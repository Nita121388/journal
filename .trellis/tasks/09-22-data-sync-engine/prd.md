# 数据同步引擎（SQLite + 可插拔 Backplane + LWW 合并）

## Goal
为 Journal host 实现跨设备数据同步能力，解决「数据困在单机 JSON 文件」的问题：
本地权威库升级为 SQLite，提供可插拔的同步 Backplane（本地文件夹 / WebDAV / GitHub），
用逐卡 LWW + 删除墓碑的合并引擎在多端之间收敛，并通过 host REST 接口与扩展按钮触发。

## Background
- 现状：`host/server.js` 以单个 JSON 文件 `data/journal-data.json` 为权威源，整文件读写，多端并发写会互相覆盖。
- 扩展侧 `chrome.storage.local` 只是镜像缓存，`extension/lib/sync.js` 是未实现的骨架（`syncNow()` 直接抛错）。
- 已设计（见 design.md）：存储与传输解耦——合并引擎不感知数据走本地文件夹、WebDAV 还是 GitHub。

## Requirements
### 存储层
- 新增 SQLite 本地库（`node:sqlite`），作为 host 唯一权威源；表：`cards` / `settings` / `meta`。
- 卡片持久化字段含 `deleted`（墓碑）、`updatedAt`（LWW 依据）、`createdAt`。
- `journals` 改为 **由 `c_mj_<day>` 卡片派生**的只读视图，避免双数据源。
- 首次启动从旧 `journal-data.json` 迁移（journals / todos / cards / settings），幂等且不丢数据。
- 当运行环境无 `node:sqlite` 时，回退到等价的 JSON 文件存储实现（接口一致，保证 host 仍可用）。

### 同步引擎
- `mergeCardSets(localCards, remoteCards)` 纯函数：逐卡 LWW（`updatedAt` 新者胜），
  同刻删除墓碑优先（防止已删卡片复活），返回合并结果 + 统计 + 冲突列表。
- `SyncBackplane` 接口：`pull() -> snapshot|null`、`push(snapshot)`、`test()`。
- 实现 4 种 Backplane：Memory（测试）、LocalFolder（本地目录）、WebDAV、GitHub（REST Contents API）。
- `runSync({ store, backplane, direction })`：pull → merge → 持久化 → push，维护 `meta.lastSyncAt`。

### host 接口
- `GET  /api/sync/status` — 同步配置与状态（provider、lastSyncAt、deviceId）。
- `POST /api/sync/now`    — 手动触发一次同步（body: `{ direction?: 'auto'|'push'|'pull' }`）。
- `GET/PUT /api/sync/config` — 读写同步配置（provider + 各 provider 参数）。
- 保持既有 `/api/cards`、`/api/journals`、`/api/todos`、`/api/heatmap`、`/api/settings`、`/api/health` 契约不变。

### 扩展侧
- `extension/lib/sync.js` 改为调用 host 的 `/api/sync/status` 与 `/api/sync/now`，不再抛 `Not implemented`。
- 设置页增加同步配置（provider）与「立即同步」按钮 + 状态显示。

## Acceptance Criteria
- [x] `node --test host/test/` 全绿（54/54 通过）。
- [x] 合并引擎单测覆盖：远端新增、本地新增、LWW 远端胜、LWW 本地胜、
      远端墓碑传播、墓碑不复活较新本地编辑、同刻墓碑优先、幂等。
- [x] Backplane 单测：Memory / LocalFolder 往返、WebDAV 与 GitHub 用 mock fetch 覆盖
      拉取(null/命中)、推送(新建/更新)、连接测试、分支自动创建。
- [x] 引擎端到端单测：两台「设备」（两个临时库 + 共享 backplane）双向同步后数据收敛，
      删除在两端传播，重复同步幂等，无数据丢失。
- [x] host 集成测试：临时数据目录启动 server，CRUD + `/api/sync/*` 正常，响应均为 `{ok,...}`。
- [x] 旧 `journal-data.json` 迁移测试：journals/todos/cards/settings 均被迁入新库且可读。
- [x] 真实端到端：两台 host 经共享目录 / GitHub provider 双向同步并传播删除。
- [x] JavaScript 语法检查通过（`node --check` 全文件）。
- [x] CLI 端到端：`today/read/write/todo/heatmap` 正常，新增 `sync` 命令。

## Verification
- `cd host && npm test` → tests 54, pass 54, fail 0。
- `node --check` 全 `host/**` + `extension/**` → 0 error。
- 手动起服务：`GET /api/health` 返回 `store:"sqlite"`；`/api/sync/config` 密钥脱敏；CLI `sync status/auto/push` 正常。

## Out of Scope
- 服务器部署（自建 relay / 中央后端）——接口预留，暂不实现。
- CRDT（Automerge/Yjs）——当前 LWW 足够。
- 多人协作 / 鉴权体系。
