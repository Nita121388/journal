# 统一卡片系统重构 — 实施计划（父任务编排）

> 父任务拥有源需求集、任务地图、跨子任务验收与最终集成审查。各阶段按子任务实施，父任务在此串起顺序与验收。

## 执行顺序（依赖：A → B → C → D）

| 序 | 子任务 | 产出 | 验收门 |
|---|---|---|---|
| 1 | 阶段 A `card-data-model` | 数据层：列/迁移/属性库/模板存储/元数据 | `cd host && npm test` 全绿；零丢失校验通过 |
| 2 | 阶段 B `card-pool-view` | 统一卡片池：状态筛选/多色卡/列表卡片视图/尺幅/命名视图 | 手动验收 + eslint/vitest |
| 3 | 阶段 C `card-property-editor` | 属性编辑器 + 添加属性 + 进度/时长联动 | 手动验收 + eslint/vitest |
| 4 | 阶段 D `card-templates` | 模板保存/新建/管理 | 手动验收 + eslint/vitest |
| 5 | 父任务集成 | 全链路走查 + 同步/Obsidian 往返 + 零丢失复核 | 最终验收清单 |

## 每阶段实施清单（在各自子任务 implement.md 细化）

### 阶段 A（数据模型地基）
- [ ] `host/lib/storage.js`：`COLUMNS` + schema + init 加列迁移（title/status/progress/duration/props）+ rowToCard + cardToValues + applyCardPatch + LOSS_FIELDS。
- [ ] `buildCard`/`createCard`：status 推导（type+done→status）、title 回落、project 一等化、provenance 写入。
- [ ] `host/sync/merge.js normalizeCard` + `mdformat.js`：新增字段。
- [ ] host `meta` 表：propertyLibrary / templates / savedViews 读写接口。
- [ ] `extension/lib/model.js`：卡片模型、stateToStatus 推导、属性库/模板本地镜像。
- [ ] host 测试：加列迁移、状态推导、往返不丢。

### 阶段 B（统一卡片池 UI）
- [ ] 合并卡片池+待办为统一视图；删除旧待办区。
- [ ] schema 驱动筛选器（状态/优先级/项目/标签/日期/自定义属性/元数据）+ 待办预设。
- [ ] 多色卡片渲染（emoji/标题/状态/进度/关键属性）。
- [ ] 卡片/列表布局切换 + 紧凑/舒展/全屏尺幅（复用现有宽屏模式）。
- [ ] 命名视图保存/切换（meta['savedViews']）。

### 阶段 C（属性编辑器）
- [ ] 属性驱动编辑器：内建区 + 自定义属性区。
- [ ] 添加属性流程（名称/图标/类型/选项 → 加入卡片/属性库），保留字保护。
- [ ] 进度↔状态联动、时长↔起止双向。

### 阶段 D（模板系统）
- [ ] 保存模板（捕获当前编辑器状态）。
- [ ] 用模板新建（预填默认属性）。
- [ ] 模板管理（增删改/重命名）。

## 验证命令

```bash
cd host && npm test              # node:test，含新增字段用例
npx eslint host/                 # 0 errors
npx eslint extension/            # 0 errors
npx vitest run --coverage        # lib/ 覆盖率 > 80%
# 手动：chrome://extensions 重载 → 侧栏打开 → 迁移日志 → 新旧卡核对
```

## 风险文件 / 回滚点

- 高风险：`host/lib/storage.js`（迁移）、`extension/lib/model.js`（模型）、`extension/sidepanel.js`（视图大改）。
- 迁移每列 `VACUUM INTO` 备份 + 校验 + 回滚；`host/data/journal.db*.bak` 保留。
- git：每阶段一个 commit，可独立 `git revert`。

## start 前置检查

- [ ] 本任务（父）与 4 子任务 prd/design/implement 就绪。
- [ ] inline 模式（Codex）：跳过 jsonl，`task.py start --allow-empty-context`。
- [ ] 用户已批准最终规划摘要。
