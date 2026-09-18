# Design: 日历看板 + 指定日期编辑

## 架构概览

在现有侧边栏（sidepanel.html/js/css）中新增日历视图和日期选择状态。涉及 4 个文件：

```
extension/
  sidepanel.html   — 新增日历 section（热力图下方）
  sidepanel.js     — 新增 selectedDate 状态 + renderCalendar + 切换逻辑
  sidepanel.css    — 新增日历样式 + 月份导航
  lib/model.js     — 新增 getMonthMatrix() 纯函数
```

## 核心状态变更

当前 `sidepanel.js` 的隐含状态：日期固定为 `todayKey()`。

**新增**：`let selectedDate = todayKey()` 作为整个 UI 的当前编辑日期。

所有依赖日期的地方改为使用 `selectedDate`：

| 原来 | 改为 |
|------|------|
| `renderToday()` 固定读 `todayKey()` | 读 `selectedDate` |
| `debouncedSave` 里写 `todayKey()` | 写 `selectedDate` |
| header 显示固定今日 | 显示 `selectedDate` |
| textarea 保存到当天 | 保存到 `selectedDate` |

## 竞态处理：日期切换与 debounce 保存

当前 `debouncedSave` 用 500ms 防抖，但只在 textarea input 时触发。如果用户刚输入内容（触发 debounce 计时），立即点击日历切到另一天，待执行的 debounced save 会：
1. 在错误的 `selectedDate`（已过期的值）上保存内容，或
2. 新日期的内容还没加载就被旧的 save 覆盖

**解决方案**：切换 `selectedDate` 之前先 cancel debounce 并立即执行一次 flush：

```js
function switchToDate(newDate) {
  flushSave();        // cancel debounce + sync write 当前 textarea 内容到当前 selectedDate
  selectedDate = newDate;
  // 重新渲染 textarea + header
}
```

`flushSave` 直接调用 `saveJournal(selectedDate, textarea.value)` 并 cancel 定时器。

## 纯函数新增：model.js

新增 `getMonthMatrix(year, month)` → 返回 6×7 矩阵（最多 6 行，覆盖跨月边界），每个元素为：

```js
{ dayKey: "2026-09-18", day: 18, isCurrentMonth: true, isToday: false }
```

- 第一行：上月末尾补齐（`isCurrentMonth: false`）
- 最后行：下月开头补齐
- 周日起始（Sun 0 → Sat 6）
- `year`/`month` 为 JS Date 的 0-indexed month（`month=8` = 九月）

## 日历 UI 结构

```html
<section id="calendar-section">
  <div class="calendar-header">
    <button id="cal-prev" aria-label="上一月">‹</button>
    <span id="cal-month-label">2026年9月</span>
    <button id="cal-next" aria-label="下一月">›</button>
    <button id="cal-today" class="cal-today-btn">今天</button>
  </div>
  <div class="calendar-grid">
    <div class="cal-weekday">日</div> ... <div class="cal-weekday">六</div>
    <!-- 6×7 = 42 个 .cal-day 单元 -->
    <div class="cal-day" data-day="2026-09-01">1</div>
    ...
  </div>
</section>
```

## 数据流

```
日历点击 → switchToDate(newDate)
              → flushSave()
              → selectedDate = newDate
              → loadJournal(selectedDate) → textarea.value = ...
              → updateHeaderDate()
              → renderCalendar() （更新高亮）

textarea input → debounce → saveJournal(selectedDate, value)
                           → renderHeatmap()（热力图刷新）
```

## 关键约束

- 不改 `store.js` / `host-sync.js` / `manifest.json`
- 不新增依赖
- `switchToDate` 必须先 flush 再切换（顺序不可颠倒）
- 点击日历格子用事件委托（容器上一个 click handler）
- 日历渲染函数纯函数：`renderCalendar(container, matrix, selectedDate, heatmapData)`

## 回滚点

如果实现有问题，直接还原 `sidepanel.html` 中的 `<section id="calendar-section">` + `sidepanel.js` 中的日期状态 + `sidepanel.css` 日历样式 + `model.js` 的 `getMonthMatrix`，其余文件无影响。
