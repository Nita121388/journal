# Implement — 卡片编辑器 Notion 化

## 顺序原则

先建组件（无风险、可独立测试）→ 再改 HTML 结构 → 再改 CSS → 最后接事件。
每步都可单独验证，避免「一次大改后 dev-loop 全红、无法定位」。

---

## Step 1 · 组件层（新增 3 文件 + 单测）

- [x] `extension/components/seg.js`：`createSegGroup(container, dataKey, value, onPick) → { setValue, getValue }`
- [x] `extension/components/chip.js`：`createChip({ label, onRemove, removable, active, title })`
- [x] `extension/components/property-row.js`：`createPropRow({ icon, label, key }) → { row, val }`
- [x] `extension/components/seg.test.js` + `chip.test.js`（jsdom 环境，vitest `environment: 'node'` → 需在测试文件顶部 `// @vitest-environment jsdom`）
- [x] `extension/components/README.md` 更新（列出三件套职责）

验证：
```bash
npm --prefix extension run test -- components
npm --prefix extension run lint
```

回滚点：`git checkout -- extension/components`

## Step 2 · HTML 结构（sidepanel.html 200-330）

- [x] 删除 `.card-editor-accent`（编辑器 + 模板构建器两处 `<div>`；模板构建器的 CSS 已 `display:none`，删 HTML 更干净）
- [x] 头部：`.ce-head-fields` 内移除 date/type 的 `.ce-head-subrow`，日期下沉到属性区（type 保留在头部，因 `smoke.mjs` 断言其宽度 ≥90px）
- [x] `.card-editor-body` 内 6 个 `<section class="ce-section">` 合并为：
      `<div class="ce-props">` + 8 个 `<div class="prop-row" data-key="...">`
      每行 = `<span class="prop-key">icon + 文字</span>` + `<div class="prop-val">控件</div>`
- [x] 状态行：`.seg` ×4 保留 `data-status`、`aria-checked`；自定义状态输入改为 `.prop-val` 内行内输入
- [x] 优先级行：`.seg` ×3 保留 `data-priority`；每个按钮内加 `<i class="seg-dot" data-priority="high"></i>`
- [x] 进度行：`data-key="progress"`，内含 range + number + `%`
- [x] 排程行：三个 input 的 id **全部保留**（`card-editor-start/end/duration-min`）+ `#card-editor-duration` 回显
- [x] 标签行：`#card-editor-tag-chips` 容器 + `#card-editor-tag-input`
- [x] 项目行：`#card-editor-project` + `#project-suggest`
- [x] `<details class="ce-more">` 内只留「自定义属性 + 属性库」；「项目目录」上提到主属性区
- [x] 底部：「保存为模板」从 `.card-editor-tools` 移到 `.card-editor-footer` 左侧（`justify-content: space-between`）

验证：
```bash
grep -c "ce-section" extension/sidepanel.html     # 期望 0
grep -c "card-editor-accent" extension/sidepanel.html  # 期望 0
node dev-loop/dev-loop.mjs --scenario smoke --width 400   # 期望仍绿（此时 CSS 未改，视觉丑但结构正确）
```

回滚点：`git checkout -- extension/sidepanel.html`

## Step 3 · CSS（sidepanel.css 编辑器段重写）

- [x] 删除 `2323-2560` 段的编辑器视觉规则（保留 `.card-editor` 外壳、`.ce-more`、`.card-editor-footer` 布局）
- [x] 删除 `2635-2665` 的补丁段中已被新规则取代的部分（自定义状态、进度数值）
- [x] 删除 `2991` 的 `.ce-section:focus-within`
- [x] 新增 `.ce-props` 网格 + `.prop-key` + `.prop-val` + `.ce-divider`
- [x] 新增 `.seg` 弱底选中态 + `.seg-dot` 圆点色
- [x] 新增 `.chip-atom`（标签 chip，hover 显示 ×）
- [x] 改 `.card-editor-title`（22px，1px transparent 底边，focus 显示）
- [x] 改 `.ce-emoji-tile`（透明底 + hover 弱底）
- [x] `styles/tokens.css` 新增 `--color-hover` / `--color-hover-strong` / `--prio-*`
- [x] `@media (max-width: 360px)` 下键列 76px → 64px

验证：
```bash
grep -nE "#[0-9a-fA-F]{3,6}" extension/sidepanel.css | sed -n '/23[0-9][0-9]:/p'   # 期望无新增 hex
node dev-loop/dev-loop.mjs --scenario smoke --width 320,360,400,500
```

回滚点：`git checkout -- extension/sidepanel.css extension/styles/tokens.css`

## Step 4 · 接组件（card-editor.js / editor-props.js / bind-editor.js）

- [x] `card-editor.js`：`updateStatusSeg` / `updatePrioritySeg` 内部改用 `createSegGroup`（导出签名不变）
- [x] `card-editor.js`：`renderEditorTags` 改用 `createChip`（DOM 等价：仍是 `button.tag-chip`）
- [x] `editor-props.js`：`renderEditorProps` 的 `row` 构建改用 `createPropRow`
- [x] `bind-editor.js`：两段 seg click 委托合并为一次（用 `createSegGroup` 的委托，或在 bind 层写一个 `dataKey` 循环）
- [x] `views/timeline-card.js`：`.tag-chip` 构建改用 `createChip`（输出 DOM 等价，`is-static` 类保留）

验证：
```bash
npm --prefix extension run test
npm --prefix extension run lint
node dev-loop/dev-loop.mjs --scenario smoke --width 320,360,400,500
node dev-loop/dev-loop.mjs --scenario tpl --width 400
node dev-loop/dev-loop.mjs --scenario llm --width 400
```

回滚点：`git checkout -- extension/features extension/views/timeline-card.js extension/entries/bind-editor.js`

## Step 5 · 收尾

- [x] 人工截图：亮色 + 暗色 + 320px 三张，确认「无卡片框、无渐变条、无整段焦点框」
- [x] `grep -rn "ce-section" extension/` → 期望 0
- [x] 更新 `.trellis/spec/frontend/design-system.md` 的组件表（新增 `.seg` 弱底规范、`.prop-row` 属性行规范）
- [x] 更新 `.trellis/spec/frontend/component-guidelines.md`（新增「组件层三件套」小节）
- [x] commit

## 验证命令汇总

```bash
cd /e/primary/projects/journal
npm --prefix extension run lint
npm --prefix extension run test
node dev-loop/dev-loop.mjs --scenario smoke --width 320,360,400,500
node dev-loop/dev-loop.mjs --scenario tpl --width 400
node dev-loop/dev-loop.mjs --scenario select --width 400
```

## 完成判据

全部 Step 勾选 + 上述 5 条命令全绿 + 3 张截图人工确认。
