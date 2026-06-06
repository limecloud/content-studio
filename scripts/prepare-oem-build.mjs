import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(rootDir, 'oem', 'brands');
const appServerResourceDir = join(rootDir, 'resources', 'app-server');

function normalizeCliValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function normalizeId(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function toPosixPath(value) {
  return value.split(sep).join('/');
}

function assertInsideRoot(filePath, label) {
  const resolved = resolve(rootDir, filePath);
  const rel = relative(rootDir, resolved);
  if (rel.startsWith('..') || rel === '' || isAbsolute(rel)) {
    throw new Error(`${label} 必须位于当前仓库内：${filePath}`);
  }
  return resolved;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

function requiredString(record, key) {
  const value = String(record[key] || '').trim();
  if (!value) throw new Error(`品牌配置缺少 ${key}`);
  return value;
}

function appServerBinaryName() {
  return process.platform === 'win32' ? 'app-server.exe' : 'app-server';
}

function requireAppServerResourcesIfNeeded() {
  if (process.env.CONTENT_STUDIO_REQUIRE_APP_SERVER_RESOURCES !== '1') return;
  const manifestPath = join(appServerResourceDir, 'app-server.release.json');
  const binaryPath = join(appServerResourceDir, 'current', appServerBinaryName());
  const backendPath = join(appServerResourceDir, 'backend', 'content-backend.mjs');
  const missing = [manifestPath, binaryPath, backendPath].filter((item) => !existsSync(item));
  if (missing.length) {
    throw new Error(
      [
        '缺少 App Server 发布资源，请先运行 npm run app-server:prepare:release。',
        ...missing.map((item) => `- ${toPosixPath(relative(rootDir, item))}`),
      ].join('\n'),
    );
  }
}

function resolveIconPath(brand, key) {
  const iconPath = brand.icons?.[key];
  if (!iconPath) throw new Error(`品牌 ${brand.brandId} 缺少 ${key} 图标配置`);
  const resolved = assertInsideRoot(iconPath, `${key} 图标`);
  if (!existsSync(resolved)) {
    throw new Error(`品牌 ${brand.brandId} 的 ${key} 图标不存在：${iconPath}`);
  }
  return resolved;
}

function buildElectronBuilderConfig({ brand, version, tempBuildDir, runtimeConfigPath }) {
  const iconPng = toPosixPath(join(tempBuildDir, 'icon.png'));
  const iconIcns = toPosixPath(join(tempBuildDir, 'icon.icns'));
  const iconIco = toPosixPath(join(tempBuildDir, 'icon.ico'));
  const runtimeConfig = toPosixPath(runtimeConfigPath);
  const outputDir = `release/${brand.brandId}`;
  const skillTypeId = `${brand.appId}.skill`;
  const skillMimeType = brand.skillMimeType;

  return {
    appId: brand.appId,
    productName: brand.productName,
    artifactName: `${brand.artifactName}-${version}-\${os}-\${arch}.\${ext}`,
    directories: {
      app: toPosixPath(join(tempDir, 'app')),
      output: outputDir,
      buildResources: toPosixPath(tempBuildDir),
    },
    files: ['out/**', 'package.json'],
    extraResources: [
      { from: 'resources', to: 'resources' },
      { from: 'resources/app-server', to: 'app-server' },
      { from: runtimeConfig, to: 'resources/oem-runtime-config.json' },
    ],
    fileAssociations: [
      {
        ext: 'skill',
        name: brand.skillPackageName,
        description: brand.skillPackageDescription,
        role: 'Viewer',
        rank: 'Owner',
        mimeType: skillMimeType,
      },
    ],
    mac: {
      category: 'public.app-category.productivity',
      icon: iconIcns,
      identity: null,
      extendInfo: {
        CFBundleDocumentTypes: [
          {
            CFBundleTypeName: brand.skillPackageName,
            CFBundleTypeRole: 'Viewer',
            CFBundleTypeExtensions: ['skill'],
            LSHandlerRank: 'Owner',
            LSItemContentTypes: [skillTypeId, 'com.limecloud.lime.skill'],
          },
        ],
        UTExportedTypeDeclarations: [
          {
            UTTypeIdentifier: skillTypeId,
            UTTypeDescription: brand.skillPackageDescription,
            UTTypeConformsTo: ['public.zip-archive'],
            UTTypeTagSpecification: {
              'public.filename-extension': ['skill'],
              'public.mime-type': [skillMimeType],
            },
          },
          {
            UTTypeIdentifier: 'com.limecloud.lime.skill',
            UTTypeDescription: brand.skillPackageDescription,
            UTTypeConformsTo: ['public.zip-archive', 'public.data'],
            UTTypeTagSpecification: {
              'public.filename-extension': ['skill'],
              'public.mime-type': ['application/vnd.lime.skill+zip'],
            },
          },
        ],
      },
    },
    win: {
      target: 'nsis',
      icon: iconIco,
    },
    linux: {
      target: 'AppImage',
      icon: iconPng,
    },
  };
}

const brandId = normalizeId(normalizeCliValue('brand') || process.env.OEM_BRAND, 'bugu');
const brandPath = join(brandDir, `${brandId}.json`);
if (!existsSync(brandPath)) {
  throw new Error(`未找到品牌配置：oem/brands/${brandId}.json`);
}
requireAppServerResourcesIfNeeded();

const packageJson = await readJson(join(rootDir, 'package.json'));
const brand = await readJson(brandPath);
brand.brandId = requiredString(brand, 'brandId');
brand.tenantId = requiredString(brand, 'tenantId');
brand.appId = requiredString(brand, 'appId');
brand.productName = requiredString(brand, 'productName');
brand.shortName = normalizeId(brand.shortName, brand.productName);
brand.artifactName = requiredString(brand, 'artifactName');
brand.apiBaseUrl = requiredString(brand, 'apiBaseUrl');
brand.skillPackageName = requiredString(brand, 'skillPackageName');
brand.skillPackageDescription = requiredString(brand, 'skillPackageDescription');
brand.skillMimeType = requiredString(brand, 'skillMimeType');

const tempDir = join(rootDir, '.tmp', 'oem', brand.brandId);
const tempAppDir = join(tempDir, 'app');
const tempBuildDir = join(tempDir, 'build');
const tempResourcesDir = join(tempDir, 'resources');
const runtimeConfigPath = join(tempResourcesDir, 'oem-runtime-config.json');
const builderConfigPath = join(tempDir, 'electron-builder.json');

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempAppDir, { recursive: true });
await mkdir(tempBuildDir, { recursive: true });
await mkdir(tempResourcesDir, { recursive: true });

const iconPngPath = resolveIconPath(brand, 'png');
const iconIcnsPath = resolveIconPath(brand, 'icns');
const iconIcoPath = resolveIconPath(brand, 'ico');

await copyFile(iconPngPath, join(tempBuildDir, 'icon.png'));
await copyFile(iconIcnsPath, join(tempBuildDir, 'icon.icns'));
await copyFile(iconIcoPath, join(tempBuildDir, 'icon.ico'));

const runtimeConfig = {
  schemaVersion: 1,
  brandId: brand.brandId,
  tenantId: brand.tenantId,
  appId: brand.appId,
  productName: brand.productName,
  shortName: brand.shortName,
  apiBaseUrl: brand.apiBaseUrl,
  downloadBaseUrl: normalizeId(brand.downloadBaseUrl, undefined),
  logoUrl: `data:image/png;base64,${(await readFile(iconPngPath)).toString('base64')}`,
  supportUrl: brand.supportUrl,
  generatedAt: new Date().toISOString(),
};
await writeFile(runtimeConfigPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`, 'utf-8');

const outDir = join(rootDir, 'out');
if (!existsSync(outDir)) {
  throw new Error('缺少 out/ 构建产物，请先运行 npm run build 再准备 OEM 打包配置。');
}
await cp(outDir, join(tempAppDir, 'out'), { recursive: true });
await writeFile(join(tempAppDir, 'package.json'), `${JSON.stringify({
  name: brand.artifactName,
  version: packageJson.version,
  description: `${brand.productName} 桌面应用`,
  type: packageJson.type,
  main: packageJson.main,
  license: packageJson.license,
  engines: packageJson.engines,
  dependencies: packageJson.dependencies,
  author: brand.shortName,
}, null, 2)}\n`, 'utf-8');

const builderConfig = buildElectronBuilderConfig({
  brand,
  version: packageJson.version,
  tempBuildDir,
  runtimeConfigPath,
});
await writeFile(builderConfigPath, `${JSON.stringify(builderConfig, null, 2)}\n`, 'utf-8');

console.log(`OEM build config prepared for ${brand.brandId}`);
console.log(toPosixPath(relative(rootDir, builderConfigPath)));
