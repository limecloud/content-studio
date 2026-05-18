# Release Notes

## v0.1.0 - 2026-05-18

### 版本定位

内容工坊 v0.1.0 是第一版 Electron 桌面初始化版本，目标是把项目从通用 Claude Agent / Skills 骨架收敛成面向电商内容工程化的工作台。

核心主链：

```text
已成型知识库 -> 品牌 / 产品提示词包 -> 产品场景库 -> 文案 / 脚本 / 图片提示词 -> 图片素材 -> 视频生成队列 -> 生成历史
```

### 新增能力

- 新增深色三栏桌面工作台：左侧能力导航、中间内容生产区、右侧全局参数舱。
- 新增模型配置：统一 API endpoint、API Key、文字模型、图片模型、视频模型。
- 新增 Skills 管理：扫描内置 / workspace / 用户级 Skills，支持安装内置 Skill 到 workspace，支持启用 / 停用。
- 新增已成型知识库模块：支持内置样例、workspace 安装、DOCX / Markdown / TXT / JSON 导入、关键词检索和引用选择。
- 新增脱敏内置知识库样例：产品型知识库和个人 IP 型知识库。
- 新增品牌 / 产品提示词包生成：基于知识引用生成品牌口吻、视觉风格、卖点规则、合规边界和平台约束。
- 新增产品场景库生成：基于提示词包生成目标人群、痛点、场景、画面构图、口播方向和素材建议。
- 新增文章生成初始化链路：本地生成标题候选、大纲、Markdown 草稿和发布检查，并记录生成日志。
- 新增图片 / 视频 provider adapter：在真实媒体模型未接入时返回 blocked 状态，避免伪造成功素材，同时保留完整生成请求日志。
- 新增生成历史 / 素材库最小闭环：记录提示词包、场景卡、文章、图片请求和视频队列请求。

### 新增内置 Skills

- `prompt-pack-builder`：提示词包构建师。
- `scene-library-builder`：场景库构建师。
- `ecommerce-image-prompt`：电商图片提示词师。
- `video-breakdown`：爆款视频拆解师。
- `video-script-writer`：视频脚本生成师。
- `compliance-reviewer`：合规审核员。
- `brand-voice-keeper`：品牌口吻守门员。
- `knowledge-citation-picker`：知识引用选择器。

### 工程更新

- 补齐类型化 IPC 与 preload bridge，使 `ContentStudioApi` 覆盖 v1 主链。
- 新增 main process 本地 JSON stores：模型配置、Skill 选择、知识库、提示词包、场景卡、生成日志。
- 新增 DOCX 文本提取基础能力，依赖 `yauzl` 与 `fast-xml-parser`。
- 保持官方 `@anthropic-ai/claude-agent-sdk` 作为文本编排底座，媒体生成走独立 provider adapter。
- 不 fork Craft，不迁移 Craft 的远程 server、MCP、多会话 inbox 或通用聊天复杂度；只参考 workspace / Skills / typed bridge 的架构思路。

### 明确不包含

- 不做竞品抓取、差评采集、店铺诊断、策略报告生成。
- 不做 AI 自动搭建知识库；v0.1.0 只消费已经成型的知识库。
- 不接入真实图片 / 视频模型网关；图片和视频生成请求会记录为 blocked。
- 不做云端协作、团队权限、计费、多租户和复杂向量 RAG。

### 验证

- `npm run typecheck` 通过。
- `npm run build` 通过。
