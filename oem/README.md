# OEM 品牌构建

`oem/brands/*.json` 是桌面端打包期品牌清单事实源。每个品牌一个 manifest，构建时只读取当前 `--brand` 对应的文件，并生成 `.tmp/oem/<brand>/` 下的单品牌打包目录。

## Manifest 字段

- `brandId`：构建选择和产物目录名，例如 `bugu`、`seenx`。
- `tenantId`：客户端请求控制面 `/client/bootstrap` 使用的租户 ID。
- `appId`：Electron `appId` 和 `.skill` 文件关联 UTI 前缀。
- `productName` / `shortName`：窗口标题、登录页、侧边栏、关于页和本地 fallback branding。
- `artifactName`：安装包文件名前缀。
- `apiBaseUrl`：客户端账号、bootstrap 和更新检查的控制面 API base URL。`bugu` 只允许使用 `https://bugu.run/api`。
- `oemPublicApiBaseUrl`：OEM 站点内容、案例和素材公开 API base URL，用于客户端读取后端/R2 案例清单；私有化部署可替换为自有 API 域名。
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
- Release workflow 不直接同步 Cloudflare R2，也不触发 `limecloud/bugu` 的 R2 同步 workflow。构建完成后只产生不可变 GitHub Release 资产。
- 用户可见 latest 指针通过手动 workflow 更新：推荐使用 `Publish OEM Distribution` 一次完成控制面 promote、R2 分发、全局 manifest 和线上验证；`Promote OEM Release` 仅保留为单品牌控制面 promote 的低层入口。

## 发布事实源

GitHub Release 是桌面安装包的归档和审计入口。`bugu.run` / `www.bugu.run` 是布谷对外下载和 API 的唯一自有域名入口。

客户端更新检查顺序：

1. `apiBaseUrl` 下的 latest API，例如 `https://bugu.run/api/v1/public/agent-apps/buguai/downloads/latest?channel=stable`。
2. `downloadBaseUrl` 下的静态发布清单，例如 `https://bugu.run/desktop/content-studio/bugu/mac/latest.json`。
3. GitHub Release 页面作为人工兜底入口。

静态发布清单如继续沿用历史字段，可保留 `r2Key`；新实现优先写入文件级 `url` 或 `key`，客户端会兼容读取。

## 一键发布分发链路

`Publish OEM Distribution` 用于把已经存在的 GitHub Release 产物发布到用户可见入口。它不构建安装包，只做产物校验、控制面 latest、R2 对象、全局下载清单和线上验证。

首次配置需要在 GitHub 仓库设置中准备：

1. Environment：`oem-promotion`。真实发布 job 绑定该环境，建议开启人工审批。
2. Environment Variable：`RELEASE_PROMOTE_API_URL`。内部发布服务的 promote endpoint。
3. Environment Secret：`RELEASE_PROMOTE_API_TOKEN`。只允许更新 OEM latest 指针的最小权限 token。
4. Environment Variable：`R2_ACCOUNT_ID`。Cloudflare account id。
5. Environment Variable：`R2_BUCKET`。默认 `bugu-releases`。
6. Environment Secret：`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`。只授予目标 bucket 对象读写权限的 R2 S3 token。
7. 可选 Environment Variable：`GLOBAL_DOWNLOAD_BASE_URL`，默认 `https://downloads.bugu.run`。
8. 可选 Environment Variable：`DOWNLOAD_MANIFEST_API_URL`，默认 `https://api.bugu.run/api/v1/public/download-manifest`。
9. 可选 Environment Variable：`CONTROL_PLANE_PUBLIC_API_BASE_URL`，默认 `https://lime-api.limeai.run/api`。

常规流程：

1. 确认 `Release Desktop Packages` 已经把目标 tag 的安装包上传到 GitHub Release。
2. 打开 `Actions -> Publish OEM Distribution -> Run workflow`。
3. 先运行 dry run：

```text
brands: all
tag: v0.14.0
channel: stable
promote_control_plane: true
dry_run: true
```

4. 检查日志中列出了每个品牌的完整产物：macOS DMG、macOS ZIP、Windows NSIS、Linux AppImage，以及对应 blockmap。
5. 再运行真实发布：

```text
brands: all
tag: v0.14.0
channel: stable
promote_control_plane: true
dry_run: false
```

6. 等待 `oem-promotion` 环境审批通过。
7. workflow 会按顺序执行：
   - 控制面 promote：`bugu` 使用 appId `buguai`，`seenx` 使用 appId `seenx`。
   - 从 GitHub Release 下载目标 tag 产物。
   - 通过 R2 S3 multipart 上传大文件，绕过 Wrangler 300 MiB 限制。
   - 先写不可变版本目录：`desktop/content-studio/{brand}/{platform}/{tag}/...`。
   - 所有版本对象 HEAD 校验通过后，才覆盖 `{brand}/{platform}/latest.json`。
   - 最后合并并覆盖 `_manifests/latest.json`，保证官网 `download-manifest` 不再停留在旧版本。
   - 自动验证 `downloadBaseUrl`、`download-manifest` 和控制面 latest API。

本地可做同样的 dry run：

```bash
npm run oem:r2:publish -- --tag=v0.14.0 --brands=all --dry-run=true
npm run oem:release:verify-online -- --tag=v0.14.0 --brands=all --channel=stable
```

## 单品牌控制面提升

`Promote OEM Release` 用于把已经存在的 GitHub Release 产物提升为某个 OEM 的当前版本。它不构建安装包，只做校验和 latest 指针更新。

首次配置需要在 GitHub 仓库设置中准备：

1. Environment：`oem-promotion`。真实 promote job 绑定该环境，建议开启人工审批。
2. Environment Variable：`RELEASE_PROMOTE_API_URL`。内部发布服务的 promote endpoint。
3. Environment Secret：`RELEASE_PROMOTE_API_TOKEN`。只允许更新 OEM latest 指针的最小权限 token。

常规流程：

1. 确认 `Release Desktop Packages` 已经把目标 tag 的安装包上传到 GitHub Release。
2. 打开 `Actions -> Promote OEM Release -> Run workflow`。
3. 先运行 dry run：

```text
brand: seenx
tag: v0.10.1
channel: stable
dry_run: true
```

4. 检查日志中列出了当前品牌完整产物：macOS DMG、macOS ZIP、Windows NSIS、Linux AppImage。
5. 再运行真实 promote：

```text
brand: seenx
tag: v0.10.1
channel: stable
dry_run: false
```

6. 等待 `oem-promotion` 环境审批通过。
7. 验证客户端更新入口：

```bash
curl -sS "https://lime-api.limeai.run/api/v1/public/agent-apps/seenx/downloads/latest?channel=stable"
```

`bugu` 使用相同流程，但品牌和 appId 不同：

```text
brand: bugu
tag: v0.10.1
channel: stable
dry_run: false
```

`bugu` 客户端 latest API 使用 `buguai` appId：

```bash
curl -sS "https://bugu.run/api/v1/public/agent-apps/buguai/downloads/latest?channel=stable"
```

### 设计约束

- 构建和 promote 分离：构建生成不可变产物，promote 才改变用户可见版本。
- `Promote OEM Release` 只接受单品牌、单 tag、单 channel，避免低层入口一次性影响多个 OEM。
- `Publish OEM Distribution` 可以选择 `brands=all`，但必须手动触发、dry run 通过，并经过 `oem-promotion` 环境审批。
- dry run 不需要生产密钥，只校验 GitHub Release 资产完整性。
- 真实分发发布需要 `oem-promotion` 环境审批、`RELEASE_PROMOTE_API_TOKEN` 和 R2 S3 最小权限 token。
