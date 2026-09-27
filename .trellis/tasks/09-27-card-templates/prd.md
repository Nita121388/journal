# 阶段D 模板系统

## Goal

把当前卡片的（emoji + 属性集合 + 默认值 + 项目 + 标签 + 状态）存成**命名模板**，新建卡时一键套用；支持模板管理。

## Requirements

- **R1 保存模板**：在编辑器内把当前状态捕获为模板，填写名称；可选包含 emoji/属性/默认值/项目/标签/状态。
- **R2 用模板新建**：卡片池「模板▾」列表展示命名模板 → 点击新建卡，预填默认属性和模板字段，进入编辑器直接改。
- **R3 模板管理**：增删改、重命名；模板持久化 `meta['templates']`（本机）。
- **R4 空白模板**：始终提供「空白卡片」选项（无预填）。

## Acceptance Criteria

- [ ] 编辑器可把当前卡存为命名模板。
- [ ] 卡片池「模板▾」列出现有模板 + 空白卡片；点模板新建卡预填默认属性。
- [ ] 模板可重命名/删除/编辑；持久化到 host meta。
- [ ] 用模板新建的卡保存后写入 `props`/字段正确。
- [ ] `npx eslint extension/` 0 errors；`npx vitest run --coverage` 达标。

## Out of Scope

- 模板跨端同步（本机）。属性库跨端同步。

## Notes

- 改动集中在 `extension/sidepanel.html/js` + `lib/model.js`（模板类型）+ host `meta['templates']` 读写。
- 详细设计见父任务 `design.md` §7。