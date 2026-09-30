# Journal 📓

记录每天干了什么 —— 一个轻量的 Chrome 扩展：**每日日志 + 热力图打卡 + TODO + AI 增删改查**。

> 不想为一天只用一次的功能安装一个软件，所以做成浏览器扩展。数据全在本地（host 的 SQLite），可选 WebDAV / 本地文件夹 / GitHub 多端同步。

## 功能

- **每日日志**：每天一页，随手记下今天做了什么（Markdown 自由书写）
- **热力图打卡**：GitHub 风格热力图，一眼看出哪天记了、哪天没记
- **TODO**：独立待办清单，支持完成/优先级/截止日
- **AI 操作**：自然语言增删改查（"今天做了什么"、"给 7/8 加一条：下午见客户"、"把周一的待办标完成"）
- **数据本地**：host 本地 SQLite（`node:sqlite`），不上传任何服务器
- **多端同步（可选）**：本地文件夹 / WebDAV（坚果云等）/ GitHub 私有仓库；逐卡 LWW 合并 + 删除墓碑，多端各自同步即收敛

## 数据同步

host 是权威数据源（SQLite，`host/data/journal.db`）。同步把卡片写到共享介质，各设备独立同步后自动收敛：

| Provider | 介质 | 说明 |
|----------|------|------|
| `local` | 本地/云盘文件夹 | 最简；把目录放在 iCloud/OneDrive/坚果云同步盘即可跨机 |
| `webdav` | WebDAV 服务器 | 坚果云、Nextcloud 等 |
| `github` | GitHub 私有仓库 | REST Contents API + token；建议独立分支 `sync-data` |

- 合并规则：**逐卡 LWW**（`updatedAt` 新者胜）+ **删除墓碑**（删除永远传播、不会复活）。
- 触发：扩展设置页「☁️ 立即同步」按钮、`POST /api/sync/now`、或 CLI `node host/cli.mjs sync`。
- 配置存在 host 侧；`GET /api/sync/config` 对密钥脱敏（只回传 `*Set` 标记）。

## 技术栈

- Manifest V3 + Side Panel（`chrome.sidePanel`）
- 原生 JS（无框架，保持轻量）
- host 本地 SQLite 存储（`node:sqlite`）；扩展 `chrome.storage.local` 仅作镜像缓存
- 同步：可插拔 Backplane（本地文件夹 / WebDAV / GitHub） + LWW 合并引擎
- AI 通过本地 host（Node HTTP + CLI）连接

## 开发

```bash
# 1. 打开 chrome://extensions → Developer mode → Load unpacked
# 2. 选择 extension/ 目录
```

- 打开扩展设置页可配置「数据同步」并点「立即同步」。
- host 测试：`cd host && npm test`（`node --test`）。

### 样式与构建（Tailwind CSS v4）

侧边栏样式由 **Tailwind CSS v4** 参与构建，但仍保持「加载 unpacked 免构建」：

- `extension/src/tailwind.css` —— 构建源：`@theme` 把既有设计 token 桥接为 Tailwind utility（颜色别名 `canvas/surface/ink/muted/line/accent`），`@layer components` 放从 `sidepanel.css` 迁移来的组件。
- `extension/dist/sidepanel.css` —— **构建产物，已提交进仓库**。修改 `src/tailwind.css` 后必须重建：

```bash
cd extension && npm run build:css       # 构建
cd extension && npm run watch:css       # 监听重建（开发时）
```

- 加载顺序：`dist/sidepanel.css` 先、`sidepanel.css` 后（后者承载尚未迁移的复杂组件与设计 token 定义）。
- **不要引入 preflight**（用 `@import "tailwindcss/theme" + "tailwindcss/utilities"` 两段式，而非 `@import "tailwindcss"`）：现有样式体系已完整，加全站 reset 会视觉漂移。
- 复杂组件（时间线画布、周视图网格、日历、热力图）**保留原生 CSS**，靠运行时计算的定位（如 `scheduleHeight()`）无法用 utility 表达。

### UI 回归（dev-loop）

UI 改动后跑自动化截图 + 断言回归（Playwright，多宽度）：

```bash
cd dev-loop
node dev-loop.mjs --width 320,360,400,500                # smoke：首屏/host/日历/卡片池
node dev-loop.mjs --scenario tpl --width 360             # 模板构建器
node dev-loop.mjs --scenario tailwind-migrated --width 360  # 迁移组件的 computed-style 校验
```

## 结构

```
extension/         扩展本体
  manifest.json    MV3 配置
  background.js    Service Worker
  sidepanel.html   主界面（侧边栏）
  options.html     设置页（含数据同步）
  lib/             数据模型 / 存储 / host 桥接 / 同步入口
host/              本地 Node 服务（HTTP + CLI）
  server.js        REST 服务 + /api/sync/*
  cli.mjs          agent/CLI 客户端
  lib/storage.js   SQLite 权威存储（+ JSON 回退、旧数据迁移）
  sync/            合并引擎 + 可插拔 Backplane + 编排
  test/            node:test 测试
```
