export function stripInternalTraceLinesFromPrompt(value: string): string {
  const text = value.trim();
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim();
      if (!normalized) return true;
      return !/(assetKey|sourceId|workflowRunId|artifactRefs?|generation-log|input-source|workflow-run|sourceType)\s*[:：=]/i.test(normalized);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
