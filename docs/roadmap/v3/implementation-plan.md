# 布谷 AI v3 实施计划

更新时间：2026-05-23  
状态：Draft

## 0. 当前判断

v3 的实现仓库应以 `bugu/bugu` 为主，`limecore` 只提供通用中台抽象。  
`content-studio` 只保留 v3 路线图，不承担 Bugu 的站点代码实现。
部署方式必须可切换，Cloudflare、阿里云和私有化只是一组参考适配器，不是产品边界。

## 1. 阶段划分

### P0：文档和契约定版

目标：

- 固化 v3 PRD、架构、数据模型和接口契约。
- 固化 Cloudflare、阿里云和私有化的参考部署画像。
- 确认 `bugu.run`、`seenx.run` 和 OEM 别名 / 预览入口的路由规则。

验收：

- 文档齐全。
- 路由、存储和租户解析策略无歧义。

### P1：站点配置和 tenant resolver

写集（在 `bugu/bugu`）：

- `lib/site.ts`
- `workers/api-proxy/src/index.js`
- `components/layout/*`
- `components/sections/*`
- `app/*`

任务：

- 读取租户配置。
- 支持 host / path 解析。
- 渲染默认品牌和 OEM 品牌。
- 配置导航、CTA、首页区块和主题。
- 支持独立 OEM 主域名对应独立构建参数。

验收：

- 一个租户配置即可渲染站点。
- 站点切换不改代码。

### P2：案例 / 素材 / 下载资产层

写集（在 `bugu/bugu`）：

- `components/sections/cases-section.tsx`
- `components/sections/download-section.tsx`
- `components/sections/materials-section.tsx`
- `components/sections/software-download-data.tsx`
- `lib/site.ts`

任务：

- 案例、素材、下载清单统一按租户读取。
- 资产图片和下载包走对象存储适配器，Cloudflare 用 R2，阿里云 / 私有化用 OSS / S3 兼容对象存储。
- 站点前台保持轻量、可扫描。

验收：

- 案例、素材、下载可独立发布。
- 资产缺失时有可解释降级。

### P3：登录 / 控制台 / OEM 管理

写集（在 `bugu/bugu`）：

- `components/account/bugu-account-client.tsx`
- `app/login/page.tsx`
- `app/console/page.tsx`
- `components/account/*`

任务：

- 保持当前站点品牌登录和控制台。
- 增加 OEM 管理 tab。
- 支持站点配置、内容发布和资源上传。

验收：

- 登录后进入同品牌控制台。
- 管理动作能写入 Bugu 自己的 D1 / R2。

### P4：API 代理和权限

写集（在 `bugu/bugu`）：

- `workers/api-proxy/src/index.js`
- `lib/bugu-api.ts`
- `docs/v1/email-registration-runbook.md`

任务：

- 继续代理 LimeCore public API。
- 新增 OEM 读取 / 写入接口。
- 明确会话校验和租户隔离。
- 同一套接口在 Cloudflare、阿里云和私有化部署下都能工作。

验收：

- 公开 API 只暴露允许的范围。
- 管理 API 不越过 Bugu 的内容边界。

## 2. 验证计划

1. 首页、案例、素材、下载和登录页可访问。
2. 至少一个 OEM 租户能完整渲染。
3. 控制台保存后，前台内容可见。
4. 资源加载失败时有降级，不伪造成功。
5. public client API 透传不破坏 LimeCore 既有登录逻辑。

## 3. 完成标准

- Bugu 形成独立的 OEM 品牌前台。
- `limecore` 保持中台抽象，不被业务内容拖重。
- `content-studio` 继续专注内容生产。
- 站点内容事实源明确落在 Bugu 的 D1 / R2 / KV。
