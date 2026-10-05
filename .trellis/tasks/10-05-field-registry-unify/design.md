# Design: 统一字段注册表（Field Registry）

## 1. 现状与问题定位

### 1.1 两套数据结构

| 来源 | 定义位置 | 形态 | 存储 |
|------|---------|------|------|
| 内建必选 | `REQUIRED_DEFS`（sidepanel.js:2173） | 代码硬编码数组 | 无 |
| 内建可选 | `OPTIONAL_DEFS`（sidepanel.js:2178） | 代码硬编码数组 | 无 |
| 属性库 | `propLibrary`（sidepanel.js:149） | 运行时对象 | host meta `propertyLibrary` |

`findPropDef`（:2249）是分叉点：先 `BUILTIN_DEFS.find`，再查 `propLibrary[key]`。

### 1.2 特色功能绑定在 key 上（核心问题）

内建字段的"特色"不是通过声明获得的，而是**引擎里硬编码 key 判断**的结果：

- 卡片渲染（`:1884-1932`）：直接读 `card.status` / `card.progress` / `card.duration` / `card.project` / `card.assignedDate`，并按固定 key 产出徽标；`card.props` 里的字段一律渲染成通用 `•key: value` 徽标。
- `createFromTemplate`（`:3012-3035`）：`switch (f.key)` 把内建 key 映射到卡片一级字段，用户 key 走 `patch.props`。
- 模板 normalize（`normalizeTemplateFields`, :2262）：必选三件套单独前置。

后果：**用户字段在结构上无法获得任何特色**——因为特色是 `if (key === 'status')` 决定的，而用户不能把 key 命名为 `status`（`RESERVED_PROPS` 保留字）。

### 1.3 可发现性缺口

模板构建器 `renderTemplateBuilder`（:2343）只渲染 `REQUIRED_DEFS` + `extra` + 添加行。内建可选属性与属性库字段**没有任何选择入口**，用户只能手打重建（`startAddProp`）。卡片编辑器有 `openPropLibrary`（:517，prompt 式），模板构建器没有对应物。

---

## 2. 统一概念：FieldDef

所有字段——内建必选、内建可选、属性库自定义——统一为同一条 `FieldDef`：

```js
/**
 * @typedef {Object} FieldDef
 * @property {string}   key        全局唯一标识
 * @property {string}   label      显示名
 * @property {string}   icon       emoji 图标
 * @property {string}   type       值形态：text|textarea|number|select|multi|date|time|checkbox|schedule|tags|status
 * @property {string}   behavior   特色功能：none|status|progress|schedule|priority|date|project
 * @property {boolean}  required   每张卡必有（UI 锁定行、模板必含）
 * @property {'builtin'|'user'} source 来源（仅决定可删改权限）
 * @property {boolean}  locked     builtin 恒为 true（不可删、key 不可改）
 * @property {string[]} [options]  select/multi 的选项
 * @property {Storage}  storage    值在卡片上的落位
 * @property {Object}   [overrides] 用户对 builtin 的局部覆盖（label/icon）
 */

/**
 * 值落位描述：kind='card' 映射到卡片一级字段；kind='props' 进 card.props
 * @typedef {Object} Storage
 * @property {'card'|'props'} kind
 * @property {Record<string,string>} [fields] templateKey -> cardField（schedule 为多对一展开）
 */
```

### 2.1 职责解耦：`type` vs `behavior` vs `storage`

三个正交维度，各管一件事：

| 维度 | 回答的问题 | 消费者 |
|------|-----------|--------|
| `type` | 值怎么存、编辑器用什么控件 | `buildTplDefaultEditor` / `buildPropControl` |
| `behavior` | 引擎拿到值后做什么（渲染/联动/归一化） | 卡片渲染、时间线、徽标 |
| `storage` | 值落到卡片哪个字段 | `createFromTemplate` / 卡片读回 |

现状把三者挤在 `type` 里（`type:'status'` 既当控件又暗含行为），解耦后任何字段都可自由组合。

