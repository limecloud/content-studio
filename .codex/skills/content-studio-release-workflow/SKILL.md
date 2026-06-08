---
name: content-studio-release-workflow
description: 准备并执行 content-studio 通用版本发布流程。适用于用户要求更新 Content Studio / 布谷AI 版本号、同步 package.json / package-lock.json / RELEASE_NOTES.md、运行发布前验证门禁、构建桌面包、创建 commit 或 tag、推送 tag 到 GitHub，或从中断的版本发布流程恢复；不处理 bugu/seenx OEM latest、R2、download-manifest 或官网下载卡片分发。
---

# Content Studio 通用发版流程

## 边界

- 本 skill 只处理仓库版本发布：版本号、发布说明、本地门禁、桌面包构建、commit / tag / push 确认和 Release workflow 跟进。
- bugu / seenx 的 stable、latest、R2、download-manifest、官网下载卡片和控制面 latest 继续使用 `.codex/skills/content-studio-oem-release/`。
- 发版属于高风险流程。`git commit`、`git tag`、`git push`、GitHub Release 创建 / 更新、删除文件、覆盖 tag、真实调用生产 API 前，必须按 `AGENTS.md` 的中文危险操作格式确认。
- 如果工作区已有大量未提交改动，先声明本轮写集；只修改发版事实源，不回滚、不覆盖用户改动。

## 启动检查

1. 先读：
   - `AGENTS.md`
   - `.codex/skills/README.md`
   - `package.json`
   - `RELEASE_NOTES.md`
2. 盘点现状：
   ```bash
   git status --short
   git log --oneline --decorate --max-count=20
   git tag --list "vX.Y.Z"
   ```
3. 明确目标版本：
   - 用户给出 `vX.Y.Z` 或 `X.Y.Z` 时，规范化为版本 `X.Y.Z` 和 tag `vX.Y.Z`。
   - 用户未给版本时，只能读取当前版本并建议 bump；不能擅自发版。
4. 如果上一轮命令仍在跑，只处理自己启动且已被用户中断的进程；不要终止明显属于用户的 dev server / Electron / 测试进程。

## 版本事实源

版本改动必须同步：

- `package.json`
- `package-lock.json`
- `RELEASE_NOTES.md`

检查项：

```bash
rg -n '旧版本|目标版本' "package.json" "package-lock.json" "RELEASE_NOTES.md" "electron-builder.yml" "forge.config.mjs" ".github/workflows"
```

说明：

- `electron-builder.yml` 和 `forge.config.mjs` 目前不硬编码应用版本；只在发布相关配置变更时修改。
- `resources/app-server/app-server.release.json` 默认是本地 sidecar manifest，不等同桌面应用版本；只有发布任务明确涉及 App Server sidecar 资源时才修改。
- 锁文件优先用 `npm version --no-git-tag-version X.Y.Z` 或结构化 JSON 更新，避免手工漏改。

## Release Notes

事实源是根目录 `RELEASE_NOTES.md`，中文为 primary。

生成内容时参考：

```bash
git describe --tags --abbrev=0
git log <last-tag>..HEAD --pretty=format:"%s (%h)" --no-merges
git diff --stat
```

格式保持现有风格：

```markdown
## vX.Y.Z - YYYY-MM-DD

### 主题

- 面向发布对象描述变更，不逐条照搬内部 commit message。

### 验证

- `npm run verify:local`
```

如只做 release note 或文档更新，可降级验证，但最终汇报必须说明降级理由。

## 验证矩阵

版本发布前默认执行：

```bash
npm run verify:local
```

根据变更范围补充：

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
npm run smoke:app-server
npm run app-server:backend:test
```

规则：

- 普通代码变更至少跑 `npm run typecheck`。
- 可交付功能变更跑 `npm run build`。
- 主工作台 / preload / IPC 主链改动优先补跑 `npm run smoke:electron`。
- 打包、图标、release 配置改动跑对应 `npm run dist:*`；macOS 本地优先 `npm run dist:mac`。
- GUI / E2E 失败必须修真实用户路径；不能通过跳过测试、放宽断言或无意义等待绕过。

## Commit / Tag / Push

执行任何 git 写操作前，先汇总：

- 目标版本与 tag。
- 将纳入提交的文件列表。
- 已通过、失败、未执行的验证。
- 是否存在未提交的非发版改动。
- 是否会触发 GitHub Release / Actions。

然后按 `AGENTS.md` 危险操作格式请求确认。确认后才执行：

```bash
git add <release-files-and-intended-changes>
git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "布谷AI vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

如果 tag 已存在，不要覆盖；先说明本地与远端 tag 状态，并单独确认删除或重建策略。

## Release / CI 跟进

推送后按仓库事实源跟进：

```bash
gh run list --workflow "Release Desktop Packages"
gh run watch <run-id>
```

如 CI 或 release workflow 失败，先读取日志、复现或对齐失败，再修复并重新跑本地相关验证；不要只依赖远端 CI 试错。

## 收尾输出

最终汇报必须包含：

- 本轮完成度百分比。
- 版本号、tag、release note 路径。
- 实际修改的发版事实源。
- 验证命令结果与任何环境限制。
- 是否已经 commit / tag / push。
- 如需要用户可见下载更新，明确下一步转入 `content-studio-oem-release`。
