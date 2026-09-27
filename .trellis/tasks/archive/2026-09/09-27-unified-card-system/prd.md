# 统一卡片系统重构（Notion/Obsidian 风格）

## Goal

把 Journal 从「固定 schema、文本/待办二元切割」升级为「**统一卡片 + 可扩展属性 + 命名模板**」的灵活卡片系统，交互借鉴 Notion / Obsidian。

- **UI 不区分文本与待办、不区分卡片池与待办**：只有「卡片池」一个主视图，待办只是状态筛选。
- **卡片池展示各色卡片**：待办是其中一种，不是独立数据结构。
- **新建卡片自主选属性**：emoji、标题、进度、状态、起止时间、占用时长、项目、标签……用多少加多少。
- **属性可新增**：支持自定义属性（客户、精力、平台……），进属性库复用。
- **模板**：把当前卡片属性集合 + 默认值存成命名模板，新建时一键套用。

> 用户价值：把「记一天干了什么」从固定表格式，变成 Notion/Obsidian 式「一张卡 = 一堆可选的属性 + 元数据」，既能当文本便签又能当任务看板，还能沉淀个人属性与模板资产。

## 确认事实（来自代码勘察）

- 前端：Chrome MV3 扩展 `extension/`，原生 ES modules 无框架。主 UI `sidepanel.html/js`，共享逻辑 `lib/`。设置页 `options.html/js`。
- 后端：本地 Node host `host/`，SQLite（`node:sqlite`）权威存储 `host/lib/storage.js`；JSON 文件回退；跨端 LWW 合并同步 `host/sync/`。
- 卡片列（`COLUMNS`）：`id, content, type, done, assignedDate, time, startTime, endTime, priority, tags, emoji, meta, createdAt, updatedAt, deleted`。
- `type` 实际只写 `text / task`（`idea` 已在前序任务收敛，显示层归入 text）。`done` 是布尔。
- **没有 `duration` 列**：时长目前由 `endTime - startTime` 计算。
- **`project` 非一等字段**：藏在 `meta.createdBy.project / meta.updatedBy.project`（provenance）。
- **元数据已有雏形**：`meta` JSON 里已有 `createdBy / updatedBy = { origin:'human'|'model', project }`，用于 AI/人工来源 + 项目。
- 现有视图：月历 / 周历 / 时间线（右侧）+ 卡片池 + 待办（左侧两区）。
- 已有成熟「零丢失加列迁移」模式：`tags`、`meta`、`emoji` 三例照抄（`VACUUM INTO` 备份 → `ALTER TABLE ADD COLUMN` → `verifyNoDataLoss` → 失败回滚）。
- 同步引擎 LWW 以 `updatedAt` 为新者胜；删除走墓碑（`deleted=1`）。
- 卡片编辑器已有：日期、类型下拉、起止时间、时长显示、emoji picker、正文 textarea、标签 chips、项目输入、meta。
- `getJournals` / `getTodos` 是 cards 的**派生视图**（`c_mj_<day>` 等），无独立表。

## Requirements

### R1 统一卡片模型（数据层）
- 卡片为唯一实体。新增一等字段：`title`、`status`、`progress`、`duration`、`props`（自定义属性 JSON）。
- `status` 取代 `type + done` 的 UI 语义：`none`(纯记录) / `todo`(待办) / `doing`(进行中) / `done`(完成)。
- `type`、`done` 列**物理保留不删**（零丢失），仅作历史兼容，UI 不再以 type 区分文本/待办。
- `project` 提升为一等字段（仍保留 provenance 兼容读）。

### R2 属性系统（两层）
- **属性定义库 Property Library**（全局）：`[key] → {label, icon, type, options?, defaultValue?}`。类型支持 `text / number / select / multi-select / date / time / checkbox / duration`。
- **卡片属性值 `props.<key>`**：每张卡实际填的值。
- 命名空间隔离，不冲突：内建字段 / `props.*` / `meta.*` 三层分离。

### R3 系统元数据分层（只读、自动托管）
- `meta.*`：`createdAt / updatedAt / deleted / provenance{origin, who, project} / deviceId / lastAgent / aiSummary…`。
- 元数据**只能展示、不能编辑**（视图列/筛选可用，但只读）。
- 驱动：LWW 同步（updatedAt）、AI 审计（origin:human|model）、多端来源。

