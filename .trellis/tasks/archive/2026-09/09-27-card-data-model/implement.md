# 阶段A 数据模型地基 — 实施计划

## 清单

- [ ] 读规范：`python3 .trellis/scripts/get_context.py --mode packages`；trellis-before-dev 注入 backend/frontend 规范。
- [ ] `host/lib/storage.js`：
  - [ ] `COLUMNS` + schema + `init()` 加列迁移（`title/status/progress/duration/props/project`）。
  - [ ] `rowToCard`/`cardToValues` 新字段 + 状态推导 + project 回落 + duration 计算 + props 解析。
  - [ ] `buildCard`/`applyCardPatch` 新字段 + provenance + updatedAt。
  - [ ] `meta` 表封装：propertyLibrary/templates/savedViews。
- [ ] `host/sync/merge.js normalizeCard` + `mdformat.js`：新字段携带。
- [ ] `extension/lib/model.js`：`createCard` + 保留字集合 + typeIcon 调整。
- [ ] host 测试：迁移零丢失、状态推导、project、provenance、merge、mdformat 往返。
- [ ] 质量检查 + 提交。

## 验证

```bash
cd host && npm test
npx eslint host/ extension/
npx vitest run --coverage
```

## 风险文件

- `host/lib/storage.js`（迁移最危险）、`host/sync/mdformat.js`（往返）。
- 回滚：git revert；`.bak` 备份。
