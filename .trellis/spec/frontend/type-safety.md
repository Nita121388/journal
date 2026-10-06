# Type Safety

> 纯 JS（无 TypeScript、无构建）项目里的类型与校验做法。

---

## Overview

扩展是**原生 ES modules**（无 TS、无打包）。类型安全靠三件事：

1. **运行时校验**：所有进入存储/真源的形状在边界处校验。
2. **JSDoc 注解**：为 `shared/` 与 `state/` 提供编辑器智能提示与文档。
3. **静态检查**：`npx vitest run --coverage` 覆盖 `shared/` + `state/`（≥80%），
   `npm run lint` 拦未用变量与越界引用。

---

## JSDoc Convention

每个导出函数都要有 `@param` / `@returns`：

```js
/**
 * @param {string} dayKey — "YYYY-MM-DD"
 * @param {Card[]} cards
 * @returns {Card[]}
 */
export function getCardsByDate(dayKey, cards) { /* … */ }
```

核心数据形状用 `@typedef` 集中声明，跨模块引用用 `import()` 类型：

```js
/** @typedef {import('../shared/model.js').Card} Card */
/** @typedef {import('../shared/field-registry.js').FieldDef} FieldDef */
```

### 已定义的 canonical 形状

| Typedef | 定义处 | 说明 |
|---|---|---|
| `Card` | `shared/model.js` | 卡片领域形状（HTTP 契约同见 `shared/protocol.js`） |
| `FieldDef` | `shared/field-registry.js` | 统一字段定义（内建与用户字段同构） |
| `InferredProp` | `shared/prop-infer.js` | 推断出的属性定义 |
| `EmojiItem` | `shared/emoji-search.js` | 表情条目 |
| `ScheduleItem` | `shared/model.js` | 时间线条目（分道布局入参） |
| `ApiResult` | `shared/protocol.js` | `{ok:true,data}` \| `{ok:false,error}` |
| `PlatformPort` | `platform/index.js` | 平台端口契约 |
| `ViewState` | `state/view-state.js` | `vs` 的形状 |
| `Settings` | `state/settings.js` | 本地设置 |
| `PropLibrary` | `state/prop-library.js` | 属性库 |

新增跨模块形状 → 加 `@typedef` 到**它所属的层**，别到处抄一份。

---

## Runtime Validation（边界）

两处边界必须校验：

1. **`state/repository.js` / `state/host-client.js`** —— host 响应进入内存真源之前。
   校验失败时**回退安全默认值**（`[]` / `{}`），不要抛到 UI 层。
2. **`shared/*` 的归一化原语** —— 如 `createCard(patch)` 把任意 patch 归一成合法 `Card`
   （缺字段补默认、类型纠偏）。所有建卡都必须过它。

```js
// shared/model.js —— 归一化边界
export function createCard(patch = {}) {
  return { id: patch.id ?? genId(), title: String(patch.title ?? ''), /* … */ };
}
```

原则：**接受任意输入，输出合法形状**；不要信任 `storageGet` / `hostFetch` 的返回形状。

---

## Lint Rules

```js
// extension/eslint.config.js
'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
'no-restricted-globals': ['error', /* chrome / localStorage / document / window / fetch */],
'no-restricted-imports': ['error', /* 分层边界 */],
```

> `jsdoc/require-jsdoc` 与 `no-unsafe-innerhtml` 需额外插件（未安装），作为
> **人工评审项**，由 `trellis-check` 与代码评审把关。

---

## Common Mistakes

- ❌ 信任 `storageGet` / `hostFetch` 的返回形状 → 边界必须校验并回退默认值。
- ❌ 把 `null` 当"缺失"用 `??` 兜底 → 显式 `null` 是合法值，要用
  `Object.prototype.hasOwnProperty.call(obj, 'k')` 判存在（见
  [`component-guidelines.md`](./component-guidelines.md) 的 `??` 陷阱）。
- ❌ 数字与字符串 key 混用 → 存储写入崩溃；在归一化边界统一类型。
- ❌ 静默吞掉读失败 → 记日志 + 返回安全默认值，不要传播 `undefined`。
- ❌ 每个模块各抄一份 `Card` typedef → 真源在 `shared/model.js`，其余用 `import()` 引用。
- ❌ 新增导出函数不写 JSDoc → 至少 `@param` + `@returns`；已装插件不拦，但评审会拦。
