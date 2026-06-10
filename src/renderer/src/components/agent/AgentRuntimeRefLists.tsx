import type { AgentRuntimeReadModel } from './agentRuntimeProjection';

type RuntimeRefKind = 'artifact' | 'evidence';

interface RuntimeRefItem {
  id: string;
  sourceEventId?: string;
}

interface AgentRuntimeRefListsProps {
  readModel: AgentRuntimeReadModel;
  artifactTitle?: string;
  evidenceTitle?: string;
}

function uniqueRefs(items: RuntimeRefItem[]): RuntimeRefItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function refsFromReadModel(readModel: AgentRuntimeReadModel, kind: RuntimeRefKind): RuntimeRefItem[] {
  const directRefs = kind === 'artifact' ? readModel.artifactRefs : readModel.evidenceRefs;
  const eventRefs = readModel.events.flatMap((event) => {
    const refs = kind === 'artifact' ? event.source.artifactRefs ?? [] : event.source.evidenceRefs ?? [];
    return refs.map((id) => ({ id, sourceEventId: event.source.id }));
  });
  return uniqueRefs([
    ...directRefs.map((id) => ({ id })),
    ...eventRefs,
  ]);
}

function shortRefId(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';
  if (/^[0-9a-f-]{12,}$/i.test(normalized)) return normalized.slice(0, 8);
  return normalized.slice(0, 12);
}

function runtimeRefLabel(kind: RuntimeRefKind, id: string, index: number): string {
  const [prefix, ...rest] = id.split(':');
  if (!rest.length) return kind === 'artifact' ? `交付物 ${index + 1}` : `依据 ${index + 1}`;
  const label = rest.join(':');
  if (prefix === 'prompt-draft') return `草稿 ${shortRefId(label)}`;
  if (prefix === 'input-source') return `输入资料 ${shortRefId(label)}`;
  if (prefix === 'app-server') return `平台交付 ${index + 1}`;
  if (prefix === 'generation-log') return `生成记录 ${shortRefId(label)}`;
  return kind === 'artifact' ? `交付物 ${index + 1}` : `依据 ${index + 1}`;
}

function runtimeRefMeta(kind: RuntimeRefKind, ref: RuntimeRefItem): string {
  if (ref.sourceEventId) return kind === 'artifact' ? '由运行记录交付' : '由运行记录绑定';
  return kind === 'artifact' ? '本轮交付引用' : '本轮依据引用';
}

function RuntimeRefSection({
  kind,
  title,
  refs,
}: {
  kind: RuntimeRefKind;
  title: string;
  refs: RuntimeRefItem[];
}) {
  if (!refs.length) return null;
  const sectionClassName = kind === 'artifact' ? 'agent-artifact-refs' : 'agent-evidence-refs';
  return (
    <section className={`${sectionClassName} agent-runtime-ref-section`} aria-label={title}>
      <header>
        <strong>{title}</strong>
        <span>{refs.length}</span>
      </header>
      <div className="agent-runtime-ref-grid">
        {refs.map((ref, index) => (
          <article
            key={ref.id}
            className="agent-ref-card"
            data-ref-kind={kind}
            data-ref-id={ref.id}
            data-source-event-id={ref.sourceEventId}
          >
            <strong>{runtimeRefLabel(kind, ref.id, index)}</strong>
            <small>{runtimeRefMeta(kind, ref)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AgentRuntimeRefLists({
  readModel,
  artifactTitle = '交付物线索',
  evidenceTitle = '依据线索',
}: AgentRuntimeRefListsProps) {
  const artifactRefs = refsFromReadModel(readModel, 'artifact');
  const evidenceRefs = refsFromReadModel(readModel, 'evidence');
  if (!artifactRefs.length && !evidenceRefs.length) return null;
  return (
    <div className="agent-runtime-ref-lists" aria-label="运行引用">
      <RuntimeRefSection kind="artifact" title={artifactTitle} refs={artifactRefs} />
      <RuntimeRefSection kind="evidence" title={evidenceTitle} refs={evidenceRefs} />
    </div>
  );
}
