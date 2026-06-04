# video-script-ai 迁移收口审计

更新时间：2026-06-04
状态：核心迁移已落地 / 外部在线系统不迁移

## 1. 审计目标

本文件用于收口 `/Users/coso/Downloads/video-script-ai` 到布谷AI内容工厂的迁移边界，确认“爆款视频拆解 -> 爆款特征库 -> 脚本改写 / 质检 -> 视频 Prompt 交接 -> 成品手动导入”已按本地内容工厂事实源落地。

迁移目标不是把源项目的 Next.js + Supabase + Auth + Seedance 在线系统完整搬进客户端，而是把其中可复用的短视频理解、爆款结构抽取、脚本生成、评分和生产交接方法迁入当前 Electron + React 工作台。

## 2. 已迁移范围

| 源项目能力 | 内容工厂落点 | 当前状态 |
| --- | --- | --- |
| Gemini / GPT 组合视频拆解 Prompt、Schema、评分维度 | `VideoWorkflowService.analyze`、`videoUnderstandingProvider`、`GenerationLogEntry.kind = video-breakdown` | 已迁移，未配置真实理解 Provider 时 blocked，不伪造拆解 |
| Hook、叙事、情绪、节奏、资源框架、五维爆款评分 | 视频模块“分析控制台”和“爆款特征库”详情 | 已迁移，特征库从成功拆解日志派生 |
| 爆款特征库管理 | `GenerationLogEntry.review.rating` 复用为精选 / 归档 | 已迁移，支持搜索、筛选、精选、归档、恢复 |
| 爆款模板改写新产品脚本 | `VideoWorkflowService.generateScript` 和视频模块“脚本改写” | 已迁移，关联拆解时严格映射镜头数、timeRange、shotType 和资源框架 |
| 脚本五维 AI 质检 | `VideoWorkflowService.evaluateScript`、`video-script-evaluation` 日志 | 已迁移，走真实文字模型或 blocked / failed |
| 单镜头重写 | `VideoWorkflowService.rewriteScriptShot`、`video-script-shot-rewrite` 日志 | 已迁移，保留源脚本日志追溯 |
| 脚本历史、评分反馈、关联模板 | 视频模块“脚本历史” | 已迁移，从本地成功脚本日志派生，反馈写回 review |
| 内容生产分段策略 | `videoProductionSegments.ts` | 已迁移，按 5 / 10 秒、口播时长、角色和场景变化切段 |
| 角色图 / 场景图 / 镜头视频 Prompt | `videoProductionPrompts.ts` 和“Prompt 交接” | 已迁移为可复制 Prompt、审核清单和导出清单 |
| 第三方视频平台交接 | Prompt 交接、成品视频导入 | 已迁移为“复制 Prompt + 手动导入成品”，不创建第三方任务 |

## 3. 不迁移范围

| 源项目能力 | 不迁移原因 |
| --- | --- |
| Auth、Admin、JWT、中间件 | 内容工厂是本地桌面工作台，不引入源项目在线用户体系 |
| Supabase 表、Storage、清理接口 | 当前事实源是工作区 `.content-studio/`，不做生产数据库清理或云存储管理 |
| Seedance 创建任务、轮询状态、在线任务 ID | 第三方平台任务不在内容工厂内创建或追踪，只做 Prompt 交接和成品手动导入 |
| 无 Key mock 成功分支 | 当前产品边界要求未配置真实 Provider 时 blocked / failed，禁止伪造成功 |
| Next.js 页面和一级导航 | 只参考工作流和信息结构，不搬外部产品的信息架构 |

## 4. 已补关键质量门禁

- 新增 Electron E2E 成功链路：从视频工作台上传本地视频、调用本地 mock `generic-http` 理解 Provider、写入 `video-breakdown` 成功日志，并在爆款特征库消费同一条日志。
- E2E 明确断言 Provider 协议字段：`operation: analyze`、`source_type: file`、`source`、`dimensions`、`model` 和 Bearer 鉴权头。
- 脚本生成不再用本地默认文案补齐模型缺失字段；模型缺少 `visual`、`voiceover`、`subtitle`、`rhythm`、`shotType`、`imagePrompt` 或 `videoPrompt` 时直接失败，不写入不完整脚本。
- Prompt 交接的第三方边界已从主动作中分离：主路径只保留“打开视频 Prompt 交接”和“导入成品视频”；内部视频生成作为已配置 Provider 时的独立可选入口。

## 5. 剩余非本阶段项

- 长脚本分批生成：源项目超过 20 镜的分批生成策略尚未迁移；当前内容工厂一次生成并严格校验目标镜头数。
- URL 视频输入：`generic-http` Provider 可处理 URL；原生视觉理解链路仍以本地文件为主，URL 只保留为可交给支持 URL 的 Provider 的输入。
- 外部视频平台生产任务：仍由用户在第三方平台执行，内容工厂不接管第三方队列、状态轮询、失败重试或计费事实。
- 真实业务素材验收：当前已补本地 mock 和 blocked 路径，仍需要用真实用户配置的 Provider 与真实参考视频补充业务验收证据。

## 6. 完成度判断

核心迁移完成度约 95%：爆款拆解、特征库、脚本生成、AI 质检、单镜头重写、脚本历史、Prompt 交接和内容生产分段已落地到内容工厂。

源项目在线系统完成度不计入本阶段：Auth / Admin / Supabase / Seedance 任务系统按客户端边界明确不迁移。
