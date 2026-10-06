# Design — 按边界分包重构 + 桌面化准备

> 本文件是**架构契约**：所有子任务的实现都必须遵守，评审以此为基准。
> 打包位置的决策见 [`docs/adr/0001-layered-packaging-within-chrome-root.md`](../../../docs/adr/0001-layered-packaging-within-chrome-root.md)。

---

## 0. 关键约束（决定架构形状）

**Chrome MV3 扩展不能 import 扩展目录以外的文件。**
因此共享逻辑物理上必须位于 `extension/`（Chrome 加载根）内，做**逻辑分层 + ESLint 强制方向**，
而不是物理 `packages/`。桌面壳在仓库根 `desktop/` 复用同一份源码。
（详见 ADR-0001；拒绝方案：workspaces+esbuild、符号链接。）

---

## 1. 目标结构

```
journal-dev/
├── package.json                    # 根：lint / test / build:css 脚本 + devDeps
├── docs/adr/                       # 架构决策记录
├── extension/                      # Chrome 扩展根 = 客户端源码根（MV3 同目录约束）
│   ├── manifest.json  background.js  icons/
│   ├── sidepanel.html  options.html
│   ├── entries/                    # 薄入口 = 组合根（唯一注入 platform 端口处）
│   │   ├── sidepanel.js            #   < 120 行
│   │   └── options.js
│   ├── platform/                   # 平台适配层（chrome.* 全仓唯一来源）
│   │   ├── index.js                #   端口类型契约 + 环境选择
│   │   ├── chrome.js               #   chrome.storage / runtime / connectNative
│   │   └── web.js                  #   localStorage(或 IndexedDB) / no-op / fetch
│   ├── shared/                     # 纯逻辑叶子（零 DOM / 零 chrome / 零 node:sqlite）
│   │   ├── model.js                #   时间/卡片/热力图聚合（原 lib/model.js）
│   │   ├── field-registry.js       #   统一字段注册表
│   │   ├── prop-infer.js           #   本地规则属性推断
│   │   ├── card-schema.js          #   卡片字段常量 + 归一化原语（host 亦消费）
│   │   └── protocol.js             #   HTTP 路由 + 消息类型 + API @typedef
│   ├── state/                      # 数据层（依赖注入的 platform 端口）
│   │   ├── repository.js           #   内存单一真源 + 订阅
│   │   ├── sync-bridge.js          #   pull/poll/onChanged 合并为一条通知链
│   │   └── view-state.js           #   视图/筛选/选中日期等 UI 状态
│   ├── views/                      # 主视图渲染
│   │   └── timeline.js  week.js  month.js  pool.js  heatmap.js  calendar.js  skills.js
│   ├── features/                   # 交互功能
│   │   └── card-editor.js  template-builder.js  emoji.js  select.js  toast.js  prop-library.js
│   ├── components/                 # 原子组件
│   │   └── chip.js  seg.js  modal.js  toolbar.js
│   ├── styles/                     # 样式（token 单一来源）
│   │   ├── tokens.css  base.css  views/*.css
│   └── dist/sidepanel.css          # Tailwind 构建产物（已提交）
├── host/                           # Node 权威服务
│   ├── server.js  cli.mjs  auto-summary.mjs
│   ├── lib/{storage,llm,llm-providers,logger}.js   # storage 消费 extension/shared 叶子
│   ├── sync/{backplane,engine,merge,mdformat,index}.js
│   ├── launcher/  scripts/  data/  test/
├── desktop/                        # Electron 壳（复用 extension/** 与 host/）
│   ├── main.js  preload.js  platform.js
├── dev-loop/
```

## 2. 依赖方向（铁律）

```
        shared  ◀── platform
           ▲
           ├── state / views / features / components
           └── entries（组合根）
        shared  ◀── host
        extension/** , host  ◀── desktop
```

规则：
1. `shared` 是最底层叶子：**不得 import 任何其他模块**，不得出现 `document/window/chrome/node:sqlite`。
2. `platform` 只依赖 `shared`；`chrome.*` / `web` API 只允许出现在这里。
3. `state/views/features/components` 可依赖 `shared`；**不得 import `platform/**`**，
   平台能力通过注入的端口对象获得。
4. `entries` 是组合根：可依赖全部，并负责选择端口、注入、启动。
5. `host` 只可 import `extension/shared/**`（纯逻辑叶子），不得依赖 UI/平台。
6. `desktop` 可依赖 `extension/**` 与 `host`。

**强制手段**：根 `eslint.config.js` 加 `no-restricted-imports` 三组规则（见 §7）。

## 3. 平台端口（Platform Port）

`platform/index.js` 定义契约，`entries/*.js` 选定实现并注入：

```js
/** @typedef {object} PlatformPort
 *  @property {'chrome'|'web'|'desktop'}                 kind
 *  @property {(keys:string[]) => Promise<object>}       storageGet
 *  @property {(obj:object) => Promise<void>}            storageSet
 *  @property {(cb:(changes:object)=>void) => (()=>void)} storageSubscribe
 *  @property {(msg:object) => Promise<object>}          sendMessage
 *  @property {() => void}                               openOptionsPage
 *  @property {(req:{method:string,path:string,body?:object}) => Promise<
 *              {ok:boolean,data?:any,error?:{code:string,message:string}}>} hostFetch
 *  @property {() => Promise<{ok:boolean,error?:string}>} startHost
 */
```

