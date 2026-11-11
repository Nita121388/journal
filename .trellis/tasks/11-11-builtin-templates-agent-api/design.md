# 设计：内置模板 seed + agent 模板管理通路

## 关键现状（证据）

| 事实 | 位置 |
|---|---|
| meta 路由只有 propertyLibrary / templates / savedViews 三组 GET/PUT（整列表覆盖） | `host/server.js:598-603` |
| store.getMeta(key) 任意 key 可用（meta 表通用） | `host/lib/storage.js:482,615` |
| `getTemplates` 对 null/[] 不区分 → seed 判定不能用"列表为空" | `storage.js:645-651` |
| UI 保存模板 = updateHostMeta('templates', read-modify-write) | `template-menu.js:52-58` |
| 管理对话框：pickDialog 选模板 → 重命名/删除/编辑属性 | `template-menu.js:manageTemplates` |
| 模板形态 + normalizeTemplateFields（补 REQUIRED_DEFS） | `template-builder.js:119-139` |
| writeValueToCard：`''` 视为未填走 empty 兜底；schedule 值 = `{start,end,duration}` | `field-registry.js:143-178` |
| 应用启动顺序：pullFromHost 之后即可安全读 meta | `entries/app.js:init` |

## 方案

### 1. 内置模板清单（`extension/shared/builtin-templates.js`，新文件，纯数据）

```js
export const BUILTIN_TEMPLATES = [
  { id: 't_builtin_todo',    name: '待办任务', emoji: '✅', builtin: true,
    fields: [{ key: 'status', value: 'todo' }, { key: 'priority', value: 'medium' },
             { key: 'assignedDate', value: '' }, { key: 'project', value: '' }] },
  { id: 't_builtin_idea',    name: '灵感想法', emoji: '💡', builtin: true,
    fields: [{ key: 'project', value: '' }] },            // 无优先级/排程（用户拍板）
  { id: 't_builtin_daily',   name: '每日记录', emoji: '📅', builtin: true,
    fields: [{ key: 'assignedDate', value: '' }] },
  { id: 't_builtin_agent',   name: 'Agent 任务', emoji: '🤖', builtin: true,
    fields: [{ key: 'status', value: 'todo' }, { key: 'priority', value: 'medium' }, { key: 'project', value: '' }] },
  { id: 't_builtin_meeting', name: '会议 / 会面', emoji: '🤝', builtin: true,
    fields: [{ key: 'schedule', value: { duration: 60 } }, { key: 'assignedDate', value: '' }, { key: 'project', value: '' }] },
];
/** seed 版本：升级内置清单时 +1，可再触发一次补充 seed（只补缺 id，不复活已删） */
export const TEMPLATES_SEED_VERSION = 1;
```

- `title/content/tags` 不写——`normalizeTemplateFields` 会自动补 REQUIRED_DEFS。
- `''` 值字段 = 只决定可见性不填值（`writeValueToCard` 的空串兜底）。
- id 用固定字符串（非时间戳）：agent 文档可引用、seed 幂等判重靠 id。

### 2. seed 逻辑（`extension/features/template-menu.js` 或独立 `builtin-templates.js` features 文件）

```
init 时（app.js pullFromHost 之后）：
  templatesSeed = await getHostMeta('templatesSeed')   // 新 meta key
  if (templatesSeed >= TEMPLATES_SEED_VERSION) return
  await updateHostMeta('templates', cur => {
    list = Array.isArray(cur) ? cur : []
    missing = BUILTIN_TEMPLATES.filter(b => !list.some(t => t.id === b.id))
    return [...missing, ...list]
  })
  await setHostMeta('templatesSeed', TEMPLATES_SEED_VERSION)
```

- **幂等**：按 id 补缺——用户删了 `t_builtin_todo`，版本没升就不会再回来（`templatesSeed` 已 ≥ 1 挡住整段）。
- **升级语义**：版本 +1 时只补 id 缺失的（用户删掉旧内置 = 主动选择，不复活）。
- host 离线：getHostMeta 返回 null → 直接 return，下次启动再试。
- `getHostMeta`/`setHostMeta` 需要 host 支持 `templatesSeed` key → 见 §4。

