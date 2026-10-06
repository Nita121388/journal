# Implement — 重构前基线清理与环境准备

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 状态：**已完成**（2026-10-06）

## 执行记录

### S1-1 工作树收敛
- [x] 提交未提交改动 → commit `8e61690`（弹窗按钮基类 + 属性定义弹窗卡片化）
- [x] 归档 `09-30-custom-select-component`（P1–P4 已验收，全场景回归全绿）→ `archive/2026-10/`
- [x] 盘点其余 10 个 in_progress 任务：均为历史任务（对应功能已在码内），
      **不擅自归档**（部分归属协作者）；本次重构按**文件边界**推进，不受其状态影响。
      已在本文件记录"重构期行为冻结"约定。

### S1-2 骨架建立
- [x] 根 `package.json`（统一入口，不接管依赖安装，不引入 workspaces）
- [x] `docs/adr/0001-layered-packaging-within-chrome-root.md`（打包位置决策）
- [x] 分层目录 + 契约 README（兼作占位）：
      `extension/{shared,platform,state,views,features,components,entries,styles}/README.md`

### S1-3 质量工具基线
- [x] ESLint 边界规则骨架（`extension/eslint.config.js`）：shared 叶子 / platform 不依赖上层 /
      state|views|features|components 不得 import platform；**已用探针文件验证 3 条规则均命中**
- [x] vitest：**本次不安装**（避免在基线阶段引入新依赖）。
      `npm test` 走 `host/` 的 `node --test`（103 用例）；vitest 落地移交任务 `10-06-type-and-tests`。
- [x] dev-loop 基线截图存档：`dev-loop/out/2026-10-06T04-33-53-394Z/`

### S1-4 基线缺陷修复（发现于本次）
- [x] `host/test/extension-sync.test.mjs` 硬编码端口 `8765`（实际 `8766`）→ 4 个失败。
      改为从 `extension/lib/host-sync.js` 的 `HOST` 常量推导，消除同类腐化。

## 基线快照（回退锚点）

| 项 | 值 |
|---|---|
| 基线 commit | `8e61690`（CSS）→ 本次骨架提交见 git log |
| 分支 | `dev/local` |
| `npm run lint` | **23 errors**（全部为存量 `no-unused-vars`，见 quality-guidelines.md 基线说明） |
| `npm test`（host） | **103/103 pass**（修复前 99/103） |
| dev-loop `smoke` 320/360/400/500 | **60/60 pass**，LOOP PASS |
| Chrome 加载 | `extension/` 目录 load unpacked 正常 |

## 后续子任务可依赖的不变量

- 从本基线起，`extension/{shared,platform,state,views,features,components}` 的边界规则
  **已生效**：新增代码违规会立刻被 lint 拦下。
- 后续每个子任务的门禁：
  `npm run lint`（不新增错误）+ `npm test`（103 全绿）+ `npm run dev-loop -- --scenario smoke`（全绿）。

## 回滚

本任务只新增文件、修正测试端口、提交既有改动，无运行时行为变更；
如需回滚，`git revert` 本次提交即可，不影响任何功能。
