# 阶段D 模板系统 — 技术设计

> 依赖阶段 A 的 `meta['templates']` 存储与阶段 C 的属性编辑器。详细见父任务 `design.md` §7。

## 模板结构

```
Template = { id, name, emoji, propsDefaults:{key→value},
             project, tags[], status, include:{emoji,props,project,tags,status} }
```

- 持久化：host `meta['templates']`（JSON 数组），前端镜像。
- `include` 控制保存模板时勾选哪些维度。

## 保存模板

- 编辑器「保存为模板」：捕获当前 `emoji/status/project/tags/props 值` → 表单填名称 + 勾选包含项 → 调用 store 保存。
- 重名覆盖或生成新 id（保存时确认）。

## 用模板新建

- 卡片池「模板▾」菜单：空白卡片 + 各模板（显示 emoji + 名称 + 摘要 chips）。
- 选中 → `createCard` 预填 `props = 模板.propsDefaults`、`emoji/project/tags/status`（按 include）→ 打开编辑器。

## 模板管理

- 「模板▾」底部「管理模板…」：列表重命名/删除/新建入口。

## 验证

```bash
npx eslint extension/
npx vitest run --coverage
# 手动：存模板→新建→管理
```