# Release Notes

## v0.8.0 - 2026-05-21

### 版本定位

v0.8.0 将内容工厂推进到可 OEM 的桌面客户端发布形态：同一套代码可以按品牌 manifest 构建为不同名称、图标、包名和运行时控制面的 App，同时继续补强 v2 内容工厂的输入源、SOP、素材回炉和混剪包主链。

### OEM 与发布

- 新增 `oem/brands` 品牌 manifest 体系，首批支持 `bugu` 和 `seenx`。
- 新增 OEM 构建脚本：`oem:prepare`、`oem:clean`、`oem:assert`。
- 打包时生成单品牌临时 app 目录，产物内只保留当前品牌的 `package.json`、runtime config、图标和文件关联信息。
- 登录页、侧边栏、设置页、窗口标题、`.skill` 文件关联、更新检查和本地 fallback bootstrap 均接入当前品牌配置。
- Renderer 不再静态打入默认布谷 logo，改为消费运行时 branding logo。
- GitHub Actions 发布流升级为通用 OEM matrix：tag push 仅自动构建并发布 `bugu + mac`；其他品牌和其他平台必须手动 workflow 构建。
- 手动 OEM 构建会生成独立 R2 上传目录：`desktop/content-studio/<brand>/<platform>/<tag>/`，并同步同平台 `latest.json` manifest。
- CI build matrix 设置 `max-parallel: 1`，避免免费 GitHub runner 同时占用过多。

### 内容工厂主链增强

- 输入源、品牌知识库、IP 知识库、场景库、Prompt 草稿、资产审核、混剪包和 SOP 工作流进一步打通 `workflowRunId` 追踪。
- Prompt 工作台支持围绕当前 workflow 和输入源沉淀、复制、回用和继续调整草稿。
- 素材库增强回炉、Prompt 提炼、资产审核和工作流事件记录。
- 混剪包导出补强素材归档、文件追踪和 workflow 联动。
- 视频导入、图片模块、场景提示词和工作流功能模块继续收敛到 v2 桌面工作台体验。

### 服务端协同

- LimeCore `/client/bootstrap` 增加 `branding` 字段，用作桌面客户端登录后的运行时品牌事实源。
- 客户端未登录 / 离线时使用打包期 `oem-runtime-config.json` 作为兼容 fallback；登录后以 bootstrap branding 覆盖同名字段。

### 工程与验证

- 同步更新 `package.json` 和 `package-lock.json` 到 `0.8.0`。
- 更新 GitHub Actions release workflow，支持品牌、平台和发布开关的手动输入。
- 新增 R2 布局生成脚本，确保每个 OEM 品牌 / 平台的软件包、校验信息和 manifest 都进入独立目录。
- 新增 OEM 文档和产物范围断言，防止多品牌配置目录进入最终安装产物。
- 扩展功能测试和 E2E 覆盖 v2 工作流、Prompt、素材、混剪和 OEM 相关行为。

### 验证

- `npm run typecheck`
- `npm run build`
- `npm run verify:local`
- `node scripts/prepare-oem-build.mjs --brand=bugu`
- `node scripts/prepare-oem-build.mjs --brand=seenx`
- `npx electron-builder --config .tmp/oem/bugu/electron-builder.json --mac dir --publish never`
- `npx electron-builder --config .tmp/oem/seenx/electron-builder.json --mac dir --publish never`
- `node scripts/assert-oem-artifact-scope.mjs --brand=bugu`
- `node scripts/assert-oem-artifact-scope.mjs --brand=seenx`
- `node scripts/prepare-oem-r2-layout.mjs --tag=v0.8.0 --artifact-root=.tmp/r2-fixture --out=.tmp/r2-upload-test`

### 明确不包含

- 正式 macOS Developer ID 签名和 notarization 仍未启用，当前 macOS 包继续使用 unsigned 内部预览策略。
- 未配置真实文字 / 图片 / 视频生成服务时仍返回 `blocked`，不伪造生成成功。
- 删除历史 GitHub Release / tag 需要单独确认具体版本范围。
