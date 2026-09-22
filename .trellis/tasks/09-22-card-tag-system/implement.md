# Implement — 卡片标签系统

## Princtiple
逐层落地，每层验证后再进下一层。**历史数据零丢失为最高优先级**，迁移安全专项先实现并在不改数据的前提下通过测试。

## 执行清单（顺序执行）

### 阶段 0：前置核查（只读，不改数据）
- [ ] 确认主机 `host/data/journal.db` 是否存在（开发机可能尚未生成）；若无，用临时库做迁移安全测试。
- [ ] 记录当前 cards 表结构（`PRAGMA table_info`）、现有哪些列。

### 阶段 1：后端存储层（数据库 + 迁移安全）
- [ ] `host/lib/storage.js`：新增 `normalizeTags()` 工具。
- [ ] `normalizeCard` / `buildCard` 补 `tags` 归一化（默认 `[]`）。
- [ ] `applyCardPatch` 支持 `tags` patch。
- [ ] SQLite 实现：`init()` 时幂等加列（`PRAGMA table_info` 检测 → `ALTER TABLE ADD COLUMN tags TEXT`）；加列**前**用 `VACUUM INTO` 做时间戳快照备份。
- [ ] `rowToCard` / `cardToValues`：tags 列 JSON 编码/解码（读出兜底 `[]`）。
- [ ] `COLUMNS` 追加 `'tags'`。
- [ ] JSON 回退实现确认走到公共 `normalizeCard`，读写一致（补测试）。
- [ ] **新增 `verifyNoDataLoss(store, beforeSnap)`**：id 集合一致 + 除 tags 外逐字段一致。
- [ ] 校验失败 → 从备份还原并报「迁移未改动数据」；幂等（列已存在则跳过加列与备份）。

### 阶段 2：同步合并
- [ ] `host/sync/merge.js`：`CARD_FIELDS` 追加 `'tags'`；merge 版 `normalizeCard` 补 tags。
- [ ] 合并算法本体不改。补测试：标签变化触发合并、LWW 冲突收敛。

### 阶段 3：host API
- [ ] `host/server.js`：`POST/PUT /api/cards` 透传 tags（校验 /api/cards/:id PUT 走 applyCardPatch）。
- [ ] 新增 `GET /api/tags` → `{ tags: [{ name, count }] }`（多端 Store 接口缺 countCards display；用 listCards 聚合）。

### 阶段 4：前端
- [ ] `extension/lib/host-sync.js` 确认透传（应免改）。
- [ ] `extension/sidepanel.js`：`openEditor` tags 输入（分词 + 补全 + chip）。
- [ ] `renderCard()` / `buildCardFooter` 显示 tag chip。
- [ ] 卡片池按标签筛选。变量命名 `cardTags`，避开现有 `tag`（时间标记）。
- [ ] `extension/sidepanel.css` 标签 chip / 输入样式。

### 阶段 5：测试与验证（Hard Gate）
- [ ] 迁移安全：无 tags 列库 → init → 备份存在 + 加列成功 + verifyNoDataLoss 通过 + 幂等二次 init。
- [ ] 校验失败回滚场景：模拟不一致 → 自动还原 → 原数据未损。
- [ ] SQLite 与 JSON 双实现 tags 读回一致。
- [ ] `cd host && npm test` 全绿（含新增）。
- [ ] `node --check` 全 `host/**` + `extension/**` 0 error。

### 阶段 6：收尾
- [ ] 更新 `.trellis/spec/backend/database-guidelines.md`（cards 新增 tags 列 + WAL 备份约定）。
- [ ] 更新 `README.md`（功能列表补「标签」）。
- [ ] 提交 commit（git add + commit），遵守本仓库提交规范。

## 验证命令
- `cd host && npm test`
- `node --check host/lib/storage.js host/sync/merge.js host/server.js extension/sidepanel.js ...`
- 手动：打标签 → 刷新仍存；同步后端标签更新；筛选生效。

## 回滚点
- 每个阶段完成自测验证；迁移安全阶段未通过 Gate 前，不进入后续阶段。
- 迁移失败自动回滚到备份，原始数据文件不删不覆盖。