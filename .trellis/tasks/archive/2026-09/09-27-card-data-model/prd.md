# 阶段A 数据模型地基

## Goal

为统一卡片系统打数据地基：新增一等字段、三层分离、非破坏迁移、元数据/属性库/模板存储，并让新字段穿透同步与 Obsidian 双向同步。**后端先行，前端模型同步。**

## Requirements

- **R1 卡片新增一等字段**：`title`、`status`(none/todo/doing/done)、`progress`(0..100|null)、`duration`(分钟)、`props`(自定义属性 JSON)。
- **R2 状态推导（读侧，不写库）**：`type=text→none`；`type=task+done=false→todo`；`type=task+done=true→done,+progress=100`。`type/done` 列物理保留不删。
- **R3 零丢失加列迁移**：照 `tags/meta/emoji` 三例（`VACUUM INTO` 备份 → `ALTER TABLE` → `verifyNoDataLoss` → 失败回滚）。
- **R4 project 一等化**：写入升级为一等字段；读为空回落 `meta.createdBy.project`。
- **R5 元数据分层**：`meta.provenance={origin:'human'|'model', who, project}` 统一读写；`meta.lastAgent`；每次写入刷 `updatedAt`。
- **R6 属性库/模板/命名视图存储**：host `meta` 表 `propertyLibrary` / `templates` / `savedViews`（JSON）读写接口。
- **R7 同步与 Obsidian 携带**：`merge.js normalizeCard` + `mdformat.js` 增加新字段，LWW 往返不丢。

## Acceptance Criteria

- [ ] 旧库启动自动加列 `title/status/progress/duration/props`，`verifyNoDataLoss` 通过（零丢失）。
- [ ] 状态推导正确（text/task 全组合）；`type/done/emoji` 历史值不丢。
- [ ] `project` 读写一等化 + 旧 provenance 回落兼容。
- [ ] 写入携带 `provenance.origin/who`，刷新 `updatedAt`；AI 写入 origin='model'。
- [ ] host 提供属性库/模板/视图的读写接口（meta 表）。
- [ ] LWW 合并 + Obsidian 往返后新字段不丢。
- [ ] `cd host && npm test` 全绿（含新用例）；`npx eslint host/` 0 errors。

## Out of Scope

- 不做 UI（阶段 B/C/D）。不做属性/模板/视图的跨端同步（本机）。

## Notes

- 改动：`host/lib/storage.js`、`host/sync/merge.js`、`host/sync/mdformat.js`、`extension/lib/model.js`。
- 详细设计见父任务 `design.md` §2/3/4/5/8。
