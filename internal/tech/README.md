# 技术文档索引

更新时间：2026-06-07  
状态：current

本目录用于沉淀 content-studio 的全局技术架构、关键业务流程、Agent runtime 时序和工程验收口径。这里不替代 `docs/roadmap/*` 的路线图文档，而是作为当前实现的技术总览入口。

## 文档列表

| 文档 | 作用 |
| --- | --- |
| [全局架构图](./global-architecture.md) | 描述桌面端、Electron main、Lime App Server sidecar、协议化生成服务、本地工作区和发布资源链路的全局关系。 |
| [流程与时序 PRD](./workflow-sequence-prd.md) | 描述核心用户流程、Agent 执行时序、Prompt 工作台时序、生成任务和发布打包验收。 |
| [App Server 生成能力收敛方案](./app-server-generation-convergence.md) | 定义文字、图片、视频生成执行收敛到 Lime App Server capability / tool runtime 的当前状态、剩余迁移项和治理分类。 |

## 事实源边界

1. 跨进程协议事实源：`src/shared/types.ts`。
2. Electron main IPC 接线：`src/main/ipc.ts`。
3. Preload API facade：`src/preload/index.ts`。
4. 前端壳层与业务模块：`src/renderer/src/`。
5. Agent runtime：`src/main/services/appServerSidecarService.ts` 和 `src/main/services/appServerPromptAgentService.ts`。
6. 随包 App Server 资源：`resources/app-server/`。
7. 本地工作区事实源：工作区 `.content-studio/`。

## 当前治理口径

AI 生成执行只允许继续向 Lime App Server capability / tool runtime 收敛。当前应用运行时已经通过 `AppServerSidecarService.runCapabilityTurn` 承接文字 JSON、图片生成和视频生成；`TextGenerationService`、`MediaProvider` 和现有 provider 直连 HTTP 路径只保留为兼容 facade 或未注入 App Server 时的迁移期实现，不再作为新增能力的事实源。

## 更新规则

- IPC、数据结构、runtime、打包资源或用户主流程发生变化时，必须同步更新本目录对应文档。
- 本目录记录 current 架构、已完成的收敛点和后续剩余迁移项；历史方案、长期路线图和完成度审计仍保留在 `docs/roadmap/`。
- 任何流程图或时序图必须能映射到真实代码路径，不能记录已删除 runtime fallback 或未实现能力为 current。
