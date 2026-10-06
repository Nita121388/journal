# `state/` — 数据层

**职责**：UI 的单一数据真源与视图状态。持有 `PlatformPort`（依赖注入），不自己创建端口。

## 允许
- import `shared/`；使用注入进来的 `port` 对象。

## 禁止
- 不得 import `platform/**`（端口由 `entries/` 注入）。
- 不得直接使用 `chrome.*`。

## 规划内容
| 文件 | 职责 |
|---|---|
| `repository.js` | 内存单一真源 + 订阅；卡片 CRUD 唯一入口 |
| `sync-bridge.js` | 合并 pull / poll / onChanged 为一条通知链 |
| `view-state.js` | 视图模式 / 筛选 / 选中日期等 UI 状态 |

详见 `design.md` §4。
