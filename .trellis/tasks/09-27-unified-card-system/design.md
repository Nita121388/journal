# 统一卡片系统重构 — 技术设计

> 面向 4 个阶段子任务的总设计。每阶段按本文档的相应章节细化并实现。

## 1. 架构边界

```
extension/  (前端, MV3, 无框架)
  sidepanel.html/js  主 UI：卡片池(统一视图)、编辑器、模板/属性库交互
  lib/model.js       卡片模型、派生视图、状态推导
  lib/store.js       镜像缓存（chrome.storage.local）+ host 桥接
  lib/emoji*.js      emoji picker

host/  (后端, Node + SQLite 权威存储)
  lib/storage.js     COLUMNS、init 迁移、rowToCard、upsert、applyCardPatch
  sync/merge.js      normalizeCard（新增字段随 LWW 携带）
  sync/mdformat.js   Obsidian 双向同步 frontmatter
  meta 表            属性定义库 + 模板库（key-value JSON）
```

数据流：扩展 UI → REST `/api/cards` → host SQLite（权威）→ 镜像 cache；host 经 `sync/` 与多端 LWW 合并。

## 2. 统一卡片模型（核心）

```
Card {
  // 展示
  id, emoji, title, content(正文/Markdown)
  // 排程
  assignedDate, startTime, endTime, duration(分钟)
  // 工作流状态  ← 取代 type+done 的 UI 语义
  status  : 'none' | 'todo' | 'doing' | 'done'
  progress: 0..100 | null
  priority: 'high' | 'medium' | 'low'
  // 归属
  project : string | null
  tags    : string[]
  // 自定义属性（命名空间隔离）
  props   : { [propKey]: value }
  // 系统元数据（只读，自动托管）
  meta    : { createdAt, updatedAt, deleted, provenance{origin,who,project}, lastAgent, deviceId, aiSummary }
  // 同步
  createdAt, updatedAt, deleted
}
```

**三层分离、命名空间隔离（不冲突）：**

| 层 | 命名空间 | 内容 | 编辑权 |
|---|---|---|---|
| 内建字段 | 顶层列 | emoji/title/content/status/progress/priority/time/project/tags | 编辑器可改 |
| 用户属性 | `props.<key>` | client/energy/platform/… | 用户可建可改，进属性库 |
| 系统元数据 | `meta.*` | 时间戳/provenance/device/lastAgent | 只读展示 |

> 关键：用户自定义属性永远在 `props.*` 下。属性库对 `title/content/status/…` 等内建 key 设**保留字保护**——新建同名属性被阻止或提示，杜绝覆盖。

## 3. 属性系统（两层）

```
属性定义库 PropertyDef（全局，存 host meta 表）
  key        稳定 id（如 'client'）
  label      显示名（客户）
  icon       emoji（🧑）
  type       text|number|select|multi|date|time|checkbox|duration
  options[]  （select/multi 用）
  defaultValue

卡片属性值 Card.props
  { 'client':'某公司', 'platform':'微信' }
```

- 属性定义库 + 模板库持久化在 host `meta` 表：`meta['propertyLibrary']`、`meta['templates']`，JSON 值。
- 前端属性库/模板为只读镜像；写操作走 REST（新增 setter 或复用 settings 通道）。

## 4. 历史数据迁移（非破坏，读侧推导）

旧库启动时对 `title/status/progress/duration/props` 走「零丢失加列迁移」：

1. `PRAGMA table_info(cards)` 检查缺列。
2. `VACUUM INTO '<backup>.bak'` 备份。
3. `ALTER TABLE cards ADD COLUMN <col>`（`title TEXT`、`status TEXT DEFAULT 'none'`、`progress INTEGER`、`duration INTEGER`、`props TEXT`）。
4. 读回全表 `rowToCard`，`verifyNoDataLoss(before, after)` 校验，失败 `copyFileSync` 回滚 + throw。
5. `type/done/emoji` 列**不动**。

**读侧推导（不写库）：**

| 旧数据 | 推导 |
|---|---|
| `type='text'` | `status='none'` |
| `type='task'` + `done=false` | `status='todo'` |
| `type='task'` + `done=true` | `status='done'`, `progress=100` |

