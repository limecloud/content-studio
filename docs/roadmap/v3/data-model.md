# 布谷 AI v3 数据模型

更新时间：2026-05-23  
状态：Draft

## 1. 单一事实源

| 事实域 | 事实源 |
| --- | --- |
| 租户 / 登录 / 权益 / 应用 | LimeCore public API |
| 站点配置 / 案例 / 素材 / 下载元数据 | Bugu store 契约（Cloudflare 参考部署可落 D1；阿里云 / 私有化可落 SQL） |
| 图片 / 封面 / 下载包 / 预览资源 | Bugu assetStore 契约（Cloudflare 参考部署可落 R2；阿里云 / 私有化可落 OSS / S3 兼容对象存储） |
| 高频解析缓存 / 主题缓存 / 站点映射 | Bugu KV / Redis / Tair / 配置中心 |

## 2. 核心实体

### 2.1 `oem_tenants`

站点租户的根记录。

字段建议：

- `id`
- `slug`
- `displayName`
- `primaryDomain`
- `defaultLocale`
- `limecoreTenantId`
- `themeId`
- `status`
- `createdAt`
- `updatedAt`

### 2.2 `oem_themes`

站点主题变量和品牌样式定义。

字段建议：

- `id`
- `tenantId`
- `name`
- `palette`
- `primaryColor`
- `surfaceColor`
- `borderColor`
- `radius`
- `logoStyle`
- `typographyJson`
- `tokensJson`
- `status`
- `updatedAt`

### 2.3 `oem_site_pages`

配置驱动的页面定义。

字段建议：

- `id`
- `tenantId`
- `pageKey`
- `path`
- `title`
- `templateKey`
- `blocksJson`
- `status`
- `publishedVersion`
- `updatedAt`

### 2.4 `oem_cases`

案例卡元数据。

字段建议：

- `id`
- `tenantId`
- `industry`
- `title`
- `summary`
- `result`
- `metric`
- `tagsJson`
- `mediaRefsJson`
- `sortOrder`
- `status`
- `publishedAt`

### 2.5 `oem_materials`

素材卡元数据。

字段建议：

- `id`
- `tenantId`
- `type`
- `title`
- `description`
- `previewRef`
- `assetRefsJson`
- `sourceRefsJson`
- `tagsJson`
- `status`
- `updatedAt`

### 2.6 `oem_downloads`

下载清单记录。

字段建议：

- `id`
- `tenantId`
- `title`
- `platform`
- `version`
- `href`
- `sha256`
- `size`
- `manifestJson`
- `status`
- `publishedAt`

### 2.7 `oem_assets`

资源对象元数据，真实文件放对象存储适配器。

字段建议：

- `id`
- `tenantId`
- `kind`
- `r2Key`
- `mimeType`
- `checksum`
- `width`
- `height`
- `size`
- `caption`
- `createdAt`

### 2.8 `oem_feature_flags`

租户级功能开关。

字段建议：

- `tenantId`
- `flagKey`
- `flagValueJson`
- `updatedAt`

### 2.9 `oem_audit_logs`

用于发布和回滚审计。

字段建议：

- `id`
- `tenantId`
- `actorId`
- `action`
- `targetType`
- `targetId`
- `snapshotJson`
- `createdAt`

## 3. 关系

```text
tenant 1 -> n site_pages
tenant 1 -> n themes
tenant 1 -> n cases
tenant 1 -> n materials
tenant 1 -> n downloads
tenant 1 -> n assets
tenant 1 -> n feature_flags
tenant 1 -> n audit_logs
```

## 4. 存储策略

- store 存结构化元数据和发布状态，Cloudflare 参考部署可以落 D1，阿里云 / 私有化可以落 SQL。
- assetStore 存二进制文件、预览图和下载包，Cloudflare 参考部署可以落 R2，阿里云 / 私有化可以落 OSS / S3。
- 缓存层可用 KV、Redis、Tair 或配置中心。
- LimeCore 只存账号、权益和通用 OEM 抽象，不存 Bugu 内容资产。
