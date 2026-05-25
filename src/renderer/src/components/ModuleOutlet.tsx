import type { ContentStudioAppController } from '../app/useContentStudioApp';
import { ArticleModule } from './modules/ArticleModule';
import { AssetsModule } from './modules/AssetsModule';
import { ImageModule } from './modules/ImageModule';
import { ImageShowcaseModule } from './modules/ImageShowcaseModule';
import { BrandKnowledgeModule } from './modules/BrandKnowledgeModule';
import { InputSourcesModule } from './modules/InputSourcesModule';
import { KnowledgeModule } from './modules/KnowledgeModule';
import { GreenScreenModule } from './modules/GreenScreenModule';
import { IpKnowledgeModule } from './modules/IpKnowledgeModule';
import { MixExportModule } from './modules/MixExportModule';
import { PromptWorkbenchModule } from './modules/PromptWorkbenchModule';
import { ReferenceReverseModule } from './modules/ReferenceReverseModule';
import { ScenePromptModule } from './modules/ScenePromptModule';
import { VideoImportModule } from './modules/VideoImportModule';
import { VideoPromptModule } from './modules/VideoPromptModule';
import { VideoShowcaseModule } from './modules/VideoShowcaseModule';
import { SkillsModule } from './modules/SkillsModule';
import { V2FeatureModule } from './modules/V2FeatureModule';
import { VideoModule } from './modules/VideoModule';
import { WorkflowFeatureModule, isWorkflowFeatureModule } from './modules/WorkflowFeatureModule';
import { isV2FeatureModule } from '../app/v2FeatureRegistry';

interface ModuleOutletProps {
  app: ContentStudioAppController;
  onOpenSkillPackage: (packagePath: string) => void;
}

