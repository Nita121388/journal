# PRD: Agent 接入引导设置页（GitHub prompt）

## Goal

新建 options 设置页，让用户能把 Journal 的 AI 能力交给任意 agent（Pi / Claude Code / Codex 等）——页面上提供基于 **GitHub 链接**的安装指引和可复制 prompt，用户复制粘贴给 agent 后，agent 即可读写本项目日志/TODO 数据。

## Background / 已有事实

- journal skill 已存在：`.agents/skills/journal/SKILL.md`（支持任意 agent 调用，通过 host :8765 操作数据）
- host 服务 + CLI 已可用：`host/server.js`（:8765）、`host/cli.mjs`
- 仓库有 GitHub 远端：`https://github.com/Nita121388/journal.git`
- 扩展当前无 options 页（manifest 未注册 `options_page`），README 提到 `options.html` 但未实现
- 侧边栏 settings 按钮（`#btn-settings`）已存在但无目标页
- 项目为纯 JS Chrome MV3 扩展，无框架，无构建步骤

## Requirements

### 功能需求

1. **新建 options 设置页**：`extension/options.html` + `options.js` + `options.css`，manifest 注册 `options_page`
2. **Agent 接入引导区**：
   - 展示 journal skill 的获取方式（GitHub 链接），说明支持 Pi / Claude Code / Codex
   - 提供**可复制的 prompt 模板**（textarea readonly + 复制按钮），prompt 内使用 GitHub raw 链接而非本机路径
   - 展示 host 服务状态（在线/离线，用 `/api/health` 探测）与启动提示
3. **复制 prompt 功能**：`navigator.clipboard.writeText` + 复制成功反馈
4. 保持与现有设置主题一致（theme 跟随，dark mode 支持）

### 技术约束

- 纯 JS，无新依赖，无构建步骤
- 复用现有 CSS 变量体系（dark mode）
- 不破坏现有功能（sidepanel、host 同步）
- 遵循 component-guidelines：textContent over innerHTML（prompt 是开发者静态内容，可用 textarea 承载）、事件委托

## Acceptance Criteria

- [ ] `chrome://extensions` 中 Journal 显示"扩展程序选项"，点击打开 options 页
- [ ] 侧边栏 ⚙️ 按钮可打开 options 页
- [ ] options 页显示 Agent 接入区：skill 的 GitHub 链接 + 获取说明
- [ ] 显示可复制的 prompt 模板（含 GitHub raw 链接，不含本机 E:\ 路径）
- [ ] 点击复制按钮 → 剪贴板获得完整 prompt，且有成功反馈
- [ ] host 状态检测：在线显示绿色 + 提示"已就绪"，离线显示灰色 + 给出启动命令
- [ ] dark mode 下页面正常
- [ ] 侧边栏 / host 同步功能不受影响

## Out of Scope

- 一键启动 host（浏览器扩展无法直接启 Node 进程，只给命令提示）
- skill 的自动安装（agent 侧行为，UI 只提供指引与 prompt）
- 多语言支持
- prompt 模板按平台拆分多份（一份通用 prompt + 平台备注即可，本期不拆）

## Open Questions

（无 — 已解决：prompt 模板同时提供 "只读 raw SKILL.md" 与 "clone 整个仓库" 两种获取方式，agent 自选）
