# PRD — 自建下拉框组件（BoardUI 风格）

## 背景

用户希望参考 https://www.boardui.com/components/select 的视觉语言，改造本项目所有下拉框。
BoardUI Select 特征：大圆角（rounded-2lg）、1px 中性弱描边、极弱投影（shadow-xs ≈ rgba(0,0,0,.03)）、
200ms 柔和过渡、hover 底色+描边双态变深、ring-2+ring-offset-2 焦点环、16px 描边 chevron（展开旋转）、
**非模态 popover**（页面继续滚动）、item 支持自由内容（状态点/头像）、暗色跟随语义 token。

已确认选型：**方案 B** —— 隐藏原生 select + 代理触发器 + 自绘非模态 popover，
目标是尽量还原 BoardUI 展开态行为，而不只是触发器外观。

## 现状问题

- 8 处下拉框分属 3 套样式方言（sidepanel 全局 select / 5 处局部覆盖 / options 页独立体系），重复字面量。
- 焦点反馈不统一（outline vs box-shadow ring），与设计系统 §4 ring-offset 规范不符。
- 原生 select 的展开列表由 OS 绘制，观感不可控，也带不出 BoardUI 的"非模态 + item 自由内容"。

## 目标

1. 统一 8 处下拉框为同一组件，视觉对齐 BoardUI Select。
2. 展开态为自绘非模态 popover，320–500px 侧栏内可用（翻转/限高内滚/不溢出视口）。
3. 键盘完整可达（↑↓ Home/End Enter Esc Tab + typeahead），焦点可见。
4. 读屏可达（combobox/listbox/option 语义 + aria-activedescendant）。
5. 支持 multiple 多选（2 处），触发器显示"已选 N 项"摘要。
6. **零回归**：现有 6 处 JS 调用点（`.value` / `change` / `new Option` / `sel.append` / `.multiple` / `.selectedOptions`）不改一行。
7. 暗色主题 + prefers-reduced-motion 正常。

## 非目标

- 不做虚拟滚动/远程搜索/分组/级联等高级 Select 能力。
- 不改 6 处 JS 调用点的数据流（如 `poolProjectFilter` 逻辑）。
- 不引入框架或第三方依赖（MV3 CSP 限制）。
- 不为展开态做"跟随选项滚动时页面贴住"之类的桌面 Web 行为。

## 需求清单

### R1 触发器视觉（硬门）
- 大圆角、1px 中性描边、极弱投影、hover 描边+底色变深、200ms 过渡、16px SVG chevron（展开 rotate 180°）。
- 尺寸分档：紧凑档（11px，面板工具条/属性行/卡片编辑器）、标准档（12–13px，设置页）。
- 圆角/阴影/焦点环必须走语义 token，不新增硬编码 hex。

### R2 展开态（硬门）
- 非模态：popover 打开时侧栏/页面仍可滚动，不遮滚动交互。
- popover portal 到 `document.body`（弹窗动画带 transform，fixed 子元素会被劫持）。
- 窄栏可用：下方不足向上翻转；上下都不足限高内滚；水平贴边/右对齐避免溢出视口；最小宽度=触发器宽。
- 打开时基于 `getBoundingClientRect()` 定位，监听 `scroll`/`resize` 重定位。

### R3 键盘（硬门）
- ↑↓ 移动 active（首尾 clamp），Home/End，Enter/Space 选中并关闭，Esc 关闭并回焦触发器，Tab 关闭。
- 字符 typeahead（首字母匹配，不区分大小写）。

### R4 读屏（硬门）
- 触发器 `role=combobox aria-expanded aria-haspopup=listbox aria-controls`。
- 列表 `role=listbox`，项 `role=option aria-selected`，active 用 `aria-activedescendant` 管理（焦点不离开触发器）。
- 隐藏的原生 `<select>` 保留作为无 JS/读屏 fallback。

### R5 multiple（P2）
- 触发器显示"已选 N 项 · 首项…"，truncate。
- item 选中态 accent 底 + 对勾；底部"清除"动作。
- 与原生 `selectedOptions` 双向同步。

### R6 零回归（硬门）
- 保留原生 `<select>` 节点（visually-hidden），`.value` 读写、`change`、`new Option`/`append`（MutationObserver 重绘）、`.multiple`、`.selectedOptions` 全部继续工作。

### R7 兼容与清理
- 删除 sidepanel.css:2662 全局 select 规则及 5 处局部覆盖（pool-view/pool-project/card-editor-workflow/prop-input/prop-form-row）。
- 焦点 token `--color-focus` 补进 sidepanel.css 与 options.css 的 :root（当前仅 design-system.md 有定义）。
- 同步 .trellis/spec/frontend/design-system.md §6 组件规范，补 Select 行。

## 验收标准

- [ ] dev-loop：新增 select 场景，320/360/400/500 宽度全绿，无 console error。
- [ ] 亮/暗主题 + reduced-motion 下触发器与 popover 均正常。
- [ ] 8 处下拉框全部走组件，旧 select 样式规则已删除（rg 无残留类）。
- [ ] 无新增硬编码 hex、无 `!important`（reduced-motion 兜底除外）。
- [ ] 键盘逐项验证（↑↓ Home/End Enter Esc Tab typeahead）。
- [ ] 现有 6 处 JS 调用点零改动，功能（项目筛选/视图切换/类型选择/属性定义/模板默认值/同步 provider）回归通过。
- [ ] 320px 下 popover 不溢出视口、不出现横向滚动条。

## 范围清单（8 处）

| # | 位置 | 类型 | 尺寸档 |
|---|---|---|---|
| 1 | `#pool-view-select`（命名视图） | 单选 | 紧凑 |
| 2 | `#card-editor-type`（卡片类型） | 单选 | 紧凑 |
| 3 | `#prop-type`（属性类型） | 单选 | 紧凑 |
| 4 | `#tpl-np-type`（新属性类型） | 单选 | 紧凑 |
| 5 | JS 动态 `.pool-project-select`（项目筛选） | 单选 | 紧凑 |
| 6 | JS 动态 `prop-input`（属性值 select） | 单选 | 紧凑 |
| 7 | JS 动态 `prop-input`（属性值 multi） | **多选** | 紧凑 |
| 8 | `#sync-provider`（设置页同步源） | 单选 | 标准 |

> 注：模板构建器默认值 `buildTplDefaultEditor` 中 status/select/multi 也是动态生成的 prop-input（含 6/7 同一类）；`#prop-type`/`#tpl-np-type` 为静态多选项。
