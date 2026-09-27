# 阶段B 统一卡片池 UI — 技术设计

> 依赖阶段 A 的 `status/props` 语义。详细视图模型见父任务 `design.md` §6。

## 视图模型

```
View = { id, name, layout:'card'|'list', size:'compact'|'wide'|'full',
         columns:[], sort:{key,dir}, filters:[(key,op,value)] }
```

- 持久化 `meta['savedViews']`（host）+ 前端镜像。
- 默认视图 = 卡片布局 + 紧凑 + 无筛选。

## 筛选器（schema 驱动）

- 可用维度 = 内建字段集 ∪ 属性库属性 ∪ 只读元数据(updatedAt/provenance.origin/deviceId)。
- 每维度按类型给 UI：select/multi→下拉多选；checkbox→是/否；number→范围；text→包含；date→范围/相对(今天/本周)。
- 组合 = AND；`待办` 预设按钮 = `status∈{todo,doing}`，与其它条件叠加。
- 保留 `status` 多选（none/todo/doing/done 可多选）。

## 渲染

- 卡片视图：CSS grid，色块按 `status`（none=灰/蓝、todo=琥珀、doing=蓝、done=绿淡化）+ 可选按属性高亮。
- 卡片内容：emoji、title(回落 content)、状态徽章、progress 条、priority、project、关键属性 chips、标签。
- 列表视图：行 = 列模型（内建列 + props 列 + 只读元数据列），支持显隐、拖排序；只读列 `readonly` 标记不渲染编辑控件。
- 空态 / 计数徽章。

## 尺幅

- 复用现有 `btn-wide-mode` 三态逻辑：auto/wide/full；`full` 为覆盖层 `position:fixed` 大卡片池容器。
- 容器 `aria` + 可滚动。

## 命名视图

- 顶部「视图▾」：当前视图名 + 保存/另存/管理(重命名/删除)。
- 切换 = 应用 View 状态并重渲染。

## 组件拆分（前端规范：render 纯函数、textContent 优先）

- `renderCardPool(cards)`、`renderFilterBar(availableProps)`、`renderCardCard(card)`、`renderCardRow(card, columns)`、`renderViewMenu(views)`。
- 筛选/排序/视图逻辑入 `lib/model.js`（纯函数，可测）。

## 验证

```bash
npx eslint extension/
npx vitest run --coverage
# 手动：重载扩展 → 统一卡片池 → 筛选/布局/尺幅/命名视图
```
