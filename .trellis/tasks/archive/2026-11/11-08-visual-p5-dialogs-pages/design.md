# 技术设计 — P5 弹窗与附属页

> 父任务 `11-08-visual-redesign-quiet-desk` 的 `design.md §3`（图标/按钮基元）、
> `§7`（性能约束：0 合成层）、`§1.4`（圆角标尺）在本任务继续生效。
> 本文件只写 P5 新增/变更的契约。

## 0. 一句话

把编辑器的属性行从**静态 HTML** 改成**按字段集渲染**（模板驱动），
同时把四类视觉违例收口到已存在的基元，并让版本号在界面上可读。

## 1. 属性集解析（核心）

### 1.1 现状与改动边界

- 现状：`sidepanel.html:224-296` 硬编码 9 个 `.prop-row`；`dom-refs.js` 在模块加载时按 id
  抓取全部输入元素（`editorStatus` / `editorProgress` / `editorStart` …），
  `card-editor.js` 只做「读值 → 写卡」。
- **不改**：输入元素本身、id、`card-editor.js` 的读写逻辑、字段落位（`field-registry.storage`）。
- **改**：可见性 + 顺序。即「哪些行出现在这一次弹窗里」，不改变任何数据形态。

这条边界把改动风险压在 CSS/HTML 层，`saveEditor()` 与 `formSnapshot()` 零改动。

### 1.2 契约

每行加 `data-field`：

```html
<div class="prop-row" data-field="status">
  <div class="prop-key"><i data-icon="pin" data-icon-size="14" aria-hidden="true"></i><span class="prop-key-label">状态</span></div>
  <div class="prop-val prop-val--stack">…</div>
</div>
```

- 隐藏一律用 `hidden` 属性（`[hidden]{display:none!important}` 已有），**禁止内联 style**。
- 顺序由 JS 写 `order` 类属性（CSS `order`）或直接 `append` 重排；实现取 `append` 重排
  （`display:contents` 的 `.prop-row` 在 grid 里按 DOM 序落位，重排即可）。
- 兼容老断言：`.ce-props[data-type="text"] .prop-row[data-key=progress]` 的旧选择器保留一个版本，
  新代码统一用 `data-field`。

### 1.3 字段集来源

```js
// features/editor-fields.js（新模块，纯函数 + 一次 DOM 应用）
export const DEFAULT_FIELDS = ['title', 'content', 'status', 'tags'];  // 属性区 4 行
export function resolveFields({ templateFields }) // → string[]
```

- 默认集：`title / content / status / tags`（4 个属性行）。`图标` 与 `类型` 在头部，不参与属性区。
- 模板集：`normalizeTemplateFields(tpl).map(f => f.key)` 去重后与默认集合并；
  `title / content` 永远在（`required`，模板里必有）。
- 未完整体：模板字段里出现属性库已删除的 key → 忽略（`getFieldDef(key) === null`）。
- 顺序：`title, content, status, tags` → 模板声明顺序中的其余字段 → 属性库顺序兜底。

### 1.4 入口

```js
openEditor(card, time, date, assignedDate, { templateId, fields } = {})
```

- `template-menu.createFromTemplate()` 传 `{ templateId: tpl.id, fields }`。
- 空白新建（`＋`、时间线框选、`cardpool-add`）不传 → 默认集。
- 编辑器头部（`.ce-head-subrow`）新增一行：`模板：<名称> · 更改`；`更改` 打开现有模板菜单的
  轻量版（复用 `renderTemplateMenu`），选中后调 `applyFields()` 重排，**不重载卡片数据**。
- 「自定义属性」`<details>` 恒在（它是兜底入口），但默认收起，且当模板已含自定义字段时
  自动展开。

## 2. 图标映射（emoji → `components/icon.js`）

`icon.js` 现有 27 个；需新增 4 个（24 viewBox / stroke 1.75）：

| 新图标 | 用途 | 形状 |
|---|---|---|
| `gauge` | 进度 | `M4 15a8 8 0 1 1 16 0` + 指针 `M12 15l4-4` + 底点 |
| `flag` | 优先级 | `M6 4v16` + `M6 5h11l-2.2 3.5L17 12H6` |
| `clock` | 排程 | `c(12,12,8)` + `M12 7.5V12l3 2` |
| `play` | 状态「进行中」 | `M9 6l9 6-9 6z`（fill currentColor） |

现有图标直接复用：

| 位置 | emoji | 图标名 |
|---|---|---|
| 属性：状态 | 📌 | `pin` |
| 属性：进度 | 📊 | `gauge` |
| 属性：优先级 | 🚩 | `flag` |
| 属性：日期 | 📅 | `calendar` |
| 属性：排程 | ⏱️ | `clock` |
| 属性：项目 | 📁 | `folder` |
| 属性：标签 | `#` | `tag` |
| 状态段 4 项 | 📝📌🔥✅ | `note`(新) / `pin` / `play`(新) / `check` |
| 类型下拉 | 📝☑️💡 | 文本 `note` / 任务 `check` / 想法 `sparkle` |
| 属性库按钮 | 🗂️ | `template` |
| 添加属性 | ＋ | `plus` |
| 保存为模板 | 🗂️ | `save` |
| 模板菜单「管理模板…」 | ⚙️ | `settings` |
| options 头部 | 📓 / ⚡ | `note` / `status` |

