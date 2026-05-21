import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { ArticleGenerationRequest, ArticleGenerationResult } from '../../../../shared/types';
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
  onGenerateArticle: () => void;
  onExportMarkdown: () => void;
}

type ArticlePreviewMode = 'rendered' | 'markdown';

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
  onGenerateArticle,
  onExportMarkdown,
}: ArticleModuleProps) {
  const [previewMode, setPreviewMode] = useState<ArticlePreviewMode>('rendered');
  const [copied, setCopied] = useState(false);
  const renderedArticle = useMemo(
    () => (articleResult ? renderMarkdown(articleResult.markdown) : []),
    [articleResult],
  );

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
        description="基于知识引用、平台、读者和口吻生成标题、大纲、正文和发布检查，导出为可复用 Markdown。"
        density="compact"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{articlePlatform}</span>
            <span className="status-pill">{articleResult ? '已有正文' : '待生成'}</span>
            <span className={`status-pill ${articleExportPath ? 'ready' : 'idle'}`}>{articleExportPath ? '已导出' : '未导出'}</span>
          </div>
        )}
      />

      <div className="module-grid two-col article-workbench">
        <article className="panel article-editor-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Article</p>
              <h3>文章生成</h3>
            </div>
            <span className="status-pill">公众号 / 小红书</span>
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
        <article className="panel article-preview">
          <div className="panel-title">
            <div><p className="eyebrow">Draft</p><h3>正文 / 发布检查</h3></div>
            <div className="article-actions">
              <div className="segmented-control" aria-label="正文预览模式">
                <button className={previewMode === 'rendered' ? 'active' : ''} disabled={!articleResult} onClick={() => setPreviewMode('rendered')}>预览</button>
                <button className={previewMode === 'markdown' ? 'active' : ''} disabled={!articleResult} onClick={() => setPreviewMode('markdown')}>Markdown</button>
              </div>
              <button className="ghost small" disabled={!articleResult || busy} onClick={copyArticleMarkdown}>{copied ? '已复制' : '复制正文'}</button>
              <button className="ghost small" disabled={!articleResult || busy} onClick={onExportMarkdown}>导出 Markdown</button>
            </div>
          </div>
          {articleResult ? (
            <>
              {previewMode === 'markdown'
                ? <pre>{articleResult.markdown}</pre>
                : <div className="article-rendered">{renderedArticle}</div>}
              <div className="check-list compact">{articleResult.publishCheck.map((item) => <p key={item.message} className={item.level}>{item.message}</p>)}</div>
              {articleExportPath ? <div className="result-card succeeded"><strong>已导出</strong><p>{articleExportPath}</p></div> : null}
            </>
          ) : <div className="empty-state">点击生成后会出现标题候选、正文草稿和发布检查。</div>}
        </article>
      </div>
    </section>
  );
}
