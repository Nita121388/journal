---
name: journal
description: 操作 Journal 每日日志扩展的数据（日志 + TODO + 热力图）。当用户提到"今天做了什么""写日志""记录一下""日志/today""今天的待办""改日志"或想让界面显示一段日志时使用。通过本地 HTTP 服务操作，支持任意 agent（Pi/Claude Code/Codex 等）调用。
---

# Journal Skill

> 操作 Journal 扩展的每日日志和 TODO 数据。数据存在本机，通过 host 服务读写。

## 各平台加载方式

本技能位于项目 `.agents/skills/journal/` 目录下：
- **Pi**：自动发现，无需额外配置
- **Claude Code**：读取项目 `.agents/skills/` 或用户级 `~/.claude/skills/`（后者需手动复制或 symlink）
- **Codex**：读取项目 `.agents/skills/` 或用户级 `~/.codex/skills/`（后者需手动复制或 symlink）

确保 `.agents/skills/journal/SKILL.md` 存在于以上对应目录中即可。

## 前置条件

1. 本地 host 服务已启动：`node E:/projects/journal/host/server.js`（监听 `127.0.0.1:8765`）
2. 若 host 未启动，CLI 会返回 `HOST_OFFLINE`，需先启动它

## ⭐ 数据模型（务必先读，避免写错地方）

Journal 有**两套互不相通的数据结构**，注意区分：

| 结构 | 存什么 | CLI 操作 | UI 是否显示 |
|------|--------|----------|------------|
| **`journals`**（按天；markdown 文本） | 每天的"段落式日志"，如句柄排查那几大段 | `read` / `write` / `delete` | **界面不显示**（仅供 AI/CLI/today 查询） |
| **`cards`**（按天 + 时间） | 一条条"卡片"：文本/任务/灵感，带 `time` 时间戳，按时间线排列 | 无 CLI 命令，需走 `POST /api/cards` 或直接改 `cards` | **界面显示**（侧边栏时间线） |

**核心规则**：
- **想让用户在扩展界面里看到某段内容 → 必须写 `cards`**（带 `assignedDate` 和 `time`），不是 `journals`。
- `journals` 的文本侧边栏看不到，但仍会被热力图计数，且 `today`/`read` 能读。
- 如果用户说"记录下来/显示一下"，**默认创建 cards**；只有在明确指"日志区/段落文本"或复查归档时才动 `journals`。
- **修改 `cards` 时，时间要落在 30 分钟整/半点刻度附近**：界面时间线只有 8:00-22:00 的 `:00`/`:30` 刻度，卡片时间离最近刻度 ≤15 分钟才会显示（如 11:07 归 11:00）。建议直接用整点/半点（如 14:00）。

## ⭐ 来源元数据（provenance）——每张卡片记录「谁创建 / 谁修改」

每张卡片带 `meta` 字段，记录创建者与最后修改者，用于区分**人类 / agent / 自动**：

```js
meta: {
  createdBy: { origin, agent?, model?, project?, device, at },  // 创建时写入，永不改
  updatedBy: { origin, agent?, model?, project?, device, at },  // 每次修改覆盖
}
```

### origin 三档（对应「谁做的」）

| origin | 含义 | agent / model |
|---|---|---|
| `human` | **人类**直接在扩展 UI 操作 | 无 |
| `agent-assisted` | **人类驱动 agent** 去做的（人在对话里让 agent 写） | 有 |
| `agent-auto` | **自动**（定时任务 auto-summary.mjs，无人干预） | 有（来源会话的 agent + 模型） |

- `agent`：`pi` / `codex` / `claude` —— 哪个 agent
- `model`：模型 id（如 `deepseek-v4-pro`、`kimi-k3`）—— 哪个模型
- `project`：项目目录（人类在编辑器里选；agent 自动取会话 `cwd`）
- `device`：电脑信息 `{ hostname, platform, release }`（host 自动填，跨设备同步时能看出是哪台机器写的）
- `at`：时间

### 各调用方怎么被标记（**你无需手动填**）

