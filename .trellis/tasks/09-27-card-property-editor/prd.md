# 阶段C 属性编辑器

## Goal

把卡片编辑器升级为**属性驱动**：内建属性区 + 自定义属性区 + 「添加属性」流程 + 进度/状态、时长/起止联动。新建卡片时自主选择要哪些属性。

## Requirements

- **R1 属性驱动编辑器**：emoji、标题、正文、日期、起止时间、时长、状态、进度、优先级、项目、标签 + 任意自定义属性（`props.<key>`）。属性区可折叠、可增删、可排序。
- **R2 添加属性流程**：新建 PropertyDef（名称/图标/类型 text|number|select|multi|date|time|checkbox|duration / 选项）→ 加入当前卡 ☑ 和/或 加入属性库 ☑。保留字保护（不可与内建/`props`/`meta` key 冲突）。
- **R3 进度↔状态联动**：拖到 100% ⇒ `status='done'`；勾选 done ⇒ `progress=100`；可独立微调。
- **R4 时长↔起止双向**：填时长反推结束时间；改起止自动算时长。
- **R5 属性库复用**：编辑器「＋」可从未用属性库拉取已有 PropertyDef 填到当前卡。

## Acceptance Criteria

- [ ] 编辑器按属性驱动渲染；自定义属性可读可写可删。
- [ ] 添加属性：支持各类型，加入当前卡 + 属性库；保留字冲突被阻止/提示。
- [ ] 进度到 100 ⇒ done；勾选 done ⇒ 进度 100；可独立微调。
- [ ] 时长与起止双向联动正确（改 duration 反推 endTime，改 start/end 重算 duration）。
- [ ] 可从属性库拉取既有属性到当前卡。
- [ ] `npx eslint extension/` 0 errors；`npx vitest run --coverage` 达标。

## Out of Scope

- 模板（阶段 D）。属性/模板跨端同步（本机）。

## Notes

- 改动集中在 `extension/sidepanel.html/js/css` + `lib/model.js`。
- 详细设计见父任务 `design.md` §3/7。
