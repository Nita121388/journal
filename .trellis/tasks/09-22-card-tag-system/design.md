# Design — 卡片标签系统（内嵌 + 零丢失迁移）

## 1. 核心决策：内嵌 vs 独立标签表

| | 选型 A：内嵌在卡片上（✅ 采用） | 选型 B：独立 tags 表 + 关联表 |
|---|---|---|
| 存储 | `tags` 一列（JSON 数组字符串） | `tags` + `card_tags` 关联表 |
| 同步 | 加进 `CARD_FIELDS` → 逐卡 LWW 免费正确 | 需整套 tag 实体同步路径（rename 传播、身份冲突） |
| 全局管理 | 由全量卡片派生 | 自身是实体，可带颜色/描述 |
| 复杂度 | 低，与 `priority` 同级 | 高，违背轻量原则 |
| 适用 | 日志/待办个人工具 | 标签作为一等公民的重资产管理 |

**采用内嵌方案**。标签是分类手段而非实体；派生目录（tag → count）埋在一次 `listCards` 聚合即可。

## 2. 数据模型

卡片新增 `tags: string[]`（内部实体），持久化到单列 JSON 字符串。

规范化（`normalizeTags`）：
```js
tags = input.filter(t => typeof t === 'string' && t.trim())
            .map(t => t.trim().toLowerCase())
            .filter((v, i, a) => a.indexOf(v) === i)   // 去重
```

归一化入口：`normalizeCard` / `buildCard`（storage.js）、merge.js 的 `normalizeCard`。

## 3. 存储层改动

### SQLite（createSqliteStore）
建表后幂等加列：
```sql
-- 用 PRAGMA table_info(cards) 检测 column 'tags' 是否已存在
-- 不存在则：
ALTER TABLE cards ADD COLUMN tags TEXT;
```
- `COLUMNS` 追加 `'tags'`；字段编码：读 `rowToCard` 用 `JSON.parse(r.tags ?? '[]')` 兜底，写 `cardToValues` 用 `JSON.stringify(card.tags ?? [])`。
- `normalizeCard` 对 `tags` 做数组化 + `normalizeTags`。

### JSON 回退（createJsonStore）
复用公共 `normalizeCard` 即生效；`persist()` 整对象序列化天然带 tags。**只读测试确认行为一致**。

## 4. 历史数据零丢失迁移（核心）

### 4.1 WAL 安全备份
`journal.db` 处于 WAL 模式（`PRAGMA journal_mode = WAL`）。**直接 copy 主文件会漏掉未落盘的 WAL 数据**。安全备份策略二选一：
- 方案甲：`db` 文件 + 同级 `.db-wal` / `.db-shm` 统一复制到时间戳目录 `host/data/_upgrade_backup_<ts>/`。
- 方案乙（推荐）：在迁移事务内用 `VACUUM INTO '<backup>'` 导出一致快照（Node 22+ 支持同步 `VACUUM INTO`），最简单且天然含全部已提交数据。

选择方案乙，配合「备份文件永不覆盖」。

### 4.2 逐卡校验
迁移后执行 `verifyNoDataLoss(store, beforeSnapshot)`：
1. 卡片 `id` 集合完全一致（新增/丢失都判失败）。
2. 每张卡除 `tags` 外，`content/type/done/assignedDate/time/startTime/endTime/priority/createdAt/updatedAt/deleted` 逐字段比对一致。
3. 任何不一致 → 抛迁移失败。

### 4.3 自动回滚
校验失败时：从备份还原（`VACUUM INTO` 备份可直接替换/重开），返回「迁移未改动数据」，host 照常可用。

### 4.4 幂等
每次初始化检测 tags 列是否已存在：已存在则**跳过加列与备份**，直接进入校验（校验本身也幂等）。备份只在真正首次加列前做一次，带时间戳，绝不覆盖历史备份。

## 5. 同步改动（免费正确）

`host/sync/merge.js`：
```js
export const CARD_FIELDS = Object.freeze([
  'content', 'type', 'done', 'assignedDate', 'time',
  'startTime', 'endTime', 'priority', 'tags',   // ← 追加
]);
```
- merge 的 `normalizeCard` 补 `tags` 归一化（`[]` 默认、`normalizeTags`）。
- **合并算法 `pickWinner` / 墓碑逻辑零改动**；`cardsEqual` 因 CARD_FIELDS 含 tags 而检测变化 → 触发本卡合并/上传。

## 6. API 设计

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/cards` | body 可带 `tags` |
| PUT | `/api/cards/:id` | body 可带 `tags`；`applyCardPatch` 处理 |
| GET | `/api/cards` | 返回卡含 `tags` |
| GET | `/api/tags` (新增) | 派生 `{ tags: [{ name, count }] }` |

`applyCardPatch` 追加：`if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);`

## 7. 前端（extension/sidepanel.js /.css）

- **编辑器**：`openEditor` 增加 tags 区——输入框回车分词、已有标签自动补全（取派生目录）、已选标签显示可移除 chip。
- **卡片**：`renderCard()` / `buildCardFooter` 显示标签 chip（`card.tags` 非空时）。
- **卡片池筛选**：池头加标签筛选 chips，选中后仅显示含该标签的卡（时间线可后续复用同一谓词）。
- 接口透传：`extension/lib/host-sync.js` 已是 patch 直传 body，基本免改；确认 `createCardToHost`/`updateCardToHost` 无字段白名单限制。
- **命名注意**：`sidepanel.js` 中已有 `tag` = 当前时间标记（`timeline-now-tag`），新标签相关变量用 `cardTag`/`cardTags` 等避免重名。

## 8. 兼容与回退
- 老卡无 tags → `[]`；API 出参兼容新旧扩展。
- JSON 回退与 SQLite 行为一致；迁移失败自动回滚。
- 不改合并算法、不动 CRDT。

## 9. 安全 / 风险
- WAL 备份漏数据 → 用 `VACUUM INTO` 规避（硬性）。
- 命名冲突 → 前端标签变量统一 `cardTags`。
- 标签规范化（trim+lowercase）避免 `工作`/`工作 ` 分裂。
- 颜色/emoji/描述 → 明确不做（Out of Scope）。