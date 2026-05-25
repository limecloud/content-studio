# 布谷 AI v3 集成契约

更新时间：2026-05-23  
状态：Draft

## 1. 路由约定

站点路由先按 `Host` 解析租户，再按路径解析页面。`primaryDomain` 可以是 `bugu.run`、`seenx.run` 这类独立域名，也可以配合 `{tenant}.bugu.run` 作为别名和预览入口。

### 1.1 公共页面

- `GET /`
- `GET /cases`
- `GET /materials`
- `GET /download`
- `GET /login`
- `GET /console`
- `GET /o/{tenant}`（兼容预览）

### 1.2 公共 API

- `GET /api/v1/public/oem/site-config`
- `GET /api/v1/public/oem/cases`
- `GET /api/v1/public/oem/materials`
- `GET /api/v1/public/oem/downloads`
- `GET /api/v1/public/oem/feature-flags`
- `GET /api/v1/public/oem/assets`
- `GET /api/v1/public/*`（透传 LimeCore public client API）
- `GET /api/v1/oem/preview`

### 1.3 管理 API

- `POST /api/v1/oem/site-config`
- `POST /api/v1/oem/pages`
- `POST /api/v1/oem/cases`
- `POST /api/v1/oem/materials`
- `POST /api/v1/oem/downloads`
- `POST /api/v1/oem/assets/upload`
- `POST /api/v1/oem/feature-flags`
- `POST /api/v1/oem/publish`
- `GET /api/v1/oem/publish-records`
- `POST /api/v1/oem/rollback`

公共 OEM API 支持 `?tenant=` / `?slug=`、`X-Bugu-Tenant`、`X-Bugu-Domain` 和请求 `Origin` 解析租户。独立 OEM 前台会通过构建参数带上默认 `?tenant=`，API 仍可用域名 / Origin 做兜底解析。

## 2. 站点配置响应

```json
{
  "data": {
    "tenantId": "tenant-2230",
    "slug": "bugu",
    "displayName": "布谷 AI",
    "primaryDomain": "bugu.run",
    "theme": {
      "palette": "emerald",
      "surface": "light",
      "radius": "medium"
    },
    "nav": [
      { "label": "案例", "href": "/cases" },
      { "label": "素材", "href": "/materials" },
      { "label": "下载", "href": "/download" }
    ],
    "hero": {
      "title": "布谷 AI",
      "subtitle": "支持 OEM 的品牌前台与素材中台"
    }
  }
}
```

## 3. 案例与素材响应

### 3.1 案例

```json
{
  "id": "case-001",
  "tenantId": "tenant-2230",
  "industry": "品牌推广",
  "title": "内容工厂案例",
  "summary": "用于说明方法论和结果。",
  "result": "30 天完成上线",
  "metric": "GMV / 搜索占位 / 复用率",
  "mediaRefs": ["r2://..."],
  "tags": ["oem", "brand"]
}
```

### 3.2 素材

```json
{
  "id": "material-001",
  "tenantId": "tenant-2230",
  "type": "image",
  "title": "首页 Hero 图",
  "description": "用于品牌首页首屏。",
  "previewRef": "r2://...",
  "assetRefs": ["r2://..."],
  "sourceRefs": ["case-001"],
  "tags": ["homepage", "hero"]
}
```

### 3.3 下载

```json
{
  "id": "download-001",
  "tenantId": "tenant-2230",
  "title": "macOS Apple Silicon",
  "platform": "macos-arm64",
  "version": "0.10.1",
  "href": "https://downloads.bugu.run/...",
  "sha256": "....",
  "size": 12345678
}
```

### 3.4 功能开关与资产

```json
{
  "featureFlags": {
    "oemPreviewEnabled": true
  },
  "featureFlagItems": [
    {
      "tenantId": "tenant-2230",
      "flagKey": "oemPreviewEnabled",
      "flagValue": true
    }
  ],
  "assets": [
    {
      "id": "asset-001",
      "tenantId": "tenant-2230",
      "kind": "image",
      "objectKey": "oem/bugu/assets/hero.png",
      "publicUrl": "https://assets.bugu.run/oem/bugu/assets/hero.png"
    }
  ]
}
```

### 3.5 预览与发布

- `/api/v1/oem/preview` 返回包含草稿的租户快照。
- `/api/v1/oem/publish` 提升草稿内容并写入发布记录。
- `/api/v1/oem/rollback` 从历史发布快照恢复并生成新的发布记录。

## 4. 认证与授权

- 登录页继续使用 LimeCore public client API。
- Bugu 控制台保存会话后，管理 API 使用当前会话做租户管理员校验。
- 只有已绑定租户和已授权角色才能调用写接口。
- 公共页面和公共读取接口不要求登录。

## 5. 兼容规则

1. `api.bugu.run` 只开放 public client 透传和 Bugu 管理接口。
2. 任何 `oem` 写接口都必须写入 Bugu 自己的 store / assetStore。
3. 不允许管理接口直接写 LimeCore 业务库。
4. 失败返回必须可解释，不伪造成功。
