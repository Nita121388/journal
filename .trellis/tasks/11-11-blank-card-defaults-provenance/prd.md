# 空白卡片默认值收敛 + 创建/更新时间与创建人只读行

## Goal

1. 「空白卡片」真正空白：通用新建入口不再自动带排程（起止 15 分钟）与日期；只有时间上下文入口（时间线/周视图点格子）才预填时间/日期。
2. 编辑器默认显示只读「来源」信息：创建时间 / 更新时间 / 创建人（区分人类与 agent，agent 需到具体名字），替代现在藏在「项目」行下面的一行灰字。

## Requirements

### R1 空白卡片默认值收敛

- 以下**通用新建入口**：不预填排程（开始/结束/时长留空 = 全天/未排程），**不预填日期**（= 未安排，保存在卡片池）：
  - 顶部快捷新建 `bind-shell.js` `btnQuickAdd`
  - 卡片池「新建」`bind-views.js` `btnNewCard`
  - 卡片池空态新建 `views/pool.js`
  - 模板新建 `features/template-menu.js`
- 以下**时间上下文入口保持现状**（点格子=排程语义，预填是功能不是噪声）：
  - 时间线点击/框选/拖拽 `views/timeline.js`
  - 周视图 `views/week.js`
  - now-marker「现在建一条」`views/now-marker.js`
  - 编辑已有卡片（读卡片自身的时间/日期）

### R2 来源只读行（创建时间/更新时间/创建人）

- 编辑器默认显示三行**只读**属性行：创建人、创建时间、更新时间。
  - 创建人：复用 `formatProvenance(meta.createdBy)`（👤 人类 / 🤖 agent 名 · model · 项目 · 设备 · 时间），agent 必须到具体名字（现有 provenance 已含 agent/model 字段）。
  - 创建时间 / 更新时间：`card.createdAt` / `card.updatedAt`，本地化显示。
- 系统属性规则：
  - 三行**恒显示**（不进模板、不进「＋ 添加属性」浮层、不可隐藏/编辑）。
  - 不与用户自定义属性冲突：key 已在 `RESERVED_PROPS`（createdAt/updatedAt/createdBy）。
- 新建卡片（尚未落库）：三行显示占位（如「保存后生成」），不显示假数据。
- 现有编辑器底部灰字来源行（`#card-editor-meta`，现挂在项目行 `.prop-val` 内）被这三行**取代**，避免同一信息两处出现。

### 非目标（明确不做）

- 卡片池卡片正面**不**显示创建时间/创建人（保持卡片正面清爽；来源是点开才看的元数据）。
- 不改数据形态：`saveEditor()` 照旧写全部内建字段；卡片 schema、host 存储、同步协议零变化。

## Acceptance Criteria

- [x] AC1：从顶部快捷新建 / 卡片池新建 / 模板新建打开编辑器，开始/结束/时长为空、日期为空（未安排）；保存后卡片是全天/未排程、无 assignedDate，卡片池徽标无排程/日期。（smoke 4 宽度：真空白断言 + 无日期卡落池断言全过）
- [x] AC2：时间线点格子、周视图点格子、框选、now-marker 新建，仍预填对应时间（与现状一致）。（smoke：框选预填 08:45–09:45 四宽度全过；点格子路径代码零改动）
- [x] AC3：编辑任意已有卡片，编辑器显示创建人（人类或 agent 名）、创建时间、更新时间三行只读行；agent 创建的卡显示具体 agent 名。（smoke 4 宽度：`👤 人类 · DESKTOP-36AHUML · 11/11 10:43` + createdAt/updatedAt 均 `YYYY-MM-DD HH:mm`；agent 名来自现有的 origin/agent/model provenance 链，无需新增存储）
- [x] AC4：三行不可被模板收敛隐藏、不出现在「＋ 添加属性」浮层、点 ✕/编辑无效；新建模式显示占位而非假数据。（结构契约：三行无 `data-field`、容器在 `#card-editor-props` 外 → applyFields/picker 均不触及；editor-fields.test.js 新增「无 data-field 的系统只读行不受 applyFields 影响」；smoke 新建占位断言 4/4 过）
- [x] AC5：旧灰字来源行（#card-editor-meta）不再渲染；项目行 `.prop-val` 内不再挂 meta 容器。（rg 清零，smoke 全绿）
- [x] AC6：现有 `editor-fields.test.js`、`card-schema.test.js`、`field-registry.test.js` 及相关单测全绿；新增行为的单测覆盖 R1 各入口与 R2 只读行渲染。（396/396 全绿；新增 format 7 例 + RO 行不受 applyFields 影响 1 例 + icon REQUIRED +user）

## Notes

- 现状证据：`openEditor(null, currentTime(), vs.selectedDate)`（bind-shell.js:66）→ `start=snapUpToQuarter(now)`、`end=start+15min`（card-editor.js:301-304）；卡片池入口 `openEditor(null, currentTime(), null, null)`（bind-views.js:168）日期已留空但仍带 15 分钟排程。
- 用户原始诉求（2026-11-11）：新建空白卡片后多了排程和日期；默认应包含 创建时间/更新时间/创建人（是人还是 agent、具体哪个 agent）。
