# 类型收敛 + 卡片池类型筛选 — Implement

## 前置
- PRD / Design：`09-26-card-pool-todo-filter/`

## 步骤
1. `extension/sidepanel.html`：编辑器类型下拉移除 `<option value="idea">💡 灵感</option>`。
2. `extension/lib/model.js`：`getCardTypeCounts` 改为 `{text, task}`，idea 计入 text。
3. `extension/sidepanel.js`：
   - `typeIcon`：`idea` 回落 📝（删除 `idea === '💡'` 分支）。
   - 两处 `typeCounts.idea` 文案（renderTimeline / viewHeaderLabel）并入 text 显示。
   - footer「🔄」循环改 `text ↔ task`。
   - 新增 `poolTypeFilter` + `renderPoolTypeFilters()`（全部/文本/任务(待办)），
     渲染在卡片池顶部、与标签筛选 AND 叠加。
4. `extension/sidepanel.css`：`.calview-summary.type-idea` 样式并入 `.type-text`；
   类型筛选条样式（复用 `.cardpool-tag-filters` / `.tag-chip` 现有样式）。

## 验证命令
```bash
node --check extension/sidepanel.js
node --check extension/lib/model.js
cd host && npm test        # 本次不改 host，应全绿
```

## Review gate
- 无任何 `'💡'` 图标残留；编辑器下拉只有两选项。
- 存量 idea 卡显示为 📝；卡片池类型筛选生效；标签+类型可叠加。
- 待办区块行为不变。

## Rollback
改动纯前端 + model.js 计数口径，revert 即可；无数据写操作。