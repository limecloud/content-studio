---
name: content-studio-app-server
description: 管理 Content Studio 与 Lime App Server sidecar / runtime provider store / Agents 工作台的开发和发布门禁。Use when the task mentions Lime App Server、app-server sidecar、runtime provider store、agentSession、Agents 工作台继续对话、AI Agent 对话未启动、app-server:prepare、app-server.release.json、platform-host:runtime:live、App Server 发布、App Server 资源更新，或桌面发版需要携带/验证 App Server resources。
---

# Content Studio App Server

## 工作边界

本 skill 处理 Content Studio 对 Lime App Server 的接入、资源准备、runtime provider store 验证、Agents 状态机 / UI 回归和发布门禁。版本号、`RELEASE_NOTES.md`、commit / tag / push 继续交给 `.codex/skills/content-studio-release-workflow/`；bugu / seenx R2、latest、官网旧版本继续交给 `.codex/skills/content-studio-oem-release/`。

## 启动检查

1. 先读：
   - `AGENTS.md`
   - `docs/aiprompts/app-server-workflow.md`
   - `resources/app-server/README.md`
2. 如果任务涉及真实平台宿主或 `LIME_RUNTIME_BRIDGE`，再读 `docs/aiprompts/platform-host-runtime.md`。
3. 运行 `git status --short`，声明本轮写集；不要回滚用户已有改动，不删除未跟踪产物。

## 必守门禁

- Runtime 主链必须是 `Content Studio agents -> LIME_RUNTIME_BRIDGE -> lime.agent -> app-server --backend runtime --data-dir -> provider store -> LLM -> events/artifacts`。
- 不把 Product App key 写进 Content Studio env、payload 或 workspace；不恢复第二套 runtime adapter。
- `waiting-user` 且无 `promptDraftIds` 可以是已启动普通对话；第二轮必须走 `continueConversation`，不能误报 `AI Agent 对话未启动`。
- 首页大 composer 保留；对话页使用紧凑 `.agents-thread-composer-frame`；不恢复 `.agents-thread-summary`；消息从上到下展示。
- App Server resource 发布不得跳过 sha256、`--data-dir` 和 `modelProvider/list` 预检；正式发布不得使用 skip runtime provider store check 作为证据。

## 常用命令

App Server resource：

```bash
npm run app-server:prepare -- --manifest /path/to/app-server.release.json --resources-dir resources/app-server
APP_SERVER_RELEASE_MANIFEST=/path/or/url/app-server.release.json npm run app-server:prepare:release
npm run app-server:prepare:test
npm run smoke:app-server
```

Backend / runtime：

```bash
npm run app-server:backend:test
npm run app-server:backend:live
npm run app-server:runtime:live -- --data-dir "<isolated-data-dir>" --provider "<providerId>" --model "<modelId>"
npm run platform-host:runtime:live -- --provider "<providerId>" --model "<modelId>"
```

Agents UI / 状态机：

```bash
node scripts/run-functional-tests.mjs --test-name-pattern "等待用户补充的 agents 普通对话可以继续"
npm run smoke:electron
npm run test:e2e -- --grep "agents 寒暄对话保持普通回复"
```

## 收尾

最终汇报必须包含：修改路径、App Server manifest / binary 来源、资源预检结果、runtime provider store 证据、Agents 状态机 / UI 回归命令结果、未执行验证的原因。没有用户明确要求时不做 commit / tag / push。
