# OEM 品牌构建

`oem/brands/*.json` 是桌面端打包期品牌清单事实源。每个品牌一个 manifest，构建时只读取当前 `--brand` 对应的文件，并生成 `.tmp/oem/<brand>/` 下的单品牌打包目录。

## Manifest 字段

- `brandId`：构建选择和产物目录名，例如 `bugu`、`seenx`。
- `tenantId`：客户端请求 LimeCore `/client/bootstrap` 使用的租户 ID。
- `appId`：Electron `appId` 和 `.skill` 文件关联 UTI 前缀。
- `productName` / `shortName`：窗口标题、登录页、侧边栏、关于页和本地 fallback branding。
- `artifactName`：安装包文件名前缀。
- `apiBaseUrl`：客户端账号、bootstrap 和更新检查的控制面 API base URL。
- `downloadBaseUrl`：客户端更新兜底清单和安装包所在的统一 R2 下载域名，例如 `https://downloads.limeai.run`。
- `supportUrl`：账号验证 / 支持入口，可选。
- `skillPackageName` / `skillPackageDescription` / `skillMimeType`：`.skill` 文件关联信息。
- `icons.png` / `icons.icns` / `icons.ico`：当前品牌图标资源。

## 本地命令

```bash
npm run build
node scripts/prepare-oem-build.mjs --brand=seenx
npx electron-builder --config .tmp/oem/seenx/electron-builder.json --mac dir --publish never
node scripts/assert-oem-artifact-scope.mjs --brand=seenx
```

清理当前品牌临时目录和产物：

```bash
node scripts/clean-oem-build.mjs --brand=seenx
```

## CI 行为

- tag push 仅自动构建 `bugu + mac`，并发布到 GitHub Release。
- 其他品牌和其他平台必须通过 `workflow_dispatch` 手动构建；本地自建时使用上面的 prepare / electron-builder / assert 三步。
- `workflow_dispatch` 默认手动构建 `seenx + mac + publish=false`。
- `workflow_dispatch` 默认 `sync_r2=true`，构建产物会按 `desktop/content-studio/<brand>/<platform>/<tag>/` 写入 Cloudflare R2；同目录生成 `manifest.json`，并更新 `desktop/content-studio/<brand>/<platform>/latest.json`。
- 手动输入 `brand=all` 或 `platform=all` 时会展开矩阵，但 workflow 设置 `max-parallel: 1`，避免免费 GitHub runner 同时占用过多。
- 发布后只有本次 brands 包含 `bugu` 时才触发布谷官网 R2 同步。

## R2 目录

GitHub Actions 会先把每个矩阵产物保存为 `brand__platform` artifact，再用 `scripts/prepare-oem-r2-layout.mjs` 生成上传目录。

```text
desktop/content-studio/<brand>/<platform>/<tag>/
desktop/content-studio/<brand>/<platform>/latest.json
desktop/content-studio/_manifests/<tag>.json
desktop/content-studio/_manifests/latest.json
```

需要在仓库 secrets 配置 `CONTENT_STUDIO_R2_ACCOUNT_ID`、`CONTENT_STUDIO_R2_ACCESS_KEY_ID`、`CONTENT_STUDIO_R2_SECRET_ACCESS_KEY` 和 `CONTENT_STUDIO_R2_BUCKET`。缺少 secrets 时 workflow 会保留 `oem-r2-layout` artifact 并跳过实际 R2 同步。
