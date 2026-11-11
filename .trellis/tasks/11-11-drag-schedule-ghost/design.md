# 设计：拖拽排程闭环（ghost 预览 + drop 收敛 + 周视图 drop）

## 关键现状（证据）

| 事实 | 位置 |
|---|---|
| 池卡 dragstart 写 `text/plain = card.id`，`beginGesture('pool-drag')` | `views/pool.js:193-204` |
| 时间线画布 dragover 只有整体描边高亮，无落点 | `views/timeline.js:106-111`、`sidepanel.css:.schedule-canvas.drag-over` |
| 时间线 drop：Y→格（`snapToQuarter`）、写 15 分钟、**开编辑器** | `views/timeline.js:115-136` |
| 时间线已排程卡另有指针拖动/缩放（`bindPointerDrag`，gestureKind drag/resize） | `views/timeline-card.js:146-259` |
| 周视图列壳 `.calview-week-body[data-day]`，几何同时间线（`vs.viewStartMin` + `scheduleHeight`） | `views/week.js:165-196` |
| `SLOT_HEIGHT=30`、`scheduleHeight(mins)` 由 `views/timeline.js` 导出（week/timeline-card/range-select 共用） | `views/timeline.js:257-262` |
| host PATCH 白名单含 `assignedDate/time/startTime/endTime`；`patch.startTime !== undefined → asString()`，显式 null 可清空 | `host/lib/storage.js:140-143,166` |
| `getCardDuration(card)` 已有（起止差，无则 0） | `shared/model.js:222-227` |

## 方案

### 1. 纯函数落位换算（`shared/model.js`，可单测）

```js
/** Y 坐标 → 未吸附分钟数（slotHeight 显式传入，shared 不持视图常量） */
export function slotMinutesAtY(y, viewStartMin, slotHeight) { ... }
/** 落点吸附 + 钳制（round 到 15 分钟；start ∈ [viewStartMin, viewEndMin - durationMin]） */
export function clampStartMinutes(rawMin, viewStartMin, viewEndMin, durationMin) { ... }
```

**drop 与 ghost 必须共用这两个函数**（否则预览骗人）。`SLOT_HEIGHT`/`scheduleHeight`
留在 `views/timeline.js`（视图几何不动窝，避免波及 4 个既有消费方）。

### 2. ghost 组件（`views/drag-ghost.js`，新文件）

```js
export function showDropGhost({ container, startMin, durationMin, title })
export function hideDropGhost()
```

- 模块级**单例**元素：`.drop-ghost`（虚线描边 + `--accent-soft` 半透明底 + 两行文字：标题 / `HH:MM–HH:MM`），absolute 定位，`top = scheduleHeight(startMin)`、`height = scheduleHeight(startMin + durationMin) - scheduleHeight(startMin)`。
- **节流**：记录上次 `{container, startMin, durationMin}`，未变直接 return（dragover 高频，只在换格时写 DOM）。
- `hideDropGhost()` 幂等；从旧容器挪到新容器 = 先移除再 append。
- 视图层内引用 `timeline.js` 的 `scheduleHeight`（同层互引合法）。

### 3. 时间线 drop 改造（`views/timeline.js`）

- `dragover`：`slotMinutesAtY` → `clampStartMinutes`（dur 取被拖卡）→ `showDropGhost`；保留画布整体高亮（边界指示）。
- `drop`：同一换算 → `patchCard(card.id, { assignedDate: date, time, startTime, endTime })`；**删除打开编辑器的调用**。
- 时长链：`getCardDuration(card) || 15`；`endTime = addMinutes(start, dur)`。
- `dragleave`：只清画布高亮；ghost 清除交给 drop/dragend（跨视图拖动时列间 dragleave/dragover 会接力）。

### 4. 周视图 drop（`views/week.js`，`buildDayBody` 内按 dayKey 挂监听）

- 每列 `dragover`：`preventDefault` + 按列 Y 换算 → `showDropGhost({container: body, ...})`（跨列移动时单例自动换容器）。
- `drop`：`patchCard(card.id, { assignedDate: dayKey, time, startTime, endTime })`。
- 列 `dragleave`：`hideDropGhost()`（拖出列到刻度尺/表头区域时预览消失，drop 无效）。

### 5. 反向：拖回卡片池 = 取消排程（`views/pool.js`）

- `#cardpool-list` 挂 `dragover`（`preventDefault` + `.drag-over` 弱高亮）与 `drop`：
  `patchCard(card.id, { assignedDate: null, time: null, startTime: null, endTime: null })`（`duration` 保留）。
- 无排程的卡拖回 = patch 后无变化，允许（不报错）。
- 池卡 `dragend`（拖到任何非法区域）：`hideDropGhost()`（源头兜底，防 ghost 残留）。

### 6. 被拖卡的时长来源（drop 处理器内，两视图共用逻辑）

```js
const dur = getCardDuration(card) || card.duration || 15;   // 分钟
```

放 `views/drag-ghost.js` 一并导出 `droppedCardSchedule(card, startMin)` → `{ startTime, endTime, duration }`，两视图共用（杜绝两处各写一份时长链）。

## 数据流（跨层核对）

```
pool dragstart (card.id via dataTransfer)
  → timeline/week dragover: slotMinutesAtY/clampStartMinutes (shared) → showDropGhost (views)
  → drop: patchCard → state/repository.updateCardEntry → host PATCH（显式 null 清字段 ✓）
  → pool dragend: hideDropGhost（源头兜底）
```

## 兼容与回滚

- 数据形态零变化（只写既有四个时间字段的值或显式 null）；host/协议零改动。
- 行为变更：时间线 drop 不再自动开编辑器——用户已拍板（ghost 可视化后 drop 即完成）。
- 单 commit 可整回滚（2 个新文件 + 3 个视图文件改动）。

## 验证

- 单测：`shared/model.test.js` 新增 `slotMinutesAtY` / `clampStartMinutes`（吸附/钳制/边界/时长越界）。
- dev-loop 新场景 `drag-schedule.mjs`：合成 `DragEvent(dataTransfer)` 派发 dragover/drop：
  - 时间线：ghost 出现（top/文字断言）→ drop → 卡片落位、时长保留、**编辑器未开**；
  - 周视图：周三列 drop → assignedDate 正确；跨列 dragover ghost 换列；
  - 反向：拖回池 → 字段清空、池高亮；
  - 非法区域：dragend 后 ghost 无残留。
- 全量：extension 单测 + lint + smoke 回归。
