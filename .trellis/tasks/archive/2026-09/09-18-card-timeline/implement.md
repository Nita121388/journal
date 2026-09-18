# Implement: 时间线卡片系统

## 阶段划分

| 阶段 | 内容 | 依赖 | 产出文件 |
|---|---|---|---|
| 0 | 数据模型层 (model.js) | 无 | `extension/lib/model.js` |
| 1 | Host API 升级 (server.js) | 无 | `host/server.js` |
| 2 | 存储层重构 (store.js) | 阶段 1 | `extension/lib/store.js` |
| 3 | 同步层适配 (host-sync.js) | 阶段 2 | `extension/lib/host-sync.js` |
| 4 | 右侧时间线 UI (sidepanel.html/css/js) | 阶段 2 | `extension/sidepanel.html`, `.css`, `.js` |
| 5 | 左侧卡片池 UI | 阶段 4 | `extension/sidepanel.html`, `.css`, `.js` |
| 6 | 日历/热力图联动 | 阶段 4 | `extension/sidepanel.js` |
| 7 | 迁移现有数据 + 验证 | 阶段 3 | `host/data/journal-data.json` |

**阶段 0 和 1 可并行**，其余按序。

## 阶段 0: model.js — 纯函数

新增/修改函数：
- `createCard(patch)` — 返回新 Card 对象（自动生成 id、时间戳）
- `groupCardsForTimeline(cards)` — 按时间段分组（5分钟窗口并列）
- `countCardsByDay(cards)` — `Record<dayKey, number>`
- `getCardTypeCounts(cards, date)` — `{text, task, idea}`
- `migrateOldJournals(oldJournals)` — 旧格式 → Card[]
- `migrateOldTodos(oldTodos)` — 旧格式 → Card[]
- 更新 `aggregateHeatmap` 接受 Card[] 直接推导

验证：`node --check extension/lib/model.js`

## 阶段 1: server.js — Host API

新增路由：
- `GET /api/cards` — 返回 `data.cards` 数组
- `POST /api/cards` — 创建卡片，返回新卡片
- `PUT /api/cards/:id` — 更新卡片（PATCH 语义），返回更新后卡片
- `DELETE /api/cards/:id` — 删除卡片
- 保留 `/api/journals/*` 兼容（GET 返回空或旧数据；PUT 转为创建 text 卡片）

卡片 ID 格式：`c_<timestamp>`（`crypto.randomUUID()` 前缀）

data.json 默认值加 `cards: []`。

验证：
- `node --check host/server.js`
- 手动测试：`curl http://127.0.0.1:8765/api/cards` 确认返回数组
- 手动测试：`POST /api/cards` → `PUT /api/cards/:id` → `DELETE /api/cards/:id`

## 阶段 2: store.js — 存储层

新增函数：
- `getAllCards()` — 从缓存读，若为空则触发迁移
- `getCardsByDate(date)` — 过滤 assignedDate === date
- `getCardPool()` — 过滤 assignedDate === null
- `createCard(patch)` → 调 `POST /api/cards` + 写缓存
- `updateCard(id, patch)` → 调 `PUT /api/cards/:id` + 写缓存
- `deleteCard(id)` → 调 `DELETE /api/cards/:id` + 写缓存
- `migrateIfNeeded()` — 检测缓存中是否有旧 journals/todos，迁移为 cards 并写回

旧 `getAllJournals()` / `saveJournal()` / `getJournal()` 保留兼容，内部委托 cards。

验证：`node --check extension/lib/store.js`

## 阶段 3: host-sync.js

- `pullFromHost()` 改为拉取 `GET /api/cards` 并存入缓存 `cards` 键
- 其余不变

验证：`node --check extension/lib/host-sync.js`

## 阶段 4: 右侧时间线 UI

HTML 改动：
- `<section id="journal-section">` 重命名为 `<section id="timeline-section">`
- 内含：日期标题 `#timeline-date-header`、滚动容器 `#timeline-container`、新建按钮 `#btn-add-card`
- 移除旧 `<textarea id="journal-input">`

