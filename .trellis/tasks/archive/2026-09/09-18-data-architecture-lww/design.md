# Design: 数据存储架构重构

## 数据模型变更

### 新模型

```js
// host 数据文件格式
{
  "journals": {
    "2026-09-18": {
      "content": "1. 分析性能数据\n- 本周多版本对照...",
      "createdAt": "2026-09-18T10:30:00.000Z",
      "updatedAt": "2026-09-18T14:20:00.000Z"
    }
  },
  "todos": [...],
  "settings": {...}
}
```

### 旧模型兼容

读取时判断类型：
- 若值是 `string` → 旧格式，补时间戳：`{ content: oldString, createdAt: todayMidnight, updatedAt: todayMidnight }`
- 若值是 `object` 且有 `content` 字段 → 新格式，直接用

## 同步层变更（host-sync.js）

### pullFromHost（启动时）

- **无条件拉取**：读 host 全量 journals，覆盖 chrome.storage.local
- LWW 合并逻辑：对同一天，比较 `updatedAt`，取更大的那个
- 离线降级：host 离线时保留缓存，下次启动再拉

### pushToHost（扩展编辑时）

- **直接写 host**：扩展编辑时通过 `PUT /api/journals/{day}` 写 host
- 不再写 chrome.storage.local（存储由权威层管理）
- host 接口不变：`{ markdown: "content" }`（host server 侧负责加时间戳）

## host server.js 变更

- PUT `/api/journals/{day}` 接收 `{ markdown }` 时，自动加时间戳：
  - 新条目：`createdAt = now, updatedAt = now`
  - 更新已有条目：保留原 `createdAt`，`updatedAt = now`
- GET `/api/journals/{day}` 返回新格式对象
- GET `/api/journals` 返回全量新格式

## 迁移工具（migrate.mjs）

1. 读取 host 文件 + 用户导出的扩展数据 JSON
2. 对同一天：取 `updatedAt` 更大的内容（旧格式按今天处理）
3. 两边独有的天直接保留
4. 结果写回 host 文件（带时间戳）
5. 输出合并统计

## 回滚点

- 数据迁移前备份 → `backup/2026-09-18/`
- 每次迁移生成 `migrate-result.json`（可追溯）
- 若迁移后出问题：恢复 `journal-data.json.bak` 即可
