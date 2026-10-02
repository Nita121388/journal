# 实施计划

## Step 1 — 推断模块 `extension/lib/prop-infer.js`
- [x] `RULES` 关键词表（日期/起止/数量/是否/状态/优先级/负责人/类型/标签/备注/项目…）→ {type, icon, options?}
- [x] `dedupeKey(name, existingKeys)`
- [x] `inferProp(name, {existingKeys})` → {key,label,icon,type,options,defaultValue,confidence}
- [x] 图标兜底链：RULES icon → `searchEmojis(name)` → `📄`
- [x] 验证：node 快速脚本跑几个样例（重要度/截止日期/备注/起止时间/未知词）

## Step 2 — 渲染改造 `sidepanel.js`
- [x] `renderTemplateBuilder`：去掉两个 group 盒子与标题，改为「内置行 + extra 行 + 添加行」扁平结构
- [x] `buildReqRow`：改为 `.tpl-prop-row.is-locked`（去掉 checkbox/label 结构，改图标+名称+值）
- [x] `buildExtraRow`：图标按钮 + 可双击名称 + 值 + 右键；保留拖拽；内置隐藏 ✕
- [x] 新增 `buildAddRow`：一行式添加行，点击新增
- [x] 图标点击 → 复用 emoji picker 改 `def.icon`
- [x] 双击属性名 → 内联 input，Enter/blur 确认、Esc 取消（只改 label）
- [x] 右键菜单：编辑属性 / 修改类型（切换重置 values）/ 上移 / 下移 / 移除（内置隐藏）
- [x] 切换类型后重置 `tplBuilderState.values[key] = defaultTplValue(newDef)`

## Step 3 — 样式 `sidepanel.css`
- [x] `.tpl-add-row`（同高、hover 高亮、虚线感）
- [x] `.tpl-prop-icon` / `.tpl-prop-name`（含编辑态 input 样式）
- [x] 行操作按钮 hover 显形
- [x] 右键菜单样式（复用 `.template-menu` 或新增 `.tpl-ctx-menu`）

## Step 4 — 验证
- [x] 手工/脚本核对：内置三件套仍恒存在且在最前；`saveTemplateBuilder` 输出格式不变
- [x] 核对 AC：扁平化 / 一行式添加 / 三种行内编辑 / 右键五项 / 推断样例 / key 去重改名不变 / 内置锁定
- [x] 回归：预填、编辑既有模板、拖拽排序、卡片编辑器属性行
- [x] lint（`extension/package.json` 的 eslint）

## Review Gates
- G1：Step 1 完成后跑样例验证推断输出
- G2：Step 2 完成后核对 PRD 全部 AC
- G3：Step 4 lint 通过 + 无回归后，才 commit

## Rollback
- 改动集中在模板构建器渲染 + 新增一个独立模块；回滚 = 还原 `sidepanel.js` 渲染段 + 移除新模块，prop-infer 独立无副作用
