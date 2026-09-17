---
name: journal
description: 操作 Journal 每日日志扩展的数据（日志 + TODO + 热力图）。当用户提到"今天做了什么""写日志""添加待办""今天的待办""记录一下""改日志"等涉及 Journal 数据的增删改查时使用。通过本地 HTTP 服务操作，支持任意 agent（Pi/Claude Code/Codex 等）调用。
---

# Journal Skill

> 操作 Journal 扩展的每日日志和 TODO 数据。数据存在本机，通过 host 服务读写。

## 前置条件

1. 本地 host 服务已启动：`node E:/projects/journal/host/server.js`（监听 `127.0.0.1:8765`）
2. 若 host 未启动，CLI 会返回 `HOST_OFFLINE`，需先启动它

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
$CLI todo add <title> [--priority high|medium|low] [--due YYYY-MM-DD]
$CLI todo done <id>                          # 标记完成
$CLI todo delete <id> --confirm              # 删除（需 --confirm 防误操作）
```

### 热力图 / 汇总

```bash
$CLI heatmap                                # 各天是否有记录
```

## 自然语言 → 命令映射（示例）

| 用户说 | 执行 |
|--------|------|
| "我今天做了什么" / "看看日志" | `$CLI today` |
| "今天记录一下：下午见客户" | `$CLI write 2026-09-17 --content "下午见客户"` |
| "给 7/8 加一条：整理报告" | `$CLI read 2026-07-08` → 拼接 → `$CLI write 2026-07-08 --content "..."` |
| "我的待办有哪些" | `$CLI todo list` |
| "加个待办：写周报，明天截止" | `$CLI todo add "写周报" --due <明天>` |
| "把 X 待办标完成" | `$CLI todo list` → 找到 id → `$CLI todo done <id>` |
| "删掉 X 待办" | `$CLI todo list` → 找到 id → `$CLI todo delete <id> --confirm` |

## 注意事项

- **日期计算**：`today`/`明天`/`昨天` 用系统日期计算，格式 `YYYY-MM-DD`。示例：明天 = `date -d "+1 day" +%F`
- **中文日期**："7/8" 通常指 7 月 8 日，若年份不明确用最近年份
- **TODO 删除必须 `--confirm`**，否则命令会失败（防误操作）
- **追加日志**：先 `read` 再 `write` 覆盖，避免丢内容
- 所有输出为 JSON，`ok:false` 时看 `error.code`（`HOST_OFFLINE` = 启动 host；`VALIDATION_ERROR` = 参数错误；`NOT_FOUND` = 目标不存在）
- 数据文件：`E:/projects/journal/host/data/journal-data.json`（host 与扩展双向同步）
