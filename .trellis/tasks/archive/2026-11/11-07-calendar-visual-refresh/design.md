# 设计：日历公共卡片组件 + Milkdown 内容渲染

## 1. 关键决策（含备选与否决理由）

### D1. Milkdown 引入方式

| 方案 | 说明 | 结论 |
|---|---|---|
| A. CDN `<script>` | 零构建 | ❌ MV3 CSP `script-src 'self'` 禁止 |
| B. esbuild 本地打包 → `extension/dist/milkdown.bundle.js`（提交进仓库） | 一次构建，load unpacked 免构建；与现有 `dist/sidepanel.css` 产物策略一致 | ✅ 采用 |
| C. 直接 import `@milkdown/*` 裸模块 | Chrome 不解析 node_modules 裸说明符 | ❌ |

**落地**：`extension/build/build-milkdown.mjs`（esbuild，`bundle:true, format:'esm', target:'chrome114'`）
→ `extension/dist/milkdown.bundle.js`。`package.json` 增加 `build:js`。
产物仅导出 `mountReadonly(container, markdown, opts)` / `unmount(handle)` 两个 API，
**不暴露** Milkdown 内部对象，避免版本升级外溢。

**Milkdown 版本与包**：`@milkdown/core` + `@milkdown/preset-commonmark` + `@milkdown/prose`（EditorView 只读）
+ `@milkdown/ctx`。**不引入** `@milkdown/crepe`（体积大、带主题/工具栏，且只读态用不上）。

### D2. 只读渲染的实例策略（性能红线）

Milkdown 每个实例 = 一个完整 ProseMirror `EditorView`（DOM + 状态 + 插件链），
月视图 42 格 × 平均 3 卡 = 126 个实例会把侧边栏拖死。

**分三档渲染**：

| 档 | 场景 | 渲染器 |
|---|---|---|
| L0 行内 | 月格 pill / 周视图短块（≤30min） | `shared/md-lite.js` → 纯文本单行（去 `#`/`*`/`` ` ``/`[]()` 标记） |
| L1 结构化 | 周/日视图正常块（内容 2–6 行） | `md-lite` 段落化（`<div>` 逐行，无嵌套列表） |
| L2 富文本 | 卡片**展开态**（点击展开）/ 编辑器预览 | Milkdown 只读实例 |

**实例池**：`views/milkdown-mount.js` 维护 `Map<cardId, handle>`，
`acquire(el, card)` 时若池已满（`MAX_MOUNTED = 2`），按 LRU `unmount` 最旧的；
卡片收起、视图切换、`renderRightView` 重渲染时统一 `releaseAll()`。

### D3. 组件 API（`views/calendar-card.js`）

```js
// 纯渲染，无 storage 读取；返回 DOM 节点
renderCardPill(card, { showTime = true, onClick })        // 月格 / 全天行
renderCardBlock(card, { startMin, endMin, lane, dayKey }) // 周/日时间网格块（含拖拽/缩放）
renderDayHeader(dayKey, { count, compact })               // 日期头（数字 + 副标 + 今天标）
renderCardDetail(card, { container })                     // 展开态：header + Milkdown 正文 + footer
```

- `renderCardBlock` 内部复用现有 `timeline-card.js` 的拖拽/缩放/`is-short` 逻辑
  （把 `renderTimelineCard` 重构为 `renderCardBlock` 的薄壳，避免双份维护）。
- `buildCalSummary`（`rightview.js`）删除，改调 `renderCardPill`。
- 色系由 `cardColorKey(card)` 决定（`shared/format.js` 纯函数）：
  `type` 优先（task/text），`card.props.color` / 首个 tag 兜底，返回 `'red'|'green'|'blue'|'purple'|'gray'`。

### D4. 视图切换 dock

参考图底部浮动 dock。当前实现是顶部 `.view-modes` 三个 emoji 按钮。

- **保留**顶部按钮（键盘/读屏可达，且已有 `aria-pressed` 语义），
- **新增**底部浮动 dock 作为视觉主入口，`position: sticky; bottom: 8px`，
  与顶部按钮共享同一 `data-mode` + 同一事件委托（`entries/bind-views.js` 里改成按 `[data-mode]` 委托）。
- 设计系统明确「禁止 emoji 当功能图标」→ dock 用 SVG 图标（24×24、stroke 2、currentColor）。

### D5. 农历/节日副标

参考图有「十九/廿十/白露/中秋节」。**本期不引入农历数据源**（会引入新依赖 + 打包体积）。

- `renderDayHeader` 预留 `subLabel` 参数；
- 仅实现**固定节日**表（`shared/lunar-lite.js`，手写 12 条：元旦/春节/清明/劳动/端午/中秋/国庆…），
  农历日期本期不显示（留 `TODO`，PRD 已列为不包含项）。

## 2. 数据流

```
vs.allCardsCache ──getCardsByDaySync()──▶ views/month.js / week.js / timeline.js
                                              │
                                              ├─ renderDayHeader(dayKey, {count})
                                              ├─ renderCardPill(card)      [L0]
                                              └─ renderCardBlock(card)     [L1]
                                                      │ 展开
                                                      ▼
                                              renderCardDetail → milkdown-mount.acquire() [L2]
