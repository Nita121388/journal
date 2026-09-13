# Journal 📓

记录每天干了什么 —— 一个轻量的 Chrome 扩展：**每日日志 + 热力图打卡 + TODO + AI 增删改查**。

> 不想为一天只用一次的功能安装一个软件，所以做成浏览器扩展。数据全在本地，可选 WebDAV/本地文件同步。

## 功能

- **每日日志**：每天一页，随手记下今天做了什么（Markdown 自由书写）
- **热力图打卡**：GitHub 风格热力图，一眼看出哪天记了、哪天没记
- **TODO**：独立待办清单，支持完成/优先级/截止日
- **AI 操作**：自然语言增删改查（"今天做了什么"、"给 7/8 加一条：下午见客户"、"把周一的待办标完成"）
- **数据本地**：`chrome.storage.local`，不上传任何服务器
- **同步可选**：WebDAV（坚果云等）/ 本地文件双通道，LWW 合并 + 删除墓碑

## 技术栈

- Manifest V3 + Side Panel（`chrome.sidePanel`）
- 原生 JS（无框架，保持轻量）
- `chrome.storage.local` 存储
- AI 通过本地 host（Node + MCP）或 API Key 连接

## 开发

```bash
# 1. 打开 chrome://extensions → Developer mode → Load unpacked
# 2. 选择 extension/ 目录
```

## 结构

```
extension/         扩展本体
  manifest.json    MV3 配置
  background.js    Service Worker
  sidepanel.html   主界面（侧边栏）
  options.html     设置页
  lib/             数据模型 / 存储 / 同步
host/              本地 AI Agent（Node，复用 tabshelf-host 模式）
docs/              设计文档
```
