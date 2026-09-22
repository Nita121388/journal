# 卡片标签系统（历史数据零丢失迁移）

## Goal
让「卡片」支持标签（tags）：用户可给一张卡片打一个或多个标签，通过标签快速分类、筛选、检索。
功能按「轻量、内嵌、同步免费正确」的原则落地，**并把「历史数据零丢失」作为最高优先级硬性约束**。

## Background
- 卡片是唯一权威数据模型（`host/lib/storage.js`），字段：`content / type / done / assignedDate / time / startTime / endTime / priority / createdAt / updatedAt / deleted`。
- host 存储为 **SQLite（`node:sqlite`，权威）+ JSON 回退**双实现；运行环境无 `node:sqlite` 时自动退回 JSON 存储。
- 合并引擎 `host/sync/merge.js` 为纯函数逐卡 LWW（`updatedAt` 新者胜）+ 删除墓碑；业务字段白名单 `CARD_FIELDS` 驱动 `cardsEqual`。
- 前端 `extension/sidepanel.js` 渲染 `renderCard()` 与卡片池 `renderCardPool()`，点击进 `openEditor(card, ...)`。
- 现状：卡片没有标签字段；`sidepanel.js` 中已存在 `tag` 局部变量，但它是「当前时间标记 `timeline-now-tag`」，**与本功能无关，实现时避免命名混淆**。
- 用户数据可能在多种环境（含 Windows launcher）。当前开发机 `host/data/` 尚未生成 `journal.db`。

## Requirements
### 数据模型
- 卡片新增 `tags: string[]` 字段，默认 `[]`；规范化规则：`trim` + 统一小写、去重、过滤空串。
- 选择**内嵌方案**：tags 随卡片存储与同步，不建独立 tags 实体表（派生标签目录由全量卡片聚合得出，满足自动补全 / 筛选 / 标签云）。

### 存储层（**SQLite 与 JSON 双实现行为一致**）
- SQLite `cards` 增 `tags TEXT` 列（存 JSON 数组字符串）；JSON 回退实现同样读写 tags。
- 完成幂等的表结构升级（`ALTER TABLE ... ADD COLUMN`，用 `PRAGMA table_info` 检测列是否已存在）。
- 老卡片 tags 缺失 → 归 `[]`，其它字段不变。

### 同步
- `CARD_FIELDS` 追加 `tags`，使得标签变化能被 `cardsEqual` 检测并随 LWW 正常合并；**合并算法本体不改**（标签冲突由逐卡 LWW 自动收敛）。
- merge 层 `normalizeCard` 同步补 `tags` 归一化。

### host 接口
- `GET/PUT /api/cards` 透传 `tags`；`applyCardPatch` 支持 `tags` patch。
- 新增只读派生 `GET /api/tags` → `{ tags: [{ name, count }] }`。（不引入 tags 写接口，标签只在卡片上增删。）

### 前端
- 编辑器（`openEditor`）增加 tags 输入：分词 + 已有标签自动补全 + 已选标签 chip。
- `renderCard()` / 卡片池显示标签 chip。
- 卡片池（及可选时间线）支持按标签筛选。
- 可选增强：标签云入口（由派生目录渲染 `{name,count}`）。

## 硬性约束（Highest Priority）：历史数据零丢失
把「历史数据一根毛都不能丢」固化为**程序自动校验的硬性验收项**，不是口头承诺：

1. **迁移前完整备份**：动手前对数据库做安全快照（需正确处理 SQLite **WAL 模式**——不能只复制主文件，须连同 `-wal`/`-shm` 一起，或使用等价的干净快照导出），备份带时间戳且**永不覆盖旧备份**。
2. **逐卡自动校验**：迁移后程序自动对比——卡片总数一致 + 每张卡除新增 `tags` 列外其它字段逐字符一致（不靠人眼）。
3. **校验失败 → 自动回滚**：从备份还原至升级前状态，程序照常可用并明确报告「迁移未改动数据」。
4. **迁移为幂等**：重复启动/重复执行安全，不会重复加列或重复备份覆盖。
5. 迁移前后均不删除、不覆盖原始数据文件；备份文件保留可人工恢复。

## Acceptance Criteria
- [ ] 历史数据零丢失：端到端验证「备份齐全 → 加列 → 逐卡比对通过」；构造一次校验失败场景能自动回滚且原数据未损。
- [ ] `host/test/` 全绿（`node --test`，含新增迁移安全 + tags 合并测试）。
- [ ] `CARD_FIELDS` 含 `tags`；标签变化触发合并；逐卡 LWW 冲突收敛无丢失。
- [ ] SQLite 与 JSON 双实现：写入 tags → 两种存储均可读回一致的卡片。
- [ ] 幂等迁移：带旧 schema（无 tags 列）二次初始化不报错、不重复备份、数据保留。
- [ ] `GET/PUT /api/cards` 与 `applyCardPatch` 正确处理 tags；`GET /api/tags` 返回正确 count。
- [ ] 前端：可打标签、见 chip、按标签筛选。
- [ ] `node --check` 全 `host/**` + `extension/**` 0 error。

## Verification
- `cd host && npm test` 全绿。
- 迁移安全专项：带 WAL 快照、逐卡 hash 比对、回滚覆盖测试。
- 手动：给卡片打标签 → 刷新仍在；改标签 → 同步后端已更新；按标签筛选生效。

## Out of Scope
- 标签作为一等实体（颜色 / emoji / 描述 / 全局重命名专项）——明确不做，保持轻量。
- 标签全局重命名（= 批量改卡低频操作，不建专项）。
- 云端标签索引服务。