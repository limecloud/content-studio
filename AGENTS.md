# 布谷AI内容工厂 Agent 指南

本文件只用于开发 `limecloud/content-studio` 仓库本身。规则参考 Lime 主仓库的工程协作方式，但按本项目的 Electron + React + Claude SDK 内容工厂定位收敛。

## 基本原则

1. **始终中文沟通** - 回复、文档和新增注释默认使用简体中文；若文件已有其他语言风格，保持一致。
2. **先读后写** - 修改前先阅读目标文件、相邻模块和当前 `git status --short`。
3. **代码仓库是事实源** - 重要需求、路线图、发布说明和架构决策必须落到 repo 内文档。
4. **少问但不越权** - 只有需求歧义、不可逆操作、凭证缺失或生产影响时才停下来问。
5. **默认不主动提交** - 用户没有明确要求时，不做 `git commit`、`git tag`、`git push` 或分支操作。
6. **避免无关变更** - 不顺手重构、不改无关文案、不删除用户未确认的文件。
7. **KISS / YAGNI 优先** - 只实现当前明确需要的工作流，不预留复杂云端、多租户或通用聊天能力。

## 高风险操作确认

执行以下操作前必须先用中文明确确认：

- `git commit`、`git tag`、`git push`、Release 创建 / 更新。
- 删除文件、批量移动、覆盖用户数据或清理未跟踪文件。
- 修改包管理锁文件、升级核心依赖、全局安装工具。
- 发送凭证、调用生产 API、修改系统级签名 / 证书配置。

确认格式：

```text
⚠️ 危险操作检测！
操作类型：[具体操作]
影响范围：[详细说明]
风险评估：[潜在后果]

请确认是否继续？[需要明确的“是 / 确认 / 继续”]
```

## 技术栈与架构边界

- 桌面壳：Electron + electron-vite。
- 前端：React + TypeScript，入口 `src/renderer/src/App.tsx` 只负责装配壳层。
- 主进程：`src/main/`，IPC 在 `src/main/ipc.ts`。
- Preload bridge：`src/preload/index.ts`。
- 共享协议：`src/shared/types.ts` 是前后端类型契约事实源。
- 文本编排：`src/main/services/textGenerationService.ts` 只负责编排配置，具体调用下沉到 `src/main/providers/textGenerationProvider.ts`；Claude / Anthropic 官方链路走 `claude-sdk`，Anthropic 兼容、OpenAI 兼容、Gemini 原生链路必须走显式协议生成服务，禁止把非 Claude 模型硬塞进 Claude SDK 运行底座。
- 媒体生成：`src/main/providers/mediaProvider.ts` 只负责编排日志和视频，图片协议下沉到 `src/main/providers/imageGenerationProvider.ts`；图片必须走真实生成服务；未配置时返回可追溯 `blocked`，禁止生成 SVG 占位或伪造成功。视频生成可走 Generic HTTP 生成服务；未配置真实生成服务时只允许保存 blocked 队列请求。
- Pi 边界：当前不引入 Pi；只有当非 Claude 模型需要完整会话、工具调用、权限、安全模式、MCP / 能力调度和会话恢复时，才按路线图重新评估。
- 视频拆解：`src/main/services/videoWorkflowService.ts` 可走同一个 Generic HTTP 视频端点并发送 `operation: "analyze"`；未配置真实理解生成服务时只能 blocked，禁止模板伪造拆解。
- 本地数据：工作区下 `.content-studio/`，不要硬编码用户目录。
- 路线图：`docs/roadmap/v1/`。
- 发布说明：`RELEASE_NOTES.md`。

## 模块拆分规则

1. `App.tsx` 只保留应用壳层装配、全局布局和顶层入口。
2. 复杂状态与副作用进入 `src/renderer/src/app/useContentStudioApp.ts`，按 Controller Hook 模式暴露给壳层。
3. 展示层组件放在 `src/renderer/src/components/`。
4. 业务页面组件放在 `src/renderer/src/components/modules/`，按图片、视频、文章、知识库、素材、能力拆分。
5. 跨模块路由装配放在 `src/renderer/src/components/ModuleOutlet.tsx`，不要把条件渲染重新堆回 `App.tsx`。
6. 常量放在 `src/renderer/src/app/constants.ts`。
7. 纯格式化 / 提取函数放在 `src/renderer/src/app/formatters.ts`。
8. 前端局部类型放在 `src/renderer/src/app/types.ts`；跨进程协议类型必须放在 `src/shared/types.ts`。
9. 样式入口 `src/renderer/src/styles.css` 只做分层 `@import`，真实样式放在 `src/renderer/src/styles/`。

