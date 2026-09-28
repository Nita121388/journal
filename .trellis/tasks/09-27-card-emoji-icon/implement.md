# 卡片 emoji 图标 + 周视图高度 — Implement

## 前置
- PRD / Design：`09-27-card-emoji-icon/`

## 步骤（顺序执行）

### A. host 数据层
1. `host/lib/storage.js`：
   - `COLUMNS` 数组加 `'emoji'`
   - `rowToCard` 加 `emoji: parseEmojiCell(r.emoji)`（或 str 兜底）
   - `cardToRow`（写库）加 `emoji: c.emoji ?? ''`
   - `applyCardPatch`：`if (patch.emoji !== undefined) next.emoji = ...`
   - `init()` 加 `emoji` 列迁移（照抄 meta 模式）
   - JSON 回退实现同步
2. `host/sync/merge.js`：`normalizeCard` 加 `emoji: str(card.emoji) ?? ''`
3. `host/sync/mdformat.js`：写 frontmatter `emoji`、解析 `props.emoji`
4. `host/test/`：storage 测试加 emoji 加列/零丢失用例；mdformat 往返加 emoji

### B. 前端 emoji 数据与 picker
5. 新建 `extension/lib/emoji-data.js`（精选 ~150 个，从 tabshelf 抽取）
6. 新建 `extension/lib/emoji.js`（分类网格 + 最近使用 + 自由输入渲染）
7. `extension/sidepanel.html`：编辑器加 emoji 行（按钮+预览+picker 容器）
8. `extension/sidepanel.js`：
   - `model.js createCard` 加 emoji 字段
   - openEditor/saveEditor 读写 emoji；picker 交互
   - `typeIcon` 支持 emoji
   - 时间线卡片 header、卡片池、月/周历摘要、待办列表显示 emoji
   - `getTodos()` map 带 emoji
9. `extension/sidepanel.css`：picker 样式 + 周视图高度（380/480）

### C. 验证
```bash
node --check extension/sidepanel.js extension/lib/emoji.js extension/lib/model.js
cd host && npm test
```

## Review gate
- 无 emoji 卡片 icon 不变（类型默认）
- 历史库加列后数据零丢失
- 同步往返 emoji 保留

## Rollback
数据层字段新增，revert 后老版本读不到 emoji 列（迁移幂等，重建即可）；
前端文件 revert 无数据影响。