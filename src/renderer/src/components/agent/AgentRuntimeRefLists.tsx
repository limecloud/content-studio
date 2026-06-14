import { useMemo, useState } from 'react';
import type { AgentRuntimeEventProjection, AgentRuntimeReadModel } from './agentRuntimeProjection';

type RuntimeRefKind = 'artifact' | 'evidence';

interface RuntimeRefItem {
  id: string;
  sourceEventId?: string;
}

interface RuntimeRefDetail extends RuntimeRefItem {
  kind: RuntimeRefKind;
  label: string;
  meta: string;
  sourceEvents: AgentRuntimeEventProjection[];
}

interface AgentRuntimeRefListsProps {
  readModel: AgentRuntimeReadModel;
  artifactTitle?: string;
  evidenceTitle?: string;
  selectedKey?: string;
  onSelectRef?: (kind: RuntimeRefKind, id: string) => void;
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

function eventRefs(event: AgentRuntimeEventProjection, kind: RuntimeRefKind): readonly string[] {
  return kind === 'artifact' ? event.source.artifactRefs ?? [] : event.source.evidenceRefs ?? [];
}

function eventPayloadText(event: AgentRuntimeEventProjection, key: string): string {
  const value = event.source.payload?.[key];
  return typeof value === 'string' ? value : '';
}

function sourceEventsForRef(
  readModel: AgentRuntimeReadModel,
  kind: RuntimeRefKind,
  id: string,
): AgentRuntimeEventProjection[] {
  return readModel.events
    .filter((event) => (
      eventRefs(event, kind).includes(id) ||
      eventPayloadText(event, kind === 'artifact' ? 'artifactRef' : 'evidenceRef') === id ||
      eventPayloadText(event, kind === 'artifact' ? 'artifactId' : 'evidenceId') === id
    ))
    .slice(-6);
}

function refDetailKey(kind: RuntimeRefKind, id: string): string {
  return `${kind}:${id}`;
}

function refDetailsFromReadModel(readModel: AgentRuntimeReadModel): RuntimeRefDetail[] {
  const artifactRefs = refsFromReadModel(readModel, 'artifact');
  const evidenceRefs = refsFromReadModel(readModel, 'evidence');
  return [
    ...artifactRefs.map((ref, index): RuntimeRefDetail => ({
      ...ref,
      kind: 'artifact',
      label: runtimeRefLabel('artifact', ref.id, index),
      meta: runtimeRefMeta('artifact', ref),
      sourceEvents: sourceEventsForRef(readModel, 'artifact', ref.id),
    })),
    ...evidenceRefs.map((ref, index): RuntimeRefDetail => ({
      ...ref,
      kind: 'evidence',
      label: runtimeRefLabel('evidence', ref.id, index),
      meta: runtimeRefMeta('evidence', ref),
      sourceEvents: sourceEventsForRef(readModel, 'evidence', ref.id),
    })),
  ];
}

function refKindLabel(kind: RuntimeRefKind): string {
  return kind === 'artifact' ? '交付物' : '依据';
}

function eventStatusLabel(event: AgentRuntimeEventProjection): string {
  if (event.status === 'completed') return '已完成';
  if (event.status === 'running') return '执行中';
  if (event.status === 'pending') return '待处理';
  if (event.status === 'blocked') return '已阻断';
  if (event.status === 'failed') return '失败';
  if (event.status === 'canceled') return '已取消';
  return event.displayStatus || event.status;
}

function RuntimeRefDetailPanel({ detail }: { detail: RuntimeRefDetail }) {
  return (
    <aside
      className={`agent-runtime-ref-detail ${detail.kind}`}
      aria-label={`${refKindLabel(detail.kind)}详情`}
      data-ref-kind={detail.kind}
      data-ref-id={detail.id}
    >
      <header>
        <span>{refKindLabel(detail.kind)}详情</span>
        <strong>{detail.label}</strong>
      </header>
      <dl>
        <div>
          <dt>引用 ID</dt>
          <dd>{detail.id}</dd>
        </div>
        <div>
          <dt>来源</dt>
          <dd>{detail.meta}</dd>
        </div>
        <div>
          <dt>运行记录</dt>
          <dd>{detail.sourceEvents.length ? `${detail.sourceEvents.length} 条` : '未绑定具体事件'}</dd>
        </div>
      </dl>
      {detail.sourceEvents.length ? (
        <div className="agent-runtime-ref-events" aria-label="引用来源事件">
          {detail.sourceEvents.map((event) => (
            <article
              key={event.id}
              data-event-class={event.source.eventClass}
              data-event-status={event.status}
            >
              <span>{event.source.eventClass ?? '运行事件'}</span>
              <strong>{event.title}</strong>
              {event.detail ? <small>{event.detail}</small> : null}
              <em>{eventStatusLabel(event)}</em>
            </article>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function RuntimeRefSection({
  kind,
  title,
  refs,
  activeKey,
  onSelect,
}: {
  kind: RuntimeRefKind;
  title: string;
  refs: RuntimeRefItem[];
  activeKey?: string;
  onSelect: (kind: RuntimeRefKind, ref: RuntimeRefItem) => void;
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
          <button
            key={ref.id}
            type="button"
            className="agent-ref-card"
            data-ref-kind={kind}
            data-ref-id={ref.id}
            data-source-event-id={ref.sourceEventId}
            data-active={activeKey === refDetailKey(kind, ref.id) ? 'true' : undefined}
            onClick={() => onSelect(kind, ref)}
          >
            <strong>{runtimeRefLabel(kind, ref.id, index)}</strong>
            <small>{runtimeRefMeta(kind, ref)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function AgentRuntimeRefLists({
  readModel,
  artifactTitle = '交付物线索',
  evidenceTitle = '依据线索',
  selectedKey: controlledSelectedKey,
  onSelectRef,
}: AgentRuntimeRefListsProps) {
  const artifactRefs = refsFromReadModel(readModel, 'artifact');
  const evidenceRefs = refsFromReadModel(readModel, 'evidence');
  const details = useMemo(() => refDetailsFromReadModel(readModel), [readModel]);
  const [uncontrolledSelectedKey, setUncontrolledSelectedKey] = useState<string | undefined>(() => {
    const first = details[0];
    return first ? refDetailKey(first.kind, first.id) : undefined;
  });
  const selectedKey = controlledSelectedKey ?? uncontrolledSelectedKey;
  const activeDetail = details.find((detail) => refDetailKey(detail.kind, detail.id) === selectedKey) ?? details[0];
  const handleSelectRef = (kind: RuntimeRefKind, ref: RuntimeRefItem) => {
    const nextKey = refDetailKey(kind, ref.id);
    if (controlledSelectedKey === undefined) {
      setUncontrolledSelectedKey(nextKey);
    }
    onSelectRef?.(kind, ref.id);
  };
  if (!artifactRefs.length && !evidenceRefs.length) return null;
  return (
    <div className="agent-runtime-ref-lists" aria-label="运行引用">
      <RuntimeRefSection
        kind="artifact"
        title={artifactTitle}
        refs={artifactRefs}
        activeKey={activeDetail ? refDetailKey(activeDetail.kind, activeDetail.id) : undefined}
        onSelect={handleSelectRef}
      />
      <RuntimeRefSection
        kind="evidence"
        title={evidenceTitle}
        refs={evidenceRefs}
        activeKey={activeDetail ? refDetailKey(activeDetail.kind, activeDetail.id) : undefined}
        onSelect={handleSelectRef}
      />
      {activeDetail ? <RuntimeRefDetailPanel detail={activeDetail} /> : null}
    </div>
  );
}
