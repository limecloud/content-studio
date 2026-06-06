import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  platformKey,
  prepareAppServerResources,
  readReleaseManifest,
  resolveCliOptions,
  selectArtifact,
  sha256File,
  sidecarBinaryName,
} from './prepare-app-server-resources.mjs';

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-resources-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('selects release artifact by protocol and platform', () => {
  const manifest = {
    version: '1.0.0',
    protocolVersion: 'appserver.v0',
    artifacts: [
      { platform: 'darwin-arm64', url: 'app-server-darwin-arm64', sha256: 'a'.repeat(64) },
      { platform: 'linux-x64', url: 'app-server-linux-x64', sha256: 'b'.repeat(64) },
    ],
  };
  assert.equal(selectArtifact(manifest, 'linux-x64').url, 'app-server-linux-x64');
  assert.throws(() => selectArtifact({ ...manifest, protocolVersion: 'old' }, 'linux-x64'), /unsupported app-server protocol/);
  assert.throws(() => selectArtifact(manifest, 'win32-x64'), /no artifact for win32-x64/);
});

test('prepares current sidecar resources and verifies sha256', async () => {
  await withTempDir(async (dir) => {
    const platform = platformKey(process.platform, process.arch);
    const binaryName = sidecarBinaryName(process.platform);
    const sourceBinary = join(dir, binaryName);
    await writeFile(sourceBinary, '#!/usr/bin/env node\nconsole.log("app-server")\n');
    await chmod(sourceBinary, 0o755);
    const sha256 = await sha256File(sourceBinary);
    const manifestPath = join(dir, 'app-server.release.json');
    await writeFile(manifestPath, `${JSON.stringify({
      version: '1.0.0',
      protocolVersion: 'appserver.v0',
      artifacts: [
        { platform, url: sourceBinary, sha256 },
      ],
    }, null, 2)}\n`);

    const resourcesDir = join(dir, 'resources', 'app-server');
    const result = await prepareAppServerResources({
      manifest: manifestPath,
      resourcesDir,
      platform,
    });

    assert.equal(result.platform, platform);
    assert.equal(result.sha256, sha256);
    assert.equal(result.binaryPath, join(resourcesDir, 'current', binaryName));
    assert.equal(await sha256File(result.binaryPath), sha256);
    assert.deepEqual(JSON.parse(await readFile(result.manifestPath, 'utf8')).artifacts[0].sha256, sha256);
    if (process.platform !== 'win32') {
      const mode = (await stat(result.binaryPath)).mode & 0o111;
      assert.notEqual(mode, 0);
    }
  });
});

test('rejects artifact sha256 mismatch before replacing current binary', async () => {
  await withTempDir(async (dir) => {
    const platform = platformKey(process.platform, process.arch);
    const binaryName = sidecarBinaryName(process.platform);
    const sourceBinary = join(dir, binaryName);
    await writeFile(sourceBinary, 'bad-binary');
    const manifestPath = join(dir, 'app-server.release.json');
    await writeFile(manifestPath, `${JSON.stringify({
      version: '1.0.0',
      protocolVersion: 'appserver.v0',
      artifacts: [
        { platform, url: sourceBinary, sha256: '0'.repeat(64) },
      ],
    }, null, 2)}\n`);

    await assert.rejects(() => prepareAppServerResources({
      manifest: manifestPath,
      resourcesDir: join(dir, 'resources', 'app-server'),
      platform,
    }), /sha256 mismatch/);
  });
});

test('resolves release CI environment options', () => {
  const options = resolveCliOptions({}, {
    APP_SERVER_RELEASE_MANIFEST_URL: 'https://example.invalid/app-server.release.json',
    APP_SERVER_RELEASE_PLATFORM: 'linux-x64',
    APP_SERVER_RELEASE_BINARY: '/tmp/app-server',
    APP_SERVER_RELEASE_VERSION: '1.59.0',
    APP_SERVER_RESOURCES_DIR: '/tmp/resources',
  });

  assert.deepEqual(options, {
    manifest: 'https://example.invalid/app-server.release.json',
    resourcesDir: '/tmp/resources',
    platform: 'linux-x64',
    binary: '/tmp/app-server',
    version: '1.59.0',
  });
});

test('prepares resources from a direct built sidecar binary', async () => {
  await withTempDir(async (dir) => {
    const platform = platformKey(process.platform, process.arch);
    const binaryName = sidecarBinaryName(process.platform);
    const sourceBinary = join(dir, binaryName);
    await writeFile(sourceBinary, '#!/usr/bin/env node\nconsole.log("app-server")\n');
    await chmod(sourceBinary, 0o755);
    const sha256 = await sha256File(sourceBinary);
    const resourcesDir = join(dir, 'resources', 'app-server');

    const result = await prepareAppServerResources({
      binary: sourceBinary,
      resourcesDir,
      platform,
      version: '1.59.0',
    });

    assert.equal(result.platform, platform);
    assert.equal(result.sha256, sha256);
    assert.equal(await sha256File(join(resourcesDir, 'current', binaryName)), sha256);
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
    assert.equal(manifest.version, '1.59.0');
    assert.equal(manifest.protocolVersion, 'appserver.v0');
    assert.deepEqual(manifest.artifacts, [
      {
        platform,
        url: `current/${binaryName}`,
        sha256,
      },
    ]);
  });
});

test('prepares resources from remote manifest with relative artifact url', async () => {
  await withTempDir(async (dir) => {
    const platform = platformKey(process.platform, process.arch);
    const binaryName = sidecarBinaryName(process.platform);
    const binaryBody = Buffer.from('#!/usr/bin/env node\nconsole.log("app-server")\n');
    const sha256 = createSha256(binaryBody);
    const manifestBody = `${JSON.stringify({
      version: '1.0.0',
      protocolVersion: 'appserver.v0',
      artifacts: [
        { platform, url: './bin/app-server', sha256 },
      ],
    }, null, 2)}\n`;

    const server = http.createServer((request, response) => {
      if (request.url === '/app-server.release.json') {
        response.setHeader('content-type', 'application/json');
        response.end(manifestBody);
        return;
      }
      if (request.url === '/bin/app-server') {
        response.end(binaryBody);
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });

    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    try {
      const { port } = server.address();
      const manifestUrl = `http://127.0.0.1:${port}/app-server.release.json`;
      const resourcesDir = join(dir, 'resources', 'app-server');
      const manifest = await readReleaseManifest(manifestUrl);
      assert.equal(manifest.manifest.version, '1.0.0');

      const result = await prepareAppServerResources({
        manifest: manifestUrl,
        resourcesDir,
        platform,
      });

      assert.equal(result.sha256, sha256);
      assert.equal(await sha256File(join(resourcesDir, 'current', binaryName)), sha256);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  });
});

function createSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
