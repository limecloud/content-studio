# 内容工坊 v1 PRD 完成度审计

更新时间：2026-05-19  
状态：Completion Audit

## 1. 目标重述

本轮整体目标是把内容工坊从“能看见入口”推进到“业务主链可真实使用、不可用能力明确 blocked、关键流程有功能测试和 GUI smoke 证明”。成功标准拆成以下可交付项：

1. 一级列表 / 工作台留在主页面；详情、编辑、配置、历史明细才进入弹窗 / 抽屉。
2. 文字主链必须走官方 `@anthropic-ai/claude-agent-sdk` 或明确认证 blocked，不再用本地模板伪造成功。
3. 图片生成必须走真实 Provider 或明确 blocked，不再生成 SVG 占位素材。
4. 视频拆解和视频生成必须有真实 Provider 路径；未配置时只允许 blocked / 队列文件，不伪造视频或拆解结果。
5. 已成型知识库、提示词包、场景卡、文章、图片、视频、Skills、历史都要形成可追溯业务闭环。
6. 功能测试必须覆盖服务级业务逻辑，GUI smoke 必须覆盖主窗口、导航、滚动、详情弹窗和无 Provider blocked 分支。
7. 文档、发布说明和项目级 `AGENTS.md` 必须同步当前真实能力边界。

## 2. Prompt-to-Artifact 清单

| 明确要求 | 当前证据 | 验证方式 | 状态 | 未覆盖 / 弱覆盖 |
| --- | --- | --- | --- | --- |
| 一级列表不做弹窗，详情才弹窗 | `src/renderer/src/App.tsx` 直接渲染 `ModuleOutlet`；`src/renderer/src/components/DetailDialog.tsx`；`src/renderer/src/components/modules/SkillsModule.tsx` | `npm run smoke:electron` 检查 Skills 详情弹窗打开 / 关闭，且 `hasRedundantWorkbenchHint=false` | 完成 | 知识库章节详情、历史详情仍有部分 inline 展示，后续可继续抽屉化 |
| Claude SDK 文字主链 | `src/main/services/textGenerationService.ts`；`src/main/services/claudeSdkRuntime.ts`；提示词包 / 场景卡 / 文章 / 视频脚本服务都注入 `TextGenerationService` | `npm run test:functional` 覆盖文字主链；`npm run smoke:electron` 用 `CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY=1` 验证无认证 blocked | 完成 | 未在本机外发真实 Claude 请求，需用户提供登录 / Key 后手工验证费用链路 |
| 图片真实 Provider / blocked | `src/main/providers/mediaProvider.ts` 支持 OpenAI Responses `image_generation`，未配置时 blocked | `npm run test:functional` 用本地 HTTP Provider 验证真实适配和 PNG 落盘；`npm run smoke:electron` 验证无 Key 不生成占位 | 完成 | 未用真实商业 Key 跑费用 E2E |
| 视频生成真实 Provider / 队列 | `src/main/providers/mediaProvider.ts` 支持 Generic HTTP 视频 Provider，解析 URL / base64 并落盘；未配置时保存 blocked 队列 JSON / MD | `npm run test:functional` 验证视频 Provider 下载产物；`npm run smoke:electron` 验证未配置时队列文件和 blocked | 完成 | Generic HTTP 是网关契约，不绑定单一商业平台 |
| 视频拆解真实 Provider / blocked | `src/main/services/videoWorkflowService.ts` 支持 Generic HTTP Provider，发送 `operation: "analyze"` 并解析结构化 segments；未配置时 blocked | `npm run test:functional` 覆盖真实理解 Provider adapter 和日志；`npm run smoke:electron` 验证未配置时 blocked | 完成 | 仍需接入用户选择的视频理解网关进行真实素材分析 |
| 知识库导入 / 搜索 / 引用 | `src/main/services/knowledgeBaseStore.ts`；`src/renderer/src/components/modules/KnowledgeModule.tsx` | `npm run test:functional` 覆盖 Markdown 导入、结构化、搜索引用；smoke 覆盖内置知识库安装和检索 | 完成 | DOCX 解析未在本轮功能测试中单独覆盖 |
| 提示词包和场景卡派生 | `src/main/services/promptPackService.ts`；`src/main/services/sceneLibraryStore.ts` | `npm run test:functional` 覆盖提示词包、场景卡生成和日志 | 完成 | 完整字段编辑和版本历史后置 |
| 文章生成和 Markdown 导出 | `src/main/services/articleGenerationService.ts`；`src/renderer/src/components/modules/ArticleModule.tsx`；`src/main/ipc.ts` 的 `article:exportMarkdown` | `npm run test:functional` 覆盖文章标题 / 大纲 / Markdown / 发布检查；smoke 覆盖 blocked 分支 | 基本完成 | 导出 Markdown 依赖系统 save dialog，未在 headless smoke 中点击真实保存 |
| Skills 管理和详情 | `src/main/services/skillManager.ts`；`src/main/services/skillSelectionStore.ts`；`src/renderer/src/components/modules/SkillsModule.tsx` | `npm run smoke:electron` 覆盖扫描、启用态、详情弹窗打开 / 关闭 | 完成 | 未提供 Skill 编辑器，符合 v1 边界 |
| 历史 / 素材可追溯 | `src/main/services/generationLogStore.ts`；`src/renderer/src/components/modules/AssetsModule.tsx` | `npm run smoke:electron` 验证历史填充、blocked 日志、产物 refs；`npm run test:functional` 验证日志 kind / status / artifactRefs | 完成 | 旧历史缺少 input 时不能重试 |
| 设置 / Provider 配置 | `src/main/services/modelConfigStore.ts`；`src/renderer/src/components/SettingsDialog.tsx`；`src/renderer/src/app/useContentStudioApp.ts` | `npm run smoke:electron` 覆盖设置弹窗和模型页；`npm run typecheck` 覆盖共享类型 | 完成 | `getModelCatalog()` 仍是本地种子，不拉远端 metadata |
| 入口占位 | `src/renderer/src/app/constants.ts` | GUI smoke 主要入口点击不进入 disabled 假功能 | 完成 | 合规检测、AI 对话、图片精修、创意视频、自定义视频仍是后续入口 |
| 验证命令 | `package.json` 新增 `test:functional`、`verify:local`；`scripts/run-functional-tests.mjs`；`scripts/electron-smoke.mjs` | 2026-05-19 已执行 `npm run verify:local`，包含 typecheck、build、4 个功能测试、Electron smoke | 完成 | 未做真实外部 Provider 费用 E2E |
| 文档同步 | `README.md`、`RELEASE_NOTES.md`、`AGENTS.md` | 本文件和上述文档均说明 Claude SDK、本地登录、Responses 图片、Generic HTTP 视频拆解 / 生成、blocked 边界 | 完成 | 发布前还需按版本 tag 更新最终 release 文案 |

