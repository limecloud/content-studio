import type { ContentStudioAppController } from '../app/useContentStudioApp';
import { ArticleModule } from './modules/ArticleModule';
import { AssetsModule } from './modules/AssetsModule';
import { ImageModule } from './modules/ImageModule';
import { KnowledgeModule } from './modules/KnowledgeModule';
import { SkillsModule } from './modules/SkillsModule';
import { VideoModule } from './modules/VideoModule';

interface ModuleOutletProps {
  app: ContentStudioAppController;
}

export function ModuleOutlet({ app }: ModuleOutletProps) {
  if (app.activeModule === 'image') {
    return (
      <ImageModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        productImageRefs={app.productImageRefs}
        referenceImageRefs={app.referenceImageRefs}
        suggestedImagePrompt={app.suggestedImagePrompt}
        setImagePromptDraft={app.setImagePromptDraft}
        imagePromptMode={app.imagePromptMode}
        setImagePromptMode={app.setImagePromptMode}
        imageGenerationMode={app.imageGenerationMode}
        setImageGenerationMode={app.setImageGenerationMode}
        imageTemplate={app.imageTemplate}
        setImageTemplate={app.setImageTemplate}
        imageWatermark={app.imageWatermark}
        setImageWatermark={app.setImageWatermark}
        sceneCards={app.sceneCards}
        selectedSceneIds={app.selectedSceneIds}
        setSelectedSceneIds={app.setSelectedSceneIds}
        activePromptPack={app.activePromptPack}
        mediaResult={app.mediaResult}
        onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
        onExportAsset={(path) => app.runAction(() => app.exportAsset(path))}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectReferenceImages={() => app.runAction(() => app.selectAssetFiles('reference-image'))}
        onGenerateImage={() => app.runAction(app.generateImage)}
        onGenerateSceneCards={() => app.runAction(app.generateSceneCards)}
      />
    );
  }

  if (app.activeModule === 'video') {
    return (
      <VideoModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        videoUrl={app.videoUrl}
        setVideoUrl={app.setVideoUrl}
        videoProductName={app.videoProductName}
        setVideoProductName={app.setVideoProductName}
        videoSceneBackground={app.videoSceneBackground}
        setVideoSceneBackground={app.setVideoSceneBackground}
        videoSubtitleMode={app.videoSubtitleMode}
        setVideoSubtitleMode={app.setVideoSubtitleMode}
        videoVoiceStyle={app.videoVoiceStyle}
        setVideoVoiceStyle={app.setVideoVoiceStyle}
        videoShotCount={app.videoShotCount}
        setVideoShotCount={app.setVideoShotCount}
        videoDurationSeconds={app.videoDurationSeconds}
        setVideoDurationSeconds={app.setVideoDurationSeconds}
        videoCustomRequirement={app.videoCustomRequirement}
        setVideoCustomRequirement={app.setVideoCustomRequirement}
        videoAssetRefs={app.videoAssetRefs}
        selectedVideoDimensions={app.selectedVideoDimensions}
        toggleVideoDimension={app.toggleVideoDimension}
        videoBreakdown={app.videoBreakdown}
        videoScript={app.videoScript}
        activeScenes={app.activeScenes}
        suggestedVideoPrompt={app.suggestedVideoPrompt}
        mediaResult={app.mediaResult}
        onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
        onExportAsset={(path) => app.runAction(() => app.exportAsset(path))}
        onSelectVideo={() => app.runAction(() => app.selectAssetFiles('video'))}
        onAnalyzeReferenceVideo={() => app.runAction(app.analyzeReferenceVideo)}
        onGenerateVideoScript={() => app.runAction(app.generateVideoScript)}
        onGenerateVideo={() => app.runAction(app.generateVideo)}
      />
    );
  }

  if (app.activeModule === 'article') {
    return (
      <ArticleModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        articleType={app.articleType}
        setArticleType={app.setArticleType}
        articlePlatform={app.articlePlatform}
        setArticlePlatform={app.setArticlePlatform}
        articleAudience={app.articleAudience}
        setArticleAudience={app.setArticleAudience}
        articleTopic={app.articleTopic}
        setArticleTopic={app.setArticleTopic}
        articleTone={app.articleTone}
        setArticleTone={app.setArticleTone}
        articleLength={app.articleLength}
        setArticleLength={app.setArticleLength}
        articleRequirement={app.articleRequirement}
        setArticleRequirement={app.setArticleRequirement}
        articleResult={app.articleResult}
        articleExportPath={app.articleExportPath}
        onGenerateArticle={() => app.runAction(app.generateArticle)}
        onExportMarkdown={() => app.runAction(app.exportArticleMarkdown)}
      />
    );
  }

  if (app.activeModule === 'knowledge') {
    return (
      <KnowledgeModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        knowledgeBases={app.knowledgeBases}
        knowledgeQuery={app.knowledgeQuery}
        setKnowledgeQuery={app.setKnowledgeQuery}
        knowledgeBaseFilter={app.knowledgeBaseFilter}
        setKnowledgeBaseFilter={app.setKnowledgeBaseFilter}
        knowledgeSectionFilter={app.knowledgeSectionFilter}
        setKnowledgeSectionFilter={app.setKnowledgeSectionFilter}
        knowledgeTagFilter={app.knowledgeTagFilter}
        setKnowledgeTagFilter={app.setKnowledgeTagFilter}
        availableKnowledgeTags={app.availableKnowledgeTags}
        activeKnowledgeBase={app.activeKnowledgeBase}
        activeKnowledgeBaseKey={app.activeKnowledgeBaseKey}
        setActiveKnowledgeBaseKey={app.setActiveKnowledgeBaseKey}
        searchResults={app.searchResults}
        selectedCitations={app.selectedCitations}
        activePromptPack={app.activePromptPack}
        promptPackDraft={app.promptPackDraft}
        setPromptPackDraft={app.setPromptPackDraft}
        activeEditableScene={app.activeEditableScene}
        sceneCardDraft={app.sceneCardDraft}
        setSceneCardDraft={app.setSceneCardDraft}
        onImportKnowledgeBase={() => app.runAction(app.importKnowledgeBase)}
        onInstallBuiltinKnowledgeBase={(id) => app.runAction(() => app.installBuiltinKnowledgeBase(id))}
        onSearchKnowledge={() => app.runAction(app.searchKnowledge)}
        onAddCitation={app.addCitation}
        onAddKnowledgeSectionCitation={app.addKnowledgeSectionCitation}
        onGenerateSceneCards={() => app.runAction(app.generateSceneCards)}
        onSavePromptPackDraft={() => app.runAction(app.savePromptPackDraft)}
        onSaveSceneCardDraft={() => app.runAction(app.saveSceneCardDraft)}
      />
    );
  }

  if (app.activeModule === 'assets') {
    return (
      <AssetsModule
        logsCount={app.logs.length}
        filteredLogs={app.filteredLogs}
        historyFilter={app.historyFilter}
        setHistoryFilter={app.setHistoryFilter}
        copiedLogId={app.copiedLogId}
        onCopyLogPrompt={(log) => app.runAction(() => app.copyLogPrompt(log))}
        onRevealLogPath={(log) => app.runAction(() => app.revealLogPath(log))}
        onRetryLog={(log) => app.runAction((context) => app.retryLog(log, context))}
      />
    );
  }

  return (
    <SkillsModule
      skills={app.skills}
      enabledSkillKeys={app.enabledSkillKeys}
      skillSelection={app.skillSelection}
      activeSkill={app.activeSkill}
      activeSkillKey={app.activeSkillKey}
      copiedSkillKey={app.copiedSkillKey}
      workspaceReady={Boolean(app.workspacePath)}
      onSelectSkill={app.setActiveSkillKey}
      onInstallSkill={(slug) => app.runAction(() => app.installSkill(slug))}
      onToggleSkill={(skill) => app.runAction(() => app.toggleSkill(skill))}
      onCopySkillPath={(skill) => app.runAction(() => app.copySkillPath(skill))}
    />
  );
}
