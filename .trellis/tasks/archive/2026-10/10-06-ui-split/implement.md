# Implement — 拆分 sidepanel 为 entries/views/features

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 状态：**已完成**（2026-10-06）

## 结果

| 指标 | 拆分前 | 拆分后 |
|---|---|---|
| `extension/sidepanel.js` | 3695 行 | **删除**（→ `entries/sidepanel.js` 13 行启动引导） |
| UI 模块最大行数 | 3695 | **384**（`shared/model.js`，非受限层）；受限层最大 `views/timeline.js` 353 |
| `extension/lib/` | 11 个模块 | **消失** |
| `npm run lint` | 23 errors（存量） | **0 errors** |

## 分阶段执行（每阶段独立提交 + dev-loop 回归）

| 阶段 | 内容 | 提交 |
|---|---|---|
| A | 入口归位（`entries/`）+ `components/dom-refs.js` + `features/toast.js` + `lib/{emoji,select,prop-llm}` → `features/` | `e46fa12` |
| B | `state/view-state.js` 集中 15 个视图变量（AST 替换 162 处）；新增端口 `prefGet/prefSet/prefRemove`，`localStorage` 全部收敛到 `platform/` | `d0c7b41` |
| C-1 | `shared/format.js` + `views/heatmap.js` + `views/calendar.js` | `cc0ab57` |
| C-2 | `state/actions.js`（组合根反向回调通道，打断 views↔entries 循环）+ `views/pool.js` | `dfa8b25` |
| C-3 | `views/timeline.js`；`viewStartMin/EndMin` 迁入 vs；`formatProvenance` 入 shared | `227c2da` |
| C-4/D-1 | `views/rightview.js` + `features/card-editor.js`；`state/prop-library.js`；编辑器 DOM 引用并入 dom-refs | `7f3791b` |
| D-2 | `features/template-builder.js` + `views/{skills,named-view,refresh}.js` + `features/{host-status,wide-mode}.js` | `7b4f897` |
| D-3 | template-builder 四分：`template-{builder,rows,fields,menu}.js` | `b6475f5` |
| D-4 | `entries/{app,bind-shell,bind-views,bind-editor}.js`；`sidepanel.js` → 12 行 | `363e72b` |
| C-5/D-5 | `views/{week,timeline-card}.js`、`features/{editor-props,select-view}.js`；lint 归零 | `247511f` |

## 最终结构

```
extension/
├── entries/            sidepanel.js(13) app.js bind-shell bind-views bind-editor options.js
├── components/         dom-refs.js（els + 编辑器/属性表单 DOM 引用）
├── state/              view-state / actions / repository / sync-bridge / host-client /
│                       settings / prop-library
├── views/              timeline timeline-card rightview week month-grid (在 rightview) pool
│                       heatmap calendar skills named-view refresh
├── features/           card-editor editor-props template-{builder,rows,fields,menu}
│                       toast emoji select select-view prop-llm host-status wide-mode
├── shared/             model format field-registry prop-infer card-schema protocol emoji-*
└── platform/           index chrome web background
```

## 为完成本次拆分自建的工具（存于 `.trellis/tasks/10-06-ui-split/tools/`）

| 工具 | 作用 |
|---|---|
| `map.mjs` | 用 acorn 输出顶层声明与行区间，确定精确切割边界 |
| `deps.mjs` | 计算新模块引用了哪些仍留在源文件的顶层名 |
| `freevars.mjs` | 用 `eslint-scope` 求模块「未解析引用」→ 找出漏 import |
| `checkexports.mjs` | 静态校验每个相对 import 的名字在目标模块确有导出（ESM 缺导出只在浏览器报错） |
| `extract.mjs` | 通用提取器：自动推导 import、自动给上游补 export、写盘前 `acorn.parse` 自检 |
| `autoimport.mjs` | 由自由变量反查其来源模块，生成 import 块 |

**核心手法**：AST（acorn）定位 → 变换 → **写盘前 parse 自检** → `freevars`/`checkexports` 静态校验 → dev-loop 真实浏览器回归。

## 验证

| 门禁 | 结果 |
|---|---|
| `entries/sidepanel.js` | **13 行**（AC < 120） |
| 受限层无模块 > 400 行 | ✅（views/features/components 最大 353） |
| `extension/lib/` | ✅ 已消失 |
| `rg "chrome\." extension/{views,features,components,state,entries}` | ✅ 无结果 |
| `npm run lint` | ✅ **0 errors**（基线 23） |
| `npm test`（host） | ✅ 103/103 |
| dev-loop `smoke` 320/360/400/500 | ✅ 60/60 |
| dev-loop `select` / `options` / `tpl` | ✅ 46/46 · 10/10 · 17/17 |

## 行为冻结确认

全程未新增功能、未改样式、未改 DOM 结构、未改事件语义。所有阶段以 dev-loop 多宽度回归为门禁；
期间发现并修复的 2 个既有缺陷（`select` 场景折叠失修、离线空态缺按钮）已用 worktree 在 `8e61690` 复现确认非本次引入。

## 回滚

每个阶段一个提交，可单独 revert；因依赖单调向下，回滚任一阶段不影响其前置产物。
