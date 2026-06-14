const PLATFORM_INTERNAL_MODEL_RECORD_ID_PATTERN =
  /^(?:id|tid):\d{10,}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isInternalPlatformModelRecordId(modelId: string | undefined): boolean {
  return Boolean(modelId && PLATFORM_INTERNAL_MODEL_RECORD_ID_PATTERN.test(modelId.trim()));
}

export function compactUsableModelIds(models: Array<string | undefined> | undefined): string[] {
  return Array.from(new Set(
    (models ?? [])
      .map((model) => model?.trim() ?? '')
      .filter((model) => model && !isInternalPlatformModelRecordId(model)),
  ));
}
