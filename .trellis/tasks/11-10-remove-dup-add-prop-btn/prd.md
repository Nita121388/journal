# 编辑器删冗余「新建自定义属性」常驻按钮

## Goal

卡片编辑器里「＋ 新建自定义属性」常驻按钮（`#btn-add-prop`）与「＋ 添加属性」浮层最后一项
「＋ 新建自定义属性…」指向**同一个** `addEditorProp()` 行内命名流程——删常驻按钮，
统一到「添加属性」浮层这一个入口。

## Requirements

- 删编辑器 HTML 段的 `.props-add-row-wrap` + `#btn-add-prop`（sidepanel.html）。
- 删 `bind-editor.js` 的 click 绑定与 `dom-refs.js` 的 `btnAddProp` 引用。
- `addEditorProp()` **保留**（浮层 `onPickNew` 仍在用），行内命名流程不动。
- 空态提示文案改为指向「＋ 添加属性」浮层（editor-props.js `renderEmpty`）。
- 删 `.props-add-row-wrap` / `.props-add-main` CSS（全站仅此一处使用）。
- dev-loop editor 场景补断言：编辑器内无 `#btn-add-prop`；「添加属性」浮层仍含「新建自定义属性…」。

## Out of Scope

- 模板构建器侧同名入口（`template-fields.js:startAddProp`）——模板上下文没有「添加属性」浮层，不冗余。

## Acceptance Criteria

- [x] 编辑器内不存在 `#btn-add-prop` / `.props-add-row-wrap`，全站无残留引用（grep 0 命中，模板构建器侧除外）。
- [x] 「＋ 添加属性」浮层最后一项「＋ 新建自定义属性…」仍可新建行并进入行内命名。
- [x] 空态提示指向新入口。
- [x] `npm run lint` / `npm --prefix extension test` / dev-loop editor 场景通过。
- [x] 已同步 dev 部署目录。
