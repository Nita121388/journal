# Implement — 按边界分包重构 + 桌面化准备

> 本文件是**跨子任务执行计划**。子任务顺序单调向下，每一步可独立提交、独立回滚。
> 父任务不直接实现；父任务负责集成回归与最终验收。

## 0. 执行顺序与依赖

```
baseline-cleanup ──▶ shared-package ──▶ platform-port ──▶ state-repository
                                                              │
                                                              ▼
                                                         ui-split ──▶ style-consolidation
                                                              │
                                        type-and-tests ◀──────┤
                                        desktop-shell  ◀──────┘（platform-port 完成后即可并行）
```

- **硬前置**：`baseline-cleanup` → `shared-package` → `platform-port` → `state-repository` → `ui-split`。
- `style-consolidation` 在 `ui-split` 之后（此时文件已分段）。
- `desktop-shell` 降级为后续可选（本期不做桌面端，只预留可行性）。
- `type-and-tests` 随各子任务增量推进，最后收口到 80%。

## 1. 每个子任务的统一 Gate（Definition of Done）

- [ ] `cd extension && npm run lint`（或新 workspace lint）0 错误
- [ ] `node dev-loop/dev-loop.mjs --width 320,360,400,500` 全绿
- [ ] 行为等价证明：说明"无功能变化"，或列出有意变更
- [ ] 边界规则无新增违规（`rg chrome\. packages/shared packages/ui` 为空）
- [ ] 单独可回滚：一个（或一组）语义清晰、message 规范的 commit
- [ ] 更新对应文件头 JSDoc / `docs/adr`（如有决策）

## 2. 分步清单

### S1 · baseline-cleanup（子任务 10-06-baseline-cleanup）✅ 已完成（归档 2026-10）
- [ ] 收敛当前 2 处未提交改动：提交 `extension/sidepanel.css` 按钮基类补丁
- [ ] 归档 09-30-custom-select-component（implement.md 记 P1–P4 已完成）
- [ ] 处置其余 11 个 in_progress 任务：归档已完成者，其余标注"重构期冻结"
- [ ] 建 `packages/` 骨架 + 根 `package.json`（workspaces + devDeps）
- [ ] 建 vitest / eslint 基线；跑通 dev-loop 基线截图并存档
- [ ] **验证**：`git status` 干净；dev-loop 基线 20/20

### S2 · shared-package ✅ 已完成（归档 2026-10）
- [ ] `git mv extension/lib/model.js packages/shared/model.js` 等（model/field-registry/prop-infer）
- [ ] 抽 `packages/shared/card-schema.js`：与 `host/lib/storage.js` 的双份字段常量去重
- [ ] 抽 `packages/shared/protocol.js`：HTTP 路由 + 消息类型 + API `@typedef`
- [ ] 修正 `host/test/extension-sync.test.mjs` 反向 import
- [ ] **验证**：`cd host && npm test` 全绿；`node host/cli.mjs --help` 正常

### S3 · platform-port
- [ ] 建 `packages/platforms/chrome/platform.js` / `packages/platforms/web/platform.js`
- [ ] 把 `chrome.*` 从 store.js / host-sync.js / sidepanel.js / options.js / background.js 收敛
- [ ] 加 ESLint 边界规则三条
- [ ] **验证**：`rg "chrome\." package/*/ ui shared` 为空；web 实现下 dev-loop 通过

### S4 · state-repository
- [ ] 建 `packages/ui/state/repository.js`（内存真源 + 订阅）与 `sync-bridge.js`
- [ ] 合并 pull/poll/onChanged 为一条通知链（内容签名去重）
- [ ] 删除 `normalizeEntry`/`newerEntry`/`startPushListener`、journals/todos 全量委托
- [ ] 竞态回归用例：并发写 + 外部写 → 收敛正确
- [ ] **验证**：多端同步 e2e 通过；dev-loop 全绿

### S5 · ui-split
- [ ] 建 `packages/ui/{app,dom}.js`、`state/view-state.js`
- [ ] 逐模块搬迁 views/features（一次一个，每步 dev-loop）
- [ ] `entries/sidepanel.js` 降到 < 120 行
- [ ] **验证**：无 UI 模块 > 400 行；`dev-loop --scenario all` 全绿

### S6 · style-consolidation
- [ ] 建 `ui/styles/{tokens,base}.css` + `views/*.css`
- [ ] token 收敛单源；决定 Tailwind `@theme` 改为别名读取 or 退役
- [ ] **验证**：computed-style 断言 + 多宽度截图零漂移；`dist/` 双轨消除

### S7 · desktop-shell — **⏸ 已降级为后续可选（用户决定本期不做桌面端）**
> 可行性的实际交付物由 S3（平台端口层）承担：`chrome.*` 收敛 + `PlatformPort` 契约 + `web` 参考实现
> 即构成可移植性证明。本步骤需要时再启动，**不阻塞父任务验收**。
- [ ]（可选）建 Electron 壳 `desktop/`，内嵌 spawn host，加载同一 UI
- [ ] 内嵌 spawn host；加载同一 UI
- [ ] **验证**：桌面窗口读写同一 `host/data/journal.db`；Chrome 渠道不受影响

### S8 · type-and-tests
- [ ] shared + ui/state 全量 JSDoc `@typedef`
- [ ] vitest 覆盖率 ≥ 80%，接入 lint/CI 门禁
- [ ] **验证**：`npx vitest run --coverage` 达标

## 3. 父任务集成验收（全部子任务完成后）

- [ ] AC1–AC9 全绿（见 prd.md）
- [ ] Chrome load unpacked：side panel + options 无回归
- [ ] AC7 桌面可行性证明：`chrome.*` 零外泄 + `web` 端口可构造（Electron PoC 不要求）
- [ ] `docs/adr` 记录关键决策（host 权威、LWW、在 Chrome 根内分层、桌面可行性边界）
- [ ] 最终 dev-loop 全量回归 + 人工 spot check

## 4. 回滚点

每个子任务 = 一个回滚点。因依赖单调向下，回滚第 N 步不会影响第 N-1 步的产物；
`ui-split` 期间保留 `platforms/chrome/sidepanel.js` 旧副本作为 fallback，验收后删除。
