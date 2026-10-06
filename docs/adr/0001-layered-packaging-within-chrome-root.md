# ADR-0001：分层打包位置 —— 为什么不用物理 `packages/` 单体仓库

- 状态：Accepted
- 日期：2026-10-06
- 相关任务：`.trellis/tasks/10-06-package-boundaries-refactor/`

## 背景

重构目标是把 `extension/`（3695 行 sidepanel.js、chrome.* 散落 6 文件、样式双轨）
与 `host/` 整理为清晰分层，并为 Electron 桌面版复用同一套 UI 做准备。

初版方案设想标准 npm workspaces 单体仓库：

```
packages/{shared,host,ui,platforms}/
```

## 决策驱动因素（硬约束）

**Chrome MV3 扩展无法 import 扩展目录以外的文件。**
`manifest.json` 所在目录即扩展根，`chrome-extension://<id>/` 映射到该目录；
任何 `../` 越出该目录的相对 import 都会被拒绝加载。

因此若 UI/共享代码物理放在 `packages/`，Chrome 客户端必须二选一：

1. 引入 JS 打包器（esbuild/vite），把 `packages/*` 构建成扩展内的自包含产物；
2. 用符号链接/junction 把 `packages/shared` 链入扩展目录。

## 备选方案

| 方案 | 优点 | 代价 |
|---|---|---|
| **A. workspaces + esbuild 构建 Chrome 产物** | 物理包边界最"标准" | 新增 JS 构建链；开发需 watch/rebuild；与项目"免构建"取向冲突；包体维护成本 |
| **B. workspaces + node_modules 符号链接** | 无构建 | Windows junction 依赖 `npm install`；Web Store 打包不包含符号链接；脆弱 |
| **C. 在扩展根内做逻辑分层（采用）** | 零构建、零符号链接、满足全部架构目标 | 共享代码物理上位于 `extension/` 内 |
| **D. 保持现状不做分包** | 无改动 | 放弃可读性与桌面复用目标 |

## 决策

采用 **方案 C**：在 Chrome 可加载的根目录内做**逻辑分层**，用 ESLint 强制依赖方向；
桌面壳在仓库根 `desktop/` 复用同一份源码。

```
journal-dev/
├── extension/     # Chrome 扩展根 = 客户端源码根（MV3 同目录约束）
│   ├── entries/   #   薄入口（唯一的组装点）
│   ├── platform/  #   平台适配（chrome.* 唯一来源）
│   ├── shared/    #   纯逻辑叶子
│   ├── state/  views/  features/  components/  styles/
├── host/          # Node 权威服务（只可 import extension/shared 的叶子）
├── desktop/       # Electron 壳（复用 extension/**）
├── dev-loop/
└── docs/adr/
```

分层与依赖（单向，禁止反转）：

```
shared ◀── platform                        （平台适配层：chrome.* / localStorage / fetch 的唯一归属地）
shared ◀── state                           （数据层：真源 / 同步 / host 客户端）
shared ◀── components                      （DOM 原子：元素注册表）
           components ◀── features | views  （UI 层，**同层对等**：交互 vs 渲染；允许互相引用）
           {state, components, features, views} ◀── entries   （组合根，可 import 全部）

host    ◀── 只依赖 shared（消费其纯逻辑叶子）
desktop ◀── 依赖 extension/** 与 host（本期未实现）
```

**真实约束（与 `extension/eslint.config.js` 逐条对应，两边必须保持同步）：**

| 层 | 允许 | 禁止 |
|---|---|---|
| `shared/` | 仅 `shared/` | 任何其他层；`node:*`；`document` `window` `chrome` `fetch` |
| `platform/` | `shared/` | `state` `views` `features` `components` `entries` |
| `state/` | `shared/` `platform/index.js` 契约 | `views` `features` `components` `entries`；`platform/chrome.js` `web.js` `desktop.js` 具体实现 |
| `components/` | `shared/` `platform/index.js` 契约 | `state` `views` `features` `entries` |
| `features/` `views/` | `shared/` `state/` `components/` 及**彼此** | `entries/`；`platform/*.js` 具体实现 |
| `entries/` | 全部 | — |
| 全局 | — | `chrome` `localStorage` `fetch` 只能出现在 `platform/` |

> 早期版本的 ADR 写为「state / views / features / components 不得 import platform」，
> 与实现（各层经 `getPort()` 使用端口）不一致。现已统一为上表：
> **允许依赖 `platform/index.js` 的契约，禁止 import 具体实现**。

**为什么 features 与 views 是对等的两层而非上下级**：二者同属 UI 层，按职责划分
（`features/` = 可复用的交互物；`views/` = 页面级渲染装配）。
`views/pool.js` 用 `features/toast.js` 弹提示是合理的；硬拆成上下级只会制造无意义的中间层。
真正的铁律是：**二者都不得反向依赖组合根 `entries/`**（反向调用一律经 `state/actions.js`）。

**强制手段**：`extension/eslint.config.js` 的 `no-restricted-imports`（层序矩阵）
+ `no-restricted-globals`（chrome/localStorage/fetch）+ `no-undef`，由 `npm run lint` 把关。

## 结果

**收益**
- 获得全部架构目标：单向依赖、单一职责、平台端口、可单测、桌面复用。
- 零新增 JS 构建链；Chrome 仍可"加载 unpacked 免构建"。
- 避免 Web Store 打包时符号链接/外部文件的陷阱。

**成本**
- `shared/` 物理上位于 `extension/` 内 —— 属打包约束产生的物理位置，非逻辑缺陷；
  逻辑上它仍是无依赖的叶子，被 `host` 与 `ui` 共同消费。
- 依赖方向需靠 ESLint `no-restricted-imports` 强制，不能靠目录物理隔离。

## 备注

若未来确需物理 workspaces（如需发布 `@journal/shared` 到 registry），
则必须同时引入方案 A 的构建链；届时本 ADR 需要被 supersede。