- `platform/chrome.js`：`chrome.storage.local` / `chrome.runtime` / `connectNative`。
- `platform/web.js`：`localStorage` / no-op runtime / `fetch`。
- `desktop/platform.js`：文件存储 / contextBridge / 直连 `127.0.0.1:8766`。

## 4. 数据层设计

### 4.1 repository（单一真源）

```js
createRepository(port) -> {
  load(),                        // 启动：从 host 拉取 → 内存
  list({ scope, filters }),      // 同步查询（内存）
  create(patch), update(id,patch), remove(id),
  subscribe(cb),                 // 变更通知，返回退订
  refresh(),                     // 外部变更触发（轮询 / storage 事件）
}
```

- 内存态为唯一真源；`platform.storage` 只作持久化缓存，不再是第二真源。
- 写路径：乐观更新内存 → `hostFetch` 落 host → 失败回滚 + toast。

### 4.2 sync-bridge（合并 3 条路径）

现状 pull（启动）+ poll（20s）+ `onChanged` → 合并为：
1. 启动调 `repository.load()`（pull）。
2. 定时与 storage 事件都调 `repository.refresh()`，以内容签名去重（沿用 `lastSig` 思路）。
3. 统一 `subscribe` 通知 → `app.js` 重渲染。

删除：`normalizeEntry` / `newerEntry` / `startPushListener`（no-op）、`journals`/`todos` 全量委托。

## 5. UI 拆分设计

| 模块 | 来源（sidepanel.js 行区间） |
|---|---|
| `entries/sidepanel.js`（app） | 初始化 3303–3695 + 全局刷新 2137–2147 |
| `views/timeline.js` | 1156–1738 |
| `views/week.js` | 960–1138 |
| `views/month.js` | 836–959 |
| `views/pool.js` | 1739–2012 |
| `views/heatmap.js` | 2015–2046 |
| `views/calendar.js` | 2049–2134 |
| `views/skills.js` | 3232–3302 |
| `features/card-editor.js` | 268–609 + 编辑态 |
| `features/template-builder.js` | 2197–3231 |
| `features/toast.js` | 611–619 |
| `features/emoji.js` / `select.js` | 原 lib/ |
| `state/view-state.js` | 顶部 74–157 视图状态变量 |

渲染约定：
- render 函数**纯 + 幂等**：输入状态，输出 DOM；不读模块级可变全局、不写 storage。
- 统一走 `components/` 或轻量 `dom` 工具；禁止对用户内容用 `innerHTML`。

## 6. 样式收敛设计

- `styles/tokens.css`：`:root` 变量**唯一**定义处（颜色/间距/圆角/阴影/字体）。
- `styles/base.css`：reset + 布局骨架。
- `styles/views/*.css`：时间线/周历/日历/热力图保留原生 CSS（运行时定位无法 utility 化）。
- Tailwind `src/tailwind.css` 的 `@theme` 改为**读 tokens 别名**，不再重复定义值；
  或整体退役（子任务评审时二选一）。
- 门禁：`dev-loop` 多宽度截图 + computed-style 断言，视觉零漂移才算过。

## 7. ESLint 边界规则（契约）

```js
// 概念示意
{ files: ['extension/shared/**'], rules: { 'no-restricted-imports': ['error', {
    patterns: ['../*', '**/platform/**', '**/state/**', '**/views/**', '**/features/**',
               'node:*', 'chrome'] }] } },
{ files: ['extension/{state,views,features,components}/**'], rules: { 'no-restricted-imports': ['error', {
    patterns: ['**/platform/**'] }] } },
{ files: ['extension/{shared,state,views,features,components,entries}/**'], rules: {
    'no-restricted-globals': ['error', 'chrome'] } },
{ files: ['host/**'], rules: { 'no-restricted-imports': ['error', {
    patterns: ['**/extension/platform/**','**/extension/state/**','**/extension/views/**',
               '**/extension/features/**','**/extension/entries/**'] }] } },
```

## 8. 桌面壳设计（Electron）

```
desktop/main.js
  ├─ spawn('node', ['host/server.js'])                 # 内嵌权威服务
  ├─ BrowserWindow → loadFile('extension/sidepanel.html')  # 同一套 UI
  └─ preload.js → contextBridge.exposeInMainWorld('platform', port)
```

Chrome 用 `connectNative`+Go launcher；桌面用 spawn；二者只实现同一端口契约。

## 9. 迁移策略与回滚

- 优先 `git mv` 保留历史；每步保持可运行、可提交。
- 顺序：`baseline → shared → platform → repository → ui-split → styles → desktop → types`。
- 回滚点 = 每个子任务的提交；依赖单调向下，回滚第 N 步不影响第 N-1 步产物。
- `ui-split` 期间保留旧 `extension/sidepanel.{js,html}` 作为 fallback，验收后删除。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| ui-split 触碰几乎全部 UI 逻辑 | 先补 dev-loop 断言基线；一次一模块、每步可运行 |
| 数据真源合并引入竞态 | repository 乐观更新 + 内容签名去重 + 竞态回归用例 |
| 样式双轨迁移视觉漂移 | computed-style 断言作为门禁，禁止"看起来差不多" |
| host 与 extension 卡片归一化重复 | 抽 `shared/card-schema.js`；host 只消费纯逻辑叶子 |
| 范围蔓延 | 行为冻结：重构期不新增功能 |
| 与 11 个 in_progress 任务冲突 | baseline 阶段先收口/归档，避免移动靶 |
