# Implement: 数据存储架构重构

## 阶段 0：数据导出（前置，需用户配合）

- [ ] options 页新增「导出扩展数据」按钮
- [ ] 用户点击 → 导出 `chrome.storage.local` 的 journals → JSON 文件下载
- [ ] 用户把导出文件发给我（或放到项目目录）

## 阶段 1：数据模型 + 迁移工具

1. **migrate.mjs**（新文件，host/ 下）
   - 读 host 文件 + 导出 JSON
   - LWW 合并（updatedAt 比较）
   - 写回 host 文件（新格式）
   - 输出统计 + 备份

2. **跑迁移**：`node host/migrate.mjs <导出文件>`
   - 确认合并结果正确（两天内容都完整、无丢失）
   - 验证 host 文件新格式

## 阶段 2：host server.js 支持新模型

- PUT 接收 `{ markdown }` → 存 `{ content, createdAt, updatedAt }`
- GET 返回新格式
- 兼容旧格式读取（string → 补时间戳）

## 阶段 3：同步层重构（host-sync.js）

- pullFromHost：无条件拉取 + LWW 合并
- pushToHost：直接写 host，不写 storage
- startPushListener 适配新流程

## 阶段 4：扩展侧适配

- store.js：getJournal/saveJournal 支持新旧格式
- sidepanel.js：渲染时取 `content` 字段
- model.js：aggregateHeatmap 适配（值可能是 object）

## 阶段 5：验证

- [ ] `node --check` 全部改动文件
- [ ] host API 手动测试：PUT/GET/DELETE journals
- [ ] 扩展 UI：热力图/日历/TODO 正常显示新数据
- [ ] 无 chrome.storage 直调（除了 store.js / 导出工具）
- [ ] dark mode 正常

## 风险与回滚

- 迁移前备份（已有 backup/2026-09-18/journal-data.json.bak）
- 迁移生成 migrate-result.json 可追溯
- 出错恢复备份