### 3. builtin 只读 + 复制（UI）

- `manageTemplates(templates)`：选中模板后按 `tpl.builtin` 分支：
  - builtin → pickDialog 只有「复制为我的模板」；clone：`{ id: 新id, name: tpl.name + ' 副本', emoji, fields: 深拷贝 }`（不带 builtin），走现有 updateHostMeta 追加。
  - 非 builtin → 现有（重命名/删除/编辑属性）。
- `renderTemplateMenu`：内置模板条目加 🔒 标记（或 builtin 前缀弱化样式），下拉照常可选用。
- 构建器不开放编辑 builtin（管理分支已挡住；防御性：`openTemplateBuilder(tpl)` 处不特殊处理——唯一入口是管理）。

### 4. host：meta 白名单扩 key + 单模板 API

- meta 路由补 `templatesSeed`：`GET/PUT /api/meta/templatesSeed`（整数）。
- 新增（storage.js 实现，server.js 挂路由）：
  - `GET /api/meta/templates` 不变。
  - `PUT /api/meta/templates/:id` → `upsertTemplate(store, tpl)`：
    - 校验：`id` === 路由 id 且非空；`name` 非空字符串；`fields` 是数组。不合法 → 400。
    - 已存在且 `existing.builtin` → 409（内置模板只读）。
    - 合并语义：存在则整条替换（保留原 builtin 标记？不——payload 不得带 `builtin: true`，非 seed 来源一律洗掉），不存在则追加。
  - `DELETE /api/meta/templates/:id` → `deleteTemplate(store, id)`：builtin → 409；不存在 → 幂等成功。
  - `PUT /api/meta/templates`（整列表，UI 链路）：保存时**剥离 `builtin: true`**？不——UI 的 updateHostMeta 会原样带回 builtin 模板（rename/delete 已被 UI 挡，但 edit-fields 链路可能改 builtin）。简化：整列表 PUT 时若 payload 缺失某 builtin id，或该条 builtin 标记被剥离 → **拒绝 409**？过严会卡 UI rename 链路（UI rename map 原样保留 builtin 字段 ✓）。
    - 决定：整列表 PUT 保留 builtin 条目原样（不校验），仅文档注明 agent 不要用此端点；单模板 API 有内置保护即可。（UI 链路原样回传 builtin 字段，rename/delete 对 builtin 已在 UI 层挡住。）
- `builtin: true` 写入源唯一：seed（extension）与单模板 API 的防御性剥离。

### 5. skill 文档（`.agents/skills/journal/SKILL.md`）

新增「模板管理」节：
- `GET /api/meta/templates`（列表）
- `PUT /api/meta/templates/<id>`（创建/更新单模板；**禁止整列表 PUT**——并发覆盖）
- `DELETE /api/meta/templates/<id>`
- 格式契约：`{id,name,emoji,fields:[{key,value}]}`；fields 不必含 title/content/tags（自动补）；`''` 值=只控可见性；schedule 值 `{start,end,duration}`。
- 约束：builtin 模板只读（409）；id 自定（如 `t_agent_xxx`）。

## 数据流

```
extension init → getHostMeta('templatesSeed') → 缺 → updateHostMeta(templates, 补缺 id) + setHostMeta(templatesSeed, 1)
UI 管理 builtin → 仅 clone（新 id，无 builtin 标记）→ updateHostMeta 追加
agent → PUT /api/meta/templates/:id（host 校验 + builtin 保护）→ UI 下次打开下拉即见
```

## 兼容与回滚

- meta 增 key 零迁移；旧 host + 新扩展：`templatesSeed` 路由不存在 → 404 → getHostMeta null → seed 跳过（降级安全）。新 host + 旧扩展：无影响。
- 单 commit 可回滚（1 新数据文件 + template-menu 改造 + host 两函数两路由 + skill 文档）。

## 验证

- host 单测：upsert/delete/内置保护/校验（node:test，参照 `host/test/*.test.mjs`）。
- extension 单测：seed 判定纯函数（版本比较/补缺 id/不复活）。
- dev-loop `tpl` 场景：补断言——内置 5 模板出现在下拉、管理对 builtin 只有复制、复制副本可编辑。
- smoke 全量防回归。
