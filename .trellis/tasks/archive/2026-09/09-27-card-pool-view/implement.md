# 阶段B 统一卡片池 UI — 实施计划

## 清单

- [ ] 读规范 trellis-before-dev（frontend）。
- [ ] `sidepanel.html`：统一卡片池容器 + 筛选栏 + 视图菜单；删除旧待办区。
- [ ] `lib/model.js`：View 类型、`applyFilters(cards, filters)`、`sortCards`、状态色、`availableFilterDims`。
- [ ] `sidepanel.js`：渲染统一卡片池（卡片/列表）、筛选交互、布局/尺幅切换、命名视图保存/切换。
- [ ] `sidepanel.css`：多色卡片、grid/列表、尺幅、覆盖层全屏。
- [ ] 质量检查 + 提交。

## 验证

```bash
npx eslint extension/
npx vitest run --coverage
# 手动验收
```

## 风险文件

- `extension/sidepanel.js`（大改）、`extension/sidepanel.css`。
- 回滚：git revert。
