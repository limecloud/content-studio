# 布谷 AI v3 架构与流程图

更新时间：2026-05-23  
状态：Draft

## 1. 设计结论

v3 采用 **可移植部署 + 参考云适配器** 的轻量 OEM 架构。  
`bugu` 负责品牌前台、案例、素材、下载、自有登录 / 控制台和租户配置；每个 OEM 租户可以有自己的主域名，例如 `seenx.run`。`limecore` 只负责公共中台抽象。  
不把 Bugu 内容资产放进 Railway，也不把 Cloudflare、阿里云或某个数据库作为唯一运行时事实源。

## 2. 总体架构图

```mermaid
flowchart LR
  subgraph Browser[访问者 / 租户管理员]
    UI["bugu.run / seenx.run / {tenant}.bugu.run"]
  end

  subgraph Pages[部署前台]
    Frontend["Next.js / 静态站点 / 自托管前台"]
  end

  subgraph Worker[部署 API 层]
    API["api.bugu.run"]
    Resolver["Tenant Resolver"]
    Proxy["LimeCore Public API Proxy"]
    OemApi["OEM Read/Write API"]
  end

  subgraph Storage[可替换存储]
    D1["D1 / SQL: 站点配置 / 案例 / 素材 / 下载元数据"]
    R2["R2 / OSS / S3: 图片 / 封面 / 下载包 / 预览资源"]
    KV["KV / Redis / Tair: 解析缓存 / 主题缓存 / Feature Flag"]
  end

  subgraph Core[LimeCore / 布谷通用中台]
    LimeAuth["登录 / 会话 / OAuth / 权益 / 应用"]
  end

  UI --> Frontend
  Frontend --> API
  API --> Resolver
  Resolver --> D1
  Resolver --> KV
  API --> Proxy
  Proxy --> LimeAuth
  API --> OemApi
  OemApi --> D1
  OemApi --> R2
  OemApi --> KV
```

## 3. 站点解析流程

```text
请求进入
-> 读取 Host / path
-> 解析 tenant slug
-> 读取 D1 站点配置
-> KV 命中则直接返回
-> 未命中则回源 D1
-> 组合主题、导航、首页区块和资产列表
-> 返回前台渲染数据
```

### 3.1 路由优先级

1. `primaryDomain` 命中的站点主域名，例如 `bugu.run` 或 `seenx.run`。
2. `{tenant}.bugu.run` 作为兼容别名和预览入口。
3. `bugu.run/o/{tenant}` 作为路径型兼容入口。
4. `/login` 和 `/console` 按命中的站点主域名渲染对应品牌壳。

## 4. 内容发布流程

```mermaid
sequenceDiagram
  participant Admin as 租户管理员
  participant UI as 控制台
  participant API as api.bugu.run
  participant D1 as D1
  participant R2 as R2
  participant KV as KV
  participant Pages as 前台

  Admin->>UI: 编辑案例 / 素材 / 下载
  UI->>API: 提交保存
  API->>D1: 写入元数据
  API->>R2: 上传资源文件
  API->>KV: 刷新缓存键
  API-->>UI: 返回发布结果
  Pages->>API: 下一次访问读取站点配置
  API->>D1: 读取最新配置
  API-->>Pages: 返回最新站点结构
```

## 5. 账号与控制台流程

- `/login` 使用当前站点品牌的账号前端逻辑。
- 会话仍由 LimeCore public API 提供。
- `/console` 在品牌一致的前提下承接账号、下载、权益和 OEM 管理。
- 控制台里的 OEM 管理只改 Bugu 自己的 store / assetStore，不改 LimeCore 业务库。

## 6. 失败与降级

- Store 读取失败时，前台显示可解释错误或回退到默认品牌配置。
- 对象资源缺失时，卡片保留文本和可解释降级，不伪造素材已存在。
- LimeCore public API 不可用时，账号和控制台显示可解释错误，不影响公共首页浏览。
- 缓存失效时，API 回源 store，不改变数据事实源。