```

`vs` 只增字段：`expandedCardId: string|null`（展开态唯一性）。重渲染时若卡片已不在数据里则清空。

## 3. 构建与产物

```
extension/
├── build/build-milkdown.mjs      # esbuild 脚本（新增）
├── dist/milkdown.bundle.js       # 产物（提交）
├── dist/milkdown.css             # 产物（提交，只读主题最小样式）
└── views/milkdown-mount.js       # 动态 import 产物 + 实例池
```

`milkdown-mount.js` 用 **动态 `import()`** 懒加载产物，首屏不付代价：

```js
let modPromise = null;
function loadBundle() {
  modPromise ??= import('../../dist/milkdown.bundle.js'); // 相对 views/
  return modPromise;
}
```

> 注意：`import()` 路径必须相对当前模块文件；MV3 下扩展页可加载 `chrome-extension://` 自身资源，OK。

## 4. 兼容与回退

- 打包失败 / 产物缺失：`milkdown-mount.acquire()` catch 后降级为 `md-lite` L1 渲染，并 `console.warn` 一次。**不阻塞视图渲染**。
- 老卡片无 `content`：pill 显示 `cardPrimaryText`，detail 显示空态「暂无内容」。
- 存量 `idea` 类型：并入 `text` 色系（已有先例 `calview-summary.type-idea`）。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| Milkdown 打包体积（约 300–500KB min）拖慢扩展加载 | 动态 `import()` 懒加载，仅展开时拉取；产物 `--minify` |
| 实例泄漏（展开 → 切视图） | 实例池 + `renderRightView` 统一 `releaseAll()`；dev-loop 断言 `__milkdownMountedCount` |
| 拖拽/缩放逻辑重构引入回归 | `renderCardBlock` 保留原 `timeline-card.js` 实现为内核，先抽壳再换样式；现有 vitest 覆盖 |
| CSS 大改导致 320px 溢出 | dev-loop `--width 320,360,400,500` 作为硬门 |

## 6. 测试策略

- 单测（vitest + jsdom）：
  - `calendar-card.test.js`：pill 结构/截断/`is-today`/`+N`、`cardColorKey` 分支
  - `md-lite.test.js`：Markdown 去标记、行数上限、空内容
  - `milkdown-mount.test.js`：实例池上限、LRU 释放、`releaseAll`、bundle 缺失降级
- dev-loop：新增场景 `calendar-visual`，断言 pill 数量/色系 class/今天标记/无横向溢出/
  `window.__journalMilkdownMounted <= 2`