## UI 与产品边界

- 产品定位是“内容工厂 / 内容工作台”，不是通用聊天平台。
- 主链保持：成型知识库 -> 提示词包 -> 场景库 -> 文章 / 图片 / 视频队列 -> 历史。
- UI 默认桌面端，不新增移动端或营销页风格。
- 用户可见能力必须真实可追溯；未接入能力用 disabled / blocked / 后续接入表达。
- 图片未接入真实生成服务时不得生成占位图；视频未接入真实生成服务时只保存 blocked 队列文件，并写入 `artifactRefs`。
- 文字生成默认用协议化 生成服务路由；`claude-sdk` 可复用 Claude Code 登录 / API Key，其他协议必须使用对应端点和 Key。测试或 smoke 如需避免外发，使用 `CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY=1` 强制走 blocked 分支。

## 代码变更规则

1. IPC 改动必须同步四侧：
   - `src/shared/types.ts`
   - `src/main/ipc.ts`
   - `src/preload/index.ts`
   - `src/renderer/src/` 调用方
2. 数据结构改动必须同步 store、默认值、UI 消费和文档。
3. 版本改动必须同步：
   - `package.json`
   - `package-lock.json`
   - `RELEASE_NOTES.md`
4. 打包配置改动必须验证 `electron-builder.yml` 和本地构建。
5. macOS 当前默认 `identity: null`，生成 unsigned 内部预览包；正式签名 / notarization 另开任务处理。

## 常用命令

```bash
npm run typecheck
npm run build
npm run test:functional
npm run smoke:electron
npm run test:e2e
npm run verify:local
npm run dist:mac
npm run dist:win
npm run dist:linux
pnpm run dev
```

注意：

- 仓库事实锁文件是 `package-lock.json`，依赖安装优先使用 `npm install` / `npm ci`。
- 本地 `pnpm run dev` 仅作为用户指定的启动入口，不要轻易运行 `pnpm install` 覆盖依赖状态。
- 如 Electron 安装损坏，可先用 `npm install` 恢复，再按实际错误处理。

## 验证要求

- 普通前端 / 主进程改动：至少跑 `npm run typecheck`。
- 可交付功能改动：跑 `npm run build`。
- 主工作台 / preload / IPC 主链改动：优先补跑 `npm run smoke:electron`。
- 打包 / 图标 / release 配置改动：跑对应 `npm run dist:*`，macOS 本地优先 `npm run dist:mac`。
- 发布前必须本地严格跑完 `npm run verify:local`；如失败，必须按日志修复后重新全量执行，禁止只依赖远端 CI 试错。
- GUI / E2E 失败必须修稳定的真实用户路径，禁止通过放宽断言、跳过测试、增加无意义等待或移除覆盖来绕过失败。
- GUI 交互改动如无法做点击级验证，必须说明阻塞原因、已完成的替代验证和残余风险；发布相关改动不得带着未解释的 GUI 风险继续。

## 发布流程

1. 更新版本号和 `RELEASE_NOTES.md`。
2. 本地运行 `npm run verify:local` 并确认通过；如 CI 曾失败，先复现 / 对齐失败日志，修复后再重新跑本地全量验证。
3. 危险操作确认。
4. `git commit`。
5. `git tag -a vX.Y.Z -m "布谷AI vX.Y.Z"`。
6. `git push origin main`。
7. `git push origin vX.Y.Z`。
8. 用 `gh run watch` 跟进 CI 与 `.github/workflows/release.yml`；失败后必须按日志修复、重新跑本地 `npm run verify:local`，再更新提交和 tag。
9. 发布成功后汇报 commit、tag、Release 链接、本地全量验证和远端 CI / Release 结果。

## 收尾汇报

开发任务结束必须说明：

- 做了什么、涉及哪些路径。
- 验证命令和结果。
- 主线目标完成度百分比。
- 若是路线图 / 多阶段任务，补充整体目标完成度和下一刀。