CSS 新增：
- `.timeline-slot` — 单个时刻行（flex 布局：时间标签 + 圆点 + 卡片区域）
- `.timeline-cards` — 卡片并列容器（最多 2 列 grid）
- `.timeline-card` — 卡片样式（圆角卡片，accent 边框 hover）
- `.timeline-dot` — 时间点指示（●/○）
- `.timeline-dot.is-empty` — 空心圆，cursor: pointer
- `.timeline-card.is-editing` — 编辑态样式

JS 新增 `renderTimeline(date)`：
1. 调 `getCardsByDate(date)` 获取当天卡片
2. 调 `groupCardsForTimeline()` 分组
3. 生成时间刻度（每 30 分钟），有卡片的 slot 显示卡片，无的显示空心圆
4. 绑定事件：点击空心圆 → 弹出创建；点击卡片 → 编辑；保存 → `updateCard()`

新建卡片交互：
- 底部 `#btn-add-card` 点击 → `createCard({ assignedDate: selectedDate, time: currentTime })`
- 空心圆点击 → 弹出 `#mini-card-editor`（绝对定位 overlay），输入后保存

验证：
- `node --check extension/sidepanel.js`
- UI 手动测试：点击空时间点创建卡片，卡片出现在时间线
- UI 手动测试：点击卡片进入编辑，点击外部保存

## 阶段 5: 左侧卡片池 UI

HTML 新增：在 `#sidebar` 内，日历之前插入 `<section id="cardpool-section">`

CSS 新增：
- `.cardpool-item` — 池内卡片行（小卡片样式）
- `.cardpool-schedule-btn` — 📅 安排按钮

JS 新增 `renderCardPool()`：
1. 调 `getCardPool()` 获取未安排卡片
2. 渲染列表，绑定事件
3. 点击卡片 → 弹出日期选择器，选择后调 `updateCard(id, { assignedDate })`
4. 点击 `#btn-new-card` → 创建空卡片并进入编辑
5. 卡片池更新后调 `renderCalendarView()` + `renderHeatmap()` 刷新左侧

验证：
- UI 手动测试：创建池卡片，安排到日期，卡片池 -1，日历 +1

## 阶段 6: 日历/热力图联动

改动：
- `renderCalendarView()` 的背景色逻辑改为按卡片数着色（0→透明，5+→主色绿）
- `renderHeatmap()` 改为按卡片数分 6 档着色
- 热力图 hover 显示 tooltip（日期 + 卡片数 + 类型分布）
- 点击日历某天 → `updateSelectedDate()` → 切换右侧时间线
- 点击热力图某天 → 同上

验证：
- 热力图 hover 显示正确卡片数
- 日历格子颜色按卡片数渐变
- 点击日历/热力图切换右侧时间线

## 阶段 7: 迁移 + 最终验证

1. 启动扩展，触发 `migrateIfNeeded()` 将旧 journals/todos 迁移为 cards
2. 验证 host 文件中 cards 数组非空，旧 journals/todos 数据已转换
3. 验证旧备份 `backup/2026-09-18/journal-data.json.bak` 完整
4. 全量语法检查：`node --check` 所有改动文件
5. 手动测试全流程：创建池卡片 → 安排到日期 → 时间线显示 → 热力图更新
6. 测试暗色模式下所有新 UI 组件
7. 测试窄屏响应式（<720px 单栏）

## 验收 checklist

- [ ] `node --check` 全部 JS 文件通过
- [ ] host API 全部路由手动测试通过
- [ ] 时间线按时间顺序渲染卡片，时间刻度可见
- [ ] 同时间卡片并列显示（2列）
- [ ] 点击空时间点可创建卡片
- [ ] 卡片编辑保存正常
- [ ] 卡片池创建/安排功能正常
- [ ] 日历格子按卡片数着色
- [ ] 热力图按卡片数分档着色
- [ ] 热力图 hover tooltip 正确
- [ ] 点击日历/热力图切换时间线正常
- [ ] 旧数据迁移不丢失内容
- [ ] 暗色模式下 UI 正常
- [ ] 窄屏单栏布局正常
