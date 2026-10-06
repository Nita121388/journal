# 抽取 shared 纯逻辑包

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 前置：`10-06-baseline-cleanup`（已完成）

## Goal

把 `extension/lib/` 中的**纯逻辑**模块搬入 `extension/shared/`（依赖图叶子），
并抽取 `card-schema.js` 与 `protocol.js` 两个契约模块，消除 host 与扩展之间
重复的卡片归一化逻辑。**零行为变更**。

## Requirements

### R1 搬迁纯逻辑模块
- `extension/lib/model.js` → `extension/shared/model.js`
- `extension/lib/field-registry.js` → `extension/shared/field-registry.js`
- `extension/lib/prop-infer.js` → `extension/shared/prop-infer.js`
- 三者必须是纯模块（无 DOM / 无 storage / 无 chrome / 无 node:）。
- `prop-infer.js` 现依赖 `lib/emoji.js` 的 `searchEmojis`；`emoji.js` 混合了
  纯搜索与 DOM/localStorage —— 必须**按纯度拆分**：
  - 纯搜索 + 数据 → `extension/shared/emoji-search.js`（+ `shared/emoji-data.js`）
  - DOM 渲染 + 最近使用 → 留在 `extension/lib/emoji.js`

### R2 抽取 `shared/card-schema.js`
- 归并 `extension/lib/model.js` 与 `host/lib/storage.js` 中**逐字节重复**的原语：
  - 常量：`CARD_TYPES` `PRIORITIES` `STATUSES` `RESERVED_PROPS`
  - 函数：`statusFromTypeDone` `normalizeProgress` `normalizeDuration`
    `normalizeProps` `normalizeTags`
- 两侧改为 import 该模块，删除各自副本。
- **行为必须逐字节等价**：不得改变任一 side 的归一化结果。

### R3 抽取 `shared/protocol.js`
- 收敛 host HTTP 路由与消息类型为常量 + `@typedef`（请求/响应形状）。
- 供后续 `state/sync-bridge.js` 与 host 复用，避免字符串字面量散落。

### R4 修正跨边界 import
- `host/test/extension-sync.test.mjs` 反向 import `extension/lib/sync.js`：
  本任务先记录归属；实际拆分随 `state-repository` / `type-and-tests` 完成
  （sync.js 尚未搬迁，本任务不强行处理）。

## Acceptance Criteria

- [ ] `extension/shared/{model,field-registry,prop-infer,emoji-search,emoji-data,card-schema,protocol}.js` 存在
- [ ] `rg "chrome\.|document|window|localStorage|node:" extension/shared` 无结果
- [ ] ESLint 边界规则对 `shared/**` 0 违规
- [ ] `host/lib/storage.js` 不再含重复的 normalizer；`npm test` 103/103 全绿
- [ ] `npm run lint` 不新增错误（保持 23）
- [ ] `npm run dev-loop -- --scenario smoke` 全绿（UI 行为不变）
- [ ] 全仓无残留 `lib/model.js` / `lib/field-registry.js` / `lib/prop-infer.js` 引用

## Constraints

- 优先 `git mv` 保留历史。
- 不改任何运行时行为；不新增依赖。
- 不搬迁含 DOM/localStorage 的模块（emoji 渲染、select、store、host-sync、prop-llm、ai）。

## Out of scope

- `store.js` / `host-sync.js` / `sync.js` → `state/`（属 `state-repository`）。
- `emoji.js` 渲染部分 → `features/`（属 `ui-split`）。
- vitest 安装（属 `type-and-tests`）。
