# 技术设计：模板构建器属性行改造

## 1. 边界

本轮**只改模板构建器（`openTemplateBuilder` 渲染的那棵 DOM）**，不碰：
- 卡片编辑器的属性行（`renderEditorProps`）
- host / 数据格式 / 同步

新增一个纯函数模块 `extension/lib/prop-infer.js`（可被未来 AI 层复用）。

## 2. 数据结构

构建器状态基本沿用现有 `tplBuilderState`：

```js
tplBuilderState = {
  name, emoji,
  extra: [ { key, def: { key, label, icon, type, options? } } ],  // 顺序 = 显示顺序
  values: { [key]: defaultValue },
}
```

**key 语义（重要）**：key 是数据标识，创建时取属性名，后续**改名只改 `def.label`，key 永不变**。
去重：新建时若 `extra` 或属性库已存在同名 key，追加 `(2)`、`(3)`…

内置三件套 title/content/tags 继续走 `tplBuilderState.values`，不进 `extra`（保持 `normalizeTemplateFields` / `saveTemplateBuilder` 的 REQUIRED 前置逻辑不变）。

## 3. 渲染结构（替换 `renderTemplateBuilder`）

```
#tpl-prop-list.tpl-prop-list
  ├─ 内置行 ×3            （.tpl-prop-row.is-locked，扁平后无外框）
  ├─ extra 行 ×N          （.tpl-prop-row.tpl-extra-row，可拖拽）
  └─ 添加行 ×1            （.tpl-prop-row.tpl-add-row，一行式）
```

**删除**：`tpl-group` / `tpl-group-req` / `summary` / `tpl-group-title` 全部（必备组 + 额外组的盒子与标题）。
**新增**：`.tpl-add-row`（与 `.tpl-prop-row` 同高，hover 高亮，文字 `＋ 添加属性`，点击新增）。

行内结构（统一）：

```
.tpl-prop-row
  ├─ .tpl-prop-icon      图标按钮（点击开 picker）
  ├─ .tpl-prop-name      属性名（双击→变 input）
  ├─ .tpl-prop-value     默认值编辑器
  └─ .tpl-row-act*       悬停显形：✎ / ✕（内置行仅 ✎，或都靠右键）
```

## 4. 交互

| 交互 | 行为 |
|---|---|
| 点图标 | 复用 `renderEmojiPicker`（`lib/emoji.js`），选中即改 `def.icon` |
| 双击属性名 | 原位换成 `<input>`，Enter/blur 确认、Esc 取消；确认时若改名 → 只改 `def.label` |
| 右键行 | 弹菜单（复用 `template-menu` 定位模式 + 同样的 outside-click 关闭） |
| 点添加行 | 新增行 → `prop-infer.infer(name||'新属性')` → 进入属性名编辑态 |

**右键菜单项**：编辑属性 / 修改属性类型（子项或直接列类型）/ 上移 / 下移 / 移除（内置隐藏）。
菜单用 `position: fixed`，定位时贴右边界防溢出。

## 5. 推断模块 `lib/prop-infer.js`

```js
export function inferProp(name, { existingKeys = [] } = {})
  → { key, label, icon, type, options, defaultValue, confidence }
```

- **type/options**：`RULES` 关键词表，按 `name` 包含匹配（中文为主），首个命中即返回
- **icon**：先查 `RULES` 里的显式 icon；没有则 `searchEmojis(name)` 取第一个；再没有给 `📄`
- **key**：`dedupeKey(name, existingKeys)` → 重名加 `(2)`
- **confidence**：`rule`（命中规则）/ `fallback`（兜底）—— 供未来 AI 层决定是否升级

不发起任何网络请求；未来 LLM 层可作为「confidence 低时的兜底/增强」，接口不变。

## 6. 改动清单

| 文件 | 改动 |
|---|---|
| `extension/lib/prop-infer.js` | 新增：关键词表 + `inferProp` + `dedupeKey` |
| `extension/sidepanel.js` | 改 `renderTemplateBuilder` / `buildReqRow` / `buildExtraRow` / `buildAddPanel`；新增图标点击、双击改名、右键菜单、type 切换；移除分组渲染 |
| `extension/sidepanel.html` | 无需大改（构建器主体已是容器）；可能加一个菜单挂载点（用 document.body 动态建即可） |
| `extension/sidepanel.css` | 新增 `.tpl-add-row` / `.tpl-prop-icon` / `.tpl-prop-name` 编辑态 / 菜单样式；废弃 `.tpl-group*`（可留不删） |

## 7. 风险与兼容

- **`values` 与类型编辑器一致性**：切换类型必须重置 `tplBuilderState.values[key]`，否则旧值类型不匹配
- **保存格式不变**：`saveTemplateBuilder` 的 `requiredFields + extraFields`（含 label/icon/type/options override）逻辑不变，只因 UI 变化导致 override 更多
- **拖拽**：保留现有 `tpl-extra-row` draggable 机制，仅扁平化容器
- **回归风险点**：从当前卡预填、编辑既有模板的 def 恢复（`openTemplateBuilder` 中 extra 重建）—— 需验证内置三件套仍被识别为 required
