# Implement — 抽取平台端口层 platform

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 状态：**已完成**（2026-10-06）
> 定位：**"桌面可行性"的实际交付物**（用户决定本期不做桌面端，只保留可行性）

## 执行记录

### S3-1 端口契约与实现
- [x] `extension/platform/index.js`
  - `PlatformPort` 完整 `@typedef`（kind / storageGet / storageSet / storageSubscribe /
    sendMessage / openOptionsPage / hostFetch / startHost）
  - `resolvePort()` 按环境选择；`getPort()` 惰性缓存；`setPort()` 供测试/桌面壳注入
- [x] `extension/platform/chrome.js`：`chrome.storage.local` / `chrome.runtime` 实现
- [x] `extension/platform/web.js`：`localStorage` + `fetch` 实现（可移植性证明，非产品级）

### S3-2 chrome.* 收敛
| 文件 | 原 chrome 用法 | 现 |
|---|---|---|
| `background.js` → `platform/background.js` | `chrome.sidePanel/runtime/action/tabs/connectNative` | 平台层文件，合法；manifest 改为 `platform/background.js` + `"type":"module"` |
| `lib/store.js` | `chrome.storage.local.get/set/onChanged` | `getPort().storageGet/Set/Subscribe` |
| `lib/host-sync.js` | `chrome.storage.local.set` + 自建 `fetch` | `getPort().storageSet` + `getPort().hostFetch` |
| `lib/prop-llm.js` | `chrome.storage.local.get/set` | `getPort().storageGet/Set` |
| `sidepanel.js` | `chrome.runtime.sendMessage/openOptionsPage` | `getPort().startHost()/openOptionsPage()` |
| `options.js` | `chrome.storage.local.get` | `getPort().storageGet` |

**附带收敛**（host 地址字面量，即 `protocol.js` 的存在意义）：
- `sidepanel.js` / `options.js` 中 6 处 `http://127.0.0.1:8766` 字面量 → `DEFAULT_HOST_BASE` / `ROUTES`
- `sidepanel.js` 的裸 `fetch(/api/skill-status)` → `getPort().hostFetch('GET', ROUTES.skillStatus)`

### S3-3 ESLint 边界收紧（探针验证）
- [x] **全局**：`chrome` 在 `platform/**` 之外一律报错（探针 `lib/__probe.js` 验证命中）
- [x] `platform/**`：放开 `chrome` 全局；仍禁止依赖上层业务层
- [x] `state|views|features|components`：**允许** `platform/index.js`（契约），
      **禁止** `platform/{chrome,web,desktop}.js`（具体实现由 entries 选择注入）

### S3-4 dev-loop 适配（发现于验证阶段）
端口单一真相迁移到 `shared/protocol.js` 后，dev-loop 的端口探测失效（原读 `lib/host-sync.js`）：
- [x] `dev-loop/lib/host.mjs` `detectHostPort()` 改读 `shared/protocol.js` 的 `DEFAULT_HOST_PORT`
- [x] `buildTestExtension()` 增加 `DEFAULT_HOST_PORT = <testPort>` 改写（原仅改 `127.0.0.1:PORT` 字面量）

## 验证结果

| 门禁 | 结果 |
|---|---|
| `chrome.*` 在 `platform/**` 之外出现 | ✅ **0**（仅注释与 eslint 配置） |
| `createWebPort()` 可构造且契约完整 | ✅ kind=web，8 个方法齐全 |
| ESLint：chrome 全局越界报错 | ✅ 探针验证命中 |
| `npm run lint` | ✅ **22**（与 S2 持平，无新增） |
| `npm test`（host） | ✅ **103/103** |
| dev-loop `smoke` 320/360/400/500 | ✅ **60/60**，LOOP PASS |
| dev-loop `options` 360/500 | ✅ **20/20**，LOOP PASS |
| Chrome MV3 module service worker | ✅ isolated host 接入正常（证明端口改写与启动链路通） |

## 产出文件

```
extension/platform/
├── index.js        # 【新】端口契约 + 选择 + 注入
├── chrome.js       # 【新】Chrome MV3 实现
├── web.js          # 【新】web 参考实现（可移植性证明）
└── background.js   # ← 原 extension/background.js（平台层文件）
```

## 桌面可行性结论

实现 `PlatformPort` 只差三个动作，**不需要改任何 UI 代码**：
1. 文件系统 storage 实现（替换 `chrome.storage.local`）
2. 直连 host（复用 `hostFetch`）
3. 内嵌进程启动（替换 native messaging 的 `startHost`）

`web.js` 已证明"换实现即可跑"这条路径成立。

## 回滚

`git revert` 本任务提交即可。风险点仅 `manifest.json` 的 service worker 路径变更
（已由 dev-loop 在真实 Chrome 中验证通过）。

## 遗留（移交后续子任务）

- `lib/store.js` / `lib/host-sync.js` / `lib/sync.js` 仍在 `lib/`，尚未搬入 `state/` → `state-repository`
- `protocol.js` 的 `ROUTES` 尚未在 host 侧使用（host 仍字面量）→ 可随 `state-repository` 或独立小任务
- `lib/ai.js` 仍是未实现的空骨架（`throw new Error('AI not implemented yet')`）→ 建议独立清理
