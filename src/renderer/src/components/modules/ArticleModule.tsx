import type { Dispatch, SetStateAction } from 'react';
import type { ArticleGenerationRequest, ArticleGenerationResult } from '../../../../shared/types';
import { ARTICLE_LENGTH_OPTIONS, ARTICLE_TYPE_OPTIONS } from '../../app/constants';

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
  return (
    <section className="module-grid two-col">
      <article className="panel">
        <div className="panel-title"><div><p className="eyebrow">Article</p><h3>文章生成</h3></div><span className="status-pill">公众号 / 小红书</span></div>
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
          <button className="ghost small" disabled={!articleResult || busy} onClick={onExportMarkdown}>导出 Markdown</button>
        </div>
        {articleResult ? (
          <>
            <div className="chip-row">{articleResult.titleCandidates.map((title) => <span key={title} className="chip">{title}</span>)}</div>
            <p className="article-summary">{articleResult.summary}</p>
            <pre>{articleResult.markdown}</pre>
            <div className="check-list">{articleResult.publishCheck.map((item) => <p key={item.message} className={item.level}>{item.message}</p>)}</div>
            {articleExportPath ? <div className="result-card succeeded"><strong>已导出</strong><p>{articleExportPath}</p></div> : null}
          </>
        ) : <div className="empty-state">点击生成后会出现标题候选、正文草稿和发布检查。</div>}
      </article>
    </section>
  );
}
