# 拆分 sidepanel 为 entries/views/features

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 前置：`shared-package` / `platform-port` / `state-repository`（均已完成）
> 目标：`entries/sidepanel.js` < 120 行；无 UI 模块 > 400 行

## Goal

把 3695 行的 `sidepanel.js` 巨石拆为「组合根 + 视图 + 功能 + 组件」，
消除隐式跨模块全局状态，让每个模块可独立阅读/修改。

## 依赖分析结论（实测，非估计）

按顶层声明归属做跨簇引用统计：

| 簇 | 行数 | 依赖的外部簇 |
|---|---|---|
| utils(工具+状态) | 116 | — |
| editor(卡片编辑器) | 475 | utils:74 |
| domref(DOM 引用) | 111 | refresh/editor |
| rightview(月/周/日程) | 419 | utils:24, timeline:16 |
| timeline | 589 | utils:9, editor:4, refresh:4 |
| pool(卡片池) | 274 | utils:15 |
| heatmap | 34 | domref:1 |
| calendar | 90 | utils:6, domref:3 |
| namedview(命名视图) | 48 | utils:13 |
| tpl(模板构建器) | 1029 | editor:19, utils:1 |
| skills | 76 | tpl/domref/editor |
| init | 392 | 几乎所有 |

**被跨簇引用最多的名字**：`els`×17、`selectedDate`×15、`showToast`×14、
`refreshAll`×11、`allCardsCache`×9、`viewMode`×8、`openEditor`×8。

→ 因此必须先建立三个共享点，再拆视图/功能：
1. `components/dom-refs.js` — DOM 元素注册表（`els`）
2. `state/view-state.js` — 视图可变状态（selectedDate/viewMode/筛选/缓存…）
3. `features/toast.js` + 组合根提供的 `refreshAll` / `openEditor`

## Requirements

### R1 目标结构
```
extension/
├── entries/sidepanel.js        # 组合根：< 120 行
├── components/dom-refs.js      # els 注册表
├── state/view-state.js         # 视图状态（可变对象，显式字段）
├── features/
│   ├── toast.js  emoji.js  select.js  prop-llm.js
│   ├── card-editor.js          # 卡片编辑器
│   └── template-builder.js     # 模板构建器
└── views/
    ├── heatmap.js  calendar.js  skills.js
    ├── month.js  week.js  timeline.js  pool.js
```

### R2 消除隐式全局状态
- 模块级 `let`/`const` 视图状态集中到 `state/view-state.js`（单对象、字段显式）。
- 拆分后各模块不得再自建同名模块级可变变量。

### R3 分阶段、可回滚
按依赖由外到内分阶段，每阶段一次提交 + dev-loop 验证：
- **A 纯搬迁**：`els` → `components/dom-refs.js`；`showToast` → `features/toast.js`；
  `lib/{emoji,select,prop-llm}.js` → `features/`；`sidepanel.js` → `entries/sidepanel.js`
- **B 共享状态**：`state/view-state.js`
- **C 视图**：heatmap → calendar → skills → timeline → pool → month/week
- **D 功能**：card-editor → template-builder

### R4 行为冻结
- 不改任何 UI 行为、样式、DOM 结构、事件语义。
- 每阶段 `dev-loop` 场景全绿（smoke 320/360/400/500 + select 360 + tpl 360 + options 360）。

## Acceptance Criteria

- [ ] `entries/sidepanel.js` < 120 行
- [ ] 无 UI 模块 > 400 行（`views/*` `features/*` `components/*`）
- [ ] `extension/lib/` 目录消失
- [ ] `rg "chrome\." extension/{views,features,components,state,entries}` 无结果
- [ ] `state/view-state.js` 是唯一持有视图可变状态处（grep 校验）
- [ ] `npm run lint` 不新增错误
- [ ] `npm test` 103/103
- [ ] dev-loop `smoke`/`select`/`tpl`/`options` 全绿
- [ ] 每个阶段独立提交、可单独 revert

## Constraints

- 优先 `git mv`；不改函数体逻辑（只改引用路径与状态归属）。
- 不引入框架/构建器。
- 每次提取后必须保持可运行（不允许中间态长时间不可用）。

## Out of scope

- 样式收敛（属 `style-consolidation`）
- vitest 单测（属 `type-and-tests`）
- 把可变状态改成响应式 store（保持"显式调用渲染"的现有模型）
