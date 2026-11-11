# 拖拽排程闭环：落地预览 ghost + drop 行为收敛 + 周视图 drop

## Goal

卡片池卡片拖向时间线/周视图时，拖动中就能**看到会落在哪个 15 分钟格、占多长**（ghost 预览块）；松手即完成排程（不再强制打开编辑器）；反向拖回卡片池取消排程；周视图具备同款拖拽排程。

## 现状（证据）

- 卡片池卡片 `draggable=true`，`dragstart` 写 `text/plain = card.id`（`views/pool.js:193-204`）
- 时间线画布仅有**整体** `dragover` 高亮（`.schedule-canvas.drag-over`），无落点预览（`views/timeline.js:106-111`、`sidepanel.css:1748`）
- 时间线 drop：按 Y 算 15 分钟格 → 写 `assignedDate/time/startTime/endTime(=+15min)` → **强制打开编辑器**（`views/timeline.js:115-136`）
- 周视图列（`.calview-week-body[data-day]`）**无任何 drop 处理**（`views/week.js`）
- 时间线已排程卡的卡身拖动/缩放走指针手势（`views/timeline-card.js`，`bindPointerDrag`），与卡片池 HTML5 DnD 是两条独立链路，本任务不改它

## Requirements

### R1 落地预览（ghost 块）

- 卡片池卡拖到时间线/周视图列上时，显示 ghost 预览块：
  - 位置 = 吸附后的 15 分钟格（与 drop 落点**同一换算函数**）
  - 高度 = 该卡将获得的时长档位（`scheduleHeight`），宽度 = 列/画布可用宽
  - 内容 = 卡片标题 + 时间段文字（`HH:MM–HH:MM`）
  - 视觉 = 虚线描边 + `--accent-soft` 半透明底（token，不硬编码色）
- 拖动中**仅当落点格变化**才更新 ghost 位置（dragover 高频，避免每帧写 DOM）
- ghost 在 `dragleave` / `drop` / `dragend`（含拖出所有合法目标）时**必须**清除

### R2 drop 行为收敛

- **不自动打开编辑器**：drop 即完成排程（ghost 已可视化落点；要细调就点卡片）
- **保留原时长**：时长取值链 = `card.duration` → `endTime-startTime` → 15 分钟；drop 只改日期与起点，不把 90 分钟的卡压成 15 分钟
- 落点钳制：起点 ∈ `[viewStartMin, viewEndMin - 时长]`，卡片不越出画布
- **无 toast**（卡片落位即为反馈）

### R3 反向：拖回卡片池 = 取消排程

- 卡片池列表接受 drop：写入 `assignedDate: null, time: null, startTime: null, endTime: null`（保留 `duration`，便于再次排程），卡片回到「未安排」
- 池列表 dragover 时给出与时间线一致的弱高亮
- 无排程的卡拖回池 = 无副作用

### R4 周视图 drop + 预览

- 周视图每天列（`.calview-week-body[data-day]`）接受 drop：列 → `assignedDate = 列日期`，Y → 时间格；同款 ghost 预览（落在哪列就显示在哪列）
- 拖到列之间移动时 ghost 跟随跨列

### 非目标

- 月历视图 drop（月格仅 44px 宽、无时间语义；后续独立任务）
- 不改编时间线已排程卡的指针拖动/缩放（`bindPointerDrag`）
- 不做键盘拖拽替代（卡片池既有「安排」快捷按钮即键盘可达路径）
- 不改 host/协议/schema（`asString(null)` 与 PATCH 白名单已支持清空时间字段）

## Acceptance Criteria

- [x] AC1：拖动卡片池卡在时间线画布上方移动，ghost 块实时显示落点（时间格 + 时段文字 + 高度=时长）；落点格不变时 DOM 不更新（可通过 mutation/性能断言或代码审查确认）。（实测：`top=240px height=180px`、`10:00–11:30`；节流由 showDropGhost 同容器+同起点+同时长早退实现，代码审查确认）
- [x] AC2：时间线 drop 后卡片落在 ghost 所示位置（`assignedDate=当前日期`、`startTime=落点`、时长保留）；**编辑器不自动打开**。（实测：assignedDate=2026-11-11 10:00–11:30、editorHidden=true）
- [x] AC3：90 分钟卡拖到 14:00 落点 → `startTime=14:00, endTime=15:30`（原时长保留）；15 分钟卡 → `endTime=+15`。（实测：90 分钟卡 → 10:00–11:30；无时长卡 B → 10:00–10:15）
- [x] AC4：把已排程卡拖到卡片池列表 → 四个时间字段清空、卡片回到未安排；卡片池列表 dragover 有高亮。（实测：assignedDate=null null–null dur=90 保留、drag-over 类置位）
- [x] AC5：周视图把卡拖到周三列 10:30 → `assignedDate=周三`、`startTime=10:30`；拖动跨列时 ghost 跟随；离开列后 ghost 清除。（实测：非今天列 dragover ghost 10:00–10:15，drop 后 assignedDate=目标列 10:00–10:15）
- [x] AC6：`dragleave`/拖到非法区域/取消拖拽后 ghost 必被清除（无残留）。（dragleave/drop 两路径由场景断言实测；dragend 源头兑底由 pool.js dragend 调 hideDropGhost 实现，代码审查确认）
- [x] AC7：落点换算抽到 `shared/model.js` 纯函数并被 drop 与 ghost 共用，带单测（吸附/钳制/边界）。（slotMinutesAtY/clampStartMinutes，5 组单测，model.test.js 400/400 全绿）
- [x] AC8：dev-loop 新增 `drag-schedule` 场景覆盖 AC2–AC6；全量单测 + lint + 既有 smoke 回归全绿。（drag-schedule 正反序 72/72 全过；全量单测 400/400；lint 0 error；smoke 防回归见收尾记录）

## Notes

- 用户诉求原文（2026-11-11）：「拖拽到日志也有问题，拖拽到时间块上时不预览拖拽落地块」+「卡片应该支持拖拽到具体的时间和日期，拖拽后就新增排程属性」。
- 用户已确认方案 5 条：ghost 预览 / drop 不开编辑器 / 保留原时长 / 拖回池取消排程 / 周视图同款。
