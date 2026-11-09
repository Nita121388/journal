# P5 弹窗与附属页：属性集重排、基元收口、版本可见

> 归属：`11-08-visual-redesign-quiet-desk` 的子任务（第 5 阶段）。
> 本任务对父任务「不重做信息架构」的非目标**开一个显式例外**：卡片编辑器的属性集
> 由「静态 9 组」改为「默认最小集 / 模板字段驱动」。理由见背景 ③。

## 背景（全部实测取证，2026-11-09）

① **"改了看不到"**：用户 11-09 截图里的弹窗仍是旧设计。核对文件时间：

| 位置 | 时间 |
|---|---|
| prod 部署 `D:\Apps\ChromeExtensions\journal\extension\sidepanel.html` | 2026-11-07 18:19 |
| dev 部署 `D:\Apps\ChromeExtensions\journal-dev\extension\sidepanel.html` | 2026-11-07 23:32（11-09 已手动同步一次） |
| 仓库 `dev/local` 同文件 | 2026-11-08 23:06（`bb6e6a8` / `d9147fe`） |

截图特征 `.ce-section`（分区灰盒）、`.card-editor-accent`（顶部落色带）、绿色主色，
在当前 `extension/` 中**已 0 处命中**。即：样式重构确实做了，但从未落到用户眼前的包。
且 UI 上没有任何版本标识，用户无法自行判断「我看的是新包还是旧包」。

② **弹窗从未进回归**：`dev-loop/scenarios/` 只有 `shell` / `calendar-visual` /
`week-readable` / `tpl` / `select` / `smoke` / `options` / `audit` / `tailwind-migrated` /
`llm`，**没有 editor 场景**。连续两天的视觉验证都绕过了这个弹窗。

③ **属性集违背产品原则**：`extension/sidepanel.html:224-296` 把 9 组属性硬编码为
静态 DOM（状态 / 自定义状态输入 / 进度 / 优先级 / 日期 / 排程 / 标签 / 项目 / 自定义属性），
`card-editor.js` 的 `syncTypeVisibility()` 只按类型隐藏「进度」一行。
即：**选模板建卡时，模板字段完全不影响编辑器**，用户永远面对全部 9 组。
产品原则应为「默认只给少量必要属性，其余由用户自建模板按需引入」。

④ **四类视觉违例**（父任务 R3 / R11 / R6 已定，尚未落到弹窗）：
- 17 处功能 emoji：`prop-key` 六项（⚙️📊🚩📅⏱️📁）、状态段 📝📌🔥✅、类型下拉 📝☑️💡、🗂️×2、`＋`
- `extension/sidepanel.css:2403` `.overlay { backdrop-filter: blur(3px) }` —— 违反 `design.md §7`「全站 0 处合成层」
- 优先级三色圆点走 `--prio-high/medium/low`（红/褐/绿）—— 违反 R11 与「绿色退出 UI 语义」
- 弹窗页脚 `取消/保存` 是裸 `.btn-secondary/.btn-primary`，未接 `components/button.js` 的 4 变体 × 3 尺寸

⑤ `extension/options.css:37-38` 仍有 `backdrop-filter: saturate(1.4) blur(10px)`；`options.html`
头部仍是 📓 / ⚡ emoji —— options 换皮（本任务 R7）范围内一并处理。

## 目标

1. 新建卡片时，编辑器**只渲染该模板的字段**；无模板 = 默认最小集。
2. 上述四类违例清零，弹窗与模板构建器、options、select 四页视觉一致。
3. **版本在界面上可见**（侧栏 + options + `chrome://extensions`），使「改了看不到」可被用户自行定位。
4. 编辑器进 dev-loop 回归，此后任何视觉改动都能被截图与断言覆盖。

## 需求

