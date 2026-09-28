# 卡片自定义 emoji 图标 + 周视图高度优化

## Goal

每张卡片支持设置一个 emoji 作为该卡片的 icon（参考 tabshelf 的 emoji picker 交互）。
emoji 存卡片**顶层字段**，host SQLite 加列零丢失迁移、同步/merge/Obsidian 双向同步携带。
同时调高周视图列内部高度，容纳更多卡片。

## 背景与现状

- 卡片类型收敛后 icon 是固定的：`text → 📝`、`task → ☑️`（`typeIcon()`）。
- tabshelf 有完整的 emoji picker（`extension/lib/emoji.js` + `emoji-data.js`，205KB/1665 条，
  中英搜索 + 最近使用 + 分类）。journal 是轻量扩展，不引入 205KB 库。
- host 已有多轮「零丢失加列迁移」成熟模式（tags / meta），照抄即可。
- 周视图 `.calview-week-col` `min-height: 320px`（宽屏 420px），卡片区可再增高。

## Requirements

1. **卡片 emoji 字段**
   - 卡片顶层字段 `emoji`（string，默认 '' 表示用类型默认图标）。
   - 前端 `model.js createCard`、host `storage.js`（COLUMNS + init 迁移 + rowToCard +
     upsert + applyCardPatch）、`sync/merge.js normalizeCard` 都加该字段（LWW 自动携带）。
   - Obsidian 双向同步 `mdformat.js`：frontmatter 加 `emoji`，解析读回（同步不丢）。
2. **emoji 选择器（轻量）**
   - 编辑器内嵌 picker：**精选常用 emoji 集（~120-160 个）+ 自由输入文本框**。
   - 精选集按分类（表情/手势/动物/食物/活动/物品/符号/旗帜），复用 tabshelf 的
     数据子集（从 emoji-data.js 抽取常用项，生成 journal 版 `emoji-data.js`，几 KB）。
   - 交互：点 emoji 选中 → 预览；文本框可输入任意 emoji；已选高亮。
3. **icon 显示位全部支持 emoji**
   - `typeIcon(card)` 改为 `card.emoji || 类型默认`；影响：时间线卡片、卡片池、
     月/周历摘要、待办列表（todo 项也要带 emoji）。
4. **周视图高度**
   - `.calview-week-col` min-height 提高（普通 ~380px，宽屏 ~480px），卡片区
     `.calview-week-cards` 相应适配。

## Acceptance Criteria

- [ ] 编辑器能选择 emoji（精选集 + 自由输入），保存后卡片带 emoji。
- [ ] 时间线卡片、卡片池、月/周历摘要、待办列表均显示自定义 emoji（无则类型默认）。
- [ ] 旧数据库（无 emoji 列）启动后自动加列，历史数据零丢失（verifyNoDataLoss 通过）。
- [ ] LWW 合并与 Obsidian 双向同步往返后 emoji 不丢。
- [ ] 周视图列更高，能容纳更多卡片。
- [ ] host 测试全绿（新增 emoji 相关用例）。

## Notes

- 改动横跨 host（storage/merge/mdformat）+ extension（model/sidepanel/css/html）。
- 精选 emoji 数据从 tabshelf 的 `emoji-data.js` 抽取生成，独立小文件。