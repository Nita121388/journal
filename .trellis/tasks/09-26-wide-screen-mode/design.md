# 宽屏模式 — Design

## 目标
宽标签页自动铺满全宽，窄侧边栏不变。

## 变更范围
纯前端：`extension/sidepanel.css` `.html` `.js`。不碰 host / 数据。

## 状态模型
`documentElement` 上用一个 boolean class 表达当前布局：
```js
document.documentElement.classList.toggle('wide-mode', isWide)
```
- 生效优先级：**手动设置 `on/off` > 自动（视口 ≥1100px）**。
- 用户选择持久化存 `localStorage['journal.wideMode']`：
  - `'on'` → 强制宽屏；`'off'` → 强制窄屏；`'auto'`（默认，不存在时视为 auto）→ 跟随 `matchMedia('(min-width: 1100px)')`。
- 判定函数：
  ```js
  function computeWide() {
    const m = localStorage.getItem('journal.wideMode');
    if (m === 'on')  return true;
    if (m === 'off') return false;
    return matchMedia('(min-width: 1100px)').matches;   // auto
  }
  ```

## 媒体查询响应
- 视口变化时（`matchMedia('(min-width:1100px)').addEventListener('change')`，仅 auto 模式需要）→ 重新 applyWide()。监听常驻，代价忽略。
- 手动模式不受媒体查询影响。

## CSS 增量
只加一段，用 `html.wide-mode` 选择器覆盖，不改现有规则（避免回归）：
```css
html.wide-mode main { max-width: none; }
```
- 现有 `#board` grid `280px 1fr`、`finance` 的 `min-height`、`schedule-canvas` 用
  百分比 lane 宽度 —— 宽屏容器变宽后自动拉伸、多 lane 自动变宽，无需改 lane 逻辑。
- 月历 `.calview-day` min-height、周历 `.calview-week-col` min-height 在 wide 下
  加大，卡片摘要 `flex:1` + ellipsis 随宽自动显示更多文字（现有样式已支持）。

## 按钮（三态循环）
视图工具区新增：
```html
<button id="btn-wide-mode" title="宽屏模式（自动 / 强制宽屏 / 强制窄屏）">⛶</button>
```
循环顺序 `auto → on → off → auto`，按钮文案/边框高亮反映当前模式：
- auto：灰边框、图标 `⛶`，title 附注"自动"
- on：高亮、图标 + 文字"宽屏"启用状态
- off：普通、减弱

点击后写 localStorage → applyWide()。刷新后 init 读取恢复。

## 回归要点
- `<720px` 现有 `@media` 隐藏侧栏、单列收起逻辑绝对不动，仅当 `html.wide-mode`
  且视口确实宽时 `main{max-width:none}` 生效，窄屏下 wide 类不会误加。
- `applyWide` 在 init 时同步调用一次 + 媒体查询 change 回调 + 按钮点击各一次。