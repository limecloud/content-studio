# content-studio OEM 发布检查清单

## 触发意图

用户出现以下说法时，按 OEM 发布分发处理：

- “发布 vX.Y.Z / 上线 stable / promote”
- “bugu / seenx 还是旧的”
- “官网下载还是旧版本”
- “无法发布 / 继续发布”
- “R2 latest / download-manifest / 下载卡片不对”
- “把 GitHub Release 同步到 R2”

## 事实源

- GitHub Release：不可变安装包归档和审计入口。
- 控制面 latest API：
  - bugu appId 是 `buguai`
  - seenx appId 是 `seenx`
- R2 分平台 latest：
  - `desktop/content-studio/{brand}/{platform}/latest.json`
- 官网下载卡片事实源：
  - `https://api.bugu.run/api/v1/public/download-manifest`
  - 背后依赖 R2 `desktop/content-studio/_manifests/latest.json`
- bugu 下载域名：`https://downloads.bugu.run`
- seenx 页面可能使用：`https://downloads.limeai.run`

## 推荐发布流程

1. 只读盘点：

```bash
git status --short
```

2. 校验 GitHub Release 产物完整性：

```bash
npm run oem:r2:publish -- --tag=vX.Y.Z --brands=all --dry-run=true
```

3. 如果 release 产物缺失，先处理 `Release Desktop Packages`，不要继续写 R2 latest。

4. 真实发布前必须确认：

```text
⚠️ 危险操作检测！
操作类型：发布 OEM 桌面包到控制面和生产 R2
影响范围：bugu/seenx latest API、R2 分平台 latest、全局 download-manifest、官网下载卡片
风险评估：会改变用户可见下载版本；若 tag 或品牌选择错误，用户会看到错误安装包

请确认是否继续？[需要明确的“是 / 确认 / 继续”]
```

5. 推荐用 GitHub Actions 真实发布：

```bash
gh workflow run "Publish OEM Distribution" \
  -f brands=all \
  -f tag=vX.Y.Z \
  -f channel=stable \
  -f promote_control_plane=true \
  -f dry_run=false
```

随后用 `gh run list --workflow "Publish OEM Distribution"` 找 run，并用 `gh run watch <run-id>` 跟进。

6. 如果用户明确要求本地发布，才使用本地脚本；本地必须有 R2 S3 token：

```bash
R2_ACCOUNT_ID=... \
R2_ACCESS_KEY_ID=... \
R2_SECRET_ACCESS_KEY=... \
npm run oem:r2:publish -- --tag=vX.Y.Z --brands=all
```

不要打印任何 token 或 secret。

## 发布后验证

必须跑：

```bash
npm run oem:release:verify-online -- --tag=vX.Y.Z --brands=all --channel=stable
```

必要时补充：

```bash
curl -fsSL "https://api.bugu.run/api/v1/public/download-manifest?verify=$(date +%s)" | jq '{tag: .data.tag, builds: [.data.builds[] | {brand, platform, tag}]}'
curl -fsSL "https://lime-api.limeai.run/api/v1/public/agent-apps/buguai/downloads/latest?channel=stable" | jq '.data.version'
curl -fsSL "https://lime-api.limeai.run/api/v1/public/agent-apps/seenx/downloads/latest?channel=stable" | jq '.data.version'
```

用 Playwright 验证：

- `https://bugu.run` 下载卡片显示目标版本，链接指向 `downloads.bugu.run/.../vX.Y.Z/...`
- `https://seenx.run` 显示目标版本，页面下载链接 HEAD 为 200

## 旧版本排查顺序

1. 控制面 API 是否旧：
   - `lime-api.limeai.run/api/v1/public/agent-apps/buguai/downloads/latest`
   - `lime-api.limeai.run/api/v1/public/agent-apps/seenx/downloads/latest`
2. R2 分平台 latest 是否旧：
   - `downloads.bugu.run/desktop/content-studio/{brand}/{platform}/latest.json`
3. 官网全局 manifest 是否旧：
   - `api.bugu.run/api/v1/public/download-manifest`
4. 官网页面是否旧：
   - Playwright 快照看实际下载卡片
   - Network 看请求响应体，不要只看 SSR HTML

如果只有第 3 项旧，问题通常是 `_manifests/latest.json` 未更新或只包含单品牌。用 `Publish OEM Distribution` 修复。
