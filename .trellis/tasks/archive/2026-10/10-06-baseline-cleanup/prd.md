# 重构前基线清理与环境准备

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 本任务必须在其余 7 个子任务之前完成。

## Goal

把工作树收敛到干净、可复现的基线，并搭好分层重构所需的骨架与质量工具，
使后续每一步搬迁都能"有安全网、有回退点"。

## Requirements

### R1 工作树收敛
- 提交当前未提交的 `extension/sidepanel.css` 改动（`.btn-primary/.btn-secondary` 基类 + 属性弹窗样式）。
- 处置 `09-30-custom-select-component` 任务：其实现已在 `6897bfc` 提交，`implement.md` 记 P1–P4 已完成 → 归档。
- 盘点其余 in_progress 任务：已完成者归档；未完成者标注"重构期冻结"，避免移动靶。

### R2 骨架建立
- 建根 `package.json`（scripts + devDeps），统一 lint / test 入口。
- 建目录骨架（不搬迁运行时代码）：`extension/{entries,platform,shared,state,views,features,components,styles}`、`docs/adr`。
- 目录内放 `.gitkeep` 或首个真实模块，避免空目录丢失。

### R3 质量工具基线
- ESLint：加边界规则骨架（先只覆盖已存在的层，随搬迁扩展）。
- vitest：可运行但允许 0 用例（骨架 + 配置）；`npm test` 可执行。
- 记录 dev-loop 基线：多宽度截图存档，作为后续"视觉零漂移"的对照。

### R4 可复现基线记录
- 在 `implement.md` 记录基线 commit hash、dev-loop 结果、lint 结果。

## Acceptance Criteria

- [ ] `git status` 干净
- [ ] 09-30 任务已归档到 `.trellis/tasks/archive/`
- [ ] 根 `package.json` 存在，`npm run lint` / `npm test` 可执行
- [ ] 目录骨架存在且被 git 跟踪
- [ ] dev-loop 基线全绿并记录结果
- [ ] 基线 commit hash 写入 implement.md

## Constraints

- 本任务**只做清理与骨架**，不搬迁任何运行时代码（搬迁从 `shared-package` 开始）。
- 不改变任何现有功能行为。
- Chrome 扩展在每一步仍可正常 load unpacked。

## Out of scope

- 不移动 `extension/lib/*` 到 `shared/`（属下一子任务）。
- 不引入 JS 打包器。

## Notes

- 顺序硬前置：本任务未完成前，其余子任务不得 start。
- 若发现 in_progress 任务实际已完成，直接在本次归档，不另开任务。
