# 抽取平台端口层 platform

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 前置：`10-06-shared-package`（已完成）
> **本任务是"桌面可行性"的实际交付物**：`chrome.*` 全部收敛 + 可替换端口契约。

## Goal

把全仓 `chrome.*` 调用收敛到 `extension/platform/`，向上暴露统一的 **PlatformPort** 契约；
UI 与数据层通过 `getPort()` 使用平台能力，不再直接引用 `chrome.*`。
提供 `web` 参考实现，证明端口契约真的可替换（即桌面可行性）。

## Requirements

### R1 端口契约与实现
- `extension/platform/index.js`：`PlatformPort` `@typedef` + `resolvePort()` + `getPort()` / `setPort()`
  （`setPort` 供测试注入 fake）。
- `extension/platform/chrome.js`：`chrome.storage.local` / `chrome.runtime` 实现。
- `extension/platform/web.js`：`localStorage` + `fetch` 实现（证明可移植；不做产品化）。
- 端口方法（见 design.md §3）：
  `kind` `storageGet` `storageSet` `storageSubscribe` `sendMessage` `openOptionsPage`
  `hostFetch` `startHost`。

### R2 chrome.* 收敛
- `background.js` → `platform/background.js`（Service Worker 本质是平台代码）并更新 `manifest.json`。
- 改造下列消费方改用端口：
  - `lib/store.js`（storage get/set/onChanged）
  - `lib/host-sync.js`（storage set）
  - `lib/prop-llm.js`（storage get/set 缓存）
  - `sidepanel.js`（`sendMessage` 启动 host、`openOptionsPage`）
  - `options.js`（storage get）
- 收敛后：`rg "chrome\." extension` 仅命中 `platform/`。

### R3 ESLint 边界收紧
- `chrome` 全局：仅允许出现在 `platform/**`（其余文件 `no-restricted-globals` 报错）。
- `state|views|features|components`：允许依赖 `platform/index.js` 的**契约**，
  禁止 import `platform/{chrome,web,desktop}.js` 具体实现。

### R4 行为等价
- 不改任何运行时行为；`dev-loop` 全场景回归作为门禁。
- host 通信仍走 `http://127.0.0.1:8766`（端口常量来自 `shared/protocol.js`）。

## Acceptance Criteria

- [ ] `rg "chrome\." extension --glob '!platform/**' --glob '!node_modules/**'` 无结果
- [ ] `platform/{index,chrome,web}.js` 存在且 `web` 端口可被构造/单测
- [ ] `lib/store.js` 与 `lib/host-sync.js` 不再出现 `chrome`
- [ ] ESLint：`chrome` 全局在 `platform/**` 之外报错（探针验证）
- [ ] `npm run lint` 不新增错误
- [ ] `npm test`（host）103/103
- [ ] `npm run dev-loop -- --scenario smoke` 320/360/400/500 全绿
- [ ] Chrome load unpacked 正常（background 路径更新后仍能启动 host）

## Constraints

- 不新增依赖（web 端口用 `localStorage` 即可，不引 IndexedDB 库）。
- `web.js` 只做"可替换性证明"，不追求功能完整。
- 不改 host 侧代码（除必要的 import 调整外）。
- 保持 `startHost` 在 Chrome 下仍经 native messaging。

## Out of scope

- Electron 壳（`10-06-desktop-shell`，已降级为后续可选）。
- 数据真源合并（属 `state-repository`）。
- `store.js` → `state/repository.js` 搬迁（属 `state-repository`；本任务只换掉其中的 chrome.*）。
