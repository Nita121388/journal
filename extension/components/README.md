# `components/` — 原子组件层

**职责**：可复用的无框架 UI 原子（chip / seg / 属性行 / modal / toolbar / badge）。

## 允许
- import `shared/`；纯 DOM 构建。

## 禁止
- 不得 import `state/` `views/` `features/` `platform/`（组件必须自包含）。
- 不得对用户内容使用 `innerHTML`。

约定见 `.trellis/spec/frontend/component-guidelines.md`。

## 现有组件

| 文件 | 导出 | 职责 | 消掉的重复 |
|---|---|---|---|
| `dom-refs.js` | `els` 注册表 | 所有 `getElementById` 集中于此 | 散落各处的查询 |
| `seg.js` | `createSegGroup` / `syncSegValue` | 分段单选组（容器级委托 + 幂等同步） | `updateStatusSeg` / `updatePrioritySeg` 两份同构遍历 |
| `chip.js` | `createChip` | 标签 chip（可删除 / 只读 / 选中） | `card-editor.js` 与 `views/timeline-card.js` 各手写一份 |
| `property-row.js` | `createPropRow` / `createPropDivider` | Notion 式两列属性行（键列 + 值列） | 内建属性的 `.ce-section` 卡片与自定义属性的 `.prop-row` 两套结构 |

## 组件契约（不可改，dev-loop 依赖）

- `seg.js`：容器内子按钮必须是 `button.seg`，值在 `data-<dataKey>`，选中态类 `is-active`。
  `dev-loop/scenarios/smoke.mjs` 与 `probe.mjs` 按此选择器断言。
- `chip.js`：输出类名保持 `tag-chip`（既有 CSS 与 `views/` 复用），`chip-atom` 仅作行为钩子；
  `×` 必须是独立 `.chip-x` 元素，不能拼进文本（否则读屏念「乘号」）。
- `property-row.js`：行结构固定为 `.prop-row > .prop-key + .prop-val`，
  `data-key` 落在行上供 CSS 分流。
