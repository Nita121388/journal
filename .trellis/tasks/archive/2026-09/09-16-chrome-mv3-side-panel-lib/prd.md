# PRD: 搭建 Chrome 扩展骨架

## Goal

创建最小可运行的 Chrome MV3 Side Panel 扩展，使其可加载进 Chrome 并显示侧边栏，同时搭好 `lib/` 模块层（store/model/sync/ai），为后续功能开发做好架构准备。

## User Story

作为开发者，我希望在 `chrome://extensions` 加载 `extension/` 目录后，看到侧边栏打开并显示一个干净的日志界面，确认扩展可以正常工作。

## Acceptance Criteria

- [ ] `extension/manifest.json` 正确声明 `side_panel`，权限最小（`storage`）
- [ ] `extension/sidepanel.html` 打开侧边栏后显示日志界面骨架（日期标题 + textarea）
- [ ] `extension/sidepanel.js/css` 实现 UI 渲染逻辑（无数据时显示空状态）
- [ ] `extension/background.js` 处理 `chrome.sidePanel` 入口点击
- [ ] `extension/lib/store.js` 实现 `getTodayEntry` / `saveTodayEntry`（基于 `chrome.storage.local`）
- [ ] `extension/lib/model.js` 实现 `todayKey()` / `aggregateHeatmap()`
- [ ] `extension/lib/ai.js` / `lib/sync.js` 骨架文件（空函数存根）
- [ ] `chrome://extensions` 加载成功，侧边栏可打开，无 console 错误

## Out of Scope

- 真正的 AI 对接 / WebDAV 同步 / TODO 功能
- 热力图渲染（本次只搭 store，不画图）
- Options 页面
