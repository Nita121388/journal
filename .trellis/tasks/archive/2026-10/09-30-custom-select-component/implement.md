# Implement — 自建下拉框组件（BoardUI 风格）

> 执行顺序 P1 → P2 → P3 → P4。每阶段结束跑该阶段的验证命令，全绿才进下一阶段。
> 任务路径：`.trellis/tasks/09-30-custom-select-component/`
> 状态：**P1–P4 已完成**（2026-09-30）。下文为执行记录 + 复跑命令。

## P0 · 前置

- [x] 记录基线：`git status` 干净（commit `aebef5c`）
- [x] 基线回归：`--scenario tailwind-migrated --width 320,400` → 20/20 全绿

## P1 · 核心组件 + 全部单选

- [x] 新建 `extension/lib/select.js`：
  - [x] `enhanceSelect(el, opts)`：包裹层 + visually-hidden 保留原生 select + 触发器 button
  - [x] 幂等：`registry` Map 命中直接返回
  - [x] `MutationObserver` 两路：① `documentElement` 子树新增 `select` → 自动增强（含 detach 清理）；② 每个已增强 select 的 `childList` → 重绘
  - [x] `render` / `buildItems` / `syncItems` / `choose` 职责分离（选项签名比对，签名不变则复用 DOM）
  - [x] 单例「当前打开实例」：`openState` 模块级，同一时刻仅一个 popover
  - [x] `position(trigger, pop)`：GAP 6 / MARGIN 8 / MIN_H 96，翻转 + 限高 + 视口 clamp
  - [x] `scroll`(capture) + `resize` → 重定位；关闭时解绑
  - [x] 键盘/焦点/aria 按 design.md §4（`aria-activedescendant`，焦点不离开触发器）
  - [x] typeahead（600ms 前缀窗口，循环匹配）
  - [x] **实现修正**：`option.selected` / `select.value` 不反映到 `selected` 属性 → 改为实例上 patch `value` setter（详见 design.md §2）
- [x] 新建 `extension/select.css`：触发器 / chevron / popover / item / 多选摘要 / 焦点环 / reduced-motion
- [x] 两页 `:root` 补 `--select-*` + `--color-focus` token
- [x] 两页 HTML 各加 `<link rel="stylesheet" href="select.css">`
- [x] 两页 JS 各加 `import { autoEnhance as enhanceSelects }` + `init()` 开头调用

**验证 P1**（全部通过）
- [x] 触发器渲染正常（值文本、chevron、hover、focus-visible 焦点环）
- [x] 点开 → 页面仍可滚动（非模态）
- [x] 底部空间不足时向上翻转
- [x] 键盘 ↑↓ Home End Enter Esc Tab + typeahead 逐项过
- [x] 亮/暗主题截图对比；reduced-motion 下无动画
- [x] 回归：项目筛选、命名视图、卡片类型、属性类型、同步 provider 全部正常

## P2 · 多选

- [x] 触发器摘要「已选 N 项 · 首项…」；0 项走 placeholder
- [x] item 选中态（accent-soft 底 + 对勾）
- [x] 底部「清除」行
- [x] 选中后保持打开、焦点不移动
- [x] `selectedOptions` 双向同步；`buildTplDefaultEditor` multi 分支回显正常

## P3 · 清理旧 CSS

- [x] 删 `sidepanel.css` 全局 `select` 块 + 4 处局部视觉覆盖
- [x] 删 `options.css` `.field select` 相关（保留 input）
- [x] 保留 `max-width` 布局占位（供 `copyLayout` 搬运）；满宽规则改为作用于 `.js-select` 包裹层
- [x] `rg -n "appearance: *none" extension/*.css` → 仅剩 range input（预期）
- [x] `rg -n "^\s*select[ ,:{]" extension/*.css` → 无结果

**验证 P3**
- [x] grep 干净
- [x] dev-loop `smoke` / `tpl` / `tailwind-migrated` 320,400,500 全绿
- [x] 删除前后视觉无意外变化

> P3 暴露的连锁问题：删除 `.pool-view-select` 的 `font-size:11px` 后，原先基于 computed font-size 的
> 尺寸档探测把紧凑档误判为 md（UA 默认 13.3px ≥ 13）。已改为**显式驱动**（默认 sm +
> `data-select-size="md"`），并补 dev-loop 断言防回归。

## P4 · 回归场景 + 文档

- [x] 新建 `dev-loop/scenarios/select.mjs`（41 项断言）：8 处增强、触发器 computed、展开态 portal/role/z-index/不溢出、
      非模态滚动、Esc/↑↓/Enter/typeahead、动态 select、外部 `sel.value` 赋值、multiple、options 页 md 档与 change 链路、暗色跟随
- [x] `dev-loop.mjs` 注册 `select` 场景（并把 `extId` 透传以支持设置页检查）
- [x] 同步 `.trellis/spec/frontend/design-system.md` §6 补 Select 行、§8.1 记录 `select.css` 跨页共享约定
- [x] 回写 `design.md` 反映实现后的真实决策（value-setter patch / token 表 / 删除清单 / API 签名）
- [x] `node dev-loop/dev-loop.mjs --scenario select --width 320,360,400,500` → 41/41 全绿

## Review Gates

| Gate | 时点 | 结果 |
|---|---|---|
| G1 | P1 结束 | ✅ 定位/键盘/aria 逐条对照 design.md §3/§4；发现并修正 selected 属性反射的伪机制 |
| G2 | P2 结束 | ✅ 多选摘要、切换、清除、`selectedOptions` 同步 |
| G3 | P3 结束 | ✅ 旧 CSS 删除彻底；发现并修正尺寸档探测回归 |
| G4 | P4 结束 | ✅ select 场景 41/41 + 全场景无回归 + spec 同步 |

## 最终验收（design-system §9）

- [x] dev-loop 全场景 320/360/400/500 全绿（select 41 / smoke 15 / tpl 8 / tailwind-migrated 20）
- [x] 无新增硬编码 hex（两个 shadow rgba 为设计 token，集中于 :root，已在 spec 说明）
- [x] 无 `!important` 新增
- [x] 新交互键盘可达、焦点可见（ring-offset）
- [x] 亮暗主题 + reduced-motion 正常
- [x] 无横向滚动、无内容截断
- [x] 6 处既有 JS 调用点零改动（`git diff` 核对：sidepanel.js 仅 +1 import +1 调用；options.js 同）
- [x] lint 不新增错误（`sidepanel.js` 19 个存量 `no-unused-vars` 为 HEAD 既有，基线记录在 quality-guidelines.md）

## 复跑命令

```bash
# 主回归
node dev-loop/dev-loop.mjs --scenario select --width 320,360,400,500
# 旁路回归
node dev-loop/dev-loop.mjs --scenario smoke --width 320,400,500
node dev-loop/dev-loop.mjs --scenario tpl --width 320,400,500
node dev-loop/dev-loop.mjs --scenario tailwind-migrated --width 320,400,500
# lint
cd extension && npx eslint lib/select.js
```
