# 技术设计

## 数据兼容

新卡片保存 `startTime` 和 `endTime`；旧 `time` 作为兼容回退。统一通过纯函数读取：`getCardStartTime(card)`、`getCardEndTime(card)`。旧卡片的结束时间为开始时间 + 15 分钟，不强制批量迁移。

## 时间画布

时间线由左侧 15 分钟刻度层和右侧日程画布组成。画布固定起点 08:00，`SLOT_HEIGHT` 表示 15 分钟高度。卡片使用绝对定位：

- `top = (start - 08:00) / 15 * SLOT_HEIGHT`
- `height = duration / 15 * SLOT_HEIGHT`
- lane 由区间重叠算法分配

同一重叠连通分组内按开始时间排序，使用最早可复用 lane；卡片 `left/width` 依据该分组 lane 数计算。

## 拖拽

卡片底部放置 resize handle，使用 Pointer Events。拖动距离转换为分钟并四舍五入到 15 分钟，只更新 `endTime`，不得短于 `startTime + 15`。pointer capture 防止拖出卡片后丢失事件；完成后调用现有 store 更新接口并刷新。

## 编辑器

新增 `input type=time` 开始/结束字段。新建默认开始时间为点击时间吸附值、结束时间 +15 分钟；编辑旧卡片时按兼容读取值填充。保存前校验并吸附。

## 视觉与回归

保留当前时间 marker 的绿色视觉语义；marker 置于画布对应位置。卡片主体 click 编辑，handle 阻止 click 冒泡。时间线容器继续内部滚动，卡片内容超出时截断/滚动但不改变时间高度。