- `project`：写入升级为一等字段；读 `project` 为空时回落 `meta.createdBy.project`（provenance 兼容）。
- `title`：新卡片写入；历史卡 `title=''`，显示回落 `content`。
- `duration`：为空时由 `endTime - startTime` 计算；用户改 `duration` 反推 `endTime`。

## 5. 元数据分层与「模型/Agent 修改时间」

- `meta.updatedAt` = 修改时间；`meta.provenance = { origin:'human'|'model', who, project }` = 修改者来源。
- 用途：① LWW 合并时间戳（updatedAt 为胜负手）；② AI 审计（origin 区分 AI/人工）；③ 视图只读列/筛选（修改时间、修改者、设备）。
- **写路径**：扩展/CLI 每次写入必须携带 `provenance.origin`（human/model）+ `who`（如 agent 名）→ 存 `meta`，并刷新 `updatedAt`。
- 现有 `meta.createdBy/updatedBy.project` 结构保留兼容；新代码读写统一走 `meta.provenance`。

## 6. 统一卡片池视图

**视图 View = 布局 × 尺幅 × 显示列 × 排序 × 筛选**，可命名保存：

| 维度 | 选项 |
|---|---|
| 布局 | 卡片视图(网格,多色) / 列表视图(密集行) |
| 尺幅 | 紧凑(侧栏默认) / 舒展(宽屏) / 全屏(覆盖层) |
| 显示列(仅列表) | 内建列 + 自定义属性列 + 只读元数据列(可显隐/拖排序) |
| 排序 | 修改时间 / 开始时间 / 优先级 / 任一属性 |
| 筛选 | schema 驱动：状态/优先级/项目/标签/日期/自定义属性/只读元数据(AND) |

- 筛选 = 一组 `(propKey, operator, value)` AND。待办预设 = `status∈{todo,doing}`。
- 命名视图持久化：存 `meta` 表（`meta['savedViews']`），前端切换。

## 7. 编辑器与模板

- 编辑器 = 内建属性区（可折叠）+ 自定义属性区 + 添加属性流程。
- 添加属性：名称/图标/类型/选项 → 加入当前卡 ☑ 或加入属性库 ☑。
- 进度↔状态联动：`progress===100 ⇔ status==='done'`，可独立微调。
- 时长↔起止联动：双向推导。
- 模板 = `{ name, emoji, propsDefaults:{key→val}, project, tags, status }`（存 `meta['templates']`）。
- 保存模板：从当前编辑器状态捕获；用模板新建：预填默认属性后进编辑器。

## 8. 同步 & Obsidian 兼容

- `sync/merge.js normalizeCard` 增加 `title/status/progress/duration/props` 字段 → LWW 自动携带。
- `sync/mdformat.js`：frontmatter 增加 `status/progress/duration/title` 及 `props.*`（自定义属性转 frontmatter key），解析读回，往返不丢。
- 属性库/模板/命名视图：**本机**（host meta 表），不入同步快照（本期 out of scope）。
- 墓碑/合并逻辑不变。

## 9. 兼容性 & 回滚

- REST `/api/cards` 返回的 card 新增字段；旧扩展/CLI 读到未知字段**忽略即可**（宽松读取）。
- 迁移每列独立 `VACUUM INTO` 备份 + 校验 + 回滚，任一失败抛错并恢复，不影响已迁移列。
- 回滚点：git commit 前逐阶段可 `git revert`；迁移有 `.bak` 备份。

## 10. 阶段划分（子任务）

| 阶段 | 子任务 | 覆盖章节 |
|---|---|---|
| A 数据模型地基 | `09-27-card-data-model` | §2/3/4/5/8 后端 + 迁移 + 元数据 |
| B 统一卡片池 UI | `09-27-card-pool-view` | §6 视图/筛选/布局/尺幅 |
| C 属性编辑器 | `09-27-card-property-editor` | §3/7 编辑器 + 添加属性 + 联动 |
| D 模板系统 | `09-27-card-templates` | §7 模板保存/新建/管理 |

依赖：A → B → C → D（C、D 强依赖 A 的 props/status 字段；B 依赖 A 的 status 语义）。
