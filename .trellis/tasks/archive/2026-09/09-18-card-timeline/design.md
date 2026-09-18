# Design: 时间线卡片系统

## 架构概览

```
┌─ Host (权威源) ─────────────────────────────┐
│  host/data/journal-data.json                │
│  { cards: Card[], todos:[], settings:{} }   │
└─────────────────────────────────────────────┘
       ↑ PUT/GET (HTTP 8765) ↑ 拉取覆盖
┌─ 扩展层 ────────────────────────────────────┐
│  store.js ── card CRUD，直写 host + 写缓存  │
│  host-sync.js ── 启动拉取，写 host 后同步缓存│
│  model.js ── 纯函数：聚合热力图/卡片数/时间线│
│  sidepanel.js ── UI 渲染 + 事件绑定         │
│  sidepanel.html/css ── 双栏看板布局          │
└─────────────────────────────────────────────┘
```

## 数据模型

### Card 类型

```ts
interface Card {
  id: string;          // "c_<timestamp>"
  content: string;     // 纯文本
  type: "text" | "task" | "idea";
  done: boolean;       // 仅 task
  assignedDate: string | null;  // "YYYY-MM-DD" | null
  time: string | null;          // "HH:MM" | null
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}
```

### Host 文件结构（升级后）

```json
{
  "cards": [ ... ],
  "settings": { "theme": "auto" },
  "todos": [],
  "journals": {}
}
```

`todos` 和 `journals` 保留但不再写入，迁移后逐步废弃。

### 缓存结构

`chrome.storage.local` 存储 `{ cards: Card[] }`（与 host 同结构）。

## 迁移策略

1. 读取旧 `journals[dayKey]`：`typeof v === "string"` → `card = { id, content: v, type: "text", done: false, assignedDate: dayKey, time: null, createdAt, updatedAt }`
2. 读取旧 `todos[]`：每个 todo → `card = { id, content: todo.title, type: "task", done: todo.done, assignedDate: todo.due, time: null, createdAt: now, updatedAt: now }`
3. 迁移脚本在 store.js 的 `getAllCards()` 中处理（读到旧格式即迁移写回）

## 接口变更

### store.js

```js
// 读
getAllCards()          // Card[]
getCardsByDate(date)   // Card[] — 某天的卡片
getCardPool()          // Card[] — assignedDate === null
getHeatmapData()       // Record<dayKey, number> — 每天卡片数

// 写
createCard(patch)      // Card — 新建卡片
updateCard(id, patch)  // Card — 更新内容/类型/done/time/assignedDate
deleteCard(id)         // void
```

所有写操作：直写 host + 写缓存（与现有 store.js 模式一致）。

### host/server.js

- 新增 `POST /api/cards` — 创建卡片
- 新增 `PUT /api/cards/:id` — 更新卡片
- 新增 `DELETE /api/cards/:id` — 删除卡片
- `GET /api/cards` — 返回全部卡片
- `PUT /api/cards/:id/move` — 移动卡片到新日期/时间
- 保留旧 `/api/journals/*` 兼容（GET 返回空，PUT 转为创建 text 卡片）

### model.js

```js
getCardsByDate(cards, date)      // 过滤 assignedDate === date，按 time 排序
groupCardsForTimeline(cards)     // 按时间段分组（5分钟窗口内并列）
countCardsByDay(cards)           // Record<dayKey, number> — 热力图数据
getCardTypeCounts(cards, date)   // {text, task, idea} 按天统计
```

## 并列判定算法

```
function groupCardsForTimeline(cards):
  sorted = cards.sort(by time asc, createdAt asc)
  groups = []
  for card in sorted:
    if card.time is null:       // 无时间的卡片，归入"全天"组
      groups.push([card])
    elif last group exists AND last group's time within 5 min of card.time:
      last group push card      // 并列
    else:
      groups.push([card])
  return groups  // Array<{time, cards: Card[]}>
```

## UI 组件拆分

### 右侧面板 (Journal Section)

```
<div id="timeline-section">
  <div id="timeline-date-header">📅 2026-09-18 · 3 张卡片</div>
  <div id="timeline-container">
    <!-- 时间轴渲染区域 -->
    <!-- 由 sidepanel.js 的 renderTimeline() 动态生成 -->
  </div>
  <button id="btn-add-card">＋ 在当前时间新建卡片</button>
</div>
```

### 时间轴单元格 (单个时刻)

```
<div class="timeline-slot" data-time="09:30">
  <div class="timeline-time">09:30</div>    <!-- 时间标签 -->
  <div class="timeline-dot"></div>            <!-- ● 或 ○ -->
  <div class="timeline-cards">               <!-- 卡片列表（1-2列） -->
    <div class="timeline-card" data-id="c_xxx">
      <div class="card-header">
        <span class="card-type-icon">📝</span>
        <span class="card-time">09:31</span>
        <span class="card-meta">47 字</span>
      </div>
      <div class="card-body" contenteditable>
        LiCASmart 客户端问题调查...
      </div>
      <div class="card-footer">
        <button class="card-type-toggle">📝</button>
        <button class="card-done-toggle" hidden>✅</button>
        <button class="card-delete-btn">×</button>
      </div>
    </div>
  </div>
</div>
```

### 左侧卡片池面板

```
<section id="cardpool-section">
  <div class="section-header">
    <span class="section-label">🃏 卡片池 (3)</span>
  </div>
  <ul id="cardpool-list">
    <li class="cardpool-item" data-id="c_xxx">
      <span class="cardpool-type">☑️</span>
      <span class="cardpool-text">回复老王</span>
      <button class="cardpool-schedule-btn">📅</button>
    </li>
  </ul>
  <button id="btn-new-card">＋ 新卡片</button>
</section>
```

## 关键交互流

### 点击空时间点创建卡片

```
用户点击 10:30 空心圆
  → sidepanel.js 监听 click on .timeline-dot.is-empty
  → 弹出 mini-card-editor overlay（绝对定位，在点击位置附近）
  → 用户输入内容，选择类型
  → 点击保存 → createCard({ time: "10:30", assignedDate: selectedDate, ... })
  → re-render timeline
```

### 卡片池安排卡片到日期

```
用户点击卡片池卡片的 📅 按钮
  → 弹出日期选择器（mini calendar popover）
  → 选择日期 → updateCard(id, { assignedDate: chosenDate, time: null })
  → 卡片池 -1，日历 +1
  → 切换到目标日期的时间线
```

### 卡片类型切换

```
点击卡片的类型图标 → 循环切换 text → task → idea → text
  → updateCard(id, { type: nextType })
  → 切换为 task 时显示 done 复选框
```

## 热力图/日历联动

```
aggregateHeatmap() 从 getAllCards() 推导：
  dayKey → count of cards with assignedDate === dayKey

点击日历/热力图某天 → updateSelectedDate(dayKey) → 重新渲染右侧时间线
```

## 兼容性保障

- host server 保留 `/api/journals/*` 接口（旧格式读写自动转换）
- `startPushListener()` 仍为 no-op（写走 store.js → host-sync → host）
- 旧导入数据（JSON）兼容：import 时检查 `journals` 键并迁移
- 旧导出工具：导出 `cards`（新格式），不导出旧 `journals`/`todos`
