import type { ReactNode } from 'react';
import type { ContentStudioAppController } from '../app/useContentStudioApp';
import { ArticleModule } from './modules/ArticleModule';
import { AssetsModule } from './modules/AssetsModule';
import { ImageModule } from './modules/ImageModule';
import { ImageShowcaseModule } from './modules/ImageShowcaseModule';
import { BrandKnowledgeModule } from './modules/BrandKnowledgeModule';
import { KnowledgeModule } from './modules/KnowledgeModule';
import { GreenScreenModule } from './modules/GreenScreenModule';
import { MaterialBreakdownModule } from './modules/MaterialBreakdownModule';
import { MixExportModule } from './modules/MixExportModule';
import { PromptWorkbenchModule } from './modules/PromptWorkbenchModule';
import { VideoImportModule } from './modules/VideoImportModule';
import { VideoPromptModule } from './modules/VideoPromptModule';
import { VideoShowcaseModule } from './modules/VideoShowcaseModule';
import { SkillsModule } from './modules/SkillsModule';
import { V2FeatureModule } from './modules/V2FeatureModule';
import { VideoModule } from './modules/VideoModule';
import { isV2FeatureModule } from '../app/v2FeatureRegistry';
import {
  createModelSettingsProjection,
} from '../app/platformModelSettingsProjection';

interface ModuleOutletProps {
  app: ContentStudioAppController;
  onOpenSkillPackage: (packagePath: string) => void;
}