export function ModuleOutlet({ app, onOpenSkillPackage }: ModuleOutletProps) {
  const brandName = app.authState?.bootstrap?.branding?.shortName
    || app.authState?.bootstrap?.branding?.appName
    || app.authState?.bootstrap?.tenant?.name
    || '布谷AI';

  const renderAssetsModule = (variant: 'library' | 'compliance' | 'retouch' = 'library') => (
    <AssetsModule
      variant={variant}
      logsCount={app.logs.length}
      logs={app.logs}
      inputSources={app.inputSources}
      promptDrafts={app.promptDrafts}
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
      onOpenPromptDraft={app.openTracePromptDraft}
      onOpenSceneCards={app.openTraceSceneCards}
      onOpenWorkflowRun={app.openTraceWorkflowRun}
    />
  );

  if (app.activeModule === 'image') {
    return (
      <ImageModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        workspacePath={app.workspacePath}
        runMode={app.params.runMode}
        productImageRefs={app.productImageRefs}
        referenceImageRefs={app.referenceImageRefs}
        imagePromptDraft={app.imagePromptDraft}
        setImagePromptDraft={app.setImagePromptDraft}
        imagePromptMode={app.imagePromptMode}
        setImagePromptMode={app.setImagePromptMode}
        imageGenerationMode={app.imageGenerationMode}
        setImageGenerationMode={app.setImageGenerationMode}
        imageTemplate={app.imageTemplate}
        setImageTemplate={app.setImageTemplate}
        imageTemplateInputs={app.imageTemplateInputs}
        setImageTemplateInputs={app.setImageTemplateInputs}
        imageWatermark={app.imageWatermark}
        setImageWatermark={app.setImageWatermark}
        mediaResult={app.mediaResult}
        logs={app.logs}
        onUseGeneratedImageAsReference={app.useGeneratedImageAsReference}
        onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
        onExportAsset={(path) => app.runAction(() => app.exportAsset(path))}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectReferenceImages={() => app.runAction(() => app.selectAssetFiles('reference-image'))}
        onGenerateImage={() => app.runAction(app.generateImage)}
      />
    );
  }

  if (app.activeModule === 'image-showcase') {
    return (
      <ImageShowcaseModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        productImageRefs={app.productImageRefs}
        authState={app.authState}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onUsePromptInImage={app.useScenePromptInImage}
      />
    );
  }

  if (app.activeModule === 'video-showcase') {
    return (
      <VideoShowcaseModule
        busy={app.busy}
        workspaceReady={Boolean(app.workspacePath)}
        productImageRefs={app.productImageRefs}
        videoAssetRefs={app.videoAssetRefs}
        authState={app.authState}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectVideo={() => app.runAction(() => app.selectAssetFiles('video'))}
        onUsePromptInVideo={app.useScenePromptInVideo}
      />
    );
  }

  if (app.activeModule === 'video' || app.activeModule === 'video-script') {
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
        activeScenes={app.activeScenes}
        suggestedVideoPrompt={app.suggestedVideoPrompt}
        mediaResult={app.mediaResult}
        onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
        onExportAsset={(path) => app.runAction(() => app.exportAsset(path))}
        onSelectProductImages={() => app.runAction(() => app.selectAssetFiles('product-image'))}
        onSelectReferenceImages={() => app.runAction(() => app.selectAssetFiles('reference-image'))}
        onSelectVideo={() => app.runAction(() => app.selectAssetFiles('video'))}
        onAnalyzeReferenceVideo={() => app.runAction(app.analyzeReferenceVideo)}
        onGenerateVideoScript={() => app.runAction(app.generateVideoScript)}
        onOpenVideoPromptHandoff={() => app.runAction(app.openVideoPromptHandoff, '正在准备视频 Prompt 交接')}
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
        onOpenWorkflowRun={app.openTraceWorkflowRun}
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
        onOpenKnowledgeScenes={() => app.runAction(app.generateSceneCards, '正在基于品牌知识库生成场景库')}
        onOpenInputSources={() => app.setActiveModule('knowledge-inputs')}
      />
    );
  }

  if (app.activeModule === 'knowledge-ip') {
    return (
      <IpKnowledgeModule
        workspaceReady={Boolean(app.workspacePath)}
        busy={app.busy}
        activeKnowledgeBase={app.activeKnowledgeBase}
        selectedCitations={app.selectedCitations}
        citationCount={app.effectiveCitationCount}
        inputSources={app.inputSources}
        ipKnowledgeBases={app.ipKnowledgeBases}
        promptDrafts={app.promptDrafts}
        activeIpKnowledgeBase={app.activeIpKnowledgeBase}
        activeIpKnowledgeBaseId={app.activeIpKnowledgeBaseId}
        setActiveIpKnowledgeBaseId={app.setActiveIpKnowledgeBaseId}
        onGenerateIpKnowledgeBase={() => app.runAction(app.generateIpKnowledgeBase, '正在生成 IP 知识库')}
        onCreateScenarioPrompt={(scene) =>
          app.runAction(() => app.createIpScenarioPrompt(scene), '正在生成 IP 场景延伸 Prompt')
        }
        onOpenPromptDraft={app.openTracePromptDraft}
        onOpenKnowledgeScenes={() => app.runAction(app.generateSceneCards, '正在基于 IP 知识库生成场景延伸库')}
        onOpenPromptWorkbench={() => app.setActiveModule('assets-prompt-workbench')}
      />
    );
  }

  if (app.activeModule === 'assets') {
    return renderAssetsModule();
  }

  if (isV2FeatureModule(app.activeModule)) {
    if (app.activeModule === 'image-reference-reverse') {
      return (
        <ReferenceReverseModule
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          inputSources={app.inputSources}
          onImportInputSource={(purpose) =>
            app.runAction(() => app.importInputSource(purpose), '正在登记对标输入源')
          }
          onRegisterManualInputSource={(input) =>
            app.runAction(() => app.registerManualInputSource(input), '正在登记产品资料')
          }
          onGenerateReversePrompt={(input) =>
            app.runAction(() => app.generateReferenceReversePrompt(input), '正在反推图片 Prompt')
          }
          onOpenPromptWorkbench={() => app.setActiveModule('assets-prompt-workbench')}
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (app.activeModule === 'image-compliance') {
      return renderAssetsModule('compliance');
    }

    if (app.activeModule === 'image-retouch') {
      return renderAssetsModule('retouch');
    }

    if (
      app.activeModule === 'assets-prompt-workbench' ||
      app.activeModule === 'video-creative' ||
      app.activeModule === 'video-custom' ||
      app.activeModule === 'article-title' ||
      app.activeModule === 'article-script'
    ) {
      const defaults = {
        'assets-prompt-workbench': {
          purpose: 'image' as const,
          title: '图片 Prompt 草稿',
          intent: '根据产品资料和参考图，生成自然真实的小红书种草图 Prompt。',
        },
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
          copiedPlatformDraftId={app.copiedPlatformDraftId}
          agentPromptSessions={app.agentPromptSessions}
          textModel={app.params.textModel}
          textModels={app.modelCatalog?.textModels ?? []}
          activeDraftId={app.activePromptDraftId}
          activeSessionId={app.activeAgentPromptSessionId}
          onSelectDraft={app.setActivePromptDraftId}
          onSelectSession={app.setActiveAgentPromptSessionId}
          onGenerateDraft={(input) =>
            app.runAction(() => app.generatePromptDraft(input), '正在生成 Prompt 草稿')
          }
          onStartSession={(input) =>
            app.runAction(() => app.startAgentPromptSession(input), '正在启动 Agent 会话')
          }
          onContinueSession={(input) =>
            app.runAction(() => app.continueAgentPromptSession(input), '正在继续 Agent 会话')
          }
          onUpdateDraft={(input) =>
            app.runAction(() => app.updatePromptDraft(input), '正在保存 Prompt 草稿')
          }
          onUsePromptInImage={app.useScenePromptInImage}
          onOpenVideoPrompt={app.usePromptDraftInVideo}
          onUsePromptInArticle={app.usePromptDraftInArticle}
          onOpenGreenScreen={app.usePromptDraftInGreenScreen}
          onMaterializeDraftToSop={(input) =>
            app.runAction(() => app.materializePromptDraftToWorkflow(input), '正在物化为 SOP 草案')
          }
          onMaterializeDraftToSkill={(input) =>
            app.runAction(() => app.materializePromptDraftToSkill(input), '正在物化为 Skill')
          }
          onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
          onCopyPlatformDraft={(draftId) => app.runAction(() => app.copyPlatformDraftText(draftId), '正在复制发布文案')}
          onOpenWorkflowRun={app.openTraceWorkflowRun}
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
          onOpenWorkflowRun={app.openTraceWorkflowRun}
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (app.activeModule === 'knowledge-scenes' || app.activeModule === 'image-scene-prompts') {
      return (
        <ScenePromptModule
          module={app.activeModule}
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          sceneCards={app.sceneCards}
          promptDrafts={app.promptDrafts}
          activePromptPack={app.activePromptPack}
          citationCount={app.effectiveCitationCount}
          selectedSceneIds={app.selectedSceneIds}
          onSelectSceneIds={app.setSelectedSceneIds}
          onGenerateSceneCards={() => app.runAction(app.generateSceneCards, '正在生成场景库')}
          onGenerateScenePromptDraft={(input) =>
            app.runAction(() => app.generateScenePromptDraft(input), '正在生成场景 Prompt 草稿')
          }
          onUpdateSceneCard={(scene) =>
            app.runAction(() => app.updateSceneCard(scene), '正在确认场景卡')
          }
          onUsePromptInImage={app.useScenePromptInImage}
          onUsePromptInVideo={app.usePromptDraftInVideo}
          onUsePromptInArticle={app.usePromptDraftInArticle}
          onUsePromptInGreenScreen={app.usePromptDraftInGreenScreen}
          onRecordPromptDraftCopy={(input) =>
            app.runAction(async () => {
              await app.recordPromptDraftCopy(input);
            }, '正在记录复制动作')
          }
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (app.activeModule === 'knowledge-inputs') {
      return (
        <InputSourcesModule
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          inputSources={app.inputSources}
          onImportInputSource={(purpose) =>
            app.runAction(() => app.importInputSource(purpose), '正在登记输入源文件')
          }
          onRegisterManualInputSource={(input) =>
            app.runAction(() => app.registerManualInputSource(input), '正在登记文本输入源')
          }
          onSelectModule={app.setActiveModule}
        />
      );
    }

    if (isWorkflowFeatureModule(app.activeModule)) {
      return (
        <WorkflowFeatureModule
          module={app.activeModule}
          workspaceReady={Boolean(app.workspacePath)}
          busy={app.busy}
          definitions={app.workflowDefinitions}
          runs={app.workflowRuns}
          logs={app.logs}
          inputSources={app.inputSources}
          assetReviews={app.assetReviews}
          platformDrafts={app.platformDrafts}
          copiedPlatformDraftId={app.copiedPlatformDraftId}
          activeDefinitionId={app.activeWorkflowDefinitionId}
          activeRunId={app.activeWorkflowRunId}
          onSelectDefinition={app.setActiveWorkflowDefinitionId}
          onSelectRun={app.setActiveWorkflowRunId}
          onCreateDraft={() => app.runAction(app.createWorkflowDraft, '正在生成 SOP 草案')}
          onPublishDefinition={(definitionId) =>
            app.runAction(() => app.publishWorkflowDefinition(definitionId), '正在发布工作流定义')
          }
          onUpdateDefinition={(definition) =>
            app.runAction(() => app.updateWorkflowDefinition(definition), '正在保存 SOP 定义')
          }
          onStartRun={(definitionId, inputs, inputSourceIds) =>
            app.runAction(() => app.startWorkflowRun(definitionId, inputs, inputSourceIds), '正在创建 SOP 运行记录')
          }
          onOpenInputSources={() => app.setActiveModule('knowledge-inputs')}
          onRunAction={(action, runId) => {
            if (action === 'open-brand-knowledge') {
              app.openWorkflowRunBrandKnowledge(runId);
              return;
            }
            if (action === 'open-ip-knowledge') {
              app.openWorkflowRunIpKnowledge(runId);
              return;
            }
            if (action === 'open-scene-library') {
              app.openWorkflowRunSceneLibrary(runId);
              return;
            }
            if (action === 'open-prompt-draft') {
              app.openWorkflowRunPromptDraft(runId);
              return;
            }
            if (action === 'open-asset-review') {
              app.openWorkflowRunAssetReview(runId);
              return;
            }
            if (action === 'open-reference-reverse') {
              app.openWorkflowRunReferenceReverse(runId);
              return;
            }
            if (action === 'open-image-workbench') {
              app.openWorkflowRunImageWorkbench(runId);
              return;
            }
            if (action === 'open-article-workbench') {
              app.openWorkflowRunArticleWorkbench(runId);
              return;
            }
            if (action === 'open-video-prompt') {
              app.openWorkflowRunPrompt(runId);
              return;
            }
            if (action === 'import-finished-video') {
              app.runAction(() => app.importWorkflowRunFinishedVideo(runId), '正在导入成品视频');
              return;
            }
            if (action === 'open-overlay') {
              app.openWorkflowRunOverlay(runId);
              return;
            }
            if (action === 'approve-workflow-review') {
              app.runAction(() => app.approveWorkflowRunReview(runId), '正在确认 SOP 审核');
              return;
            }
            if (action === 'archive-workflow-assets') {
              app.runAction(() => app.archiveWorkflowRunAssets(runId), '正在归档 SOP 产物');
              return;
            }
            if (action === 'open-platform-draft') {
              app.runAction(() => app.openWorkflowRunPlatformDraft(runId), '正在打开平台草稿包');
              return;
            }
            if (action === 'open-input-sources') {
              app.setActiveModule('knowledge-inputs');
              return;
            }
            app.openWorkflowRunMixExport(runId);
          }}
          onRevealPath={(path) => app.runAction(() => app.revealPath(path))}
          onCopyPlatformDraft={(draftId) => app.runAction(() => app.copyPlatformDraftText(draftId), '正在复制发布文案')}
          onOpenPromptDraft={app.openTracePromptDraft}
          onOpenSourceLog={app.openTraceGenerationLog}
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
