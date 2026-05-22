import type { InputSourcePurpose, InputSourceRecord, WorkflowDefinition } from './types';

export const PROMPT_DISTILLED_SOURCE_TAG = 'prompt-distilled';

export function isPromptDistilledSource(source: Pick<InputSourceRecord, 'tags'>): boolean {
  return source.tags.includes(PROMPT_DISTILLED_SOURCE_TAG);
}

export function isReusablePromptInputSource(source: Pick<InputSourceRecord, 'tags'>): boolean {
  return !isPromptDistilledSource(source);
}

export function isReusableWorkflowInputSource(source: Pick<InputSourceRecord, 'purpose' | 'tags'>): boolean {
  if (isPromptDistilledSource(source)) return false;
  return source.purpose !== 'successful-asset';
}

function pushUnique<T>(items: T[], value: T): void {
  if (!items.includes(value)) items.push(value);
}

export function workflowInputPurposesForDefinitionKey(definitionKey: string): InputSourcePurpose[] {
  const key = definitionKey.toLowerCase();
  const purposes: InputSourcePurpose[] = ['sop-input'];

  if (key.includes('brand')) {
    pushUnique(purposes, 'brand-kb');
    pushUnique(purposes, 'product-brief');
  }
  if (key.includes('ip') || key.includes('longform')) {
    pushUnique(purposes, 'ip-kb');
    pushUnique(purposes, 'ip-scenario-kb');
  }
  if (key.includes('image') || key.includes('seeding')) {
    pushUnique(purposes, 'reference');
    pushUnique(purposes, 'product-brief');
    pushUnique(purposes, 'user-feedback');
    pushUnique(purposes, 'brand-kb');
  }
  if (key.includes('product') || key.includes('commercial')) {
    pushUnique(purposes, 'product-brief');
    pushUnique(purposes, 'reference');
    pushUnique(purposes, 'brand-kb');
  }
  if (key.includes('feedback') || key.includes('topic')) {
    pushUnique(purposes, 'user-feedback');
    pushUnique(purposes, 'product-brief');
    pushUnique(purposes, 'brand-kb');
  }
  if (key.includes('green-screen') || key.includes('overlay')) {
    pushUnique(purposes, 'product-brief');
    pushUnique(purposes, 'user-feedback');
    pushUnique(purposes, 'brand-kb');
    pushUnique(purposes, 'ip-kb');
  }
  if (key.includes('video')) {
    pushUnique(purposes, 'product-brief');
    pushUnique(purposes, 'user-feedback');
    pushUnique(purposes, 'brand-kb');
    pushUnique(purposes, 'ip-kb');
    pushUnique(purposes, 'reference');
  }

  return purposes;
}

export function inputSourceMatchesWorkflowDefinitionKey(
  source: Pick<InputSourceRecord, 'purpose' | 'tags'>,
  definitionKey: string,
): boolean {
  if (!isReusableWorkflowInputSource(source)) return false;
  return workflowInputPurposesForDefinitionKey(definitionKey).includes(source.purpose);
}

export function selectWorkflowInputSourceIdsForDefinition(
  definition: Pick<WorkflowDefinition, 'key'>,
  sources: Array<Pick<InputSourceRecord, 'id' | 'purpose' | 'tags'>>,
  limit = 12,
): string[] {
  return sources
    .filter((source) => inputSourceMatchesWorkflowDefinitionKey(source, definition.key))
    .slice(0, limit)
    .map((source) => source.id);
}
