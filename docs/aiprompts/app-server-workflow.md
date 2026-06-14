# Lime App Server 开发与发布工作流

> 状态：current playbook
> 适用：Content Studio 接入 Lime App Server sidecar、runtime provider store、Agents 工作台会话、App Server 资源更新和发版门禁。

## 触发范围

遇到以下任务时先读本文，再改代码或发版：

- 更新 `resources/app-server/`、`app-server.release.json`、App Server sidecar binary 或 packaged backend。
- 修改 `agentSession`、`AgentPromptSession`、`appServerPromptAgentService`、runtime provider store、`LIME_RUNTIME_BRIDGE` 或 `platform-host:runtime:live`。
- 修复 Agents 工作台继续对话、`AI Agent 对话未启动`、消息顺序、对话输入框、运行事件或 artifact 投影。
- 发布桌面包时需要证明包内 App Server 能启动、能读取 provider store、能返回 runtime events。

## 事实边界

Agent runtime 主链只有一条：

```text
Content Studio agents
  -> LIME_RUNTIME_BRIDGE
  -> lime-desktop-platform /capability/invoke lime.agent
  -> app-server --stdio --backend runtime --data-dir <runtime-data-dir>
  -> provider store
  -> LLM API
  -> agentSession/event / artifact.snapshot
```

约束：

- Content Studio 不保存、不传递 Product App provider key；key 只属于 Lime App Server provider store / 平台设置。
- React UI 只投影 runtime facts；会话是否启动、权限、工具结果、artifact、blocked 原因都不能由 UI-only state 伪造。
- 不恢复第二套 runtime adapter，不回退到旧 external backend 作为 Agents 主链。
- 未接通真实 runtime 时必须 fail closed 或 blocked，不能补造成功事件、Prompt 交付物或图片 / 视频占位。

## 开发流程

1. 启动前先读：
   - `AGENTS.md`
   - `resources/app-server/README.md`
   - `docs/aiprompts/platform-host-runtime.md`
   - 本文
2. 用 `git status --short` 盘点工作区，只声明本轮要改的文件，不回滚用户已有改动。
3. 按变更类型选择入口：
   - App Server resource / binary：优先改 `scripts/prepare-app-server-resources.mjs`、`resources/app-server/README.md` 和相关 smoke。
   - Agents runtime：优先改 `src/main/services/appServerPromptAgentService.ts`、`src/main/services/agentPromptSessionStore.ts` 和共享类型。
   - Agents UI：优先改 `src/renderer/src/components/agents/` 与 `src/renderer/src/styles/agents-workbench.css`，保持 runtime facts 投影。
4. IPC 或数据结构变化必须同步四侧：`src/shared/types.ts`、`src/main/ipc.ts`、`src/preload/index.ts`、renderer 调用方。

## Agents 状态机门禁

这些行为是发布门禁，不允许回归：

- 第一轮普通寒暄可进入 `waiting-user`，即使没有 `promptDraftIds` 也表示会话已经启动。
- 第二轮继续对话必须走普通 `continueConversation` 路径；不能因为缺少 draft 报 `AI Agent 对话未启动`。
- 只有真实 runtime 未接通、blocked、session 缺失或 store 损坏时，才能显示 `AI Agent 对话未启动`。
- `executionEvents` 必须来自 Lime App Server runtime events 或明确的 blocked / error facts；不能把说明文案塞进 assistant 正文代替事实。
- 相关回归测试至少包含：

```bash
node scripts/run-functional-tests.mjs --test-name-pattern "等待用户补充的 agents 普通对话可以继续"
npm run test:e2e -- --grep "agents 寒暄对话保持普通回复"
```

## Agents UI 门禁

Agents 工作台需要保持桌面端产品形态：

- 首页保留大 composer 和业务入口，不删除首页主操作区。
- 首页 composer 与对话页 composer 拆分；对话页使用紧凑的 `.agents-thread-composer-frame`。
- 对话页不恢复 `.agents-thread-summary` 这类顶部摘要块。
- 对话消息按自然阅读顺序从上到下展示；不要改成从底部堆叠。
- 上下文、工具结果、审批状态、artifact 和 evidence 使用对应 runtime / artifact 区域投影，不塞进普通助手气泡。
- UI 回归时至少用 E2E 校验消息顺序、顶部摘要不存在、底部输入框高度和第二轮继续对话。

## App Server 资源更新

本地验证资源准备：

```bash
npm run app-server:prepare -- \
  --manifest /path/to/app-server.release.json \
  --resources-dir resources/app-server
```

正式 release workflow 使用：

```bash
APP_SERVER_RELEASE_MANIFEST=/path/or/url/app-server.release.json \
npm run app-server:prepare:release
```

发布约束：

- `resources/app-server/app-server.release.json` 是 sidecar manifest，不等同桌面应用版本；只有 App Server sidecar 资源变化时才更新。
- 同平台 binary 必须通过 `--data-dir` 与 `modelProvider/list` 预检；输出需能证明 `runtimeProviderStore=validated`。
- sha256 校验、`--data-dir` 支持和 `modelProvider/list` 校验不能在正式发布中跳过。
- `CONTENT_STUDIO_SKIP_APP_SERVER_RUNTIME_PROVIDER_STORE_CHECK=1` 只允许本地临时诊断，不能作为 release 证据。
- 跨平台资源在当前主机无法执行 binary 时，只能记录 `runtimeProviderStore=skipped-cross-platform`，不能替代本平台 live 证据。

## 发布验证矩阵

App Server 或 Agents runtime 相关发布至少执行：

```bash
npm run app-server:prepare:test
npm run app-server:backend:test
npm run smoke:app-server
npm run typecheck
npm run build
```

涉及真实 provider store / 平台宿主时补充其一：

```bash
npm run app-server:runtime:live -- --data-dir "<isolated-data-dir>" --provider "<providerId>" --model "<modelId>"
npm run platform-host:runtime:live -- --provider "<providerId>" --model "<modelId>"
```

涉及 Agents UI / 状态机时补充：

```bash
node scripts/run-functional-tests.mjs --test-name-pattern "等待用户补充的 agents 普通对话可以继续"
npm run smoke:electron
npm run test:e2e -- --grep "agents 寒暄对话保持普通回复"
```

`platform-host:runtime:live` 是真实平台宿主证据；standalone `app-server:runtime:live` 只能证明 App Server provider store 可用，不能声明真实宿主链路已完成。

## 发版联动

- 通用版本发布继续使用 `.codex/skills/content-studio-release-workflow/`。
- 只要发版涉及 App Server sidecar、`resources/app-server/`、Agents runtime 或 `AI Agent 对话未启动` 回归，必须同时使用 `.codex/skills/content-studio-app-server/`。
- bugu / seenx 控制面 latest、R2、download-manifest 和官网旧版本继续使用 `.codex/skills/content-studio-oem-release/`；若 OEM 包内 App Server resources 变化，先完成本文验证，再进入 OEM 分发。

收尾汇报必须列出 App Server manifest / binary 来源、sha256 或 release manifest、实际验证命令、runtime provider store 证据、Agents UI / 状态机回归结果和未覆盖风险。
