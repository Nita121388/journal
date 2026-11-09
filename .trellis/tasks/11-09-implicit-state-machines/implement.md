# Implement — 执行清单

> 每步完成后跑「验证」；每 P 一个 commit（可独立 revert）。全程不推送，最后统一 push。

## P0 准备
- [x] 勘察清单（docs/answers/implicit-state-machines.html）
- [x] `task.py start` 激活任务

## P1 withBusy（修缺陷 1：双击保存重复建卡）
- [x] 新建 `extension/features/busy.js`：`withBusy(key, fn)` in-flight 去重 + `isBusy(key)`
- [x] `busy.test.js`：并发去重 / reject 释放 / 不同 key 独立
- [x] `card-editor.js saveEditor` 接入：`withBusy('editor.save', ...)`；保存中 `editorSave.disabled` + 文案「保存中…」，finally 复原
- [x] `host-status.js startHost` 接入：`withBusy('host.start', ...)`（保留 disabled）
- [x] dev-loop editor 场景补断言：保存按钮双击只建一张卡
- 验证：vitest + lint + dev-loop smoke/editor

## P2 layer-stack（修缺陷 3：Esc 穿透链）
- [x] 新建 `extension/features/layer-stack.js`：`pushLayer/popLayer/layers` + 统一 Esc(capture) + 外点 + z 表
- [x] 迁移：appDialog（dialog.js 去掉内部 Esc capture）、卡片编辑器 overlay、模板构建器 overlay、tpl-prop overlay、字段浮层 ×2、emoji picker、右键菜单、select 下拉（openState 单例改为 pushLayer）
- [x] 旧链并行期：bind-editor.js 的 Esc if 链**暂留**（全部浮层两层都关 → 幂等）
- [x] 全量 dev-loop 绿 → 删 bind-editor.js if 链，保留「编辑器/构建器本体关闭 + ⌘⏎」逻辑
- [x] dev-loop 补断言：字段浮层打开时按 Esc 只关浮层，编辑器仍开
- 验证：全套 + dev-loop select 场景

## P3 panels-open 收口（修缺陷 2：pref 漂移）
- [x] bind-shell.js `setPanels` 统一写 pref；Esc / 点 board / 按钮 / 初始化全走它
- [x] 单测或 dev-loop 断言（storage pref 与 body class 一致）
- 验证：全套

## P4 gesture（收编 4 份拖拽复制）
- [x] 新建 `extension/views/gesture.js`：bindDragGesture 内核（threshold/suppressClick/data-gesture + 兜底自愈）
- [x] 迁移 timeline-card move / resize（公共行为不变：吸附、钳制、patchCard）
- [x] 迁移 range-select（对外 API 不变）
- [x] 迁移 pool DnD + template-rows 排序拖拽（is-dragging 收编）
- [x] app.js:50 改读 data-gesture（兼容期双读）
- 验证：全套 + dev-loop smoke/editor/select + 手动 headed 截图核对
- [x] 最后：删兼容双写

## P5 fsm + 登记表（观测性）
- [x] 新建 `extension/shared/fsm.js` + `fsm.test.js`
- [x] host-status.js 换 defineMachine；`#host-status-btn` 加 `data-host-state`
- [x] sync-bridge.js 只加 `getSyncState()` 观测，不改行为
- [x] milkdown / toast / 模板构建器 / 编辑器生命周期登记进 `docs/state-machines.md`（不改行为）
- [x] `docs/state-machines.md` 覆盖 15 台 + 1 联动
- 验证：全套

## 收尾
- [x] dev-loop 全场景全宽度 LOOP PASS
- [x] spec 更新（.trellis/spec/frontend/state-management.md + design-system.md 引 layer-stack/gesture/busy/fsm）
- [ ] 任务归档（task.py archive）
- [ ] `git push origin dev/local`（推送前确认远端无新提交，否则先 pull --rebase）

## 执行记录（2026-11-10 收尾）

- **calendar-visual 场景 12/17 失败为基线既有问题**：在 ff8d68d（本任务全部改动之前）的独立 worktree 上复跑同为 12/17，同 5 条断言失败（月格 pill / cc-block / seed 相关，属 10-17-calendar-month-view 任务范围），与本任务无关。
- 其余全部场景（smoke/host/select/editor/tpl/llm/options/shell/week-readable）400px 全绿；smoke/editor/select 另跑 320/400/500 多宽度全绿；smoke 含 `--host-mode off` 离线回归。
- 最终测试规模：extension vitest 32 文件 / 392 用例；根 lint 0 error。
