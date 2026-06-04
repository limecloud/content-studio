# 外部模块迁移检查表

## 能力映射

迁移外部项目时先列四列：

```text
外部能力 | 内容工厂模块位置 | 内容工厂事实源 | 是否真实可用
```

规则：

- 页面能力必须挂入现有模块，不新增另一套一级导航。
- Supabase/远端表默认映射到本地工作区 store、generation logs、input sources、prompt drafts 或 artifact refs。
- 登录、Admin、清理脚本、远端对象存储不原样迁移，除非内容工厂已有明确产品需求。
- 未接真实能力时显示 blocked/disabled，不用 mock 成功。

## 视频拆解类迁移

推荐映射：

- 分析控制台 -> `video` 模块的参考视频导入和真实视频理解。
- 爆款特征库 -> `GenerationLogEntry.kind === "video-breakdown"` 且成功的日志视图。
- 特征详情 -> 选中拆解日志的详情面板。
- 脚本改写 -> 使用某条拆解日志作为 `breakdownLogId` 生成 `video-script`。
- 脚本历史 -> `GenerationLogEntry.kind === "video-script"` 成功日志。
- 内容生产 -> Prompt 交接、素材清单、手动导入成品视频；不显示外部平台任务进度。

## 代码落点

- 共享类型变更：`src/shared/types.ts`
- 主进程生成/拆解：`src/main/services/videoWorkflowService.ts`
- IPC：`src/main/ipc.ts`、`src/preload/index.ts`
- 前端控制器：`src/renderer/src/app/useContentStudioApp.ts`
- 模块 UI：`src/renderer/src/components/modules/VideoModule.tsx`
- 样式：`src/renderer/src/styles/modules-video-workbench.css`

## 验证

- 普通 UI/类型改动：`npm run typecheck`
- 可交付功能：`npm run build`
- GUI 改动：Playwright 截图 + 本地查看截图。

