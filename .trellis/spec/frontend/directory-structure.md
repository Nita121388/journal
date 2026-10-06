# Directory Structure

> 扩展前端的**分层架构与依赖方向**。这是硬契约，由 ESLint 强制（`extension/eslint.config.js`）。
> 决策依据见 [`docs/adr/0001-layered-packaging-within-chrome-root.md`](../../../docs/adr/0001-layered-packaging-within-chrome-root.md)。

---

## Overview

Journal 是 **Chrome Manifest V3 扩展 + Side Panel**，**无框架、无打包器**（保持 load unpacked 免构建）。
所有用户侧代码在 `extension/` 内 —— 因为 **Chrome MV3 不能 import 扩展目录以外的文件**，
所以共享逻辑必须物理位于 `extension/` 内，做**逻辑分层 + ESLint 强制方向**，而不是物理 `packages/`。

---

## Capability Rule (先记住这一条)

> **一条能力只能出现在一个层。找不到归属时，先查下表，不要就地写。**

| 能力 | 唯一归属 |
|---|---|
| `chrome.*` / `localStorage` | `platform/` |
| `node:*` 内置模块 | `host/`（`shared/` 也禁止，它要能双跑） |
| 网络请求（`fetch`） | `platform/`（`hostFetch`）；`host/` |
| DOM 读写 | `views/` `features/` `components/` `entries/` |
| 卡片数据读写 | `state/repository.js` |
| 视图可变状态（筛选/选中/模式） | `state/view-state.js` |
| 纯计算（时间/聚合/字段/格式） | `shared/` |

---

## Directory Layout

```
extension/
├── manifest.json          # MV3 配置（side_panel / permissions / SW 指向 platform/background.js）
├── sidepanel.html         # 主界面入口（<script type="module" src="entries/sidepanel.js">）
├── options.html
├── sidepanel.css          # 手写样式（含视图定位等无法 utility 化的部分）
├── options.css  select.css
├── dist/sidepanel.css     # Tailwind 构建产物（已提交，勿手改）
├── src/tailwind.css       # Tailwind 构建源
├── styles/
│   ├── tokens.css         # ✦ 主界面设计 token 的唯一定义处
│   └── tokens-options.css # ✦ 设置页 token 的唯一定义处
│
├── entries/               # 组合根：唯一选择端口 + 注入依赖 + 启动
│   ├── sidepanel.js       #   启动引导（13 行，只 import app.js:init）
│   ├── app.js             #   装配顺序 + 注入 actions
│   ├── bind-shell.js      #   外壳交互（头部/热力图/日历/卡片池导航）
│   ├── bind-views.js      #   视图导航与视图内事件
│   ├── bind-editor.js     #   编辑器 / 模板构建器事件
│   └── options.js         #   设置页入口
│
├── platform/              # ✦ 平台适配层：chrome.* / localStorage 的唯一归属地
│   ├── index.js           #   PlatformPort 契约 + resolvePort/setPort/getPort
│   ├── chrome.js          #   chrome.storage / runtime / connectNative
│   ├── web.js             #   localStorage / fetch（可移植性参考实现）
│   └── background.js      #   Service Worker
│
├── shared/                # ✦ 纯逻辑叶子：零 DOM / 零 chrome / 零 node:
│   ├── model.js           #   时间换算、卡片派生、分道布局、热力图聚合
│   ├── card-schema.js     #   卡片字段常量 + 归一化原语（host 亦消费）
│   ├── field-registry.js  #   统一字段注册表（getFieldDef / writeValueToCard / readValueFromCard）
│   ├── prop-infer.js      #   本地规则属性推断
│   ├── protocol.js        #   HTTP 路由 + 消息类型 + API typedef
│   ├── format.js          #   日期/来源/图标等展示格式化
│   ├── emoji-data.js      #   表情数据表（纯数据，排除覆盖率）
│   └── emoji-search.js
│
├── state/                 # 数据层：依赖注入的端口，不 import platform 实现
│   ├── repository.js      #   ✦ 内存单一真源 + 订阅（卡片读写唯一入口）
│   ├── sync-bridge.js     #   pull / poll 合并为一条通知链
│   ├── host-client.js     #   host REST 端点封装（走 port.hostFetch）
│   ├── view-state.js      #   ✦ 视图可变状态的唯一持有者（vs 对象）
│   ├── actions.js         #   反向调用通道（组合根注入，打破 views→entries 循环）
│   ├── prop-library.js    #   属性库（存 host meta）
│   └── settings.js        #   本地设置
│
├── views/                 # 主视图渲染（每个 <400 行）
│   ├── timeline.js  timeline-card.js  week.js  month(见 rightview.js)
│   ├── rightview.js  pool.js  heatmap.js  calendar.js  skills.js
│   ├── named-view.js  refresh.js
│
├── features/              # 交互功能（每个 <400 行）
│   ├── card-editor.js  editor-props.js
│   ├── template-builder.js  template-rows.js  template-fields.js  template-menu.js
│   ├── select.js  select-view.js  emoji.js  toast.js
│   ├── prop-llm.js  host-status.js  wide-mode.js
│
├── components/
│   └── dom-refs.js        # ✦ els 注册表：所有 getElementById 集中在此
│
└── icons/
```

