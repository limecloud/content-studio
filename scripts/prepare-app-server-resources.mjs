#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROTOCOL_VERSION = 'appserver.v0';
const DEFAULT_MANIFEST_NAME = 'app-server.release.json';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    const value = !next || next.startsWith('--') ? 'true' : next;
    if (value !== 'true') index += 1;
    args[key] = value;
  }
  return args;
}

function platformKey(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return 'win32-x64';
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin') return 'darwin-x64';
  if (platform === 'linux') return 'linux-x64';
  return `${platform}-${arch}`;
}

function sidecarBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'app-server.exe' : 'app-server';
}

function normalizeSha256(value) {
  return String(value || '').trim().toLowerCase().replace(/^sha256:/, '');
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function selectArtifact(manifest, platform) {
  if (manifest.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`unsupported app-server protocol: expected ${PROTOCOL_VERSION}, got ${manifest.protocolVersion}`);
  }
  const artifact = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((item) => item?.platform === platform)
    : undefined;
  if (!artifact) {
    throw new Error(`app-server release manifest has no artifact for ${platform}`);
  }
  if (!artifact.url || !artifact.sha256) {
    throw new Error(`app-server artifact for ${platform} must include url and sha256`);
  }
  return artifact;
}

function normalizeManifestSource(value) {
  const source = requiredOption(value, 'manifest');
  if (isHttpUrl(source)) return source;
  if (source.startsWith('file://')) return fileURLToPath(source);
  if (isAbsolute(source)) return source;
  return resolve(source);
}

async function readReleaseManifest(manifestSource) {
  const source = normalizeManifestSource(manifestSource);
  if (isHttpUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`download app-server release manifest failed: HTTP ${response.status}`);
    }
    return {
      source,
      manifest: JSON.parse(await response.text()),
    };
  }
  return {
    source,
    manifest: JSON.parse(await readFile(source, 'utf8')),
  };
}

function resolveArtifactSource(artifactUrl, manifestSource) {
  if (artifactUrl.startsWith('file://')) return fileURLToPath(artifactUrl);
  if (isHttpUrl(artifactUrl)) return artifactUrl;
  if (isAbsolute(artifactUrl)) return artifactUrl;
  if (isHttpUrl(manifestSource)) return new URL(artifactUrl, manifestSource).toString();
  return resolve(dirname(manifestSource), artifactUrl);
}

async function copyOrDownloadArtifact(artifactUrl, manifestSource, destinationPath) {
  const source = resolveArtifactSource(artifactUrl, manifestSource);
  if (!isHttpUrl(source)) {
    await copyFile(source, destinationPath);
    return;
  }

  const response = await fetch(source);
  if (!response.ok || !response.body) {
    throw new Error(`download app-server artifact failed: HTTP ${response.status}`);
  }
  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}

function normalizeVersion(value) {
  const normalized = String(value || '').trim().replace(/^v/, '');
  return normalized || 'local-build';
}

async function buildManifestFromBinary(binaryPath, platform, binaryName, version) {
  const sourcePath = isAbsolute(binaryPath) ? binaryPath : resolve(binaryPath);
  const sha256 = await sha256File(sourcePath);
  return {
    source: dirname(sourcePath),
    manifest: {
      version: normalizeVersion(version),
      protocolVersion: PROTOCOL_VERSION,
      artifacts: [
        {
          platform,
          url: `current/${binaryName}`,
          sha256,
        },
      ],
    },
    artifactSource: sourcePath,
  };
}

async function resolveManifestInput(options, platform, binaryName) {
  if (options.manifest) {
    const manifestSource = normalizeManifestSource(options.manifest);
    const releaseManifest = await readReleaseManifest(manifestSource);
    return {
      ...releaseManifest,
      artifactSource: options.binary || selectArtifact(releaseManifest.manifest, platform).url,
    };
  }
  if (options.binary) {
    return await buildManifestFromBinary(options.binary, platform, binaryName, options.version);
  }
  throw new Error('--manifest or --binary is required');
}

