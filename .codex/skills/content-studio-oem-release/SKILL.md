---
name: content-studio-oem-release
description: 发布或修复 content-studio OEM 桌面包分发链路。Use when the user asks to 发布/上线/提升/promote/release bugu or seenx, says 继续/是 in an existing release context, update stable/latest, fix 官网/下载页/客户端仍显示旧版本, sync GitHub Release to Cloudflare R2, update download-manifest, or verify bugu.run/seenx.run download cards and R2 latest.json.
---

# Content Studio OEM Release

## 工作原则

- 先读 `AGENTS.md` 的高风险确认规则；任何真实写生产控制面、GitHub Release、Cloudflare R2、GitHub Actions workflow 的动作都必须先中文确认。
- 同时读 `docs/aiprompts/oem-release.md`；该文档是发布意图触发、排查顺序和验证命令的 Agent 事实源。
- 默认目标是完整分发闭环：GitHub Release 产物存在 -> 控制面 latest -> R2 分平台 latest -> R2 全局 `_manifests/latest.json` -> 官网/API/下载链接验证。
- 不再手工拼临时 Worker；优先使用仓库脚本和 `Publish OEM Distribution` workflow。
- 不要只更新单品牌全局 manifest。`_manifests/latest.json` 必须保留 bugu + seenx 的完整 build 集合，或用脚本自动 merge。

## 快速路径

1. 读取 [release-checklist.md](references/release-checklist.md)。
2. 运行只读检查：
   ```bash
   git status --short
   npm run oem:r2:publish -- --tag=vX.Y.Z --brands=all --dry-run=true
   npm run oem:release:verify-online -- --tag=vX.Y.Z --brands=all --channel=stable
   ```
3. 若用户只是说“官网还是旧的 / 无法发布 / 继续”，先用验证脚本和 Playwright 定位旧数据来自：
   - 控制面 `agent-apps/.../downloads/latest`
   - R2 `{brand}/{platform}/latest.json`
   - 全局 `download-manifest` / `_manifests/latest.json`
   - 官网前端缓存或错误域名
4. 若需要真实发布，优先触发 GitHub workflow：
   ```bash
   gh workflow run "Publish OEM Distribution" \
     -f brands=all \
     -f tag=vX.Y.Z \
     -f channel=stable \
     -f promote_control_plane=true \
     -f dry_run=false
   ```
5. 发布后必须验证 `downloads.bugu.run`、`downloads.limeai.run`、`api.bugu.run/api/v1/public/download-manifest`、控制面 latest API，并用 Playwright 看 `bugu.run` / `seenx.run` 页面。

## 收尾

汇报必须包含：目标 tag、品牌范围、workflow/run 链接或本地命令、R2/API/官网验证结果、临时缺口。没有用户明确要求时不要提交 commit。
