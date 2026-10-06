# JSDoc 类型 + vitest 测试基线

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 前置：`shared-package` / `platform-port` / `state-repository` / `ui-split`（均已完成）

## Goal

把规范里承诺但仓库中**从未存在**的测试基线落地：`shared/` + `state/` 单测与覆盖率门禁，
并补齐核心数据形状的 JSDoc `@typedef`，使重构成果可被回归保护。

## Requirements

### R1 测试基线
- 引入 **vitest** + `@vitest/coverage-v8`（此前 `quality-guidelines.md` 已承诺但仓库无任何扩展测试）。
- 覆盖 `shared/**` 与 `state/**`：纯逻辑（model/card-schema/format/prop-infer/field-registry/
  protocol/emoji-search）与数据层（repository/sync-bridge/host-client/settings/prop-library/view-state/actions）。
- 平台无关：用**假端口**（`test-helpers.mjs` 的 `makePort()`）注入，不经浏览器。

### R2 覆盖率门禁
- `shared/` + `state/` 语句/行/函数 ≥ 80%，分支 ≥ 70%。
- 排除纯数据表 `shared/emoji-data.js`（1686 行，非逻辑）。
- 接入 npm 脚本：`extension: test / test:coverage / test:watch`；根：`test`（extension + host）。

### R3 JSDoc typedef
- 补齐 `shared/` 与 `state/` 的核心形状：`Card` `FieldDef` `InferredProp` `EmojiItem`
  `ViewState` `Settings` `PropLibrary` `PullResult` `AppActions` `ScheduleItem`。

### R4 不回归
- `npm run lint` 保持 0 error；`npm test` 扩展 + host 全绿；dev-loop 全场景全绿。

## Acceptance Criteria

- [ ] `npx vitest run --coverage` 通过且阈值达标
- [ ] 覆盖率：`shared/` + `state/` 行 ≥ 80%、分支 ≥ 70%
- [ ] 根 `npm test` 同时跑 extension（vitest）与 host（node --test）
- [ ] `shared/` 与 `state/` 每个模块含 `@typedef` 或明确标注无需类型
- [ ] `npm run lint` 0 errors
- [ ] dev-loop `smoke` / `select` / `options` / `tpl` / `tailwind-migrated` 全绿

## Out of scope

- 视图层（views/features）的 DOM 单测（由 dev-loop 覆盖）。
- TypeScript 迁移（保持原生 JS + JSDoc）。
