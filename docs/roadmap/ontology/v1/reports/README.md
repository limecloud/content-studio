# Ontology v1 在线验收报告归档

更新时间：2026-05-31
状态：Archive Gate / Production Evidence Pending

## 1. 归档目的

本目录只保存真实线上验收报告，不保存本地 mock、单元测试输出或人工整理的通过截图。v1 是否可宣称完成，必须能回放以下事实：

- Bugu 业务后端返回真实团队内容工作区。
- 两个不同团队账号都能读取同一个工作区、同一个默认团队知识包、同一批知识地图快照、同一批构建运行、同一批审核任务和同一批生产交接行动记录。
- 至少一条团队行动记录保留交付物引用，且两个账号看到的交付物引用一致，用于证明补素材清单等交付包没有在团队共享链路丢失。
- 团队知识包已经确认发布，公开包地址是 http/https 公网地址且可访问。
- 公开包大小和 sha256 与 Bugu release 元数据一致。
- 报告由 `content:v1:verify-online` 生成，且通过 `content:v1:verify-report -- --production` 校验。

本目录不保存 token、cookie、账号密码、API Key 或本机绝对路径。

完成声明的总审计见 [`../completion-audit.md`](../completion-audit.md)。该审计必须在真实线上报告归档并通过生产校验后，才能从 `Production Evidence Pending` 更新为 `Production Verified`。

## 2. 真实验收命令

在 Content Studio 仓库根目录运行：

```bash
npm run content:v1:verify-online -- \
  --tenant=<tenant-id> \
  --workspace-id=<bugu-workspace-id> \
  --release-id=<release-id> \
  --actor-a-token=<user-a-token> \
  --actor-b-token=<user-b-token> \
  --require-public-package \
  --output=docs/roadmap/ontology/v1/reports/<yyyy-mm-dd>-online-acceptance.json
```

生产归档前必须再运行报告校验：

```bash
npm run content:v1:verify-report -- \
  --report=docs/roadmap/ontology/v1/reports/<yyyy-mm-dd>-online-acceptance.json \
  --production \
  --require-api-base-url=https://api.bugu.run
```

如只做预检，可以不传 `--production`；预检报告不能作为 v1 完成证据。

## 3. 文件命名

| 类型 | 命名 |
| --- | --- |
| 正式线上验收 | `<yyyy-mm-dd>-online-acceptance.json` |
| 复验 | `<yyyy-mm-dd>-online-acceptance-rerun-<n>.json` |
| 校验结果 | `<yyyy-mm-dd>-online-acceptance-check.json` |

如果同一天验证多个租户或品牌项目，文件名追加业务后缀，例如：

```text
2026-05-29-seenx-online-acceptance.json
2026-05-29-bugu-online-acceptance.json
```

## 4. 通过门禁

正式线上验收报告必须满足：

| 检查项 | 标准 |
| --- | --- |
| 顶层结果 | `ok: true`。 |
| API 地址 | 必须是 http/https 公网地址，生产默认 `https://api.bugu.run`；不能使用 localhost、127.0.0.1、内网 IP、链路本地地址或 mDNS `.local` 地址。 |
| target | 有 `tenant`、`workspaceId`、`releaseId`。 |
| release section | `ok: true`，顶层 `release-online-report` 为 `passed`。 |
| team section | `ok: true`，顶层 `team-sharing-online-report` 为 `passed`。 |
| 发布状态 | release 为 `published` 且 `approved`。 |
| 公开包 | `package.reachable: true`，有 http/https 公网 `publicUrl`，不能是 `file://`、相对路径、localhost、127.0.0.1、内网 IP、链路本地地址、IPv6 ULA / link-local 或 mDNS `.local` 地址。 |
| 包完整性 | 有 `size > 0` 和 64 位十六进制 `sha256`。 |
| 两账号共享 | actor A / B 看到同一个工作区和同一个非空 revision。 |
| 团队知识包版本清单 | actor A / B 的 `releaseCount` 必须一致且大于 0；必须完整分页拉取，`releaseIds` 必须一致且数量等于 `releaseCount`，`releaseListComplete` 必须为 `true`。 |
| 知识地图 / 构建运行清单 | actor A / B 的 `knowledgeMapCount`、`buildRunCount` 一致且大于 0；必须完整分页拉取，`knowledgeMapIds`、`buildRunIds` 必须一致且数量等于对应 count，`knowledgeMapListComplete`、`buildRunListComplete` 必须为 `true`。 |
| 审核任务 / 生产交接行动清单 | actor A / B 的 `reviewTaskCount`、`actionRecordCount` 一致且都必须大于 0；必须完整分页拉取，`reviewTaskIds`、`actionRecordIds` 必须一致且数量等于对应 count，`reviewTaskListComplete`、`actionRecordListComplete` 必须为 `true`。 |
| 交付物引用 | actor A / B 至少看到一条带 `artifactRefs` 的行动记录；`actionArtifactRecordIds` 和 `actionArtifactRefsByRecordId` 必须一致，证明补素材清单、行动导出等交付线索没有在服务端或团队刷新时丢失。 |
| 交付物安全 | `actionArtifactRefsByRecordId` 不能包含本机绝对路径、`file://` 或疑似凭证参数；两账号都必须能看到 `material-gap-list.json`，证明补素材清单交付链路真实进入团队事实源。 |
| 不跳过 | 不能使用 `--skip-release` 或 `--skip-team` 作为完成证据。 |

## 5. 失败处理

| 失败类型 | 处理方式 |
| --- | --- |
| 工作区不可见 | 先检查 Bugu 团队成员、租户、角色和 workspaceId。 |
| 两账号版本不一致 | 检查 Bugu revision、默认知识包和缓存刷新路径，不用本地报告覆盖。 |
| release 未确认 | 回到 Bugu 控制台完成负责人确认或驳回重发。 |
| 公开包不可访问 | 检查对象存储、R2 / OSS 公网地址、权限和缓存；内网地址不能作为生产公开包证据。 |
| sha256 不一致 | 重新发布团队知识包，不能手改报告。 |
| 报告使用 localhost / 内网地址 | 只能作为功能测试证据，不能归档为生产通过。 |

## 6. JSON 结构

报告结构以脚本输出为准，schema 见 [`v1-online-acceptance.schema.json`](./v1-online-acceptance.schema.json)。当前 schema 是归档约束，不替代运行时服务协议。