### R4 统一卡片池 UI
- 合并旧「卡片池 + 待办」为唯一主视图。
- **schema 驱动筛选**：状态 / 优先级 / 项目 / 标签 / 有无日期 / 自定义属性 / 只读元数据（修改时间、修改者、设备）。「待办」= 预设 `status∈{todo,doing}`，与其他筛选 AND 叠加。
- **多色卡片**：按状态/属性着色，露出 emoji、标题、状态、进度、关键属性。
- **视图 = 布局 × 尺幅 × 显示列 × 排序 × 筛选**：
  - 布局：卡片视图（多色网格）/ 列表视图（密集行，可显隐列、排序）。
  - 尺幅：紧凑（侧边栏默认）/ 舒展（宽屏占更多宽）/ 全屏（覆盖层大卡片池）。
  - 可保存命名视图（如「工作看板」「今日待办」）。

### R5 属性编辑器
- 编辑器改为属性驱动：emoji、标题、正文、起止时间、时长、状态、进度、优先级、项目、标签 + 任意自定义属性。
- **添加属性流程**：新建 PropertyDef（名称/图标/类型/选项）→ 加入当前卡片 和/或 加入全局属性库。
- 进度与状态联动：拖到 100% ⇒ done；勾选 done ⇒ 进度 100%；可独立微调。
- 时长双向：填时长反推结束；起止自动算时长。

### R6 模板系统
- 把当前卡片的（emoji + 属性集合 + 默认值 + 项目 + 标签 + 状态）存成**命名模板**。
- 新建卡可从模板快速创建，预填默认属性。
- 模板管理：增删改、重命名。

## Acceptance Criteria

- [ ] 旧库启动后自动加列 `title/status/progress/duration/props`，`verifyNoDataLoss` 通过（零丢失）；`type/done/emoji` 历史值不丢。
- [ ] `type=text` 卡片读作 `status=none`；`type=task+done=false` → `todo`；`type=task+done=true` → `done`；刷新/host 重启/一次同步后卡片仍在且内容不变。
- [ ] UI 不再出现「类型」「待办区」；只有统一卡片池 + 状态筛选。旧「待办」区块删除。
- [ ] 卡片池按状态筛选「待办」得到所有 `todo/doing` 卡片；与标签/属性筛选 AND 叠加生效。
- [ ] 卡片可按状态/属性显示不同颜色，露出 emoji、标题、状态、进度、关键属性。
- [ ] 卡片池支持卡片/列表两种布局 + 紧凑/舒展/全屏三档尺幅；可保存命名视图并切换。
- [ ] 编辑器可添加自定义属性（类型 text/number/select/multi/date/time/checkbox/duration），加入当前卡 + 属性库；属性库复用。
- [ ] 进度拖到 100% ⇒ 状态 done；勾选 done ⇒ 进度 100%；可独立微调。
- [ ] 时长与起止时间双向联动。
- [ ] 可把当前卡存成命名模板；用模板新建卡预填默认属性；模板可管理。
- [ ] `props` 与 `meta` 命名不冲突：新建名为 `title` 的自定义属性不覆盖内建 `title`。
- [ ] 列表视图可显示只读元数据列（修改时间 / 修改者AI或人工 / 设备），不可编辑。
- [ ] LWW 合并 + Obsidian 双向同步往返后新字段（title/status/progress/duration/props）不丢。
- [ ] host 测试 `cd host && npm test` 全绿；前端 `npx eslint extension/`、`npx vitest run --coverage` 达标。

## Out of Scope（明确不做）

- 不做破坏性物理迁移：`type/done/idea` 数据不删除、不重写。
- 不做属性/模板的跨端同步（先本机 settings 范畴；后续可在数据同步引擎任务扩展）。
- 不改 Obsidian 双向同步以外的导出格式。
- 不做多用户/协作/权限。
- 不做属性类型的高级校验（正则、公式、rollup 等 Notion 高级功能）。

## Key Decisions（规划期已与用户对齐，见 design.md）

1. **status 彻底取代 type 的 UI 语义**；type/done 列物理保留（零丢失）。
2. **新增一等 `title` 字段**（时间线/卡片显示标题，正文折叠）；无标题则回落 content。
3. **全局属性库** + 模板只引用其中的默认值（Notion 同款）。
4. **属性/模板先仅本机**（不同步）；卡片值照常同步。
5. **进度与状态联动**但允许独立微调。

## Open Questions

（规划期已全部关闭；无阻塞项。实施期若发现新问题回到 Plan 处理。）
