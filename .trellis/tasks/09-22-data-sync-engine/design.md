# Design — 数据同步引擎

## 架构总览

```
     ┌────────────── 设备 A ──────────────┐        ┌────────────── 设备 B ──────────────┐
     │  Chrome 扩展 (sidepanel/options)   │        │  Chrome 扩展                        │
     │        │ REST (127.0.0.1:8765)      │        │        │ REST                       │
     │        ▼                            │        │        ▼                            │
     │  host/server.js  (HTTP 层)          │        │  host/server.js                     │
     │        │                            │        │        │                            │
     │        ▼                            │        │        ▼                            │
     │  lib/storage.js (SQLite 权威库)     │        │  lib/storage.js                     │
     │        │                            │        │        │                            │
     │        ▼                            │        │        ▼                            │
     │  sync/engine.js (编排)              │        │  sync/engine.js                     │
     │        │                            │        │        │                            │
     │  sync/backplane.js                  │        │  sync/backplane.js                  │
     └────────┼─────────────────────────┘        └────────┼────────────────────────────┘
              │                                            │
              └──────────────►  共享同步介质  ◄────────────┘
                 LocalFolder / WebDAV / GitHub(repo)
```

## 三个解耦的层

| 层 | 文件 | 职责 | 不感知 |
|----|------|------|--------|
| 存储 store | `host/lib/storage.js` | 卡片持久化、墓碑、派生 journals、迁移 | 传输方式 |
| 合并 merge | `host/sync/merge.js` | 纯函数 LWW + 墓碑 | IO、存储 |
| 传输 backplane | `host/sync/backplane.js` | 读写远端快照 | 合并规则、存储 |
| 编排 engine | `host/sync/engine.js` | pull→merge→persist→push | 具体传输实现 |

关键：`merge.js` 是纯函数；换 transport 只需新增一个 backplane class，合并与存储零改动。

## 数据模型

### cards 表（唯一权威数据）
```sql
id TEXT PRIMARY KEY,        -- c_* / c_mj_<day> / c_mt_<uuid>
content TEXT, type TEXT,    -- text|task|idea
done INTEGER,               -- 0/1
assignedDate TEXT,          -- YYYY-MM-DD (可空=卡片池)
time/startTime/endTime TEXT,-- HH:MM
priority TEXT,              -- high|medium|low
createdAt TEXT, updatedAt TEXT,  -- ISO8601
deleted INTEGER             -- 墓碑
```

### journals 派生
`journals[day] = cards['c_mj_'+day]`。写 journal = upsert 该卡；删 journal = 墓碑该卡。
不存在独立 journals 表，杜绝双数据源。

## 合并算法（LWW + 墓碑）

```
pickWinner(local, remote):
  if !local  -> remote
  if !remote -> local
  lu = local.updatedAt, ru = remote.updatedAt
  if lu >  ru -> local
  if ru >  lu -> remote
  # 同刻：墓碑优先，避免复活
  if local.deleted  != remote.deleted -> 删除方
  else -> local
```

- 结果保留所有 id（含墓碑），供下一轮继续传播。
- `stats`: added / updated / deleted / kept。
- `conflicts`: 两端都存在且 `updatedAt` 不同 → 记录 `{id, localUpdatedAt, remoteUpdatedAt, winner}`。

## Backplane 接口

```js
interface SyncBackplane {
  name: string
  pull():  Promise<Snapshot|null>
  push(snapshot): Promise<{ ok: true, ref?: string }>
  test():  Promise<{ ok: true, ... }>
}
```

| 实现 | 介质 | 说明 |
|------|------|------|
| MemoryBackplane | 内存 | 测试用 |
| LocalFolderBackplane | 本地目录 JSON | 无服务；也用于测试 |
| WebDAVBackplane | WebDAV（坚果云等） | PROPFIND/MKCOL/PUT/GET |
| GitHubBackplane | GitHub 私有仓库 | REST Contents API（token 鉴权） |

Snapshot 格式：
```json
{ "schemaVersion": 1, "deviceId": "dev_xxx", "generatedAt": "ISO",
  "cards": [ { ...card, deleted:false } ] }
```

## 同步流程（auto）

```
remote = backplane.pull()
if remote: {cards, stats} = mergeCardSets(store.listAllCards(), remote.cards)
           store.applyMergedCards(cards)
snapshot = { schemaVersion, deviceId, generatedAt, cards: store.listAllCards() }
if direction != 'pull': backplane.push(snapshot)
store.setMeta({ lastSyncAt, lastDirection, ... })
```

- push 的是合并后的全量（含墓碑），天然幂等。
- 传输失败抛出 → HTTP 层映射 `502 SYNC_ERROR`。

## 配置

存 `settings.sync`：
```json
{ "provider": "off|local|webdav|github",
  "local":  { "dir": "..." },
  "webdav": { "baseUrl":"", "username":"", "password":"", "path":"journal/data.json" },
  "github": { "owner":"", "repo":"", "branch":"sync-data", "path":"journal-sync.json", "token":"" } }
```

## 兼容性策略
- REST 契约不变 → 扩展与 CLI 无感。
- 旧 `data/journal-data.json` 首次启动迁移进库；迁移前自动备份为 `.bak`。
- 无 `node:sqlite` 环境 → 自动退回 JSON 存储实现（同一接口）。

## 测试策略
- `node:test`（Node 内置，无新依赖）。
- merge：纯函数表驱动。
- backplane：LocalFolder 用临时目录；WebDAV/GitHub 注入 mock `fetch`。
- engine：两个临时库 + 共享 backplane，验证收敛/删除传播/幂等。
- server：临时数据目录 + 随机端口启动，跑 CRUD 与 sync。
