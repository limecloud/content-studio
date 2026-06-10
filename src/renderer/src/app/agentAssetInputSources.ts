import type { InputSourceRecord, RegisterInputSourceInput } from "../../../shared/types";

const AGENT_PRODUCT_IMAGE_REF_LIMIT = 10;
const AGENT_REFERENCE_IMAGE_REF_LIMIT = 6;

export interface AgentAssetInputSourceRequest {
  ref: string;
  label: "产品图" | "参考图";
  tags: string[];
}

export interface AgentAssetInputSourceLocator {
  sourcePath?: string;
  sourceUrl?: string;
}

export interface AgentAssetInputSourceRegistration {
  key: string;
  input: Omit<RegisterInputSourceInput, "workspacePath">;
}

export function cleanAgentAssetRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

export function localAssetPathFromRef(ref: string): string | undefined {
  if (!/^local-asset:/i.test(ref)) return undefined;
  try {
    return decodeURIComponent(new URL(ref).pathname);
  } catch {
    return undefined;
  }
}

export function assetInputSourceLocator(ref: string): AgentAssetInputSourceLocator | undefined {
  const trimmed = ref.trim();
  if (!trimmed || /^(data:|blob:)/i.test(trimmed)) return undefined;
  const localAssetPath = localAssetPathFromRef(trimmed);
  if (localAssetPath) return { sourcePath: localAssetPath };
  if (/^https?:/i.test(trimmed)) return { sourceUrl: trimmed };
  return { sourcePath: trimmed };
}

export function agentAssetInputSourceKey(locator: AgentAssetInputSourceLocator): string {
  return locator.sourcePath ? `path:${locator.sourcePath}` : `url:${locator.sourceUrl ?? ""}`;
}

export function buildAgentAssetInputSourceRequests(
  productRefs?: string[],
  referenceRefs?: string[],
): AgentAssetInputSourceRequest[] {
  return [
    ...cleanAgentAssetRefs(productRefs)
      .slice(0, AGENT_PRODUCT_IMAGE_REF_LIMIT)
      .map((ref) => ({ ref, label: "产品图" as const, tags: ["agents", "产品图"] })),
    ...cleanAgentAssetRefs(referenceRefs)
      .slice(0, AGENT_REFERENCE_IMAGE_REF_LIMIT)
      .map((ref) => ({ ref, label: "参考图" as const, tags: ["agents", "参考图"] })),
  ];
}

export function planAgentAssetInputSourceRegistrations(input: {
  productRefs?: string[];
  referenceRefs?: string[];
  knownSources: InputSourceRecord[];
  fileNameFromPath: (path: string) => string;
}): {
  existingIds: string[];
  registrations: AgentAssetInputSourceRegistration[];
} {
  const knownSources = new Map<string, InputSourceRecord>(
    input.knownSources.flatMap((source) => [
      ...(source.sourcePath ? [[`path:${source.sourcePath}`, source] as const] : []),
      ...(source.sourceUrl ? [[`url:${source.sourceUrl}`, source] as const] : []),
    ]),
  );
  const seenKeys = new Set<string>();
  const existingIds: string[] = [];
  const registrations: AgentAssetInputSourceRegistration[] = [];

  for (const item of buildAgentAssetInputSourceRequests(input.productRefs, input.referenceRefs)) {
    const locator = assetInputSourceLocator(item.ref);
    if (!locator) continue;
    const key = agentAssetInputSourceKey(locator);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const existing = knownSources.get(key);
    if (existing) {
      existingIds.push(existing.id);
      continue;
    }
    const sourceRef = locator.sourcePath ?? locator.sourceUrl ?? item.ref;
    const fileName = input.fileNameFromPath(sourceRef);
    registrations.push({
      key,
      input: {
        kind: "image",
        purpose: "task-input",
        sensitivity: "internal",
        title: `${item.label} / ${fileName}`,
        sourcePath: locator.sourcePath,
        sourceUrl: locator.sourceUrl,
        summary: `agents 工作台登记的${item.label}：${fileName}`,
        tags: item.tags,
      },
    });
  }

  return { existingIds, registrations };
}
