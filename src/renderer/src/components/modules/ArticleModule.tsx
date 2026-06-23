import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { ArticleGenerationRequest, ArticleGenerationResult, PlatformDraftRecord } from '../../../../shared/types';
import { ARTICLE_LENGTH_OPTIONS, ARTICLE_TYPE_OPTIONS } from '../../app/constants';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface ArticleModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  articleType: ArticleGenerationRequest['articleType'];
  setArticleType: Dispatch<SetStateAction<ArticleGenerationRequest['articleType']>>;
  articlePlatform: string;
  setArticlePlatform: Dispatch<SetStateAction<string>>;
  articleAudience: string;
  setArticleAudience: Dispatch<SetStateAction<string>>;
  articleTopic: string;
  setArticleTopic: Dispatch<SetStateAction<string>>;
  articleTone: string;
  setArticleTone: Dispatch<SetStateAction<string>>;
  articleLength: ArticleGenerationRequest['length'];
  setArticleLength: Dispatch<SetStateAction<ArticleGenerationRequest['length']>>;
  articleRequirement: string;
  setArticleRequirement: Dispatch<SetStateAction<string>>;
  articleResult: ArticleGenerationResult | null;
  articleExportPath: string | null;
  platformDrafts: PlatformDraftRecord[];
  copiedPlatformDraftId: string | null;
  onGenerateArticle: () => void;
  onExportMarkdown: () => void;
  onExportPlatformDraft: () => void;
  onCopyPlatformDraft: (draftId: string) => void;
  onRevealExportPath: (path: string) => void;
  onOpenRunTrace: (runTraceId: string) => void;
  onOpenPromptDraft: (promptDraftId: string) => void;
  onOpenSourceLog: (sourceLogId: string) => void;
}

type ArticlePreviewMode = 'rendered' | 'markdown';
type ProductionTimelineMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string };

function ProductionTimeline({
  messages,
  runningLabel,
}: {
  messages: ProductionTimelineMessage[];
  runningLabel?: string;
}) {
  return (
    <div className="production-timeline">
      {messages.map((message) => (
        <article key={message.id} className={`production-timeline-message ${message.role}`}>
          <strong>{message.role === 'assistant' ? '写作助手' : '任务简报'}</strong>
          <p>{message.content}</p>
        </article>
      ))}
      {runningLabel ? <div className="production-timeline-running">{runningLabel}</div> : null}
    </div>
  );
}

function optionLabel<TValue extends string>(options: Array<{ value: TValue; label: string }>, value: TValue): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    return bold ? <strong key={`${part}:${index}`}>{bold[1]}</strong> : part;
  });
}

