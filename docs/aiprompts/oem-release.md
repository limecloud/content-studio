# OEM 桌面包发布 Agent 流程

## 什么时候触发

用户出现以下任一意图时，按本流程处理，并优先使用 `.codex/skills/content-studio-oem-release/`：

- “发布 vX.Y.Z”“上线 stable”“promote”
- “bugu / seenx 还是旧的”“官网下载还是旧版本”
- “无法发布”“继续发布”“继续”“是”
- “R2 latest / download-manifest / 下载卡片不对”
- “把 GitHub Release 同步到 R2”

如果用户只说“继续”或“是”，先结合最近上下文判断是否仍在发布链路中；不要把确认词当成独立需求。

## 事实源

- GitHub Release：不可变安装包归档和审计入口。
- `Release Desktop Packages`：只负责构建并上传 GitHub Release 资产。
- `Publish OEM Distribution`：负责用户可见分发，包含控制面 latest、R2 包、分平台 latest、全局 `_manifests/latest.json` 和线上验证。
- 控制面 latest API：
  - `bugu` 的 appId 是 `buguai`
  - `seenx` 的 appId 是 `seenx`
- R2 分平台 latest：`desktop/content-studio/{brand}/{platform}/latest.json`
- 官网下载卡片 API：`https://api.bugu.run/api/v1/public/download-manifest`
- 全局 manifest：R2 `desktop/content-studio/_manifests/latest.json`

详细背景见 `oem/README.md` 的“一键发布分发链路”。

## 默认处理顺序

1. 只读盘点工作区：

```bash
git status --short
```

2. 校验目标 tag 的 GitHub Release 产物是否完整：

```bash
npm run oem:r2:publish -- --tag=vX.Y.Z --brands=all --dry-run=true
```

3. 校验线上当前状态：

```bash
npm run oem:release:verify-online -- --tag=vX.Y.Z --brands=all --channel=stable
```

4. 如果用户只是反馈“官网还是旧的”，按顺序定位：

- 控制面 latest API 是否旧。
- R2 `{brand}/{platform}/latest.json` 是否旧。
- `download-manifest` / `_manifests/latest.json` 是否旧。
- 官网页面是否缓存旧数据；用 Playwright MCP 看真实卡片和 network 响应，不只看 HTML。

5. 需要真实发布时，先按 `AGENTS.md` 做危险操作确认，再触发 workflow：

```bash
gh workflow run "Publish OEM Distribution" \
  -f brands=all \
  -f tag=vX.Y.Z \
  -f channel=stable \
  -f promote_control_plane=true \
  -f dry_run=false
```

随后用 `gh run list --workflow "Publish OEM Distribution"` 找 run，并用 `gh run watch <run-id>` 跟进。

## 高风险确认模板

```text
⚠️ 危险操作检测！
操作类型：发布 OEM 桌面包到控制面和生产 R2
影响范围：bugu/seenx latest API、R2 分平台 latest、全局 download-manifest、官网下载卡片
风险评估：会改变用户可见下载版本；若 tag 或品牌选择错误，用户会看到错误安装包

请确认是否继续？[需要明确的“是 / 确认 / 继续”]
```

用户确认前，只允许 dry run、只读 API 查询、页面验证和日志读取。

## 发布后验证

必须执行：

```bash
npm run oem:release:verify-online -- --tag=vX.Y.Z --brands=all --channel=stable
```

必要时补充只读检查：

```bash
curl -fsSL "https://api.bugu.run/api/v1/public/download-manifest?verify=$(date +%s)" | jq '{tag: .data.tag, builds: [.data.builds[] | {brand, platform, tag}]}'
curl -fsSL "https://lime-api.limeai.run/api/v1/public/agent-apps/buguai/downloads/latest?channel=stable" | jq '.data.version'
curl -fsSL "https://lime-api.limeai.run/api/v1/public/agent-apps/seenx/downloads/latest?channel=stable" | jq '.data.version'
```

用 Playwright MCP 验证：

- `https://bugu.run` 下载卡片显示目标版本，链接指向 `downloads.bugu.run/.../vX.Y.Z/...`。
- `https://seenx.run` 显示目标版本，页面下载链接可访问。

## 常见坑

- 不要用临时 Worker 手工补分发；优先走 `Publish OEM Distribution`。
- 不要只更新单品牌的全局 manifest；`_manifests/latest.json` 必须保留 bugu + seenx 的完整 build 集合。
- 不要打印或粘贴 R2、GitHub、控制面 token。
- GitHub Release 产物缺失时，先修构建发布，不能继续覆盖 latest。
- `dry_run=true` 只校验，不代表用户可见入口已经更新。
