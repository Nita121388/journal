# Implement: 日历看板 + 指定日期编辑

## 实现顺序

1. **model.js**：新增 `getMonthMatrix(year, month)` 纯函数
   - 返回 6×7 矩阵，跨月补齐，周日起始
   - 元素含 `{ dayKey, day, isCurrentMonth, isToday }`
   - 加入 JSDoc 注释（遵循 type-safety 规范）

2. **sidepanel.html**：在热力图 section 之后新增日历 section
   - `calendar-header`（prev/next/month-label/today 按钮）
   - `calendar-grid`（weekday 行 + 42 个格子容器，JS 动态填充）

3. **sidepanel.css**：新增日历样式
   - `.calendar-header` / `.cal-nav-btn` / `.cal-today-btn`
   - `.calendar-grid`（grid 7 列）
   - `.cal-day`（含 `is-filled` / `is-today` / `is-selected` / `is-out-month` 状态）

4. **sidepanel.js**：
   - 新增 `let selectedDate = todayKey()`
   - 新增 `let calendarMonth`（当前显示的月份，默认当前月）
   - `renderToday()` 改为 `renderSelectedDate()`（读 selectedDate）
   - `debouncedSave` 写 selectedDate
   - 新增 `switchToDate(newDate)`：flush → 更新状态 → 渲染
   - 新增 `renderCalendar()`：调 `getMonthMatrix` + 高亮
   - 事件委托：日历容器 click → `switchToDate`
   - month prev/next/today 按钮 handler
   - textarea 渲染时机调整（init 时渲染日历）

## 验证命令

```bash
# 1. 语法检查（项目未落地 ESLint，用 node --check 兜底）
node --check extension/sidepanel.js
node --check extension/lib/model.js

# 2. 手动验证（chrome://extensions 加载扩展）
#   - 打开侧边栏，确认热力图 + 日历并存
#   - 点击日历某天 → textarea 加载该天，header 变化
#   - 输入内容 → 保存到该天，热力图对应格子亮起
#   - 切换月份 → 网格更新
#   - 点"今天" → 回到 todayKey
#   - 快速输入后立即切日期 → 草稿不丢
#   - dark mode 正常

# 3. 一致性检查（对照 frontend spec 清单）
#   - 无 innerHTML 拼接用户内容
#   - 无 chrome.storage 直调（都在 lib/store.js）
#   - 导出函数都有 JSDoc
#   - 渲染函数纯函数 + 事件委托
```

## 需要检查的竞态

- [ ] 快速输入后立即点日历切换，草稿不丢失
- [ ] 切换后再输入，内容保存到新日期
- [ ] 从日历切回今天，今日日志正确加载

## 完成后回到

- Phase 2.2：质量检查（`trellis-check`）
- Phase 3.3：spec 更新
- Phase 3.4：commit
