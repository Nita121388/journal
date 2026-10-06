# Implement — 合并数据真源为 state/repository

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 状态：**已完成**（2026-10-06）

## 执行记录

### S4-1 模块迁移与拆分
| 原 | 现 |
|---|---|
| `lib/host-sync.js` | 拆为 `state/host-client.js`（全部 host HTTP）+ `state/sync-bridge.js`（pull/轮询编排） |
| `lib/sync.js` | 并入 `state/host-client.js` |
| `lib/store.js` | 拆为 `state/repository.js`（内存真源）+ `state/settings.js`（本地设置） |
| `lib/ai.js` | **删除**（`throw new Error('AI not implemented yet')` 空骨架，零引用） |

`lib/` 剩余：`emoji.js` / `prop-llm.js` / `select.js`（属 `ui-split`）。

### S4-2 单一真源（repository）
- [x] 内存数组 `cards` 为 UI 读取唯一入口
- [x] `getAllCards()` / `getCardsByDay()` 改为读内存（保留 async 兼容，`await` 无感）
- [x] `hydrate(cards)` / `subscribe(cb)` / `hydrateFromCache()`
- [x] 写入语义不变：先落 host → 更新内存 + 缓存 → 通知

### S4-3 三路径合一（sync-bridge）
- [x] `pullFromHost()`：三端点全成功才算成功（保留原语义）；离线回退缓存
- [x] `startHostSync()`：内容签名去重，仅真变化才 hydrate + 通知
- [x] 删除 no-op / 死代码：`startPushListener`、`normalizeEntry`、`newerEntry`
- [x] `journals`/`todos` 继续写缓存（设置页数据导出依赖）

### S4-4 契约接线
- [x] `state/host-client.js` 全部改用 `shared/protocol.js` 的 `ROUTES` / `routes`
- [x] `lib/prop-llm.js` 的 `/api/ai/infer-prop` 字面量 → `ROUTES.aiInferProp`
- [x] `extension/` 内不再有 `/api/` 字面量（仅 `shared/protocol.js` 定义处）

### S4-5 引用修正
- [x] `sidepanel.js`：改用 `state/{repository,settings,sync-bridge,host-client}.js`；
      删除未使用的 `getPoolCards`/`getHeatmapData` 导入
- [x] `options.js`：改用 `state/{settings,host-client}.js`
- [x] `host/test/extension-sync.test.mjs`：改测 `state/host-client.js`，端口取自 `shared/protocol.js`
- [x] `dev-loop` 三处场景（`select`/`options`/`tpl`）改读 `shared/protocol.js` 的 `DEFAULT_HOST_BASE`

## 验证结果

| 门禁 | 结果 |
|---|---|
| `npm run lint` | ✅ **17**（S3 为 22；减少来自删除死代码与未用导入） |
| `npm test`（host） | ✅ **103/103** |
| dev-loop `smoke` 320/360/400/500 | ✅ **60/60** LOOP PASS |
| dev-loop `options` 360 | ✅ **10/10** |
| dev-loop `tpl` 360 | ✅ **17/17** |
| dev-loop `select` 360 | ✅ **46/46**（另修好一个**既有**失修场景，见下） |
| `rg "chrome\.\|/api/" extension/{state,views,features,components}` | ✅ 无结果 |
| R4 离线回退缓存（注入 fake 端口的真实断言） | ✅ `pulled=false` 且缓存卡片被回填 |

## 顺带修复的既有缺陷（非本次引入）

1. **`dev-loop --scenario select` 自 `352bcc0` 起失修**：设置卡片改为默认折叠（`<details>`）后，
   场景仍直接点击 `#sync-section` 内部控件 → 超时。补「先展开 sync-section」后恢复。
   已用 worktree 在重构前提交 `8e61690` 复现确认：**该场景此前即为失败状态**。
2. **离线模式 `空态有行动按钮` 为既有失败**：同样在 `8e61690` 复现（14/15）。
   按"行为冻结"不在此任务修；已记录，可另开小任务。

## 产出文件

```
extension/state/
├── host-client.js   # 【新】全部 host HTTP 调用（cards/meta/journals/todos/sync）
├── repository.js    # 【新】内存真源 + 查询 + 写入 + 订阅 + 缓存回填
├── settings.js      # 【新】本地设置
└── sync-bridge.js   # 【新】启动 pull + 轮询刷新（三路径合一）
```

## 回滚

`git revert` 本任务提交即可。运行时行为等价；风险集中在数据读取源由 storage 改为内存，
已由 dev-loop 四场景 + host 测试 + 离线断言覆盖。

## 遗留

- `repository` 目前是模块单例；多实例化留给未来（`setPort` 已可供测试注入）。
- vitest 单测（覆盖 repository/sync-bridge）属 `type-and-tests`。
- 离线空态缺行动按钮为既有缺陷，建议独立小任务。