async function prepareAppServerResources(options) {
  const resourcesDir = resolve(options.resourcesDir || join(projectRoot, 'resources', 'app-server'));
  const platform = options.platform || platformKey();
  const currentDir = join(resourcesDir, 'current');
  const binaryName = sidecarBinaryName(platform.split('-')[0]);
  const binaryPath = join(currentDir, binaryName);
  const tempPath = `${binaryPath}.tmp-${process.pid}`;
  const { manifest, source, artifactSource } = await resolveManifestInput(options, platform, binaryName);
  const artifact = selectArtifact(manifest, platform);

  await mkdir(currentDir, { recursive: true });
  await copyOrDownloadArtifact(artifactSource || artifact.url, source, tempPath);
  const actualSha256 = await sha256File(tempPath);
  const expectedSha256 = normalizeSha256(artifact.sha256);
  if (actualSha256 !== expectedSha256) {
    await rm(tempPath, { force: true });
    throw new Error(`app-server sha256 mismatch: expected=${expectedSha256} actual=${actualSha256}`);
  }
  if (!platform.startsWith('win32')) {
    await chmod(tempPath, 0o755);
  }
  await rm(binaryPath, { force: true });
  await rename(tempPath, binaryPath);
  await writeFile(join(resourcesDir, DEFAULT_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);

  const installed = await stat(binaryPath);
  return {
    platform,
    resourcesDir,
    manifestPath: join(resourcesDir, DEFAULT_MANIFEST_NAME),
    binaryPath,
    sha256: actualSha256,
    bytes: installed.size,
  };
}

function firstPresent(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function resolveCliOptions(args, env = process.env) {
  return {
    manifest: firstPresent(
      args.manifest,
      env.APP_SERVER_RELEASE_MANIFEST,
      env.APP_SERVER_RELEASE_MANIFEST_URL,
      env.APP_SERVER_MANIFEST,
    ),
    resourcesDir: firstPresent(
      args['resources-dir'],
      env.APP_SERVER_RESOURCES_DIR,
      env.CONTENT_STUDIO_RESOURCES_DIR && join(env.CONTENT_STUDIO_RESOURCES_DIR, 'app-server'),
    ),
    platform: firstPresent(args.platform, env.APP_SERVER_RELEASE_PLATFORM),
    binary: firstPresent(args.binary, env.APP_SERVER_RELEASE_BINARY),
    version: firstPresent(args.version, env.APP_SERVER_RELEASE_VERSION, env.LIME_APP_SERVER_REF),
  };
}

function requiredOption(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`--${name} is required`);
  return normalized;
}

function printUsage() {
  console.log(`Usage:
  node scripts/prepare-app-server-resources.mjs \\
    --manifest /path/to/app-server.release.json \\
    [--resources-dir resources/app-server] [--platform darwin-arm64] [--binary /path/to/app-server]

  node scripts/prepare-app-server-resources.mjs \\
    --binary /path/to/built/app-server \\
    [--version 1.59.0] [--resources-dir resources/app-server] [--platform darwin-arm64]

Release CI environment:
  APP_SERVER_RELEASE_MANIFEST=/path/or/url/app-server.release.json
  APP_SERVER_RELEASE_PLATFORM=darwin-arm64
  APP_SERVER_RELEASE_BINARY=/optional/local/binary
  APP_SERVER_RELEASE_VERSION=1.59.0

Notes:
  - artifact.url may be http(s), file://, absolute path, or relative to the manifest file.
  - remote manifest URLs may use relative artifact URLs.
  - --binary overrides artifact.url but still verifies the selected artifact sha256.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }
  const result = await prepareAppServerResources(resolveCliOptions(args));
  console.log(
    [
      '[app-server:prepare] ok',
      `platform=${result.platform}`,
      `binary=${result.binaryPath}`,
      `manifest=${result.manifestPath}`,
      `sha256=${result.sha256}`,
      `bytes=${result.bytes}`,
    ].join(' '),
  );
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(`[app-server:prepare] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

export {
  platformKey,
  prepareAppServerResources,
  readReleaseManifest,
  resolveCliOptions,
  selectArtifact,
  sha256File,
  sidecarBinaryName,
};
