# 卡片类型退场：编辑器 / 时间线去掉「文本 · 任务 · 想法」

> 用户 2026-11-09 拍板：**方案 A（UI 退场，数据保留）** + 两个默认值（完成按钮常驻、旧任务卡保留 `type='task'`）。

## 背景

`类型`（`text | task | idea`）是**模板功能出现之前的分类手段**。现在卡片形态由模板承担
（模板决定字段集/默认值），再让用户在每个弹窗里选一次「文本/任务/想法」是重复分类，
且它是 P5「默认最小集」里唯一一个纯历史包袱。

实测全链路后，`type` 今天只剩**一个真实行为**与若干外观：

| 位置 | 作用 | 处置 |
|---|---|---|
| `views/timeline-card.js:293` | `type==='task'` 才显示「✅完成/↩️撤销」 | 改为按 `status` 常驻 |
| `views/timeline-card.js:312` | 页脚「🔄 切换类型」按钮 | 删除 |
| `views/timeline-card.js:105` | `type==='task'&&done` → 正文删除线 | 改 `status==='done'` |
| `views/calendar-card.js:79,176` | pill 类名 `type-*` + `is-done` | 类名不产样式，删除；`is-done` 改 `status` |
| `views/pool.js:206` / `timeline-card.js:85` | 卡片图标 `typeIcon()` → 📝☑️💡 | 改「用户 emoji，否则 `note` SVG」 |
| `host/lib/storage.js:50,133` | `status` 缺失时 `statusFromTypeDone()` 推导 | **保留**，仅历史/导入兜底 |

已确认 `.type-task/.type-text/.type-idea` **没有任何 CSS 消费**（只有 `.is-done` 有样式）。

## 需求

| # | 需求 |
|---|---|
| R1 | 编辑器头部删除「类型」下拉（`#card-editor-type` 及其所在子行）；保留「模板」入口 |
| R2 | 保存不再从下拉读 `type`：新卡写 `'text'`；**编辑既有卡时保留其原 `type`**（不把旧任务卡降级） |
| R3 | 时间线卡片页脚删除「🔄 切换类型」按钮 |
| R4 | 「完成 / 撤销完成」按 `status` 常驻显示：点完成 → `status:'done'` + `done:true` + `progress:100`；点撤销 → `status:'todo'` + `done:false` |
| R5 | 正文删除线 / 日历 pill 变灰改由 `status === 'done'` 判定（`done` 仍同步写入） |
| R6 | 卡片图标：`card.emoji` 有值用 emoji，否则用 `icon('note')` 线稿 SVG（清除 📝☑️💡 这组功能 emoji） |
| R7 | `shared/format.js:typeIcon` 退出视图调用（保留导出与测试一个版本，标注 deprecated） |
| R8 | 数据零迁移：`type` 字段、`done` 字段、DB 列、同步 Markdown 格式全部不变；`statusFromTypeDone` 保留 |

## 非目标

- 不删 `type` 列、不改同步格式、不改 Todoist 导入（其 `type:'task'` 仍写入，只是不再有 UI 入口）。
- 不改模板构建器与字段注册表。
- 不重做卡片池筛选（「待办」筛选仍按 `statusMatches(card,'active')`）。

## 验收标准

1. `#card-editor` 内不存在 `#card-editor-type`；弹窗内无「文本/任务/想法」文案。
2. 时间线卡片页脚无「切换类型」按钮；有「标记完成」按钮且与 `status` 双向同步。
3. 新建卡 `type === 'text'`；编辑一条 `type==='task'` 的旧卡保存后 `type` 仍为 `'task'`。
4. 卡片池与时间线卡片图标不再出现 📝 / ☑️ / 💡（emoji 白名单：用户自选 emoji）。
5. `grep -rn "typeIcon(" extension/views extension/features` 为空。
6. dev-loop `editor`（新增 3 条断言）+ `tpl` / `smoke` / `options` / `select` / `shell` 全绿（320/400）。
7. `npm run lint` 0 error、`npm test` 全绿。
