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

**会话来源标记**：每张卡片带 `tags: ['src:<agent>-<sessionId>']`，用于去重和溯源。

**去重逻辑**：同一会话（sessionId）同一天只写一次，第二次运行时全部 skipped。

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
