#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const outDir = join(tmpdir(), `content-studio-app-server-smoke-${process.pid}`);
const entryPath = join(outDir, 'entry.ts');
const bundlePath = join(outDir, 'entry.mjs');
try {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    entryPath,
    `export { AppServerSidecarService } from ${JSON.stringify(join(projectRoot, 'src/main/services/appServerSidecarService.ts'))};\n`,
  );
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    logLevel: 'silent',
  });

  const { AppServerSidecarService } = await import(pathToFileURL(bundlePath).href);
  const service = new AppServerSidecarService();
  const health = await service.healthCheck();
  if (!health.available) {
    throw new Error(health.message || 'app-server sidecar unavailable');
  }
  const result = await service.runSmoke();
  if (!result.ok) {
    throw new Error(result.error || 'app-server smoke failed');
  }
  if (!result.capabilityIds?.includes('content.draft.generate')) {
    throw new Error(`content.draft.generate missing: ${result.capabilityIds?.join(',') ?? 'none'}`);
  }
  if (!result.eventTypes?.includes('message.delta') || !result.eventTypes.includes('artifact.snapshot')) {
    throw new Error(`runtime events missing: ${result.eventTypes?.join(',') ?? 'none'}`);
  }
  if (!result.artifactRefs?.includes('content-studio-draft-smoke')) {
    throw new Error(`artifact missing: ${result.artifactRefs?.join(',') ?? 'none'}`);
  }
  console.log(
    [
      '[smoke:app-server] ok',
      `source=${result.source}`,
      `protocol=${result.protocolVersion}`,
      `capabilities=${result.capabilityIds.join(',')}`,
      `events=${result.eventTypes.join(',')}`,
      `artifacts=${result.artifactRefs.join(',')}`,
      `evidenceEvents=${result.evidenceEventCount ?? 0}`,
      `evidenceArtifacts=${result.evidenceArtifactCount ?? 0}`,
    ].join(' '),
  );
} catch (error) {
  console.error(`[smoke:app-server] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await rm(outDir, { recursive: true, force: true });
}