export function ModuleOutlet({ app, onOpenSkillPackage }: ModuleOutletProps) {
  const modelSettings = createModelSettingsProjection(app);
  const brandName = app.authState?.bootstrap?.branding?.shortName
    || app.authState?.bootstrap?.branding?.appName
    || app.authState?.bootstrap?.tenant?.name
    || '布谷AI';

  const renderShowcaseFrame = (content: ReactNode) => (
    <div className="showcase-page-frame">
      <div className="showcase-page-body">
        {content}
      </div>
    </div>
  );

  const renderAssetsModule = (variant: 'library' | 'compliance' | 'retouch' = 'library') => (
    <AssetsModule
      variant={variant}
      logsCount={app.logs.length}
      logs={app.logs}
      inputSources={app.inputSources}
      promptDrafts={app.promptDrafts}
      contentKnowledgeMaps={app.contentKnowledgeMaps}
      assetReviews={app.assetReviews}
      copiedLogId={app.copiedLogId}
      onCopyLogPrompt={(log) => app.runAction(() => app.copyLogPrompt(log))}
      onRevealLogPath={(log) => app.runAction(() => app.revealLogPath(log))}
      onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
      onReuseImageLogInput={(log) => app.reuseImageLogInput(log)}
      onReviewAsset={(input) => app.runAction(() => app.reviewAsset(input), '正在记录素材审核')}
      onReworkAsset={(input) => app.runAction(() => app.reworkAsset(input), '正在准备回炉')}
      onDistillAssetPrompt={(input) => app.runAction(() => app.distillAssetPrompt(input), '正在沉淀成功素材 Prompt')}
      onOpenMixExport={() => app.setActiveModule('video-mix-export')}
      onGenerateContentMaterialTasksForCoverageRows={(targets) =>
        app.runAction(() => app.generateContentMaterialTasksForCoverageRows(targets), '正在创建补素材任务')
      }
      onOpenPromptDraft={app.openTracePromptDraft}
      onOpenSceneCards={app.openTraceSceneCards}
      onOpenRunTrace={() => app.setActiveModule('assets')}
    />
  );

  if (app.activeModule === 'image' || app.activeModule === 'image-production') {
    return (
      <ImageModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        workspacePath={app.workspacePath}
        runMode={app.params.runMode}
        productImageRefs={app.productImageRefs}
        referenceImageRefs={app.referenceImageRefs}
        productImageLabel={app.imageProductLabel}
        referenceImageLabel={app.imageReferenceLabel}
        imagePromptDraft={app.imagePromptDraft}
        setImagePromptDraft={app.setImagePromptDraft}
        imagePromptMode={app.imagePromptMode}
        setImagePromptMode={app.setImagePromptMode}
        imageGenerationMode={app.imageGenerationMode}
        setImageGenerationMode={app.setImageGenerationMode}
        imageModel={app.params.imageModel}
        imageModels={app.imageModelOptions}
        setImageModel={(model) => app.setParams((current) => ({ ...current, imageModel: model }))}
        imageTemplate={app.imageTemplate}
        setImageTemplate={app.setImageTemplate}
        imageTemplateInputs={app.imageTemplateInputs}
        setImageTemplateInputs={app.setImageTemplateInputs}
        imageWatermark={app.imageWatermark}
        setImageWatermark={app.setImageWatermark}
        mediaResult={app.mediaResult}
        logs={app.logs}
        imageProductionTasks={app.imageProductionTasks}
        activeImageProductionTask={app.activeImageProductionTask}
        activeImageProductionTaskId={app.activeImageProductionTaskId}
        setActiveImageProductionTaskId={app.setActiveImageProductionTaskId}
        onUseGeneratedImageAsReference={app.useGeneratedImageAsReference}
        onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
        onExportAsset={(path) => app.runAction(() => app.exportAsset(path))}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectReferenceImages={() => app.runAction(() => app.selectAssetFiles('reference-image'))}
        onRemoveProductImageRef={app.removeProductImageRef}
        onRemoveReferenceImageRef={app.removeReferenceImageRef}
        onClearProductImageRefs={app.clearProductImageRefs}
        onClearReferenceImageRefs={app.clearReferenceImageRefs}
        onGenerateImage={() => app.runAction(app.generateImage)}
        onCreateImageProductionTask={(input) => app.createImageProductionTask(input)}
        onUpdateImageProductionTask={(input) => app.updateImageProductionTask(input)}
        onUpdateShotPrompt={(input) => app.updateShotPrompt(input)}
        onGenerateImageForShot={(input) => app.runAction((context) => app.generateImageForShot(input, context), input.generationStage === 'test' ? '正在测试生成' : '正在批量生成')}
        onReviewShotAsset={(input) => app.runAction(() => app.reviewShotAsset(input), input.status === 'approved' ? '正在审核入库' : '正在记录回炉')}
      />
    );
  }

  if (app.activeModule === 'image-showcase') {
    return renderShowcaseFrame(
      <ImageShowcaseModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        productImageRefs={app.productImageRefs}
        referenceImageRefs={app.referenceImageRefs}
        imageModel={app.params.imageModel}
        imageModels={app.imageModelOptions}
        setImageModel={(model) => app.setParams((current) => ({ ...current, imageModel: model }))}
        mediaResult={app.mediaResult}
        authState={app.authState}
        logs={app.logs}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectReferenceImages={() => app.runAction(() => app.selectAssetFiles('reference-image'))}
        onRemoveProductImageRef={app.removeProductImageRef}
        onRemoveReferenceImageRef={app.removeReferenceImageRef}
        onUsePromptInImage={app.useShowcasePromptInImage}
        onStartPartialRetouch={app.startShowcasePartialRetouch}
        onClearResult={app.clearMediaResult}
        onGenerateImage={(input) => app.runAction((context) => app.generateShowcaseImage(input, context))}
      />
    );
  }

  if (app.activeModule === 'video-showcase') {
    return renderShowcaseFrame(
      <VideoShowcaseModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        productImageRefs={app.productImageRefs}
        videoAssetRefs={app.videoAssetRefs}
        audioAssetRefs={app.audioAssetRefs}
        mediaResult={app.mediaResult}
        authState={app.authState}
        logs={app.logs}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectVideo={() => app.runAction(() => app.selectAssetFiles('video'))}
        onSelectAudio={() => app.runAction(() => app.selectAssetFiles('audio'))}
        onSelectMaterialFiles={app.selectMaterialFiles}
        onRemoveProductImageRef={app.removeProductImageRef}
        onRemoveVideoAssetRef={app.removeVideoAssetRef}
        onRemoveAudioAssetRef={app.removeAudioAssetRef}
        onUsePromptInVideo={app.useShowcasePromptInVideo}
        onStartPartialRetouch={(input) => {
          app.startShowcasePartialRetouch(input);
          app.setActiveModule('image-production');
        }}
        onClearResult={app.clearMediaResult}
        onGenerateVideo={(input) => app.runAction((context) => app.generateShowcaseVideo(input, context))}
      />
    );
  }

  if (app.activeModule === 'video' || app.activeModule === 'video-script') {
    const videoBreakdownLogs = app.logs.filter((log) => log.kind === 'video-breakdown' && log.status === 'succeeded');
    const videoScriptLogs = app.logs.filter((log) => log.kind === 'video-script' && log.status === 'succeeded');
    return (
      <VideoModule
        initialStage={app.activeModule === 'video-script' ? 'script' : 'breakdown'}
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        productImageRefs={app.productImageRefs}
        referenceImageRefs={app.referenceImageRefs}
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
        videoBreakdownLogs={videoBreakdownLogs}
        videoScriptLogs={videoScriptLogs}
        activeScenes={app.activeScenes}
        suggestedVideoPrompt={app.suggestedVideoPrompt}
        mediaResult={app.mediaResult}
        onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
        onExportAsset={(path) => app.runAction(() => app.exportAsset(path))}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectReferenceImages={() => app.runAction(() => app.selectAssetFiles('reference-image'))}
        onSelectVideo={() => app.runAction(() => app.selectAssetFiles('video'))}
        onAnalyzeReferenceVideo={() => app.runAction(app.analyzeReferenceVideo)}
        onUseVideoBreakdownLog={(log) => app.useVideoBreakdownLog(log)}
        onUseVideoScriptLog={(log) => app.useVideoScriptLog(log)}
        onOpenVideoLog={(log) => app.openTraceGenerationLog(log.id)}
        onUpdateVideoScriptReview={(input) => app.runAction(() => app.updateGenerationLogReview(input), '正在保存脚本反馈')}
        onGenerateVideoScript={() => app.runAction(app.generateVideoScript)}
        onEvaluateVideoScript={(script, log) => app.runAction((context) => app.evaluateVideoScript(script, log, context), '正在 AI 质检脚本')}
        onRewriteVideoScriptShot={(script, rowIndex, log) => app.runAction(async (context) => {
          await app.rewriteVideoScriptShot(script, rowIndex, log, context);
        }, '正在重写镜头')}
        onOpenVideoPromptHandoff={() => app.runAction(app.openVideoPromptHandoff, '正在准备视频 Prompt 交接')}
        onOpenVideoImport={() => app.setActiveModule('video-import')}
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
        platformDrafts={app.platformDrafts}
        copiedPlatformDraftId={app.copiedPlatformDraftId}
        onGenerateArticle={() => app.runAction(app.generateArticle)}
        onExportMarkdown={() => app.runAction(app.exportArticleMarkdown)}
        onExportPlatformDraft={() => app.runAction(app.exportArticlePlatformDraft)}
        onCopyPlatformDraft={(draftId) => app.runAction(() => app.copyPlatformDraftText(draftId), '正在复制发布文案')}
        onRevealExportPath={(path) => app.runAction(() => app.revealPath(path))}
        onOpenRunTrace={app.openRunTrace}
        onOpenPromptDraft={app.openTracePromptDraft}
        onOpenSourceLog={app.openTraceGenerationLog}
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
        effectiveCitationCount={app.effectiveCitationCount}
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

  if (app.activeModule === 'knowledge-brand') {
    return (
      <BrandKnowledgeModule
        workspaceReady={Boolean(app.workspacePath)}
        busy={app.busy}
        activeKnowledgeBase={app.activeKnowledgeBase}
        selectedCitations={app.selectedCitations}
        citationCount={app.effectiveCitationCount}
        brandKnowledgeBases={app.brandKnowledgeBases}
        activeBrandKnowledgeBase={app.activeBrandKnowledgeBase}
        activeBrandKnowledgeBaseId={app.activeBrandKnowledgeBaseId}
        setActiveBrandKnowledgeBaseId={app.setActiveBrandKnowledgeBaseId}
        onGenerateBrandKnowledgeBase={() => app.runAction(app.generateBrandKnowledgeBase, '正在生成品牌知识库')}
        onOpenKnowledgeScenes={() => app.runAction(app.generateSceneCards, '正在基于品牌知识库生成场景')}
        onOpenInputSources={() => app.setActiveModule('knowledge')}
      />
    );
  }

  if (app.activeModule === 'assets') {
    return renderAssetsModule();
  }

  if (isV2FeatureModule(app.activeModule)) {
    if (app.activeModule === 'material-breakdown') {
      return (
        <MaterialBreakdownModule
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          error={app.referenceReverseError}
          inputSources={app.inputSources}
          reverseResult={app.referenceReverseResult}
          activePromptDraft={app.activePromptDraft}
          onImportInputSource={(purpose) =>
            app.runAction(() => app.importInputSource(purpose), '正在登记素材输入源')
          }
          onRegisterManualInputSource={(input) =>
            app.runAction(() => app.registerManualInputSource(input), '正在登记产品资料')
          }
          onRemoveInputSource={(sourceId) =>
            app.runAction(() => app.removeInputSource(sourceId), '正在移除输入源')
          }
          onGenerateReversePrompt={(input) =>
            app.runAction(() => app.generateReferenceReversePrompt(input), '正在拆解素材')
          }
          onUpdatePromptDraft={(input) =>
            app.runAction(() => app.updatePromptDraft(input), '正在保存 Prompt 版本')
          }
        />
      );
    }

    if (
      app.activeModule === 'video-creative' ||
      app.activeModule === 'video-custom' ||
      app.activeModule === 'article-title' ||
      app.activeModule === 'article-script'
    ) {
      const defaults = {
        'video-creative': {
          purpose: 'video' as const,
          title: '创意视频 Prompt 草稿',
          intent: '基于品牌 / IP 资产生成 15 秒创意视频方向和可复制视频 Prompt，只输出素材级 Prompt，不承诺成片。',
        },
        'video-custom': {
          purpose: 'video' as const,
          title: '自定义视频 Prompt 草稿',
          intent: '按自定义镜头、画幅、动作、时长和参考素材生成可复制视频 Prompt；内部视频 API 未配置时保持手动复制路径。',
        },
        'article-title': {
          purpose: 'article' as const,
          title: '标题矩阵 Prompt 草稿',
          intent: '围绕平台、场景、痛点和品牌 / IP 口吻生成标题矩阵，保留禁用表达和事实来源提醒。',
        },
        'article-script': {
          purpose: 'article' as const,
          title: '脚本生成 Prompt 草稿',
          intent: '生成口播脚本、分镜脚本和可拆成绿幕文案图的内容结构，并保留知识来源和合规边界。',
        },
      }[app.activeModule];
      return (
        <PromptWorkbenchModule
          featureKey={app.activeModule}
          initialPurpose={defaults.purpose}
          initialTitle={defaults.title}
          initialUserIntent={defaults.intent}
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          inputSources={app.inputSources}
          promptDrafts={app.promptDrafts}
          platformDrafts={app.platformDrafts}
          teamKnowledgePackageVersions={app.contentKnowledgeReleases}
          copiedPlatformDraftId={app.copiedPlatformDraftId}
          skills={app.skills}
          enabledSkillKeys={app.enabledSkillKeys}
          textProtocol={app.modelConfig?.textProtocol}
          activeDraftId={app.activePromptDraftId}
          onSelectDraft={app.setActivePromptDraftId}
          onGenerateDraft={(input) =>
            app.runAction(() => app.generatePromptDraft(input), '正在生成 Prompt 草稿')
          }
          onUpdateDraft={(input) =>
            app.runAction(() => app.updatePromptDraft(input), '正在保存 Prompt 草稿')
          }
          onUsePromptInImage={app.useScenePromptInImage}
          onOpenVideoPrompt={app.usePromptDraftInVideo}
          onUsePromptInArticle={app.usePromptDraftInArticle}
          onOpenGreenScreen={app.usePromptDraftInGreenScreen}
          onMaterializeDraftToSkill={(input) =>
            app.runAction(() => app.materializePromptDraftToSkill(input), '正在物化为 Skill')
          }
          onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
          onCopyPlatformDraft={(draftId) => app.runAction(() => app.copyPlatformDraftText(draftId), '正在复制发布文案')}
          onOpenRunTrace={() => app.setActiveModule('assets')}
          onOpenSourceLog={app.openTraceGenerationLog}
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (app.activeModule === 'video-prompt') {
      return (
        <VideoPromptModule
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          inputSources={app.inputSources}
          sceneCards={app.sceneCards}
          promptDrafts={app.promptDrafts}
          activePromptDraftId={app.activePromptDraftId}
          selectedSceneIds={app.selectedSceneIds}
          onSelectSceneIds={app.setSelectedSceneIds}
          onGenerateScenePromptDraft={(input) =>
            app.runAction(() => app.generateScenePromptDraft(input), '正在生成视频 Prompt 草稿')
          }
          onGenerateDraft={(input) =>
            app.runAction(() => app.generatePromptDraft(input), '正在生成视频 Prompt 草稿')
          }
          onRecordPromptDraftCopy={(input) =>
            app.runAction(async () => {
              await app.recordPromptDraftCopy(input);
            }, '正在记录复制动作')
          }
          onSelectDraft={app.setActivePromptDraftId}
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (app.activeModule === 'image-green-screen') {
      return (
        <GreenScreenModule
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          promptDrafts={app.promptDrafts}
          overlayCards={app.overlayCards}
          activePromptDraftId={app.activePromptDraftId}
          onSelectDraft={app.setActivePromptDraftId}
          onGenerateOverlayCards={(input) =>
            app.runAction(() => app.generateOverlayCards(input), '正在生成绿幕文案图')
          }
          onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (app.activeModule === 'video-import') {
      return (
        <VideoImportModule
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          inputSources={app.inputSources}
          promptDrafts={app.promptDrafts}
          activePromptDraftId={app.activePromptDraftId}
          onSelectDraft={app.setActivePromptDraftId}
          onImportFinishedVideo={(promptDraftId) =>
            app.runAction(() => app.importFinishedVideo(promptDraftId), '正在导入成品视频')
          }
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (app.activeModule === 'video-mix-export') {
      return (
        <MixExportModule
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          logs={app.logs}
          inputSources={app.inputSources}
          promptDrafts={app.promptDrafts}
          overlayCards={app.overlayCards}
          assetReviews={app.assetReviews}
          mixPackages={app.mixPackages}
          onExportMixPackage={(input) =>
            app.runAction(() => app.exportMixPackage(input), '正在导出混剪包')
          }
          onRecordImportEvidence={(input) =>
            app.runAction(() => app.recordMixPackageImportEvidence(input), '正在登记混剪导入证据')
          }
          onReviewAsset={(input) =>
            app.runAction(() => app.reviewAsset(input), '正在记录素材审核')
          }
          onReworkAsset={(input) => app.runAction(() => app.reworkAsset(input), '正在准备回炉')}
          onDistillAssetPrompt={(input) =>
            app.runAction(() => app.distillAssetPrompt(input), '正在沉淀成功素材 Prompt')
          }
          onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
          onOpenPromptDraft={app.openTracePromptDraft}
          onOpenSceneCards={app.openTraceSceneCards}
          onOpenRunTrace={() => app.setActiveModule('assets')}
          onSelectModule={app.setActiveModule}
        />
      );
    }

    return (
      <V2FeatureModule
        module={app.activeModule}
        onSelectModule={app.setActiveModule}
      />
    );
  }

  if (app.activeModule === 'skills') {
    return (
      <SkillsModule
        skills={app.skills}
        enabledSkillKeys={app.enabledSkillKeys}
        skillSelection={app.skillSelection}
        activeSkill={app.activeSkill}
        activeSkillKey={app.activeSkillKey}
        copiedSkillKey={app.copiedSkillKey}
        brandName={brandName}
        workspaceReady={Boolean(app.workspacePath)}
        onSelectSkill={app.setActiveSkillKey}
        onInstallSkill={(slug) => app.runAction(() => app.installSkill(slug))}
        onCreateSkill={(draft) => app.runAction(() => app.createSkill(draft))}
        onUploadSkillPackage={() => app.runAction(() => app.uploadSkillPackage())}
        onOpenSkillFolder={(skill) => app.runAction(() => app.openSkillFolder(skill))}
        onRenameSkill={(skill, nextSlug) => app.runAction(() => app.renameSkill(skill, nextSlug))}
        onReplaceSkillPackage={(skill) => app.runAction(() => app.replaceSkillPackage(skill))}
        onUninstallSkill={(skill) => app.runAction(() => app.uninstallSkill(skill))}
        onToggleSkill={(skill) => app.runAction(() => app.toggleSkill(skill))}
        onCopySkillPath={(skill) => app.runAction(() => app.copySkillPath(skill))}
        onOpenSkillPackage={onOpenSkillPackage}
        onReadSkillFile={app.readSkillFile}
      />
    );
  }

  return null;
}
