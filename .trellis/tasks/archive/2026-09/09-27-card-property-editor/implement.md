# 阶段C 属性编辑器 — 实施计划

## 清单

- [ ] 读规范 trellis-before-dev（frontend）。
- [ ] `lib/model.js`：PropertyDef 结构、保留字集、`statusForProgress`/`durationFromTimes`/`endFromDuration`、`applyPropsPatch`。
- [ ] `sidepanel.html/js`：编辑器改属性驱动——内建区折叠 + 自定义属性区 + 「＋添加属性」表单 + 「从属性库＋」。
- [ ] `sidepanel.css`：属性行、各类型控件、进度条。
- [ ] 质量检查 + 提交。

## 验证

```bash
npx eslint extension/
npx vitest run --coverage
# 手动：加属性(各类型)/删/改、联动、属性库拉取
```

## 风险文件

- `extension/sidepanel.js`（编辑器大改）、`extension/lib/model.js`。
- 回滚：git revert。