| 调用方 | 自动标记 |
|---|---|
| **扩展 UI**（编辑器 / 待办） | `human` + 编辑器里选的项目 |
| **Pi 会话内跑 CLI**（`node cli.mjs ...`） | `agent-assisted` + `agent=pi` + `model=$PI_MODEL` + `project=cwd`（自动探测环境变量） |
| **auto-summary.mjs** | `agent-auto` + 来源 agent + 会话模型 + 会话 cwd |
| **跨设备同步** | meta 随卡片同步，LWW 新者胜 |

### 显式覆盖（可选）

CLI 支持 flag 覆盖自动探测：

```bash
$CLI todo add "写周报" --origin agent-assisted --agent pi --model deepseek-v4-pro --project E:/projects/foo
```

直接调 HTTP API 时在 body 里带 `provenance`：

```bash
curl -X POST http://127.0.0.1:8765/api/cards \
  -H "Content-Type: application/json" \
  -d '{"content":"下午见客户","type":"text","assignedDate":"2026-09-24","time":"14:00",
       "provenance":{"origin":"agent-assisted","agent":"pi","model":"deepseek-v4-pro","project":"E:/projects/journal"}}'
```

> `meta` 由 **host 封装**（补 device/at、保护 createdBy），调用方只传上下文。
> 界面：编辑器打开已有卡片时底部显示「创建：…　修改：…」。

## 快速开始

```bash
CLI="node E:/projects/journal/host/cli.mjs"
```

## 常用命令

### 今日快照（日志 + 未完成 TODO，最高频）

```bash
$CLI today
```

输出：`{ day, journal, pendingTodos, pendingCount }`

### 日志操作

```bash
$CLI read [day]                        # 读取某天日志，day 省略=今天
$CLI write <day> --content "内容"       # 写入某天日志（覆盖）
$CLI delete <day>                       # 删除某天日志
```

- day 格式 `YYYY-MM-DD`（如 `2026-09-17`）
- `write` 是**覆盖写入**，若需追加请先 `read` 再拼接

### TODO 操作

```bash
$CLI todo list [--filter active|all|done]   # 列出待办
$CLI todo add <title> [--priority high|medium|low] [--due YYYY-MM-DD] [--time HH:MM]
$CLI todo done <id>                          # 标记完成
$CLI todo delete <id> --confirm              # 删除（需 --confirm 防误操作）
```

> ⚠️ **不加 `--time` 的待办会落进界面时间线的「全天」组**（排在最底部），
> 不会出现在具体时刻上。想让待办显示在时间线上某个点，必须传 `--time`，
> 且时间要落在 `:00`/`:30` 刻度附近（与卡片同规则，见下文「创建卡片」）。

### 热力图 / 汇总

```bash
$CLI heatmap                                # 各天是否有记录
```

## 创建卡片（界面可见）

> CLI 没有卡片命令，需要直接调 host 的 HTTP API（端口 8765）。

**创建单张卡片**（`assignedDate` = 哪天，`time` = 时间刻度，建议用整点/半点）：

```bash
curl -X POST http://127.0.0.1:8765/api/cards \
  -H "Content-Type: application/json" \
  -d '{"content":"下午见客户","type":"text","assignedDate":"2026-09-17","time":"14:00"}'
```

- `type`：`text`（文本）/ `task`（任务） / `idea`（灵感）
- 想在界面时间线显示，务必给 `assignedDate` + 落在整/半点刻度的 `time`（如 09:00、14:30）
- **⭐ 必须带 `tags`（项目标签）**：写卡片时一律带上项目标签，否则界面无法按项目筛选、导出到 Obsidian 后也归不了类。
  `"tags":["journal"]` —— 用项目名/仓库名（如 `journal`、`LiCASmart`、`tabshelf`）。
  同时 `provenance.project` 给项目目录（如 `E:/projects/journal`）。
- **agent 调用时加 `provenance`**（让人知道是谁写的；不加则 host 默认标 `human`）：
  `"provenance":{"origin":"agent-assisted","agent":"pi","model":"$PI_MODEL","project":"工作目录"}`
  详见上文「来源元数据」章节。

**完整示例（agent 写一张卡，带标签 + 来源）**：