function renderMarkdown(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (!listItems.length) return;
    const items = listItems;
    listItems = [];
    nodes.push(
      <ul key={`list:${nodes.length}`}>
        {items.map((item, index) => <li key={`${item}:${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>,
    );
  };

  markdown.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      if (level === 1) nodes.push(<h2 key={`h:${nodes.length}`}>{renderInlineMarkdown(heading[2])}</h2>);
      else if (level === 2) nodes.push(<h3 key={`h:${nodes.length}`}>{renderInlineMarkdown(heading[2])}</h3>);
      else nodes.push(<h4 key={`h:${nodes.length}`}>{renderInlineMarkdown(heading[2])}</h4>);
      return;
    }
    const list = /^[-*]\s+(.+)$/.exec(line);
    if (list) {
      listItems.push(list[1]);
      return;
    }
    flushList();
    nodes.push(<p key={`p:${nodes.length}`}>{renderInlineMarkdown(line)}</p>);
  });
  flushList();
  return nodes.length ? nodes : [<p key="empty">暂无正文。</p>];
}

export function ArticleModule({
  busy,
  workspaceReady,
  articleType,
  setArticleType,
  articlePlatform,
  setArticlePlatform,
  articleAudience,
  setArticleAudience,
  articleTopic,
  setArticleTopic,
  articleTone,
  setArticleTone,
  articleLength,
  setArticleLength,
  articleRequirement,
  setArticleRequirement,
  articleResult,
  articleExportPath,
  platformDrafts,
  copiedPlatformDraftId,
  onGenerateArticle,
  onExportMarkdown,
  onExportPlatformDraft,
  onCopyPlatformDraft,
  onRevealExportPath,
  onOpenRunTrace,
  onOpenPromptDraft,
  onOpenSourceLog,
}: ArticleModuleProps) {
  const [previewMode, setPreviewMode] = useState<ArticlePreviewMode>('rendered');
  const [copied, setCopied] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  const [draftPlatformFilter, setDraftPlatformFilter] = useState('all');
  const isPlatformDraftExport = Boolean(articleExportPath?.replace(/\\/g, '/').includes('/platform-drafts/'));
  const articleTypeLabel = optionLabel(ARTICLE_TYPE_OPTIONS, articleType);
  const articleLengthLabel = optionLabel(ARTICLE_LENGTH_OPTIONS, articleLength);
  const renderedArticle = useMemo(
    () => (articleResult ? renderMarkdown(articleResult.markdown) : []),
    [articleResult],
  );
  const agentMessages = useMemo<ProductionTimelineMessage[]>(() => {
    const brief = [
      `平台：${articlePlatform || '未填写'}`,
      `文章类型：${articleTypeLabel}`,
      `目标读者：${articleAudience || '未填写'}`,
      `主题：${articleTopic || '未填写'}`,
      `口吻：${articleTone || '未填写'}`,
      `篇幅：${articleLengthLabel}`,
      articleRequirement ? `补充要求：${articleRequirement}` : '',
    ].filter(Boolean).join('\n');
    const messages: ProductionTimelineMessage[] = [{
      id: 'article-brief',
      role: 'user',
      content: brief,
      createdAt: new Date(0).toISOString(),
    }];
    if (articleResult) {
      messages.push({
        id: `article-result:${articleResult.logId}`,
        role: 'assistant',
        content: [
          `已生成 ${articleResult.titleCandidates.length} 个标题候选、${articleResult.outline.length} 条大纲和 ${articleResult.publishCheck.length} 条发布检查。`,
          '',
          articleResult.summary,
          '',
          articleResult.titleCandidates.map((title, index) => `${index + 1}. ${title}`).join('\n'),
        ].join('\n'),
        createdAt: new Date().toISOString(),
      });
    }
    return messages;
  }, [articleAudience, articleLengthLabel, articlePlatform, articleRequirement, articleResult, articleTone, articleTopic, articleTypeLabel]);
  const platformDraftOptions = useMemo(
    () => Array.from(new Set(platformDrafts.map((draft) => draft.platform).filter(Boolean))).slice(0, 8),
    [platformDrafts],
  );
  const filteredPlatformDrafts = useMemo(() => {
    const query = draftQuery.trim().toLowerCase();
    return platformDrafts
      .filter((draft) => draftPlatformFilter === 'all' || draft.platform === draftPlatformFilter)
      .filter((draft) => {
        if (!query) return true;
        return [draft.title, draft.platform, draft.topic, draft.audience, draft.tone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 12);
  }, [draftPlatformFilter, draftQuery, platformDrafts]);

  async function copyArticleMarkdown(): Promise<void> {
    if (!articleResult) return;
    await navigator.clipboard.writeText(articleResult.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="article-module-workbench">
      <ModuleCommandCenter
        eyebrow="文案 / 主流程"
        title="文章生成"
        description="基于知识引用、平台、读者和口吻生成标题、大纲、正文和发布检查，交付 Markdown 或平台草稿包。"
        density="compact"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{articlePlatform}</span>
            <span className="status-pill">{articleResult ? '已有正文' : '待生成'}</span>
            <span className={`status-pill ${articleExportPath ? 'ready' : 'idle'}`}>{articleExportPath ? '已导出' : '未导出'}</span>
          </div>
        )}
      />

      <div className="article-workbench article-agent-workspace">
        <article className="panel article-editor-panel article-agent-context-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">当前任务</p>
              <h3>{articleTopic || '文章生成'}</h3>
            </div>
            <span className="status-pill">{articleResult ? '待复核' : '待生成'}</span>
          </div>
          <div className="article-agent-object-card">
            <span>{articleTypeLabel}</span>
            <strong>{articlePlatform || '未设置平台'}</strong>
            <p>{articleAudience || '先填写目标读者，让正文有明确对象。'}</p>
          </div>
          <div className="article-agent-stage-list" aria-label="文章生成阶段">
            <span className="done">设定主题</span>
            <span className={articleResult ? 'done' : 'active'}>生成草稿</span>
            <span className={articleResult ? 'active' : 'idle'}>复核发布</span>
            <span className={articleExportPath ? 'done' : 'idle'}>导出交付</span>
          </div>
          <div className="form-grid">
            <label>
              <span>文章类型</span>
              <select value={articleType} onChange={(event) => setArticleType(event.target.value as ArticleGenerationRequest['articleType'])}>
                {ARTICLE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label><span>平台</span><input value={articlePlatform} onChange={(event) => setArticlePlatform(event.target.value)} /></label>
            <label><span>目标读者</span><input value={articleAudience} onChange={(event) => setArticleAudience(event.target.value)} /></label>
            <label><span>主题</span><input value={articleTopic} onChange={(event) => setArticleTopic(event.target.value)} /></label>
            <label><span>口吻</span><input value={articleTone} onChange={(event) => setArticleTone(event.target.value)} /></label>
          </div>
          <div className="filter-block">
            <span>字数范围</span>
            <div className="chip-row tight">
              {ARTICLE_LENGTH_OPTIONS.map((option) => (
                <button key={option.value} className={`chip-button ${articleLength === option.value ? 'active' : ''}`} onClick={() => setArticleLength(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field-label">自定义要求</label>
          <textarea value={articleRequirement} onChange={(event) => setArticleRequirement(event.target.value)} />
          <button className="primary wide" disabled={busy || !workspaceReady} onClick={onGenerateArticle}>生成大纲 / 正文 / 发布检查</button>
        </article>

        <article className="panel article-agent-canvas">
          <div className="panel-title">
            <div>
              <p className="eyebrow">写作协作</p>
              <h3>文章生成流程</h3>
            </div>
            <span className={`status-pill ${busy ? 'warning' : articleResult ? 'ready' : 'idle'}`}>
              {busy ? '生成中' : articleResult ? '已产出' : '待开始'}
            </span>
          </div>
          <div className="article-agent-run-strip">
            <div>
              <span>输入</span>
              <strong>{[articlePlatform, articleAudience, articleTopic, articleTone].filter(Boolean).length}/4</strong>
            </div>
            <div>
              <span>标题</span>
              <strong>{articleResult?.titleCandidates.length ?? 0}</strong>
            </div>
            <div>
              <span>大纲</span>
              <strong>{articleResult?.outline.length ?? 0}</strong>
            </div>
            <div>
              <span>检查</span>
              <strong>{articleResult?.publishCheck.length ?? 0}</strong>
            </div>
          </div>
          <div className="article-agent-thread" aria-label="文章生成协作记录">
            <ProductionTimeline
              messages={agentMessages}
              runningLabel={busy ? '正在整理标题候选、正文草稿和发布检查。' : undefined}
            />
          </div>
          <div className="article-agent-next-action">
            <strong>{articleResult ? '下一步：复核正文并导出交付' : '下一步：生成首版正文草稿'}</strong>
            <p>{articleResult ? '先检查标题、事实边界和平台格式，再导出 Markdown 或平台草稿包。' : '系统会根据左侧任务上下文生成标题候选、大纲、正文和发布检查。'}</p>
            <button className="primary" disabled={busy || !workspaceReady} onClick={onGenerateArticle}>
              {articleResult ? '重新生成草稿' : '开始写作'}
            </button>
          </div>
        </article>

        <article className="panel article-preview">
          <div className="panel-title">
            <div><p className="eyebrow">正文草稿</p><h3>正文 / 发布检查</h3></div>
            <div className="article-actions">
              <div className="segmented-control" aria-label="正文预览模式">
                <button className={previewMode === 'rendered' ? 'active' : ''} disabled={!articleResult} onClick={() => setPreviewMode('rendered')}>预览</button>
                <button className={previewMode === 'markdown' ? 'active' : ''} disabled={!articleResult} onClick={() => setPreviewMode('markdown')}>Markdown</button>
              </div>
              <button className="ghost small" disabled={!articleResult || busy} onClick={copyArticleMarkdown}>{copied ? '已复制' : '复制正文'}</button>
              <button className="ghost small" disabled={!articleResult || busy} onClick={onExportMarkdown}>导出 Markdown</button>
              <button className="ghost small" disabled={!articleResult || busy} onClick={onExportPlatformDraft}>导出草稿包</button>
            </div>
          </div>
          {articleResult ? (
            <>
              {previewMode === 'markdown'
                ? <pre>{articleResult.markdown}</pre>
                : <div className="article-rendered">{renderedArticle}</div>}
              <div className="check-list compact">{articleResult.publishCheck.map((item) => <p key={item.message} className={item.level}>{item.message}</p>)}</div>
              {articleExportPath ? (
                <div className="result-card succeeded">
                  <strong>{isPlatformDraftExport ? '平台草稿包已导出' : 'Markdown 已导出'}</strong>
                  <p>{isPlatformDraftExport ? '已生成正文稿、发布文案、格式指南、发布检查和追溯清单；软件不会自动发布到平台。' : '已保存本地 Markdown 文件，发布前仍需人工复核事实、配图和平台格式。'}</p>
                  <button className="ghost small" disabled={busy} onClick={() => onRevealExportPath(articleExportPath)}>{isPlatformDraftExport ? '打开草稿包' : '打开 Markdown'}</button>
                </div>
              ) : null}
            </>
          ) : <div className="empty-state">点击生成后会出现标题候选、正文草稿和发布检查。</div>}
        </article>
      </div>
      <article className="panel article-draft-history">
        <div className="panel-title">
          <div><p className="eyebrow">本地交付</p><h3>平台草稿包</h3></div>
          <span className="status-pill">{filteredPlatformDrafts.length} / {platformDrafts.length} 个</span>
        </div>
        <div className="article-draft-toolbar">
          <label>
            <span>检索草稿包</span>
            <input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="标题 / 平台 / 主题 / 人群" />
          </label>
          <div className="chip-row tight">
            <button className={`chip-button ${draftPlatformFilter === 'all' ? 'active' : ''}`} onClick={() => setDraftPlatformFilter('all')}>全部平台</button>
            {platformDraftOptions.map((platform) => (
              <button key={platform} className={`chip-button ${draftPlatformFilter === platform ? 'active' : ''}`} onClick={() => setDraftPlatformFilter(platform)}>
                {platform}
              </button>
            ))}
          </div>
        </div>
        {filteredPlatformDrafts.length ? (
          <div className="article-draft-list">
            {filteredPlatformDrafts.map((draft) => (
              <div key={draft.id} className="result-card article-draft-card">
                <div>
                  <strong>{draft.title}</strong>
                  <p>{draft.platform}{draft.topic ? ` / ${draft.topic}` : ''}</p>
                  <small>{new Date(draft.createdAt).toLocaleString()} · {draft.publishCheck.length} 条发布检查</small>
                  <em>本地交付，不自动发布。</em>
                </div>
                <div className="article-draft-actions">
                  <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onRevealExportPath(draft.packageDir)}>打开草稿包</button>
                  <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onCopyPlatformDraft(draft.id)}>{copiedPlatformDraftId === draft.id ? '已复制' : '复制发布文案'}</button>
                  {draft.promptDraftId ? <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onOpenPromptDraft(draft.promptDraftId as string)}>提示词</button> : null}
                  {draft.workflowRunId ? <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onOpenRunTrace(draft.workflowRunId as string)}>回到历史</button> : null}
                  {draft.sourceLogId ? <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onOpenSourceLog(draft.sourceLogId as string)}>来源记录</button> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="empty-state">没有匹配的草稿包。导出后可按平台、标题、主题或目标人群检索。</div>}
      </article>
    </section>
  );
}
