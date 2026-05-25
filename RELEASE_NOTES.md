# Release Notes

## v0.11.0 - 2026-05-25

### AI 生图案例迁移

- 重新按 DressingKit 源站功能分类迁移 AI 生图案例，保留源站 `businessFlag`、功能标签、输入图和输出图关系。
- 图片案例页支持后端共享案例按当前功能筛选，不再把所有数据错误归到同一功能。
- 图片案例页支持多输入 / 多输出图展示，素材预览优先使用输出图，输入 / 输出图按角色分组显示。
- 后端共享数据为空的功能显示空态，不再混入本地占位案例。
- 生产共享素材已发布到 Cloudflare R2 / D1，`bugu` 和 `seenx` 可读取同一批通用案例数据。
- 点击“尝试示例”会同步套用该案例源站 Prompt 到正面 / 背面 / 侧面视角，避免切换视角后仍显示旧 Prompt。

### 验证

- `npm run typecheck`
- `npm run verify:local`

## v0.10.1 - 2026-05-23

### 更新查询修复

- 修复“设置 -> 关于”手动检查更新在品牌 API 和静态发布清单返回 404 时直接失败的问题。
- 更新检查现在保持原有品牌 API、静态清单优先级，并新增 GitHub Release API 作为自动兜底来源。
- GitHub Release 兜底会按当前 OEM 品牌前缀筛选安装包，避免 `bugu` 与 `seenx` 混用下载资产。
- 功能测试新增双 OEM 更新查询回退覆盖，并补齐 Electron 测试 shim 的版本和 shell 能力。

### 验证

- `npm run typecheck`
- `npm run test:functional -- --test-name-pattern "更新检查"`
- `npm run build`
- `npm run verify:local`

## v0.10.0 - 2026-05-22

### 版本定位

v0.10.0 将内容工厂 v2 推进到本地总闸可验证的桌面发布候选：围绕普通运营用户的输入源、品牌 / IP 知识库、场景库、Prompt 工作台、素材审核、混剪包和平台草稿包形成可追溯主链，并把发布矩阵扩展为 `bugu` 和 `seenx` 双品牌。

### 双品牌发布

- 发布版本升级到 `0.10.0`，同步 `package.json` 和 `package-lock.json`。
- tag push 发布矩阵改为自动构建并发布 `bugu`、`seenx` 两个 OEM 品牌。
- 继续使用 GitHub Release 作为桌面安装包归档事实源；`bugu` 运行时入口保持 `bugu.run` 同域。
- 移除旧 R2 同步链路，发布工作流只负责验证、构建 OEM 包和更新 GitHub Release。
- 更新 `bugu` OEM 图标与品牌配置，保留 `seenx` 独立品牌 manifest 和产物目录。

### v2 内容工厂主链

- 新增 v2 provider 诊断、业务验收和证据目录脚本，并将 `npm run verify:v2` 纳入 `npm run verify:local`。
- 输入源页补齐产品资料结构化、SKU / 规格追溯、评论痛点聚类、客服异议话术和普通用户任务导轨。
- 品牌 / 产品知识库、IP 知识库、场景库、Prompt 工作台和视频 Prompt 页面继续收敛到可发现的二级入口。
- SOP 执行页新增运行前资料选择，显式记录本次 `inputSourceIds`，取消全部资料时禁止启动运行。
- 工作流引擎补齐产品商业素材、评论痛点选题、绿幕文案图、平台草稿包和混剪包主链追溯。

### 素材与交付

- 素材库强化审核决策、回炉、成功素材沉淀和混剪包导出追踪。
- 视频 Prompt 外部生成路径记录复制动作，成品视频支持手动导入并关联原 Prompt。
- 绿幕文案图生成、审核和混剪 manifest 写入形成可验证闭环。
- 文章页支持导出平台草稿包、平台复制稿、格式指南、发布前检查和 manifest，不接平台账号或自动发布。

### 工程与验证

- 更新 v2 路线图、实施计划、完成度审计、业务验收样例和原型文档。
- 扩展功能测试和 E2E，覆盖普通用户关键二级入口、v2 工作流、Prompt、素材、混剪和平台草稿包路径。
- 发布 workflow 会在构建前执行 `npm run verify:local`，再分别构建 `bugu` / `seenx` 的 macOS、Windows 和 Linux 产物。

### 验证

- `npm run typecheck`
- `npm run build`
- `npm run verify:v2`
- `npm run test:functional`
- `npm run smoke:electron`
- `npm run test:e2e`
- `npm run verify:local`

### 明确不包含

- 正式 macOS Developer ID 签名和 notarization 仍未启用，当前 macOS 包继续使用 unsigned 内部预览策略。
- 未配置真实文字 / 图片 / 视频生成服务时仍返回 `blocked`，不伪造生成成功。
- v2 不接平台账号，不做自动发布，不实现云端多租户协作或复杂权限系统。