```bash
curl -X POST http://127.0.0.1:8765/api/cards   -H "Content-Type: application/json"   -d '{"content":"优化侧栏滚动","type":"text","tags":["journal"],
       "assignedDate":"2026-09-24","time":"09:30","startTime":"09:30","endTime":"10:00",
       "provenance":{"origin":"agent-assisted","agent":"pi","model":"deepseek-v4-pro","project":"E:/projects/journal"}}'
```

**把一段日志转成多张卡片**（让界面能看到）：先 `$CLI read <day>` 拿到 journals 文本，再按段落拆开分别 `POST /api/cards`，每段一个时间。

## 自然语言 → 命令映射（示例）

| 用户说 | 执行 |
|--------|------|
| "我今天做了什么" / "看看日志" | `$CLI today` |
| "今天记录一下：下午见客户"（想让界面显示） | `POST /api/cards`（`assignedDate`=今天，`time`置整/半点刻度，如 14:00） |
| "给 7/8 加一条：整理报告" | `read 2026-07-08` 看当天卡片/日志 → 决定加 `journals` 还是 `cards`。若要在界面看到 → `POST /api/cards` |
| "我的待办有哪些" | `$CLI todo list` |
| "加个待办：写周报，明天截止" | `$CLI todo add "写周报" --due <明天> --time 14:00`（要显示在时间线上就给 `--time`）|
| "把 X 待办标完成" | `$CLI todo list` → 找到 id → `$CLI todo done <id>` |
| "删掉 X 待办" | `$CLI todo list` → 找到 id → `$CLI todo delete <id> --confirm` |

## ⭐ 三层数据关系：SQLite / Markdown / JSON

同一个 Journal 数据有**三个投影**，职责不同，**不要搞混**：

| 层 | 文件 | 定位 | 谁能改 |
|---|---|---|---|
| **SQLite** | `host/data/journal.db` | **唯一权威源** | 只由 host 写（人不可直接改） |
| **Markdown** | 你配置的 md 目录（如 `journal/*.md`） | **给人看 / 人改**（Obsidian） | 人 + host 导出 |
| **JSON** | `journal-sync.json`（GitHub/WebDAV/本地目录） | **给机器传**（设备间同步） | 只由 host 写 |

```
        ┌──────────────────────────┐
        │  SQLite (唯一权威)        │
        └───┬──────────────┬───────┘
   导出/导入 │              │ push/pull
            ▼              ▼
   ┌────────────────┐  ┌──────────────────┐
   │ Markdown .md   │  │ journal-sync.json│
   │ 人改 → 回流     │  │ 设备间同步        │
   └────────────────┘  └──────────────────┘
```

- **md 是给人读写的视图**，不是权威源：改 md 后执行 `sync` (pull) 会让改动回流进 SQLite
- **json 是设备间搬运格式**，人不要手改
- md 目录是**设备本地设置**（不同电脑可不同），不会被同步覆盖

### md 文件格式（Obsidian 友好）

一天一个文件 `YYYY-MM-DD.md`，卡片用 **Obsidian 属性**记元数据：

```markdown
---
date: 2026-09-24
weekday: 周三
type: journal-day
project: E:/projects/journal
device: DESKTOP-36AHUML
tags: [journal]
---

# 2026-09-24 周三

## 日志
一段散文日志
`id:: c_mj_2026-09-24` `type:: text`

## 时间线
### 09:00
排查同步 404
`id:: c_1790228243977` `type:: text` `end:: 09:30` `by:: pi` `model:: deepseek-v4-pro`

## 待办
- [ ] 未完成的任务
  `id:: c_456` `type:: task` `tags:: todo`
```

- **文件级 frontmatter**：这一天的属性（date/project/device/tags）
- **块级内联属性** `` `key:: value` ``：每张卡片的 id/type/end/by/model/tags
  （反引号包裹 → Obsidian 阅读模式不显示，干净；双冒号 → Dataview/属性面板可识别）
- **卡片池**（未安排）→ `inbox.md`
- 目录下**非日期命名的 .md**（你自己的笔记）不会被解析，安全

### 人在 Obsidian 里改了 → 怎么回流

```bash
$CLI sync          # 或 sync pull —— 把 md 改动合并回 SQLite
```

