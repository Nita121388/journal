# 子任务3：UX 第一轮落地改造 + 闭环自测

> 父任务：`09-28-agent-driven-extension-ux-polish`
> 依赖：子任务1（Agent 调试闭环 harness）、子任务2（审计报告 + 设计系统 + 改造清单）。
> 顺序约束：必须等子任务1、2 完成且用户确认审计文档后再开始。

## Goal

按子任务2 审计产出的**改造清单**，执行**第一轮** UI/UX 落地改造（聚焦最高优先级的 P1/P2 项），并用子任务1 的 Agent 闭环 harness 做**自动回归自测**，确保改造不引入回归。产出「可交付」状态的第一轮成果。

## Background / Confirmed Facts

- 待改造项由子任务2 的审计清单驱动（≥5 项 P1/P2），本轮不预设具体项，以审计输出为准。
- 已有 token 底座（29 个 CSS 变量 + 暗色模式）、focus-visible 基础、host 测试隔离能力（子任务1）。
- 审计已知高优问题（示例，优先级以审计结论为准）：IA 倒置、筛选 chips 堆叠、时间线空白、热力图密度低、emoji 图标体系、reduced-motion 缺失、token 渗透不彻底。

## Requirements

- R1. 依据审计清单落地**≥5 项** P1/P2 改造（每项可独立验证）。
- R2. 每项改造遵循子任务2 设计系统规范（token、组件、a11y），逐步收敛硬编码样式。
- R3. 改造同步补齐必要的可访问性（focus 管理、reduced-motion、aria、对比度）。
- R4. 用 dev-loop harness 对每项/整轮做多宽度(360/400/500)自动回归：截图 + 断言通过 + console 无 error。
- R5. 改造不破坏现有功能与 dev/prod 隔离（8766 dev 副本；不动现役 8765）。

## Acceptance Criteria

- [ ] ≥5 项 P1/P2 改造完成，逐项对应审计清单条目与设计系统规范。
- [ ] dev-loop 回归全绿：多宽度截图 + DOM 断言通过 + 无 console error。
- [ ] 关键流程（写日志/打卡/TODO/AI）改造后仍可用（harness 断言覆盖）。
- [ ] 可访问性缺口（reduced-motion / 焦点 / 对比度）有实质改善。
- [ ] 工作区干净、改造有清晰 commit 边界、可回退。

## Out of Scope

- 第二轮及以后改造（后续任务/迭代）。
- 新增与审计无关的新功能。
- 动效的精细打磨（除非审计列为 P1）。

## Open Questions

- （无阻塞）具体改造项以子任务2 审计清单为准。
