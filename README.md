# Journal 📓

记录每天干了什么 —— 一个轻量的 **Chrome 侧边栏扩展**：卡片式日志 + 日程时间线 + 到点提醒 + 热力图打卡 + AI 增删改查。

> 不想为一天只用一次的功能安装一个软件，所以做成浏览器扩展。
> 数据全在本地（host 的 SQLite），可选本地文件夹 / WebDAV / GitHub 多端同步。

👤 **只想用的话看 [用户指南](docs/user-guide.md)**（安装 / 上手 / 数据在哪 / 离线行为）。
下面这份是给开发者的。

---

## 核心模型：一切都是卡片

没有"日志 / 待办 / 笔记"三套模型，只有**一张卡片**，用字段表达差异：

| 字段 | 说明 |
|---|---|
| 标题 / 内容 | `title` / `content` |
| 图标 | 每张卡片可选 emoji |
| 状态 | 纯记录 · 待办 · 进行中 · 已完成（也可自定义文字状态） |
| 进度 | 0–100%，与状态双向联动（100% ⇒ 完成） |
| 排程 | 开始/结束时间（时长自动互算），落在日程时间线上 |
| 日期 | 安排在哪天（决定它出现在时间线还是卡片池） |
| 标签 / 项目 | 多维归类与筛选 |
| 自定义属性 | 任意字段：文本/数字/选择/多选/日期/时间/勾选 |

> 卡片池的「待办筛选」就是 `状态 ∈ {待办, 进行中}` —— 待办不是一个独立模块，而是一个筛选。

## 界面

| 区域 | 能力 |
|---|---|
| **卡片池** | 唯一主视图。状态/标签/项目筛选、命名视图（保存当前筛选组合）、卡片/列表双布局、模板建卡 |
| **日历** | 月历网格 + 今日热力标记，点日期跳转 |
| **打卡** | GitHub 风格热力图 + 连续天数 |
| **主视图** | 月历 / 周历 / **日程时间线**（08–22 或 24 小时，可切）三选一 |
| **AI Skill** | 展示本机已装 AI 技能状态，一键复制路径给 AI |

日程时间线支持**拖拽改时间**、拖边改时长、短卡片悬停展开、并行事件自动分道，并有一条**当前时刻指示线**。

- **到点提醒**：卡片有开始时间且当天未完成时，到点弹系统通知
  （`chrome.alarms` + `notifications`，完全本机计算、不联网；设置页可关）

- **到点提醒**：卡片有开始时间且当天未完成时，到点弹系统通知
  （`chrome.alarms` + `notifications`，完全本机计算、不联网；设置页可关）

## AI 操作

自然语言增删改查，走本地 host：

- "今天做了什么"
- "给 7/8 加一条：下午见客户"
- "把周一的待办标完成"

## 数据与同步

host 是权威数据源（SQLite，`host/data/journal.db`），扩展侧 `chrome.storage.local` 仅作离线镜像缓存。
同步把卡片写到共享介质，各设备独立同步后自动收敛：

| Provider | 介质 | 说明 |
|----------|------|------|
| `local` | 本地/云盘文件夹 | 最简；目录放在 iCloud/OneDrive/坚果云同步盘即可跨机 |
| `webdav` | WebDAV 服务器 | 坚果云、Nextcloud 等 |
| `github` | GitHub 私有仓库 | REST Contents API + token；建议独立分支 `sync-data` |

- 合并规则：**逐卡 LWW**（`updatedAt` 新者胜）+ **删除墓碑**（删除永远传播、不会复活）。
- 触发：设置页「☁️ 立即同步」、`POST /api/sync/now`、或 CLI `node host/cli.mjs sync`。
- **密钥留在 host**：`GET /api/sync/config` 与 `GET /api/llm/config` 对密钥脱敏（只回 `*Set` 标记）。

## 安装

1. 打开 `chrome://extensions` → 开启 Developer mode
2. **Load unpacked** → 选 `extension/` 目录
3. 点扩展图标打开侧边栏

host 可选（缺省时扩展仍可离线读写缓存，只是不落库）：

```bash
node host/server.js            # 启动本地权威服务（默认 127.0.0.1:8765）
node host/cli.mjs --help       # agent / CLI 客户端
```

## 技术栈

- Manifest V3 + Side Panel（`chrome.sidePanel`）
- **原生 JS，无框架、无打包器** —— 保持 load unpacked 免构建
- 7 层单向依赖：`shared` / `platform` / `state` / `views` / `features` / `components` / `entries`
  （见 [ADR-0001](docs/adr/0001-layered-packaging-within-chrome-root.md)）
- host：Node HTTP + `node:sqlite`；同步：可插拔 Backplane + LWW 合并引擎
- 样式：手写 CSS + 设计 token，Tailwind v4 参与构建（纯 CSS，无 JS 打包）

## 开发

```bash
npm run lint            # ESLint（含分层边界规则），必须 0 errors
npm test                # extension（vitest）+ host（node --test）
npm run test:coverage   # shared/ + state/ 覆盖率门禁（≥80% 行/语句，≥70% 分支）

cd dev-loop && node dev-loop.mjs --width 320,360,400,500   # 真实 Chromium UI 回归
```

### 目录结构

```
extension/            扩展本体（Chrome 加载根）
  manifest.json       MV3 配置
  sidepanel.html      主界面（侧边栏）
  options.html        设置页（数据同步 / AI）
  entries/            组合根：启动装配（sidepanel.js 仅 13 行）
  platform/           平台适配层 —— chrome.* / localStorage 唯一归属地
  shared/             纯逻辑叶子：模型 / 字段注册表 / 协议 / 格式化
  state/              数据层：repository（内存真源）/ view-state / host 客户端
  views/              主视图渲染（时间线 / 周 / 月 / 卡片池 / 热力图 / 日历）
  features/           交互功能（卡片编辑器 / 模板构建器 / 选择器 / toast）
  components/         DOM 引用注册表
  styles/             设计 token 唯一定义处
  dist/               Tailwind 构建产物（已提交，勿手改）

host/                 本地 Node 服务（HTTP + CLI）
  server.js           REST 服务 + /api/sync/*
  cli.mjs             agent/CLI 客户端
  lib/storage.js      SQLite 权威存储（+ JSON 回退、旧数据迁移）
  sync/               合并引擎 + 可插拔 Backplane + 编排
  test/               node:test 测试

dev-loop/             扩展 UI 自动化回归（Playwright + 多宽度截图断言）
.trellis/spec/        各层编码规范（动手前先读）
docs/adr/             架构决策记录
```

### 样式构建

侧边栏样式由 **Tailwind CSS v4** 参与构建，但仍保持「加载 unpacked 免构建」：

- `extension/src/tailwind.css` —— 构建源：`@theme` 把既有设计 token 桥接为 Tailwind utility，
  `@layer components` 放迁移来的组件。
- `extension/dist/sidepanel.css` —— **构建产物，已提交**。改 `src/tailwind.css` 后必须重建：

```bash
cd extension && npm run build:css     # 构建
cd extension && npm run watch:css     # 监听重建
```

- **加载顺序有硬约束**：`dist/sidepanel.css` → `select.css` → `styles/tokens.css` → `sidepanel.css`。
  `dist/` 内含 `:root{--color-X:var(--color-X)}` 自引用（Tailwind 生成），必须由 `tokens.css` 覆盖，
  否则自定义属性成环失效、所有 `var()` 背景变透明。详见 `extension/styles/README.md`。
- **不要引入 preflight**；复杂组件（时间线画布、周网格、日历、热力图）**保留原生 CSS**。