- md 里**新增**条目（无 id）→ 自动生成稳定 id 后作为新卡加入，**重复 pull 不会重复建卡**
- md 里**删除**条目 → 默认**不删** SQLite 的卡（安全优先，防误删）
- **meta（谁创建/谁修改）不会被 md 覆盖** —— md 不是 meta 权威源，SQLite 里的来源信息受保护

## ⭐ 跨设备同步

三种后端（在扩展选项页 → 数据同步 配置）：

| provider | 同步到 | 关键配置 |
|---|---|---|
| `local` | 本地文件夹（如 Dropbox 同步目录） | 同步目录 |
| `webdav` | WebDAV（坚果云等） | URL + 账号密码 + 路径 |
| `github` | GitHub 私有仓库 | owner/repo + 分支 + token |
| `markdown` | obsidian md 文件 | md 目录 |

机制：host 生成快照（全部卡片 + 删除墓碑）→ push 到后端 → 别台设备 pull → **逐卡 LWW（updatedAt 新者胜）+ 删除墓碑**合并。

```bash
$CLI sync status                # 查看同步状态（provider / 上次同步 / 设备 id）
$CLI sync                       # 触发一次同步（auto: pull → 合并 → push）
$CLI sync push                  # 仅推送（SQLite → 后端）
$CLI sync pull                  # 仅拉取（后端 → SQLite）
$CLI sync config                # 查看当前同步配置（已脱敏）
```

> ⚠️ **同步前必须先配置**：未配置时 `sync` 会报 `SYNC_CONFIG`（提示去选项页配置）。
> 密钥只存本机 host 数据目录，不会回传到页面。sync 不同步 settings（含 md 目录），所以各设备可独立设置。

## 自动沉淀（会话历史 → 日程卡片，幂等）

`host/auto-summary.mjs` 扫描本机 agent 会话历史，提取当天真实任务，幂等写入卡片（界面时间线可见）。

```bash
# 默认扫描 Pi 会话（最近主力），提取今天任务
node E:/projects/journal/host/auto-summary.mjs

# 指定天数
node E:/projects/journal/host/auto-summary.mjs --day 2026-09-23

# 只扫 Codex 会话
node E:/projects/journal/host/auto-summary.mjs --agent codex

# 预览不写入
node E:/projects/journal/host/auto-summary.mjs --dry-run
```

**会话来源标记**（两层，各司其职）：
- `tags: ['src:<agent>-<sessionId>']` —— **去重**用：同一会话同一天只写一次，第二次运行全部 skipped。
- `meta.provenance` —— **溯源**用：标 `origin: 'agent-auto'` + 来源 agent + 会话模型（从会话 `model_change` 提取）+ 项目目录（会话 `cwd`）。

两者都自动写入，无需手动指定；「来源元数据」章节有完整说明。

**可配置 agent**：`--agent pi|codex|claude`（默认 `pi`）。Pi 扫 `~/.pi/agent/sessions/`，Codex 扫 `~/.codex/sessions/`。

**定时运行**（可选）：Windows 计划任务每天 22:00 自动运行，会话结束自动沉淀。

## 注意事项

- **日期计算**：`today`/`明天`/`昨天` 用系统日期计算，格式 `YYYY-MM-DD`。示例：明天 = `date -d "+1 day" +%F`
- **中文日期**："7/8" 通常指 7 月 8 日，若年份不明确用最近年份
- **TODO 删除必须 `--confirm`**，否则命令会失败（防误操作）
- **`journals` 与 `cards` 的关系**：`journals` 只是纯文本归档区；**界面时间线只读 `cards`**。
  host 在启动时会把 `journals` 回填为 `c_mj_<day>` 卡片（幂等），
  且 `PUT /api/journals/:day` 会双写对应卡片 —— 但这类自动卡片 **`time` 为 null，会显示在「全天」**。
  想在具体时刻显示 → 用 `POST /api/cards` 并明确给 `time`。
- **追加日志**：先 `read` 再 `write` 覆盖，避免丢内容
- 所有输出为 JSON，`ok:false` 时看 `error.code`（`HOST_OFFLINE` = 启动 host；`VALIDATION_ERROR` = 参数错误；`NOT_FOUND` = 目标不存在）
- 数据文件：`E:/projects/journal/host/data/journal.db`（host SQLite 权威库；扩展是镜像缓存）