### 2.2 内建字段迁移示例

```js
// 迁移前
{ key: 'status', icon: '📌', label: '状态', type: 'status', options: ['none','todo','doing','done'] }
{ key: 'schedule', icon: '⏱️', label: '起止时间/时长', type: 'schedule' }
{ key: 'project', icon: '📁', label: '项目', type: 'text' }

// 迁移后
{ key: 'status',   icon: '📌', label: '状态',     type: 'select',   behavior: 'status',
  required: false, source: 'builtin', locked: true,
  options: ['none','todo','doing','done'],
  storage: { kind: 'card', fields: { value: 'status' } } }

{ key: 'schedule', icon: '⏱️', label: '起止时间/时长', type: 'schedule', behavior: 'schedule',
  required: false, source: 'builtin', locked: true,
  storage: { kind: 'card', fields: { start: 'startTime', end: 'endTime', duration: 'duration' } } }

{ key: 'project',  icon: '📁', label: '项目',    type: 'text',    behavior: 'project',
  required: false, source: 'builtin', locked: true,
  storage: { kind: 'card', fields: { value: 'project' } } }
```

`title/content/tags` 只是 `required: true` + `behavior:'none'`（或 `behavior:'tags'`），数据结构与其它内建字段无差别。

---

## 3. 注册表模块

### 3.1 位置与边界

新增 `extension/lib/field-registry.js`（纯函数模块，无 DOM 依赖，可单测）：

- **数据源**：内建种子常量（从 `REQUIRED_DEFS`/`OPTIONAL_DEFS` 迁移过来）+ 运行时注入的用户字段（原 `propLibrary`）。
- **持久化不变**：用户字段仍存 host meta `propertyLibrary`，保持原 shape（`{key,label,icon,type,options?}`）。注册表在运行时把两者合并、归一化、补齐 `behavior/storage/required/source/locked`。

### 3.2 API

```js
// 组装（sidepanel 启动时调用一次，propLibrary 加载后）
initFieldRegistry({ userFields: propLibrary });

getFieldDef(key)                 // → FieldDef | null（替代 findPropDef）
listFieldDefs({ source?, behavior?, includeLocked? })  // → FieldDef[]（供下拉选择）
isReservedKey(key)               // → boolean（保留字 + builtin key）

// 用户字段 CRUD（写回 propLibrary 并刷新注册表）
upsertUserField(def)
removeUserField(key)

// 行为与落位解析
getBehavior(key)                 // → 'status'|'progress'|…
getStorage(key)                  // → Storage
writeValueToCard(card, key, value)   // 按 storage 写卡片字段或 props
readValueFromCard(card, key)         // 按 storage 从卡片读回
```

### 3.3 迁移期兼容

`findPropDef(key)` 保留为 `getFieldDef(key)` 的薄封装（同一 commit 内把所有调用点改掉，避免两套名字并存）。`BUILTIN_DEFS` 保留为 `listFieldDefs({source:'builtin'})` 的导出常量，供现有 `BUILTIN_DEFS.find(...)` 判断是否内建的场景（:2508、:2936、:2959）改写。

---

## 4. 引擎分发改造（behavior 驱动）

### 4.1 卡片渲染

现状硬编码（:1884-1932）改为按 behavior 遍历注册表：

```
renderCardBadges(card):
  for def of listFieldDefs({ source:'builtin', behavior != 'none' }):
      v = readValueFromCard(card, def.key)
      if 空值 → 跳过
      switch def.behavior:
        'status'   → 状态徽标 + li.classList 'status-*'
        'progress' → `${v}%` 徽标
        'schedule' → 时长徽标
        'priority' → 🔴/🟢 徽标
        'date'     → 短日期徽标
        'project'  → 📁 徽标
  // 用户字段（behavior:'none'）维持现有 •key: value 通用徽标
  for [k,v] of card.props: ...
```