「状态段/类型下拉」是 `<button>`/`<option>` 内文字，`<option>` 不能放 SVG →
类型下拉改成和状态段一样的自定义 `select` 触发器（`select.css` 已有 `selectTrigger` 组件形态），
或退一步：`<option>` 只留纯文字（无 emoji）。**取退一步方案**（成本 1 行/项，不动 select 逻辑）。

`note` 图标需新增（第 5 个）：`r(5,3,14,18,2)` + `M9 8h6` + `M9 12h6` + `M9 16h4`。

### 3. 违例收口

| 违例 | 位置 | 处置 |
|---|---|---|
| `backdrop-filter: blur(3px)` | `sidepanel.css:2403` `.overlay` | 删除该行；遮罩用 `--color-scrim`（0.28 纯色） |
| `backdrop-filter: saturate(1.4) blur(10px)` | `options.css:37-38` header | 删除；header 用 `--surface` + 底部发丝描边 |
| 优先级三色圆点 | `sidepanel.css:2619-2621` `.seg[data-priority] .seg-dot` | 单色：`.seg-dot{background:var(--ink-weak)}`，`.seg.is-active .seg-dot{background:var(--accent)}`；删除三条 data-priority 规则；`--prio-*` 保留 token 但不被消费（`grep` 断言 0 处 `var(--prio-`） |
| 页脚裸类按钮 | `sidepanel.html` 编辑器/模板构建器/app-dialog 的 footer | 改 `btn btn-{variant} btn-{size}` + `data-variant`；`dom-refs` 按 id 抓取，不受类名变化影响 |

优先级在**卡片徽标**（`views/pool.js` / `calendar-card.js`）里若也用到 `--prio-*`，
一并改单色 + 文字；`grep -rn "var(--prio-" extension/` 必须为空（token 定义除外）。

### 4. 版本可见

- `extension/manifest.json`：`version` → `0.2.0`，新增 `"version_name": "0.2.0 Quiet Desk"`。
  `version_name` 会显示在 `chrome://extensions`，是用户自查「装的是哪个包」的第一现场。
- 新模块 `components/version-badge.js`（纯渲染，无平台依赖）：
  ```js
  export function renderVersionBadge(el, manifest) // el.textContent = 'v' + version
  ```
- 平台层：`platform/chrome.js` 暴露 `getManifest: () => chrome.runtime.getManifest()`；
  `platform/web.js` 返回 `globalThis.__JOURNAL_MANIFEST__ ?? { version: '0.0.0' }`。
- 挂载点：
  - `sidepanel.html` header-left：`<small id="app-version" class="app-version"></small>`，
    紧随 `#app-title`；`entries/sidepanel.js` 启动时渲染。
  - `options.html` header：`<small id="app-version">`；`entries/options.js` 启动时渲染。
- 样式：`--ink-weak` / `--fs-10-5` / `letter-spacing: 0`，不加背景、不加边框（R11：非主色）。
- dev-loop 断言直接读 `chrome.runtime.getManifest().version` 比对页面文本 —— 单一真值，无第二份常量。

### 5. dev-loop `scenarios/editor.mjs`

沿用 `lib/browser.mjs` 的 `launchBrowser` + `openSidePanel`，但编辑器需要交互：

1. 点 `#cardpool-add`（或 `.cardpool-add-btn`）打开编辑器 → 截图 `editor-<w>.png`
2. 断言（空白模板）：
   - `#card-editor-props .prop-row:not([hidden])` 的 `data-field` 集合 === `['title','content','status','tags']`
   - `#card-editor .prop-key-icon, #card-editor button, #card-editor summary` 的 textContent 无 emoji
     （正则 `/\p{Extended_Pictographic}/u`，白名单 `#emoji-preview`）
   - `getComputedStyle(document.querySelector('.overlay')).backdropFilter === 'none'`
   - `#card-editor-save.dataset.variant === 'solid'`，`#card-editor-cancel.dataset.variant === 'outline'`
   - `#app-version` 文本 === `v` + manifest.version
3. 断言（模板）：注入一条临时模板（host meta `templates`）→ 从模板新建 → 可见行 ⊇ 该模板字段
4. 320 / 400 两宽度；报告走既有 `lib/report.mjs`；任一断言失败 → 非 0 退出

### 6. 兼容与回滚

- 回滚点：属性集逻辑收在 `features/editor-fields.js` 一个模块；出问题把
  `applyFields()` 改成「全部显示」即恢复旧行为（1 行）。
- 类名兼容：`.btn-primary / .btn-secondary` 的 CSS 映射已存在（`button.js` 注释），
  改 HTML 后仍保留映射一个版本，避免第三方/历史断言失效。
- `data-key` → `data-field` 双写一个版本，老 dev-loop 断言不致失效。

### 7. 风险

| 风险 | 缓解 |
|---|---|
| 属性行重排导致 `dom-refs` 抓到 null | 只改可见性与顺序，不重建节点；`dom-refs` 的 id 全部保留 |
| 模板字段含已删属性库 key | `resolveFields()` 过滤 `getFieldDef(key) === null` |
| 默认集删掉「优先级」后，卡片池徽标无值 | 数据层默认仍是 `medium`（`field-registry.empty`），只是不展示控件 |
| 版本号双分支漂移（main 仍是 0.1.0） | 本任务只改 `dev/local`；main 的 version bump 放进发布流程，PRD 非目标已记 |
| `--prio-*` 清理误伤数据色 | 只清 `var(--prio-` 消费点；token 定义保留 |
