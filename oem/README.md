# OEM 品牌构建

`oem/brands/*.json` 是桌面端打包期品牌清单事实源。每个品牌一个 manifest，构建时只读取当前 `--brand` 对应的文件，并生成 `.tmp/oem/<brand>/` 下的单品牌打包目录。

## Manifest 字段

- `brandId`：构建选择和产物目录名，例如 `bugu`、`seenx`。
- `tenantId`：客户端请求控制面 `/client/bootstrap` 使用的租户 ID。
- `appId`：Electron `appId` 和 `.skill` 文件关联 UTI 前缀。
- `productName` / `shortName`：窗口标题、登录页、侧边栏、关于页和本地 fallback branding。
- `artifactName`：安装包文件名前缀。
- `apiBaseUrl`：客户端账号、bootstrap 和更新检查的控制面 API base URL。`bugu` 只允许使用 `https://bugu.run/api`。
- `downloadBaseUrl`：客户端更新兜底清单和安装包所在的同域下载 base URL。`bugu` 只允许使用 `https://bugu.run`。
- `supportUrl`：账号验证 / 支持入口，可选。
- `skillPackageName` / `skillPackageDescription` / `skillMimeType`：`.skill` 文件关联信息。
- `icons.png` / `icons.icns` / `icons.ico`：当前品牌图标资源。

## 域名边界

布谷官网只维护 `bugu.run` 和 `www.bugu.run` 两个公网域名。不要再为布谷发布链路新增或恢复 `api.bugu.run`、`downloads.bugu.run` 或按 OEM 品牌拆分的下载域名，避免 Railway / CDN 侧证书数量失控。

`bugu` 桌面包的运行时配置必须走同域入口：

```json
{
  "apiBaseUrl": "https://bugu.run/api",
  "downloadBaseUrl": "https://bugu.run"
}
```

其他 OEM 品牌可以保留自己的控制面配置，但不应假设布谷官网会为每个 OEM 绑定独立公网域名。

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

- tag push 自动构建 `bugu / seenx + mac / win / linux`，并发布到 `content-studio` GitHub Release。
- 单品牌或单平台构建可通过 `workflow_dispatch` 手动触发；本地自建时使用 prepare / electron-builder / assert 三步。
- `workflow_dispatch` 默认手动构建 `seenx + mac + publish=false`。
- 手动输入 `brand=all` 或 `platform=all` 时会展开矩阵，但 workflow 设置 `max-parallel: 1`，避免免费 GitHub runner 同时占用过多。
- Release workflow 不再同步 Cloudflare R2，也不再触发 `limecloud/bugu` 的 R2 同步 workflow。官网 / 客户端侧应从 `bugu.run` 同域入口或 GitHub Release 资产取得当前版本。

## 发布事实源

GitHub Release 是桌面安装包的归档和审计入口。`bugu.run` / `www.bugu.run` 是布谷对外下载和 API 的唯一自有域名入口。

客户端更新检查顺序：

1. `apiBaseUrl` 下的 latest API，例如 `https://bugu.run/api/v1/public/agent-apps/buguai/downloads/latest?channel=stable`。
2. `downloadBaseUrl` 下的静态发布清单，例如 `https://bugu.run/desktop/content-studio/bugu/mac/latest.json`。
3. GitHub Release 页面作为人工兜底入口。

静态发布清单如继续沿用历史字段，可保留 `r2Key`；新实现优先写入文件级 `url` 或 `key`，客户端会兼容读取。
