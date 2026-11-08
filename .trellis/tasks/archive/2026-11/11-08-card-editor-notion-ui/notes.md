# 完成记录 — 卡片编辑器 Notion 化

## 实际交付

### 新增组件（`extension/components/`）

| 文件 | 导出 | 单测 |
|---|---|---|
| `seg.js` | `createSegGroup` / `syncSegValue` | 8 条 |
| `chip.js` | `createChip` | 7 条 |
| `property-row.js` | `createPropRow` / `createPropDivider` | 7 条 |

合计 22 条组件单测。

### 消掉的重复

- `updateStatusSeg` / `updatePrioritySeg`：两份逐行同构的 `.seg` 遍历 → 统一走 `createSegGroup`。
- `bind-editor.js`：两段同构的容器 click 委托 → 由组件在首次渲染时注册一次。
- `renderEditorTags` / `timeline-card.js`：两处手写 chip → `createChip`。
- 内建属性卡片行 / 自定义属性 flex 行：两套结构 → `createPropRow` + `.prop-row/.prop-key/.prop-val`。

### 视觉（对照 Notion 参考稿）

- 6 张 `.ce-section` 卡片 → 单个 `.ce-props` 两列网格（`76px minmax(0,1fr)`），无边框无底色。
- 状态/优先级高饱和实底胶囊 → 弱底选中态（`--color-hover-strong`）；彩色只出现在 8px `.seg-dot`。
- 标题 22px 无边框，focus 才出下边框；图标瓦片透明底 + hover 弱底。
- 删除顶部 4 色渐变条 `.card-editor-accent`（编辑器 + 模板构建器两处）。
- 标签 chip 改小方角，`×` 独立元素且只在 hover/focus-visible 显示。
- 删 `.ce-section:focus-within` 整段描边，焦点只留在控件本身。
- 「保存为模板」从正文区移到 footer 左侧并弱化（`.btn-quiet`）。
- 进度行按类型渐进披露：`text` / `idea` 不显示（`.ce-props[data-type]`）。

### 顺带修掉的真实缺陷

1. **初始焦点在正文** → 改到标题（`(editorTitle || editorContent)?.focus()`）。原来打开编辑器正文立刻带焦点框，且标题要多点一次。
2. **标题残留绿框** → `.card-editor-title:focus` 与 `:focus-visible` 都要 `outline:none`（程序 `focus()` 只命中前者）。
3. **时长重复显示** → 输入框已有数字时不再写「N 分钟」文字；只在非法（结束早于开始）时提示。
4. **`.prop-row` / `.card-editor-title` / `#card-editor-content` / `#card-editor-project` 旧规则残留**：ID 选择器特异性高于新类选择器，会静默覆盖新样式。已清除 5 处死规则。
5. **`.card-editor-tags` 死类**：HTML 结构改后不再使用，删除。

### 响应式

| 宽度 | 策略 |
|---|---|
| ≥381px | 两列网格（键列 76px）；状态 2×2；排程 2 列网格 |
| ≤380px | **单列堆叠**（键在上、值在下）。320px 下两列会把时间输入压到只剩「18」、按钮文字换行 |

## 验证结果

```
npm --prefix extension run lint          → 0 error
npm --prefix extension run test          → 23 files / 283 tests passed
dev-loop smoke 320,360,400,500           → 204/204 checks, 0 error
dev-loop tpl 400                         → 17/17
dev-loop select 400                      → 46/46
```

编辑器段（Notion 化区块）硬编码 hex 计数 = **0**。

## DOM 契约确认（R3）

未改动，dev-loop 既有断言无需修改即全绿：

- `#card-editor-priority-seg .seg[data-priority]` ×3 + `.is-active` ✔
- `#card-editor-status-seg .seg[data-status]` ×4 ✔
- `#card-editor-type|start|end|duration-min|duration|content|title|save|cancel` 全部保留 ✔
- `#card-editor-overlay` / `.card-editor` ✔

## 未做（明确留给后续任务）

逻辑层缺陷，按 PRD 划出本任务范围：

- 自定义状态覆盖预设值（单字段承载两种语义）
- 进度拖到 100% 反写状态、状态回退不重置进度
- 时长三重真源（起止 / 时长输入 / 只读回显）

## 踩坑记录

- **vitest `include` 未覆盖 `components/`**：新增组件测试默认不跑，需在 `vitest.config.mjs` 的 include 里加 `components`。
- **ESLint `no-undef` 不含 `Element`**：`e.target instanceof Element` 会报错，改 `HTMLElement`。
- **`display: contents` 与 flex 冲突**：`.prop-row` 既是内建属性行也是自定义属性行容器，曾被旧 `.prop-row { display:flex }` 覆盖导致自定义属性行散列。网格容器管列宽，行只做 `contents`。
- **ID 选择器优先于类选择器**：改造中新增的类规则被同名 ID 旧规则静默覆盖，是本次最多的返工来源。改样式前先 `grep` 同名 ID 规则。
- **中文 heredoc 经 bash 传给 python 会乱码**：改用 write 工具落临时文件 + node 拼接。
