# 合并数据真源为 state/repository

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 前置：`10-06-platform-port`（已完成）

## Goal

把"host 权威 + 平台 storage 缓存 + 启动 pull + 20s 轮询 + storage.onChanged"这条
**双真源、三路径**的数据链，收敛为 `state/` 下的**单一内存真源 + 一条通知链**；
并将 `lib/` 中剩余的数据模块迁移到 `state/`。**行为等价**（含离线可读）。

## Requirements

### R1 模块迁移与拆分
- `lib/host-sync.js` → 拆为：
  - `state/host-client.js`（全部 host HTTP 调用）
  - `state/sync-bridge.js`（启动 pull + 轮询刷新）
- `lib/sync.js`（host `/api/sync/*` 薄封装）→ 并入 `state/host-client.js`
- `lib/store.js` → 拆为：
  - `state/repository.js`（内存真源 + 查询 + 写入 + 订阅）
  - `state/settings.js`（本地设置）
- 删除死代码：`lib/ai.js`（`throw new Error('AI not implemented yet')` 空骨架，无引用）

### R2 单一真源
- `state/repository.js` 持有内存卡片数组，作为 UI 读取的**唯一真源**。
- `getAllCards()` / `getCardsByDay()` 由"每次读 storage"改为"读内存"（可保持 async 或转同步，
  调用方 `await` 均兼容）。
- `hydrate(cards)` / `subscribe(cb)` 提供真源写入与订阅。
- 写入（create/update/delete）语义不变：先落 host，成功后再更新内存与缓存。

### R3 三路径合一
- `state/sync-bridge.js` 暴露 `pullFromHost()` 与 `startHostSync(onChange, intervalMs)`。
- 合并原则：启动 pull 与定时轮询都走同一套 "fetch → 内容签名去重 → hydrate → 持久化 → 通知"。
- **删除** `startPushListener` / `normalizeEntry` / `newerEntry` 等 no-op 与死代码。
- `journals`/`todos` 继续写入缓存（供设置页数据导出），保持行为不变。

### R4 离线可读（不得回归）
- host 离线时，启动 pull 必须回退到平台 storage 缓存（含旧 journals/todos → cards 迁移），
  保证离线仍可查看历史数据。

### R5 契约接线
- `state/host-client.js` 改用 `shared/protocol.js` 的 `ROUTES` / `routes`，
  UI 侧不再出现 host URL 字面量。

## Acceptance Criteria

- [ ] `extension/state/{host-client,repository,settings,sync-bridge}.js` 存在
- [ ] `lib/` 中不再有 `store.js` / `host-sync.js` / `sync.js` / `ai.js`
- [ ] `rg "chrome\.|/api/" extension/{state,views,features,components}` 无结果
- [ ] `getAllCards()` 不再触发 storage 读取（grep 确认无 `storageGet` 于 repository 读取路径）
- [ ] host 离线时侧栏仍显示缓存数据（dev-loop `--host-mode off` 或手工断言）
- [ ] `npm run lint` 不新增错误（预期因删除未用导入而下降）
- [ ] `npm test`（host）103/103（含扩展接线测试改用新路径）
- [ ] `npm run dev-loop -- --scenario smoke` 320/360/400/500 全绿
- [ ] `npm run dev-loop -- --scenario options` 全绿

## Constraints

- 保持 `createCardEntry/updateCardEntry/deleteCardEntry/getAllCards/getCardsByDay/getSettings/saveSettings`
  等**对外函数名不变**，使 sidepanel/options 仅需改 import 路径（拆分 UI 留给 S5）。
- 不做乐观 UI（当前就是 await 后再渲染），避免引入新的竞态面。
- 不改 host 侧代码。

## Out of scope

- sidepanel 的视图拆分（属 `ui-split`）。
- 把 `state/` 变成可注入多实例（保持模块单例，`setPort` 已可供测试注入）。
- vitest 单测落地（属 `type-and-tests`，但本任务需为该模块设计可测边界）。
