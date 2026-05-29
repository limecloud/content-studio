# `docs/aiprompts` 索引

本目录存放布谷AI内容工厂面向 Agent 的长期流程、触发语义和工程导航。
根 `AGENTS.md` 只保留仓库级硬规则和入口；具体流程沉淀到本目录或 `.codex/skills/`。

## 使用原则

1. **先按意图找入口** - 用户只说“继续”“还是旧的”“无法发布”时，先回看最近上下文并匹配本目录场景。
2. **先读对应文档再操作** - 涉及发布、生产 API、R2、GitHub Actions 或官网验证时，先读对应流程。
3. **Skill 承载高频动作** - 高频、易错、可复用流程同步沉淀为 `.codex/skills/`，文档保留事实源和排查顺序。
4. **真实生产写入先确认** - 任何会改变用户可见版本、R2 latest、控制面 latest、Release 或 tag 的动作必须按 `AGENTS.md` 确认。

## 按场景导航

- `business-ux-contract.md` - 桌面端业务型 UI 契约、反功能平铺门禁和原型生成提示词。
- `oem-release.md` - bugu / seenx 桌面包发布、R2 latest、download-manifest、官网仍显示旧版本的处理流程。
- `../roadmap/v2/README.md` - v2 内容工厂主线路线图。
- `../roadmap/ontology/README.md` - Ontology / 品牌内容操作地图路线图。

## 对应 Codex Skills

- `.codex/skills/bugu-product-design-cheatsheet/` - PRD 驱动的布谷AI桌面端产品原型和业务 UI 设计。
- `.codex/skills/content-studio-oem-release/` - OEM 桌面包分发发布与旧版本排查。

## 维护规则

1. 新增长期流程后，同步更新本索引和根 `AGENTS.md` 的文档导航。
2. 如果某条流程已经高频复用且容易出错，同步沉淀为 `.codex/skills/`。
3. 如果文档和 skill 出现重复，以具体流程文档为事实源，skill 只保留触发、路由和必要检查。
