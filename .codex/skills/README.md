# 布谷AI内容工厂仓库技能索引

本目录存放 content-studio 仓库级 Codex skills。
这些 skill 不是替代 `AGENTS.md` 或 `docs/aiprompts/`，而是把高频、易错、可重复执行的工作流做成触发入口。

## 当前仓库级 skills

- `bugu-product-design-cheatsheet`：基于 PRD、用户故事、用户用例和业务 UI 契约生成布谷AI桌面端产品原型，默认阻断功能罗列式 UI。
- `content-studio-design-language`：统一布谷AI内容工厂桌面工作台的布局、控件密度和视觉语言，覆盖左侧参数栏、顶部能力带、案例网格、右侧历史抽屉等模式。
- `content-studio-app-server`：处理 Lime App Server sidecar、runtime provider store、Agents 状态机 / UI 回归和随包资源发布门禁。
- `content-studio-release-workflow`：准备并执行 Content Studio 通用版本发布流程，覆盖版本号、`RELEASE_NOTES.md`、发布前验证、桌面包构建、commit / tag / push 确认。
- `content-studio-oem-release`：发布或修复 bugu / seenx OEM 桌面包分发链路，覆盖控制面 latest、Cloudflare R2、全局 download-manifest 和官网验证。

## 入口关系

- 仓库规则：看 `AGENTS.md`
- Agent 文档索引：看 `docs/aiprompts/README.md`
- 业务 UI 契约：看 `docs/aiprompts/business-ux-contract.md`
- App Server / Agents runtime：看 `docs/aiprompts/app-server-workflow.md`
- OEM 发布事实源：看 `docs/aiprompts/oem-release.md` 和 `oem/README.md`
- 高频 UI / 原型入口：看 `.codex/skills/bugu-product-design-cheatsheet/`
- 统一工作台设计语言：看 `.codex/skills/content-studio-design-language/`
- App Server 资源和 Agents runtime 门禁：看 `.codex/skills/content-studio-app-server/`
- 通用版本发布入口：看 `.codex/skills/content-studio-release-workflow/`
- 高频发布执行入口：看 `.codex/skills/content-studio-oem-release/`

## 维护规则

1. 新增长期复用的仓库级工作流时，优先评估是否应该新增 skill。
2. 新增或重构 skill 时，同步检查 `docs/aiprompts/` 文档是否仍是事实源。
3. 如果 skill 依赖的长流程已经迁到新文档，及时同步 skill 的读取入口。
