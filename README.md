# 内容工坊 / Content Studio

内容工坊是一个基于 Electron、React、Vite 和官方 `@anthropic-ai/claude-agent-sdk` 的桌面内容工程化工作台。

v0.1.0 的产品主线不是通用聊天 Agent，而是面向电商和个人 IP 内容生产的「已成型知识库 -> 提示词包 -> 场景库 -> 文章 / 图片 / 视频素材」闭环。

```text
已成型知识库
-> 品牌 / 产品提示词包
-> 产品场景库
-> 文案 / 脚本 / 图片提示词
-> 图片素材
-> 视频生成队列
-> 生成历史 / 素材库
```

## 当前定位

- **桌面壳**：Electron + React + Vite + TypeScript。
- **文本编排底座**：官方 `@anthropic-ai/claude-agent-sdk`。
- **Skills**：支持内置、workspace `.claude/skills`、兼容 `.agents/skills`、用户级 Skills。
- **知识库**：v1 只消费已经成型的产品型知识库和个人 IP 型知识库。
- **本地事实源**：workspace 下的 `.content-studio` 保存知识库索引、提示词包、场景卡、生成日志和 Skill 启用状态。
- **安全边界**：API Key 只在 Electron main process 保存，Renderer 不读取明文 Key、不直接执行文件或命令。

## v0.1.0 已包含

- 深色三栏桌面工作台：左侧能力导航、中间内容生产区、右侧全局参数舱。
- 模型配置：统一 API endpoint、API Key、文字模型、图片模型、视频模型。
- Skills 管理：扫描、安装内置 Skill、启用 / 停用、无效 Skill 错误展示。
- 已成型知识库：内置脱敏样例、workspace 安装、DOCX / Markdown / TXT / JSON 导入、关键词检索和引用选择。
- 提示词包：从知识引用生成品牌口吻、视觉风格、卖点规则、合规边界和平台约束。
- 产品场景库：生成目标人群、痛点、使用场景、画面构图、口播方向和素材建议。
- 文章生成：生成标题候选、大纲、Markdown 草稿和发布检查。
- 图片 / 视频生成请求：真实媒体 provider 未接入时返回 `blocked`，同时记录完整请求日志。
- 生成历史：记录提示词包、场景卡、文章、图片请求和视频队列请求。

## v0.1.0 不包含

- 不做竞品抓取、用户差评采集、店铺诊断和策略报告生成。
- 不做 AI 自动搭建知识库；只接入用户已有的成型知识库。
- 不接入真实图片 / 视频模型网关；图片和视频结果不会伪造成功素材。
- 不做云端协作、团队权限、计费、多租户、复杂向量 RAG。
- 不 fork Craft，不迁移 Craft 的远程 server、MCP、多会话 inbox 或通用聊天复杂度。

## 快速开始

```bash
npm install
npm run dev
```

首次运行后：

1. 打开「模型配置」，填写 endpoint、API Key 和模型名。
2. 选择一个 Workspace。
3. 在「知识库」中安装内置样例或导入 DOCX / Markdown / TXT / JSON 成型知识库。
4. 检索并选择知识引用。
5. 生成品牌 / 产品提示词包，再生成产品场景库。
6. 进入文章、图片或视频模块生成内容资产或生成请求。

## 目录结构

```text
src/main/                 Electron main process
  services/               Settings、模型配置、Skills、知识库、提示词包、场景库、生成日志
  providers/              图片 / 视频 provider adapter
src/preload/              类型化 IPC facade
src/renderer/             React 工作台 UI
src/shared/               main / preload / renderer 共用类型
resources/skills/         App 内置 Skill 模板
resources/knowledge-bases/脱敏内置知识库样例
docs/roadmap/v1/          v1 PRD、UI 蓝图、架构图和实施计划
```

## Skills 路径

内容工坊优先使用 Claude 官方路径，同时兼容 Craft 风格路径：

```text
<workspace>/.claude/skills/{slug}/SKILL.md
<workspace>/.agents/skills/{slug}/SKILL.md
~/.claude/skills/{slug}/SKILL.md
~/.agents/skills/{slug}/SKILL.md
```

## 本地验证

```bash
npm run typecheck
npm run build
```

## Release Notes

详见 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)。

## 参考

- Craft Agents OSS: https://github.com/craft-ai-agents/craft-agents-oss
- Claude Agent SDK: https://docs.claude.com/en/docs/agent-sdk/overview
- Claude Agent SDK Skills: https://docs.claude.com/en/docs/agent-sdk/skills
