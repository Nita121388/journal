# 阶段D 模板系统 — 实施计划

## 清单

- [ ] 读规范 trellis-before-dev（frontend）。
- [ ] `lib/model.js`：Template 类型、`buildTemplateFromCard(card)`、`cardFromTemplate(tpl)`。
- [ ] host store：确认 `meta['templates']` 读写可用（阶段 A 已建，这里补前端联调）。
- [ ] `sidepanel.html/js`：编辑器「保存为模板」表单；卡片池「模板▾」菜单 + 新建；模板管理。
- [ ] `sidepanel.css`：模板菜单样式。
- [ ] 质量检查 + 提交。

## 验证

```bash
npx eslint extension/
npx vitest run --coverage
# 手动：存模板→模板▾新建→管理(重命名/删)
```

## 风险文件

- `extension/sidepanel.js`、`extension/lib/model.js`。
- 回滚：git revert。