# implement.md — 父任务执行计划

> 顺序：**子1 → 子2 → 子3**（顺序依赖，非并行）。每个子任务内部按各自 implement.md 执行。
> 当前阶段：规划中（Phase 1）。执行前需用户批准最终规划摘要（brainstorm 终审门）。

## 执行检查表（顺序）

- [ ] **P1 · 子任务1**（extension-agent-debug-loop）
  - [ ] `task.py start` 激活子1（父任务不直接实现）
  - [ ] 依子1 PRD/design 落地 `dev-loop/` harness（依赖锁版 playwright@1.63.0）
  - [ ] 验证：一条命令闭环 + 3 条 DOM 断言 + console 捕获 + 多宽度截图
  - [ ] 数据零污染验证（git status + host/data 无脏记录）
  - [ ] trellis-check 质量检查 → 子1 archive
- [ ] **P2 · 子任务2**（ux-audit-and-design-system）
  - [ ] `task.py start` 激活子2
  - [ ] 用子1 harness 采集多宽度(320/360/400/500)真实截图（关键态：空/有数据/暗色/窄宽）
  - [ ] 产出 UX 审计报告（≥6 维度，证据锚点 + 严重度 + 改造清单 ≥5 项 P1/P2）
  - [ ] 产出设计系统文档 → `.trellis/spec/frontend/design-system.md`
  - [ ] **用户确认审计文档**（父任务 R3 关卡：文档先行确认后再动代码）
  - [ ] trellis-check → 子2 archive
- [ ] **P3 · 子任务3**（ux-iteration-round-1）
  - [ ] `task.py start` 激活子3
  - [ ] 按审计清单落地 ≥5 项 P1/P2 改造（遵循设计系统）
  - [ ] dev-loop 多宽度回归全绿（截图+断言+console 零 error）
  - [ ] 关键流程断言（写日志/打卡/TODO/AI）
  - [ ] trellis-check → 子3 archive
- [ ] **P4 · 父任务集成收尾**
  - [ ] 父级集成评审：全链路回归 + 工作区干净 + 文档齐全
  - [ ] 父任务 archive（`task.py archive`）

## 验证命令（关卡）

```bash
# 子1：闭环
node dev-loop/dev-loop.mjs --width 360            # → 截图+JSON 报告
# 子2：文档存在性 + 覆盖率（人工评审）
# 子3：回归
node dev-loop/dev-loop.mjs --width 360,400,500    # 全绿
git status --short                                 # 干净
```

## 风险文件 / 回滚点

- `extension/sidepanel.css/js`（子3 改造主体）—— 每项改造独立 commit，可 `git revert`。
- `dev-loop/`（子1 新增，独立 commit，可整体删除）。
- 不动 `host/` 产品代码（除非审计明确要求，需子3 内另行批准）。

## 子1/子2 完成前检查（start 前）

- 子1：`research/agent-extension-debug-loop.md` 已存在（✓）；设计已定（纯外部路线）。
- 子2：方法论文档底稿已存在（见 research/）；截图采集依赖子1。

## 当前状态

- [x] 父任务 PRD / design / implement 已写
- [x] 子1/子2/子3 PRD 已写
- [ ] 用户批准最终规划摘要 → 才能 `task.py start` 子1
