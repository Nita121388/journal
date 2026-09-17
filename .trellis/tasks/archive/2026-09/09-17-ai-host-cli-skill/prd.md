# PRD: AI 自然语言增删改查（host 服务 + CLI + skill）

## Goal

让本地任意 agent（Pi、Claude Code、Codex 等）通过 skill 调用 CLI，操作 Journal 的日志和 TODO 数据，实现自然语言增删改查。

## 架构

复用 tabshelf-host 模式：
```
Chrome 扩展 ←HTTP→ host/server.js ←→ journal-data.json
                        ↑
                   agent (Pi) ← CLI ← skill
```

- **host/server.js**: localhost:8765 REST API，读写 journal-data.json
- **host/cli.mjs**: CLI 封装 API 调用，输出 JSON，agent 友好
- **extension**: 启动时从 host 拉取，变更时推送到 host
- **skill**: `.agents/skills/journal/SKILL.md`，agent 根据自然语言选命令

## Acceptance Criteria

- [ ] `host/server.js` 启动在 `127.0.0.1:8765`，提供日志和 TODO 的 CRUD API
- [ ] `host/cli.mjs` 支持：日志查询/写入/删除、TODO 增删改查、热力图摘要、今日快照
- [ ] CLI 所有输出为 JSON，错误时 `{ ok:false, error:{code,message} }`
- [ ] 扩展启动时从 host 拉取数据写入 chrome.storage.local
- [ ] 扩展变更后推送到 host（debounce 500ms）
- [ ] `.agents/skills/journal/SKILL.md` 包含完整命令参考
- [ ] Pi 等 agent 加载 skill 后可通过 CLI 执行：查今日日志、添加 TODO、写入日志等

## API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/journals` | 获取所有日志 `{ "2026-09-17": "..." }` |
| GET | `/api/journals/:day` | 获取某天日志 |
| PUT | `/api/journals/:day` | 写入某天日志（body: `{ markdown }`) |
| DELETE | `/api/journals/:day` | 删除某天日志 |
| GET | `/api/todos` | 获取全部 TODO |
| POST | `/api/todos` | 新增 TODO（body: `{ title, priority?, due? }`) |
| PUT | `/api/todos/:id` | 更新 TODO（body: `{ done?, title?, priority?, due? }`) |
| DELETE | `/api/todos/:id` | 删除 TODO |
| GET | `/api/heatmap` | 热力图聚合 `{ "2026-09-17": 1 }` |
| GET | `/api/settings` | 获取 settings |
| PUT | `/api/settings` | 更新 settings |

## CLI 命令设计

```bash
journal today                          # 输出今日快照（日志 + 未完成 TODO）
journal read [day]                     # 读取指定天日志（默认今天）
journal write <day> --content "..."    # 写入指定天日志
journal delete <day>                   # 删除指定天日志
journal todo list [--filter active|all|done]  # 列出 TODO
journal todo add <title> [--priority high|medium|low] [--due YYYY-MM-DD]  # 添加 TODO
journal todo done <id>                 # 标记完成
journal todo delete <id>               # 删除 TODO
journal heatmap                        # 热力图摘要
```

## Out of Scope

- WebDAV 同步（sync.js 后续单独实现）
- 在扩展 UI 里显示 host 同步状态