## 3. 已执行验证

```bash
npm run verify:local
```

本次输出证据：

- `npm run typecheck`：通过。
- `npm run build`：通过，Electron main / preload / renderer 均构建成功。
- `npm run test:functional`：4 项通过。
  - 内容工厂文字主链可以生成提示词包、场景卡、文章和视频脚本。
  - 知识库可以导入、结构化并参与搜索引用。
  - 媒体 Provider 可以调用真实 HTTP 适配器并沉淀图片 / 视频产物。
  - 视频拆解可以调用真实 Generic HTTP 理解 Provider 并写入日志。
- `npm run smoke:electron`：通过。
  - 验证 preload bridge、内置 Skills、导航、设置弹窗、Skills 详情弹窗、滚动容器。
  - 验证无 Provider / 无显式 Key 时，提示词包、文章、图片、视频拆解、视频脚本、视频队列进入 blocked / 队列分支，不生成假产物。

## 4. 完成判定

按当前 v1 边界，本轮整体目标已经达到“内部预览可交付”标准：

1. 普通用户主线不再依赖 mock 成功；能真实调用的能力都有 Provider adapter，不能调用时明确 blocked。
2. 文字、图片、视频拆解、视频生成均有真实 Provider 路径和服务级功能测试。
3. GUI 主路径、详情弹窗、滚动和无 Provider 分支已有 Electron smoke 覆盖。
4. 文档、发布说明和 Agent 规则已同步当前真实能力边界。

仍不声明“外部商业 Provider 已生产可用”，因为没有在本机提供真实 Key / endpoint 进行费用 E2E；该验证必须由用户确认凭证和外发风险后再做。

结论：v1 内部预览整体目标完成，真实外部 Provider 费用链路属于发布前环境验证。

## 5. 后续增强建议

1. 提供真实 Claude / OpenAI / 视频网关 Key 后，补一条外部 Provider E2E 记录。
2. 把知识库章节详情、历史详情、场景卡编辑继续统一成 `DetailDialog` / 抽屉。
3. 发布前清理未使用的旧组件和本地临时目录，并按 release 流程提交、打 tag、发布。
