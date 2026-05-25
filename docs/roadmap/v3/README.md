# 布谷 AI 内容工厂 v3 路线图

更新时间：2026-05-23  
状态：Draft

## 一句话目标

把 `bugu` 做成支持 OEM 的品牌前台与素材中台：承接官网、案例、素材、下载、自有登录 / 控制台和租户级站点配置；`limecore` 只提供通用中台抽象，`content-studio` 继续负责生产端。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [`prd.md`](./prd.md) | v3 产品需求、范围、用户故事和验收标准。 |
| [`architecture-diagrams.md`](./architecture-diagrams.md) | Cloudflare / 阿里云 / 私有化 / LimeCore / OEM 的整体架构和数据流。 |
| [`ui-blueprint.md`](./ui-blueprint.md) | 首页、案例、素材、下载、登录、控制台与 OEM 管理界面蓝图。 |
| [`data-model.md`](./data-model.md) | 租户、站点配置、案例、素材、下载和资产元数据模型。 |
| [`integration-contracts.md`](./integration-contracts.md) | `api.bugu.run`、LimeCore public API 和 OEM 管理接口契约。 |
| [`implementation-plan.md`](./implementation-plan.md) | 分阶段落地计划、写集和验证方式。 |

## 与 v2 的关系

- v2 继续描述 `content-studio` 桌面工作台和内容生产链路。
- `bugu/docs/roadmap/v2` 承接 Bugu 站点侧的 OEM 前台、独立域名、案例 / 素材 / 下载承载、账号 / 控制台体验和部署适配器事实源。
- 这里保留跨仓库的总规划视角，用来串联生产端与站点端，不作为 Bugu 服务端实现事实源。
