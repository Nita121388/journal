# 卡片 emoji 图标 + 周视图高度 — Design

## 数据字段
卡片新增顶层字段 `emoji`（string，默认 ''）。
- `extension/lib/model.js createCard`：`emoji: patch.emoji ?? ''`
- host `storage.js`：
  - `COLUMNS` 加 `'emoji'`
  - `init()` 加列迁移（照抄 tags/meta 模式：VACUUM INTO 备份 → ALTER TABLE →
    verifyNoDataLoss）
  - `rowToCard` / `cardToRow` / `applyCardPatch` / JSON 回退同加
- `sync/merge.js normalizeCard`：`emoji: str(card.emoji) ?? ''`（LWW 自动携带）
- `mdformat.js`：
  - 写入：frontmatter `emoji: <value>`（有值才写）
  - 解析：`props.emoji` → `current.emoji`（缺失默认 ''）

## 前端 emoji 数据（轻量）
- 新建 `extension/lib/emoji-data.js`：从 tabshelf `emoji-data.js` 抽取精选
  （每分类 ~15-25 个，共 ~150 个，含 `{e, n, c}`），几 KB。
- 新建 `extension/lib/emoji.js`：`EMOJI_DB` + `emojisByCat(cat)` + 简单渲染
  （分类 tab + 网格 + 最近使用(存 localStorage `journal.recentEmojis`) + 自由输入）。
- 不在编辑器里引入完整 205KB 库。

## 编辑器集成
- `sidepanel.html`：`card-editor` 内加 emoji 行：
  ```html
  <div class="card-editor-emoji">
    <button id="btn-pick-emoji" title="设置图标 emoji">🎨</button>
    <span id="emoji-preview" class="emoji-preview">📝</span>
    <div id="emoji-picker" class="emoji-picker hidden"></div>
  </div>
  ```
- `sidepanel.js`：
  - `editorEmoji` 状态；openEditor 读 `card.emoji`；saveEditor 写 `emoji`。
  - picker 点击选中 → 更新 preview + 状态；自由输入即时生效。
  - 清空按钮：恢复类型默认。

## icon 显示
- `typeIcon(card)` 改为接收 card（或 emoji）：
  `card?.emoji || (card?.type === 'task' ? '☑️' : '📝')`
- 调用点：时间线卡片 header、卡片池、月/周历 `.calview-summary`、待办列表
  （todosCache 项需带 emoji —— `getTodos()` map 加 `emoji: c.emoji`）。

## 周视图高度
- `.calview-week-col { min-height: 380px }`（宽屏 `html.wide-mode` 480px）
- `.calview-week-cards` 现有 `flex:1; overflow-y:auto` 自动适配。

## 回归要点
- 无 emoji 的卡片全部走类型默认图标，行为不变。
- 加列迁移失败自动回滚（现有模式），不丢历史数据。
- mdformat 往返：旧文件无 emoji 字段 → 默认 ''，不回写垃圾字段。