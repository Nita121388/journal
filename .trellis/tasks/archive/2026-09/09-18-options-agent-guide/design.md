# Design: Agent 接入引导设置页

## 架构概览

新建 options 设置页（目录结构 spec 已预留 `options.html/js/css`），manifest 注册 `options_page`，并把侧边栏 ⚙️ 按钮接到 `chrome.runtime.openOptionsPage()`。

涉及 5 个文件：

```
extension/
  manifest.json    — 新增 "options_page": "options.html"（+ 无新权限）
  options.html     — 新建：Agent 接入引导区
  options.js       — 新建：复制 prompt、host 健康探测、主题
  options.css      — 新建：样式（复用 sidepanel.css 的 CSS 变量体系）
  sidepanel.js     — #btn-settings 增加 openOptionsPage 处理
```

不改 `store.js` / `model.js` / `host-sync.js` / `background.js`。

## GitHub 链接常量

```js
const REPO = 'https://github.com/Nita121388/journal';
const RAW_SKILL = 'https://raw.githubusercontent.com/Nita121388/journal/main/.agents/skills/journal/SKILL.md';
const HOST = 'http://127.0.0.1:8765';
```

## prompt 模板内容（textarea readonly 承载）

```
我想用 Journal 扩展的 AI 能力写日志。请先获取并阅读技能文件：

方式 A（轻量，推荐）：直接读 raw 内容
  打开 https://raw.githubusercontent.com/Nita121388/journal/main/.agents/skills/journal/SKILL.md
  读完即按其中说明操作（host 服务 + CLI 用法都在里面）。

方式 B（完整）：clone 仓库后在本项目内操作
  git clone https://github.com/Nita121388/journal.git
  技能文件在项目 .agents/skills/journal/SKILL.md，按说明操作。

前置：如果 host 服务未启动，运行 node host/server.js（监听 127.0.0.1:8765）。

之后我会这样说，请照做：
- "今天记录一下：xxx" → 写今天日志
- "给 7/8 加一条：yyy" → read+write 指定日期
- "我的待办有哪些" → todo list
- "加个待办：写周报，明天截止" → todo add

现在开始，等我的指令。
```

要点：无本机 `E:\` 路径（可分享、跨设备通用）；两种获取方式；host 启动提示；示例指令。

## 数据流

```
页面加载 → options.js init()
            ├─ 读 settings（theme）→ 设置 data-theme
            ├─ 探测 host：fetch /api/health → 更新状态灯
            └─ 填充 prompt textarea（静态模板）

复制按钮点击 → navigator.clipboard.writeText(promptText)
            → 成功/失败反馈（按钮文案 1.5s 后还原）

⚙️（sidepanel）→ chrome.runtime.openOptionsPage()
```

## host 状态检测

- `fetch(HOST + '/api/health', { signal: AbortSignal.timeout(2000) })`
- 成功 → 绿点「host 已就绪」；失败/超时 → 灰点「host 未启动」+ 显示启动命令 `node E:/projects/journal/host/server.js`
- **注意**：options 页和 host 同源不同协议（`chrome-extension://` → `http://`），属跨源 fetch，需 CORS —— host server.js 已对所有响应带 `Access-Control-Allow-Origin: *`，无额外改动。若 fetch 被 MV3 拦截，退化为显示"无法探测，请确认 host 已启动"（不阻塞页面功能）。

## 主题

options.js 里复用 sidepanel 的主题逻辑（读 settings.theme → `data-theme="dark"`）。把 `--color-*` 变量体系复制进 options.css 的 `:root` / `[data-theme="dark"]`，保证两页观感一致。

## 回滚点

删除 5 处改动即可：manifest 的 `options_page` 行、`options.html/js/css` 三文件、`sidepanel.js` 里 settings 按钮的 handler。无其他文件受影响。

## 风险 / 延后

- 跨源 fetch host 状态在部分 Chrome 版本可能受限 → 状态灯为**尽力而为**，不阻塞复制 prompt 核心功能
- prompt 模板是静态中文文案，未来若 skill 结构变化需同步更新（在 options.js 顶部常量区集中维护）
