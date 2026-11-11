# 实施：拖拽排程闭环

## 步骤

1. **纯函数（shared/model.js）**
   - `slotMinutesAtY(y, viewStartMin, slotHeight)` → 未吸附分钟数
   - `clampStartMinutes(rawMin, viewStartMin, viewEndMin, durationMin)` → round 15 + 钳制
   - `shared/model.test.js` 补用例（正点吸附/边界钳制/时长=视图全长/非法入参）

2. **ghost 组件（views/drag-ghost.js，新建）**
   - `showDropGhost({container, startMin, durationMin, title})` / `hideDropGhost()` / `droppedCardSchedule(card, startMin)`
   - 单例 DOM，节流（同 container+start+dur 不重写），换容器时迁移
   - 样式进 `sidepanel.css`（`.drop-ghost`，token 取色：`--accent`、`--accent-soft`、`--r-sm`；虚线 `1px dashed`）

3. **时间线（views/timeline.js）**
   - dragover：用纯函数 + `showDropGhost`（标题取 `cardPrimaryText`）
   - drop：删开编辑器；`patchCard` 写四个时间字段，时长链走 `droppedCardSchedule`
   - 移除旧的 15 分钟硬编码与 `snapped` 未保留时长的路径

4. **周视图（views/week.js）**
   - `buildDayBody` 内挂 `dragover`/`dragleave`/`drop`（按 dayKey）
   - drop 用 `droppedCardSchedule` + `patchCard`（assignedDate=dayKey）

5. **反向取消排程（views/pool.js）**
   - `#cardpool-list` dragover/drop：高亮 + 四字段置 null
   - 池卡 `dragend`：`hideDropGhost()`

6. **dev-loop 场景（dev-loop/scenarios/drag-schedule.mjs，新建）**
   - 合成 `DragEvent`（DataTransfer 带 card.id）驱动：时间线 ghost→drop、周视图跨列 ghost→drop、反向回池、非法区域清理
   - 在 `dev-loop/dev-loop.mjs` 场景表中注册（先查注册方式，按现有 pattern 加）

7. **验证**
   - `npm --prefix extension run test`（全绿；model 新增用例）
   - `npm run lint`（0 error）
   - `node dev-loop/dev-loop.mjs --scenario drag-schedule --width 320,400,500`
   - `node dev-loop/dev-loop.mjs --scenario smoke --width 320,360,400,500`（防回归）

## 边界与守则

- drop 与 ghost 的落点换算必须是**同一函数**；任意一处私下 `*15/30` 都算缺陷。
- ghost 必须可从三路清除：drop、`dragleave`（周列）、源 `dragend`。
- 不改 `SLOT_HEIGHT`/`scheduleHeight` 的归属（views/timeline.js），不改 host/协议。
- 无 toast；卡片落位即反馈。
- 样式只用语义 token；功能图标无新增（ghost 纯文字 + 虚线）。
- 新场景不得依赖鼠标真实 DnD 时序（合成事件驱动），保证多宽度稳定。

## 交付

- 单 commit：`feat(drag): 拖拽落地预览 ghost + drop 保留时长/不弹编辑器 + 周视图与池反向拖拽`
- PRD AC1–AC8 逐条勾验。
