# Content Studio Agent 指南

本文件只用于开发 `limecloud/content-studio` 仓库本身。规则参考 Lime 主仓库的工程协作方式，但按本项目的 Electron + React + Claude Agent SDK 内容工厂定位收敛。

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
- 前端：React + TypeScript，入口 `src/renderer/src/App.tsx`。
- 主进程：`src/main/`，IPC 在 `src/main/ipc.ts`。
- Preload bridge：`src/preload/index.ts`。
- 共享协议：`src/shared/types.ts` 是前后端类型契约事实源。
- 文本编排：官方 `@anthropic-ai/claude-agent-sdk`。
- 媒体生成：`src/main/providers/mediaProvider.ts`，真实 provider 未接入时必须返回可追溯 `blocked`，禁止伪造成功。
- 本地数据：workspace 下 `.content-studio/`，不要硬编码用户目录。
- 路线图：`docs/roadmap/v1/`。
- 发布说明：`RELEASE_NOTES.md`。

## 模块拆分规则

1. `App.tsx` 只保留应用状态编排、数据加载、跨模块动作和顶层路由。
2. 展示层组件放在 `src/renderer/src/components/`。
3. 业务页面组件放在 `src/renderer/src/components/modules/`，按图片、视频、文章、知识库、素材、Skills 拆分。
4. 常量放在 `src/renderer/src/app/constants.ts`。
5. 纯格式化 / 提取函数放在 `src/renderer/src/app/formatters.ts`。
6. 前端局部类型放在 `src/renderer/src/app/types.ts`；跨进程协议类型必须放在 `src/shared/types.ts`。
7. 样式入口 `src/renderer/src/styles.css` 只做分层 `@import`，真实样式放在 `src/renderer/src/styles/`。

## UI 与产品边界

- 产品定位是“内容工厂 / 内容工作台”，不是通用聊天 Agent。
- 主链保持：成型知识库 -> 提示词包 -> 场景库 -> 文章 / 图片 / 视频队列 -> 历史。
- UI 默认桌面端，不新增移动端或营销页风格。
- 用户可见能力必须真实可追溯；未接入能力用 disabled / blocked / 后续接入表达。
- 图片 / 视频未接入真实 provider 时，应生成本地占位产物或队列文件，并写入 `artifactRefs`。

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
- 打包 / 图标 / release 配置改动：跑对应 `npm run dist:*`，macOS 本地优先 `npm run dist:mac`。
- GUI 交互改动如无法做点击级验证，必须在收尾说明中明确残余风险。

## 发布流程

1. 更新版本号和 `RELEASE_NOTES.md`。
2. 运行必要校验。
3. 危险操作确认。
4. `git commit`。
5. `git tag -a vX.Y.Z -m "Content Studio vX.Y.Z"`。
6. `git push origin main`。
7. `git push origin vX.Y.Z`。
8. 用 `gh run watch` 跟进 `.github/workflows/release.yml`。
9. 发布成功后汇报 commit、tag、Release 链接和验证结果。

## 收尾汇报

开发任务结束必须说明：

- 做了什么、涉及哪些路径。
- 验证命令和结果。
- 主线目标完成度百分比。
- 若是路线图 / 多阶段任务，补充整体目标完成度和下一刀。
