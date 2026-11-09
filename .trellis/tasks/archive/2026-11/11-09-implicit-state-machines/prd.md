# 隐式状态机收敛（fsm 原语 + layer-stack + gesture + withBusy）

## Goal

把散落在模块级 let / body class / 事件 if 链里的 15 台隐式状态机收敛到**四个零依赖原语 + 一张登记表**，行为保持等价（不破坏任何现有功能），顺带修 3 个已实锤缺陷。

## 背景（勘察结论，2026-11-10）

全量清单见 `docs/answers/implicit-state-machines.html`（逐台核对过 file:line）：

- **生命周期/浮层 7 台**：卡片编辑器（closed→clean→dirty→confirming，缺 saving）、浮层 Esc 优先级链（bind-editor.js:35-58 手写）、模板构建器（5 个模块级 let）、下拉选择（openState 单例）、Toast+撤销窗口、主面板开合（body class + pref 双真源）、展开卡（已自觉，保持现状）。
- **手势 4 台（同一内核 4 份复制）**：时间线卡片移动（timeline-card.js:212）、缩放（:151）、框选（range-select.js:36）、卡片池 DnD + 模板行排序拖拽；全局耦合点 entries/app.js:50 读 body class 跳过轮询渲染。
- **数据同步/降级 4 台**：host 连接（stringly if 链）、同步桥（writeSeq 守卫，最自觉但闭包内不可观测）、milkdown 加载（failed 终态）、一次性守卫（reminded/prop-llm 缓存，持久化正确，不迁移）。
- **联动规则 1 条**：进度↔状态（onEditorProgressChange），只加注释登记，不改行为。

### 已实锤的 3 个缺陷（本任务必须修掉）

1. **双击保存重复建卡**：`saveEditor` 无 in-flight 守卫（card-editor.js:545），⌘⏎ + 双击可并发两次 `createCardEntry`。
2. **panels-open pref 漂移**：`setPanels` 点击路径写 pref，Esc 关闭路径不写（bind-shell.js:41-58）→ 下次启动回到旧状态。
3. **Esc 穿透链**：浮层 Esc 优先级手写在 bind-editor.js（35-58），新增浮层漏插队 → Esc 直接关掉编辑器丢表单（昨天加字段浮层时已差点踩到）。

## Requirements

### R1 四个原语（零依赖，不引 XState/Zustand）

- `shared/fsm.js`：纯函数转移表 `defineMachine({id, initial, states})` + `transition(machine, event)`；非法转移返回原状态并 `console.debug`（开发期可见，生产不抛）。**不碰 DOM/storage/chrome**（符合 shared 层 lint 边界）。
- `features/layer-stack.js`：浮层唯一所有者。`pushLayer({el, close, onEscape})` / `popLayer(el)`；统一 Esc（只关最上层）与外点；z-index 阶梯表由此处导出。新浮层注册一行即可。
- `views/gesture.js`：press → drag（threshold）→ commit/cancel 内核；唯一写者管理 body class（`data-gesture` 属性替代裸 class）；`suppressClick` 统一；pointerup/pointercancel 兜底自愈（class 泄漏自动清除）。
- `features/busy.js`（或并入 `toast.js runWrite`）：`withBusy(key, fn)` in-flight 去重 + 状态可查询（供按钮 disabled/文案）。

### R2 一张登记表 + 观测约定（AX）

- `docs/state-machines.md`：每台机器一节（所有者模块、状态列表、事件、不变量、DOM 观测点）。agent 改码前先查表。
- 观测约定：迁移完成的机器在关键 DOM 节点暴露 `data-state`（如 host 状态灯 `data-host-state="online"`），dev-loop 可断言。

### R3 迁移范围与顺序（每步 = 独立可回滚 commit + 全量验证）

- **P1**：`withBusy` 收编 `saveEditor` + `startHost` → 修缺陷 1。
- **P2**：`layer-stack` 收编浮层 → 修缺陷 3；并行期新旧都关浮层（双保险），全量 dev-loop 绿后删旧 if 链。
- **P3**：`panels-open` 收口到单一 setter（Esc 路径也写 pref）→ 修缺陷 2（此步不需要新原语，最小改动）。
- **P4**：`gesture` 收编 4 份拖拽复制 + app.js 改读 `data-gesture`。
- **P5**：host 状态机 + 同步桥改 `fsm` 定义并暴露 `data-state`；toast/ select / milkdown 登记表补齐（不改行为）。

### 明确不做

- 不引第三方状态库（bundle / CSP / 迁移面得不偿失）。
- 不动 repository / host 协议 / 卡片数据形态。
- 不重写已自觉的机器（展开卡 #7、一次性守卫 #15）。
- 不一次性大迁移——逐台搬迁，每步可回滚。

## Acceptance Criteria

- [ ] 缺陷 1：dev-loop 断言「快速双击保存只创建一张卡」（或等效单测）。
- [ ] 缺陷 2：单测断言 Esc 关闭后 `journal.panelsOpen` pref 与实际状态一致。
- [ ] 缺陷 3：Esc 在任意浮层打开时只关最上层，不关编辑器（dev-loop 场景断言）。
- [ ] `shared/fsm.js` 有单测（合法转移 / 非法转移返回原态 / 首个事件进初始态）。
- [ ] `eslint .` 与 `npm run test`（extension vitest + host + dev-loop 单测）全绿。
- [ ] `dev-loop` smoke + editor + select 全宽度（320/400/500）LOOP PASS。
- [ ] `docs/state-machines.md` 存在且覆盖 15 台机器。
- [ ] 全程一个 commit 一个 P（可独立 revert），最后统一推送 origin/dev/local。
