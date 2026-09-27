# 阶段A 数据模型地基 — 技术设计

> 详细模型见父任务 `09-27-unified-card-system/design.md` §2/3/4/5/8。本文只写阶段 A 的实现要点。

## 存储改动（host/lib/storage.js）

- `COLUMNS` 追加：`'title', 'status', 'progress', 'duration', 'props'`（顺序追加在 `emoji` 后、`meta` 前即可；需同步改 `cardToValues`/`rowToCard`/UPSERT 占位符）。
- schema `CREATE TABLE` 同步补列（新库直建）。
- `init()` 对每个缺失列做独立「VACUUM INTO 备份 → ALTER TABLE → 校验 → 回滚」，照 `tags/meta/emoji` 例。
  - `title TEXT`、`status TEXT DEFAULT 'none'`、`progress INTEGER`、`duration INTEGER`、`props TEXT`。
- `rowToCard`：
  - `title: r.title ?? ''`；`status` 推导（读侧）：`type==='task' ? (done?'done':'todo') : 'none'`，但优先 `r.status` 若非空（新写入胜）。
  - `progress`：`status==='done' && progress==null ? 100 : progress`。
  - `duration`：为 null 时由 `endTime-startTime` 算分钟。
  - `props`：JSON 解析（`{}` 兜底），校验 key 非保留字。
  - `project`：`r.project ?? r.meta?.createdBy?.project ?? null`。
- `cardToValues` 写 `title/status/progress/duration/props`；`project` 提升为顶层列需加列（`project TEXT`）——若走列则列入 `COLUMNS` 与迁移；否则经 `meta` 写。**推荐**：`project` 提为一等列 `project TEXT`（比塞 meta 干净），迁移同其它列。
- `applyCardPatch` 支持新字段补丁。
- `buildCard`：写入时 `status` 由 `type+done` 推导并落库，`provenance` 写入 `meta`。

## 状态推导优先级

新写入卡：显式 `status` 优先；无则 `type→status`。历史卡读取同样回落到显式 `status`，保证已迁移/已写入卡的 status 不被 type 覆盖。

## 元数据（host + extension 模型）

- `meta` 卡片字段统一结构：`meta.provenance = { origin, who, project }`，兼容保留 `createdBy/updatedBy`（旧字段是 `{origin, project}`）。
- 写入接口强制 `origin`：HTTP handler 与 CLI 透传 `provenance`；`updatedAt` 每次写刷新。
- `meta.lastAgent`：AI 写时填 `who`。

## 属性库/模板/视图存储（host meta 表）

- 新增 store 方法：`getMeta(key)`/`setMeta({key:value})` 已有；加语义封装：
  - `getPropertyLibrary()` / `savePropertyLibrary(lib)` → `meta['propertyLibrary']`
  - `getTemplates()` / `saveTemplates(list)` → `meta['templates']`
  - `getSavedViews()` / `saveSavedViews(list)` → `meta['savedViews']`
- 值均 JSON 字符串；本机存储，不入同步快照。

## 同步 & Obsidian（host/sync）

- `merge.js normalizeCard`：白名单增加 `title/status/progress/duration/props`（props 为对象，LWW 整对象覆盖；不做字段级合并）。
- `mdformat.js`：frontmatter 加 `status/progress/duration/title` 与 `props.*` 展开为顶层 key；解析读回合并进 `props`。往返不丢。

## 前端模型（extension/lib/model.js）

- `createCard` 补 `title/status/progress/duration/props`；`typeIcon` 改由 `emoji||类型`（status 不参与图标）。
- 保留字集合：`{title,content,status,progress,priority,project,emoji,assignedDate,startTime,endTime,duration,tags,id,createdAt,updatedAt,deleted,props,meta,type,done}`——`props` 与自定义属性命名冲突检测。

## 验证

```bash
cd host && npm test
npx eslint host/
```
新增用例：加列迁移零丢失、状态推导全组合、project 回落、provenance 写入、merge 携带新字段、mdformat 往返。

## 风险/回滚

- 迁移每列独立备份+回滚；`journal.db*.bak` 保留。
- `applyCardPatch` 若用白名单需加新字段，否则写回被丢——重点测试 update 路径。