**回归要求**：迁移后状态灯、进度徽标、时长徽标、项目徽标、日期徽标的显示位置与文案必须与现状逐项一致——这是本任务的主要回归面。

### 4.2 建卡落位

`createFromTemplate`（:3012）的 `switch (f.key)` 改为：

```js
for (const f of fields) {
  writeValueToCard(patch, f.key, f.value);   // patch 即可写的卡片对象
}
```

`writeValueToCard` 内部按 `storage.kind` 分发：`card` → 逐项写一级字段；`props` → `patch.props[key] = value`。

### 4.3 时间线 / 筛选等其它消费点

`:1750-1751` 的 `card.status` 过滤判断保留——它是**业务规则**（"待办/进行中"筛选），不属于字段渲染分发，不在本次改造范围。行为声明化只统一"字段值 → 呈现"这一层。

---

## 5. 模板构建器字段选择下拉（R4）

### 5.1 入口

`buildAddRow`（:2617）改为分裂按钮：主体 `＋ 添加属性`（行为不变，调用 `startAddProp`）+ 右侧 ▾ 触发 `openFieldPicker(anchorEl)`。

### 5.2 浮层

复用 `tpl-ctx-menu` / `tpl-ctx-item` / `menuSep` 与 `openPropRowMenu` 的定位逻辑，新增分组标题样式：

```
┌───────────────────────────────────┐
│  ＋ 新建自定义属性…        (高亮)   │
│ ───────────────────────────────── │
│  内建可选                          │
│  📌 状态        (已在模板 ✓ · 置灰) │
│  📊 进度                           │
│  ⭐ 优先级                         │
│  ───────────────────────────────── │
│  属性库                            │
│  🧿 我的字段                       │
│  （属性库为空时显示「（空）」）      │
└───────────────────────────────────┘
```

数据源：`listFieldDefs({ source:'builtin', required:false })` + `listFieldDefs({ source:'user' })`。已存在于 `tplBuilderState.extra` 或 `REQUIRED_DEFS` 的 key 置灰 + ✓。

### 5.3 选中行为

选中未添加的字段 → `push` 进 `tplBuilderState.extra`，`values[key] = defaultValueForType(def.type)`，`renderTemplateBuilder()`。与 `prefillTemplateFromCard` 的 `putOpt` 同构。

---

## 6. 兼容与迁移

- **不迁移存量数据**：旧模板 `fields:[{key,value,label?,icon?}]` 原样读取，`getFieldDef(key)` 补齐 def。
- **`propLibrary` 持久化 shape 不变**：用户字段仍写 `{key,label,icon,type,options?}`；`behavior/storage` 等新字段运行时派生，不落盘（内建字段的 `behavior/storage` 由代码种子决定；用户字段若声明 `behavior`，随 def 一并存入即可，缺失时默认 `'none'`/`props`）。
- **保留字不变**：`RESERVED_PROPS` + 内建 key 共同构成保留命名空间，`isReservedKey` 统一判定。

## 7. 风险

| 风险 | 缓解 |
|------|------|
| 卡片徽标渲染回归（behavior 重构触及多处） | 分阶段；Phase 3 单独提交，逐项比对徽标输出 |
| `createFromTemplate` 落位错误导致建卡丢值 | storage 声明覆盖全部 9 个内建 key，逐个验证 |
| 行为声明化范围蔓延（触碰时间线/筛选等业务规则） | 本次只统一"字段值 → 呈现"层；`card.status` 过滤等业务规则不动 |

## 8. 分阶段与回滚

| Phase | 内容 | 回滚点 |
|-------|------|--------|
| 2 | 注册表模块 + 统一存储路径（`findPropDef` → `getFieldDef`） | 纯重构，行为等价 |
| 3 | 行为声明化 + 引擎分发（渲染/建卡落位） | 单独提交，徽标回归验证 |
| 4 | 模板构建器字段选择下拉 | 纯新增 UI，可独立移除 |

每个 Phase 独立提交，任一 Phase 可单独 revert。