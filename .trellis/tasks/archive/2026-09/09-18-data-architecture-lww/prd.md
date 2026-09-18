# PRD: 数据存储架构重构（host 权威 + LWW + 合并迁移）

## Goal

重建 Journal 的数据存储架构，解决扩展 chrome.storage.local 与 host JSON 文件之间的数据不一致问题。让 host 文件成为唯一权威数据源，扩展 storage 降级为缓存；每条日志加时间戳支持 LWW 冲突解决；提供工具合并现有两份数据。

## Background / 现状

- **存储 A（扩展）**：`chrome.storage.local`，数据结构 `{ "2026-09-18": "markdown内容" }`，无时间戳
- **存储 B（host）**：`host/data/journal-data.json`，数据结构相同，无时间戳
- **同步机制**：host-sync.js，双向同步但条件判断有缺陷（只比天数，不比内容）
- **冲突现状**：agent 写 host，扩展读 storage，双方各自存了两天数据但内容不同，无法自动合并
- **已备份**：host 文件 → `backup/2026-09-18/journal-data.json.bak`

## 核心问题

1. **两份存储无时间戳**：无法判断哪份更新，冲突裁决靠猜测
2. **同步策略有盲区**：同一天追加内容不触发拉取
3. **无权威层定义**：扩展编辑和 agent 编辑谁优先？无规则

## Requirements

### 数据模型变更

- 每条日志从 `string` 改为 `{ content: string, createdAt: string, updatedAt: string }`
- `createdAt` / `updatedAt` 用 ISO 8601 格式（`new Date().toISOString()`）
- 旧格式（纯 string）自动兼容：读取时补默认时间戳（createdAt = 今天 00:00，updatedAt = 今天 00:00）

### 存储层级定义

| 层级 | 存储位置 | 职责 |
|---|---|---|
| **权威层** | host/data/journal-data.json | 所有写入的最终目的地，数据唯一真相源 |
| **缓存层** | chrome.storage.local | 扩展的临时缓存，启动时从权威层无条件同步 |

### 同步协议

| 场景 | 方向 | 行为 |
|---|---|---|
| 扩展启动 | 权威层 → 缓存层 | 无条件拉取覆盖（合并两边数据，LWW 裁决） |
| 扩展编辑 | 直接写权威层 | 写 host，不写缓存（绕过 chrome.storage.local） |
| Agent 编辑 | 权威层（直接写） | CLI/agent 直接写 host JSON |
| 扩展离线 | 缓存层独立可用 | 恢复后下次启动时合并同步 |

### 数据导出工具

- 在 options 页新增「导出扩展数据」功能
- 导出 `chrome.storage.local` 的 journals 数据为 JSON（文件下载）
- 用户手动导出后，我才能与 host 文件合并

### 合并/迁移策略

1. 读取 host 文件（权威层）和导出文件（扩展缓存）
2. 对同一天：取 updatedAt 更大的那份内容
3. 两边独有的天直接保留
4. 结果写回权威层（host 文件），格式为新模型

### 技术约束

- 纯 JS，无新依赖，无构建步骤
- host server.js 的 API 接口不变（GET/PUT/DELETE journals）
- 不破坏扩展 UI 渲染（sidepanel.js 渲染逻辑适配新模型）

## Acceptance Criteria

- [ ] host 数据文件格式升级：每条日志含 `content`、`createdAt`、`updatedAt`
- [ ] store.js 的 `getJournal` / `saveJournal` 支持新旧格式兼容
- [ ] 扩展启动时无条件从 host 拉取覆盖缓存
- [ ] 扩展编辑直接写 host（通过 PUT /api/journals/{day}）
- [ ] 旧格式数据（纯 string）读取时自动补时间戳
- [ ] options 页有「导出扩展数据」按钮，点击导出 JSON 文件
- [ ] 提供 CLI 或工具完成两份数据的合并迁移
- [ ] 迁移后扩展 UI 正常显示，热力图/日历/TODO 不受影响
- [ ] dark mode 正常

## Open Questions

（已解决）
- 时间戳格式：ISO 8601 字符串（毫秒），如 `"2026-09-18T14:30:00.000Z"`
- 迁移工具形式：一次性 CLI 脚本（`node migrate.mjs`），非自动化流程