> ✦ = 该能力的**唯一**归属地；在别处出现即为架构违规。

---

## 依赖方向（铁律）

```
shared ◀── platform                        （平台适配层：chrome.* / localStorage / fetch 的唯一归属地）
shared ◀── state                           （数据层）
shared ◀── components                      （DOM 原子）
           components ◀── features | views  （UI 层，同层对等，允许互相引用）
           {state, components, features, views} ◀── entries（组合根）
host    ◀── 只依赖 shared（纯逻辑叶子）
desktop ◀── extension/** 与 host（本期未实现）
```

1. `shared/` 是最底层叶子：**不得 import 任何其他层**，不得出现 `document/window/chrome/fetch/node:*`。
2. `platform/` 只依赖 `shared/`；`chrome.*` / `localStorage` / `fetch` **只允许**出现在这里。
3. `state/` `components/` 可依赖 `shared/` 与 `platform/index.js` 的**契约**；
   不得 import `views/` `features/` `entries/`。
4. `features/` 与 `views/` 是**同层对等**（交互 vs 渲染），允许互相引用；
   但两者都**不得 import `entries/`** —— 反向调用一律经 `state/actions.js`。
5. 任何非 `platform/` 层都**不得 import `platform/chrome.js|web.js|desktop.js`** 具体实现，
   只可用 `getPort()` 拿到的端口对象。
6. `entries/` 是组合根：可依赖全部，负责选择端口与注入。
7. `host/` 只可 import `extension/shared/**`。

### 强制手段

`extension/eslint.config.js` 用 `no-restricted-imports`（完整层序矩阵）+ `no-restricted-globals`
（`chrome` `localStorage` `fetch`）+ `no-undef` 落地。与 [`docs/adr/0001`](../../../docs/adr/0001-layered-packaging-within-chrome-root.md)
的约束表必须逐条同步。

校验：`npm run lint` 必须 **0 error**。

---

## written 顺序：新增文件放哪？

```
要新增的东西…
├─ 要调 chrome.* / localStorage？          → platform/（且只在已有实现里加，别新建层）
├─ 要算时间/聚合/归一化，无 DOM？          → shared/
├─ 要读写卡片？                            → state/repository.js（不要再开一条通路）
├─ 是「筛选/选中/模式」这类可变界面状态？   → state/view-state.js（加字段，别建新模块变量）
├─ 渲染 DOM / 绑定事件？                    → views/（按视图）或 features/（按交互）
├─ 只是 DOM 元素引用？                      → components/dom-refs.js
└─ 要选择端口 / 决定启动顺序？              → entries/
```

---

## Naming Conventions

| Item | Rule |
|------|------|
| 文件 | `kebab-case.js` / `.css` / `.html` |
| 函数 | `camelCase`，动词开头：`getTodayKey()` `renderTimeline()` `writeValueToCard()` |
| 常量 | 模块级配置用 `UPPER_SNAKE_CASE`（如 `SYNC_INTERVAL_MS` `DAY_START_MIN`） |
| CSS 类 | `kebab-case`，前缀 = 组件名：`.heatmap-cell` `.timeline-card` `.cardpool-item` |
| Chrome 消息类型 | `SCREAMING_SNAKE_CASE`，命名空间前缀：`"journal:save-entry"` |
| 内部模块级变量 | 前缀 `_`（如 `_cache`），表示非导出 |
| 测试 | 与被测文件同目录、同名 + `.test.js` |

---

## Common Mistakes

- ❌ 在 `views/` 里 `import { createChromePort } from '../platform/chrome.js'`
  → ✅ 用 `getPort()`（由 `entries/` 注入，测试/桌面壳才能替换）。
- ❌ 在模块里写 `let selectedDate = ...` 顶层可变变量
  → ✅ 加到 `state/view-state.js` 的 `vs` 对象。
- ❌ 在 `views/` 里直接 `getPort().storageSet({cards: ...})`
  → ✅ 走 `state/repository.js`，保证乐观更新与订阅通知。
- ❌ 在 `shared/` 里 `document.createElement`
  → ✅ 把数据返回给 `views/`，由视图建 DOM。
- ❌ 用 `innerHTML` 拼用户内容（日志正文/待办标题）
  → ✅ `textContent` / `createElement`。
- ❌ 新开一个文件只为了放一个常量
  → ✅ 就近放在使用它的层；跨层共享才进 `shared/`。
