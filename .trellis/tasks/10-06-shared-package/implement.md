# Implement — 抽取 shared 纯逻辑包

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 状态：**已完成**（2026-10-06）

## 执行记录

### S2-1 搬迁纯逻辑模块（`git mv` 保留历史）
- [x] `extension/lib/model.js` → `extension/shared/model.js`
- [x] `extension/lib/field-registry.js` → `extension/shared/field-registry.js`
- [x] `extension/lib/prop-infer.js` → `extension/shared/prop-infer.js`
- [x] `extension/lib/emoji-data.js` → `extension/shared/emoji-data.js`

### S2-2 emoji 按纯度拆分（发现于搬迁中）
`emoji.js` 混合了纯搜索与 DOM/localStorage，直接搬入 `shared/` 会违反边界规则，故拆分：
- [x] 新增 `extension/shared/emoji-search.js`：`searchEmojis` / `emojisByCat`（纯）
- [x] `extension/lib/emoji.js` 保留 `renderEmojiPicker`（DOM）与最近使用（localStorage），
      改为 import 并 re-export shared 的搜索实现（既有调用方路径不变）

### S2-3 抽取 `shared/card-schema.js`
- [x] 归并常量：`CARD_TYPES` `PRIORITIES` `STATUSES` `RESERVED_PROPS`
- [x] 归并原语：`statusFromTypeDone` `normalizeProgress` `normalizeDuration` `normalizeProps` `normalizeTags`
- [x] 消费方改为 import，删除各自副本：
      - `extension/shared/model.js`（并 re-export 兼容既有调用方）
      - `host/lib/storage.js`（并 re-export `RESERVED_PROPS`/`normalizeTags` 兼容 `storage.test.mjs`）
      - `host/sync/merge.js`（**第三份**重复，一并去重）

**有意保留的一处差异（重要）**：
`host/sync/merge.js` 的 `normalizeProps` **不剔除**保留字，而 `card-schema.js` 的会剔除。
这是合并引擎「对比形状」与「schema 强制」两种不同契约，行为不同。
按本重构"行为冻结"约束，**不予统一**，已在该函数上方写明注释与后续处理条件。

### S2-4 抽取 `shared/protocol.js`
- [x] `ROUTES`（health/cards/journals/todos/settings/skills/meta/sync/ai）
- [x] `routes.{card,journal,todo,meta}` 动态路由构造器
- [x] `MESSAGES.startHost`（`journal:start-host`）
- [x] `DEFAULT_HOST_BASE` / `DEFAULT_HOST_PORT` 与 `ApiResult` `Card` `@typedef`
- [ ] **尚未接线**：host/server.js 与 UI 仍用字面量（属 `state-repository`，避免本任务扩大改动面）

### S2-5 引用修正
- [x] `extension/sidepanel.js`：model / field-registry / prop-infer 三处 import 指向 `shared/`
- [x] `extension/lib/prop-llm.js`：`./prop-infer.js` → `../shared/prop-infer.js`
- [x] `extension/lib/store.js`：`./model.js` → `../shared/model.js`

## 验证结果

| 门禁 | 结果 |
|---|---|
| `extension/shared/` 纯度（无 chrome./document/window/localStorage/node:） | ✅ 仅注释提及，代码为零 |
| ESLint 边界规则（shared 叶子） | ✅ 0 违规 |
| `npm run lint` | ✅ **22**（原 23；减少的 1 个是 `model.js` 中已删除的未用 `STATUSES`，非回归） |
| `npm test`（host） | ✅ **103/103**（去重未改变归一化行为） |
| `npm run dev-loop -- --scenario smoke` 320/360/400/500 | ✅ **60/60**，LOOP PASS |
| 残留 `lib/model|field-registry|prop-infer|emoji-data` 引用 | ✅ 0 |

## 产出文件

```
extension/shared/
├── model.js            # 卡片时间/聚合纯函数（原 lib/model.js）
├── field-registry.js   # 统一字段注册表（原 lib/field-registry.js）
├── prop-infer.js       # 本地规则属性推断（原 lib/prop-infer.js）
├── emoji-data.js       # emoji 数据（原 lib/emoji-data.js）
├── emoji-search.js     # 【新】emoji 纯搜索
├── card-schema.js      # 【新】卡片字段契约与原语（host 亦消费）
└── protocol.js         # 【新】HTTP 路由 + 消息类型 + 传输 @typedef
```

## 回滚

`git revert` 本任务提交即可完全回到 S1 基线。因严格保持行为等价，
无数据迁移、无 API 变化、无 UI 变化。

## 遗留（移交后续子任务）

- `protocol.js` 尚未被 host/server.js 与 UI 实际引用 → `state-repository`
- `share/prop-infer.js` 的 `PROP_TYPES` 与 `host/lib/llm.js` 的注释仍互相引用 → 后续统一
- `host/test/extension-sync.test.mjs` 仍反向 import `extension/lib/sync.js` → `state-repository` + `type-and-tests`