| # | 需求 |
|---|---|
| R1 | 默认属性集（空白新建）= **图标 / 标题 / 类型 / 正文 / 状态 / 标签** 六项。`标签` 是注册表 `required`（搜索与卡片池筛选依赖它），故列入默认；其余 6 个内建可选字段（优先级 / 进度 / 日期 / 排程 / 项目 / 自定义属性）默认**不渲染** |
| R2 | 从模板新建时，编辑器只渲染该模板声明的字段（`templateFields`），并显示当前模板名与「切换模板」入口；切换只改可见性与默认值，**不清空已填内容** |
| R3 | 属性行渲染契约：每行带 `data-field="<key>"`，隐藏用 `hidden` 属性（非内联 `style`）。行顺序 = 默认集顺序 → 模板声明顺序 → 属性库顺序 |
| R4 | 弹窗内功能 emoji 清零：`#card-editor .prop-key-icon`、状态/优先级/类型段、页脚按钮、`details > summary`、模板菜单全部改 `components/icon.js` 的 inline SVG（24 viewBox / stroke 1.75 / currentColor） |
| R5 | 合成层清零：`sidepanel.css` 与 `options.css` 中 `backdrop-filter` 全部移除；遮罩只保留 `--color-scrim` 纯色 |
| R6 | 优先级不再用红/褐/绿三色承载语义：三段胶囊 + 单色圆点（未选 `--ink-weak`，选中 `--accent`），语义由文字「高/中/低」承担。`--prio-*` 从活跃使用中移除（token 名保留一个版本） |
| R7 | 页脚与工具位按钮接 `components/button.js`：`保存`=`solid`+`md`，`取消`=`outline`+`md`，`添加属性/属性库/保存为模板`=`quiet`+`sm`，关闭=`ghost`+`sm` |
| R8 | `options.html` / `options.css` 与 `select.css` 同步：emoji → SVG、去 `backdrop-filter`、控件高度与圆角走同一标尺；`select` 页无需改结构，只对齐 token |
| R9 | 版本显示：manifest `version` 升到 `0.2.0` 并新增 `version_name`；侧栏 header 与 options header 各显示 `v0.2.0`（`--ink-weak` / 10.5px / 非主色），`title` 里带 `version_name` |
| R10 | dev-loop 新增 `scenarios/editor.mjs`：320 / 400 两宽度截图（空白 + 模板两种字段集）+ 断言（无功能 emoji、行数 = 期望字段数、`backdrop-filter` 为 none、按钮有 `data-variant`、版本文本 = manifest.version） |
| R11 | 部署可核验：同步到 dev 部署目录后，读回的 `manifest.json` version 必须等于仓库值；核验命令与结果记入本任务 notes |

## 决策记录

- **2026-11-09 用户拍板**：采用"编辑器属性集重排并入本任务"方案（三选一中的 A），
  并要求额外增加版本显示。
- 默认集含 `标签` 的理由：`shared/field-registry.js` 把它标为 `required`，
  且搜索框占位 `搜索标题 / 内容 / 标签…` 与卡片池筛选都依赖它。用户提的 5 项（图标/标题/类型/正文/状态）
  之外仅此一项偏差，已在此显式记录。
- `类型`（text/task/idea）不在字段注册表内，是卡片一级字段；保留在头部子行，不参与 R2 的字段集计算。

## 非目标

- 不改 host / 存储 / 同步 / 协议；不改卡片数据模型（字段值照旧写各一级字段）。
- 不改模板构建器的**能力**（字段选择/默认值编辑逻辑不动），只换皮与对齐基元。
- 不修既有缺陷 `createFromTemplate()` 先落库再打开编辑器、取消后留下空卡的问题
  （记录在此，留待 `10-06-quality-sprint`）。
- 不引入任何运行时依赖；不新增 CSS 之外的构建步骤。

## 验收标准

1. 空白新建：`#card-editor-props .prop-row:not([hidden])` 的 `data-field` 集合
   === `{title,content,status,tags,type}` 对应的 6 行，且不含 priority/progress/assignedDate/schedule/project。
2. 模板新建（模板含 status+priority+assignedDate）：可见行 === 默认集 ∪ 模板字段，顺序稳定。
3. `grep -rn "backdrop-filter" extension/*.css` 在 `sidepanel.css` / `options.css` 中为空（除注释说明）。
4. `#card-editor` 子树内 `textContent` 无 emoji（白名单：`#emoji-preview` 用户自选图标、卡片内容）。
5. 页脚按钮 `data-variant` ∈ {solid, outline}，尺寸 = md；工具位 = quiet/sm。
6. 侧栏与 options 均显示 `v0.2.0`；`chrome://extensions` 显示 `0.2.0 Quiet Desk`。
7. `cd dev-loop && node dev-loop.mjs --scenario editor --width 320,400` 全绿；`npm run lint` / `npm test` 通过。
8. dev 部署目录 `manifest.json` version == `0.2.0`，且编辑器截图与仓库一致（人工目视一次）。
