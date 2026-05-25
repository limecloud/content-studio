import { app } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getResourcesRoot } from './paths';
import type { ContentStudioBrandingConfig, OemRuntimeConfig } from '../../shared/types';

const DEFAULT_BRAND_ID = 'bugu';
const DEFAULT_TENANT_ID = 'tenant-2230';
const DEFAULT_PRODUCT_NAME = '布谷AI';
const DEFAULT_API_BASE_URL = 'https://bugu.run/api';
const DEFAULT_OEM_PUBLIC_API_BASE_URL = 'https://api.bugu.run';

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function readJsonFile(filePath: string): Partial<OemRuntimeConfig> | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<OemRuntimeConfig>;
  } catch {
    return undefined;
  }
}

function getAppPath(): string {
  const electronApp = app as unknown as { getAppPath?: () => string };
  return electronApp.getAppPath?.() ?? resolve('.');
}

function runtimeConfigCandidates(): string[] {
  const explicit = normalizeText(process.env.CONTENT_STUDIO_OEM_RUNTIME_CONFIG);
  return [
    explicit,
    join(getResourcesRoot(), 'oem-runtime-config.json'),
    process.resourcesPath ? join(process.resourcesPath, 'resources', 'oem-runtime-config.json') : undefined,
    join(getAppPath(), 'resources', 'oem-runtime-config.json'),
  ].filter((value): value is string => Boolean(value));
}

export function getOemRuntimeConfig(): OemRuntimeConfig {
  const raw = runtimeConfigCandidates()
    .map((candidate) => readJsonFile(candidate))
    .find((candidate): candidate is Partial<OemRuntimeConfig> => Boolean(candidate));

  const brandId = normalizeText(process.env.CONTENT_STUDIO_BRAND_ID) ?? normalizeText(raw?.brandId) ?? DEFAULT_BRAND_ID;
  return {
    schemaVersion: 1,
    brandId,
    tenantId: normalizeText(process.env.CONTENT_STUDIO_TENANT_ID) ?? normalizeText(process.env.BUGU_TENANT_ID) ?? normalizeText(raw?.tenantId) ?? DEFAULT_TENANT_ID,
    appId: normalizeText(raw?.appId),
    productName: normalizeText(raw?.productName) ?? DEFAULT_PRODUCT_NAME,
    shortName: normalizeText(raw?.shortName) ?? normalizeText(raw?.productName) ?? DEFAULT_PRODUCT_NAME,
    logoUrl: normalizeText(raw?.logoUrl),
    supportUrl: normalizeText(raw?.supportUrl),
    apiBaseUrl: normalizeText(process.env.CONTENT_STUDIO_API_BASE_URL) ?? normalizeText(process.env.BUGU_API_BASE_URL) ?? normalizeText(raw?.apiBaseUrl) ?? DEFAULT_API_BASE_URL,
    oemPublicApiBaseUrl: normalizeText(process.env.CONTENT_STUDIO_OEM_PUBLIC_API_BASE_URL) ?? normalizeText(process.env.BUGU_OEM_PUBLIC_API_BASE_URL) ?? normalizeText(raw?.oemPublicApiBaseUrl) ?? DEFAULT_OEM_PUBLIC_API_BASE_URL,
    downloadBaseUrl: normalizeText(process.env.CONTENT_STUDIO_DOWNLOAD_BASE_URL) ?? normalizeText(raw?.downloadBaseUrl) ?? 'https://bugu.run',
  };
}

export function buildRuntimeBranding(config: OemRuntimeConfig = getOemRuntimeConfig()): ContentStudioBrandingConfig {
  return {
    brandId: config.brandId,
    tenantId: config.tenantId,
    appName: config.productName,
    shortName: config.shortName || config.productName,
    logoUrl: config.logoUrl,
    copyrightName: config.shortName || config.productName,
    supportUrl: config.supportUrl,
    oemPublicApiBaseUrl: config.oemPublicApiBaseUrl,
  };
}
