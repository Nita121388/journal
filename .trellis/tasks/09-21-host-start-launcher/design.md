# 技术设计 — 扩展一键启动 host

## 架构总览

```
sidepanel.js ──connectNative('com.journal.host')──▶ Chrome Native Messaging
                                                          │ stdin(4B len + JSON)
                                                          ▼
                                              host/journal-host-launcher.exe
                                                          │ {type:"start"}
                                                          ▼
                                          exec.Command("node","server.js")   ← 工作目录=exe 所在目录
                                                          │ HideWindow
                                                          ▼
                                              node server.js 127.0.0.1:8765
扩展轮询 fetch /api/health ←───────────────────────────────┘
```

浏览器扩展不能直接启动本地进程，因此启动动作通过 Native Messaging Host 桥接。原生 host 是一个小 Go 程序，收到消息后用隐藏窗口把 node server.js 拉起来，然后回一条 JSON 确认。扩展随即轮询 `/api/health` 判定是否真正在线。

## 一、原生启动器（Windows .exe）

位置：`host/journal-host-launcher.exe`，源码 `host/launcher/main.go`。

- 协议：从 `stdin` 读 4 字节小端长度 + UTF-8 JSON 消息（Chrome Native Messaging 规范）；`type == "start"` 时执行启动；回写 `{type:"result", success:true}`（同样 4 字节长度前缀写出到 `stdout`），随后退出。
- 启动方式：`exec.Command("node", "server.js")`，`Dir` = 当前 exe 所在目录（`os.Executable()` 的 dirname），`SysProcAttr.HideWindow = true`（隐藏控制台）。不依赖 vbs（现有 bat/vbs 保留不动，仅作为登录自动启动路径；两者可共存）。
- 幂等：不检查端口，直接让 node 拉起；若已在运行，node 会因端口占用报错退出，不影响已有进程。扩展侧以 `/api/health` 为准判断，故无需 launcher 判重。
- 编译（macOS 交叉编译，产出自带，无需用户装 Go）：
  `cd host/launcher && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ../journal-host-launcher.exe .`

## 二、Native Messaging 注册（一次性安装）

`host/install-host.bat`（在 host 目录内运行，以脚本自身位置定位 host 目录）：

1. 以脚本所在目录推导 `HOST_DIR`（`%~dp0` 去掉尾斜杠）。
2. 生成 `%HOST_DIR%\com.journal.host.json`（native 清单），其中 `path` 填 `%HOST_DIR%\journal-host-launcher.exe` 的绝对路径；`allowed_origins` 含扩展 id（安装脚本可先填 `chrome-extension://<扩展ID>/`，需用户从 `chrome://extensions` 复制；也可先用通配做占位并在 review 时定）。因 id 因机器而异，install 脚本带一个可替换的占位，并在注释里说明如何填。
3. 写注册表（HKCU，无需管理员）：
   - `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.journal.host` → `%HOST_DIR%\com.journal.host.json`
   - `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.journal.host` → 同路径
   - 用 `reg add` 幂等写入；失败打印提示。

> 注意：`allowed_origins` 是 Chrome 的安全校验，必须精确匹配扩展 id。install 脚本打印当前写入值，提示用户核对。

## 三、扩展侧

- `manifest.json`：`"permissions": ["storage","sidePanel","nativeMessaging"]`。
- `sidepanel.html`：在 `<header>` 下方新增一个 `#host-banner`（默认 `hidden`），含状态文案 + `#btn-start-host`。
- `sidepanel.js`：
  - 新增 `checkHostHealth()`：`fetch('/api/health', {signal: AbortSignal.timeout(1200)})` 判定在线/离线，更新横幅显隐。
  - 启动流程 `startHost()`：`const port = chrome.runtime.connectNative('com.journal.host')`；`port.postMessage({type:'start'})`；收到消息或端口断开即视为已触发；随后轮询 `/api/health`（间隔 ~500ms，总超时 ~15s）；成功 → 隐藏横幅、`await pullFromHost()` 刷新、toast 成功；失败 → 按钮恢复可用、toast 失败原因（含「未安装 native host / 请先运行 install-host.bat」的提示）。
  - 启动期间按钮置 disabled 防重复点击；`connectNative` 抛错时（说明 host 未注册）走失败分支并提示安装步骤。
  - 页面加载时执行一次 `checkHostHealth()`；可挂在已有初始化流程尾部，避免与现有数据拉取重复。

## 四、兼容与回归

- 现有 `host-sync.js` 的离线降级逻辑不动：即便按钮未用，离线时仍走缓存。
- 不改变任何 API 语义；server.js 只新增/保留 `/api/health`（已存在）。
- 横幅为纯增强 UI：host 在线时隐藏，不干扰主界面。

## 边界与失败场景

| 场景 | 行为 |
|---|---|
| native host 未注册（install-host.bat 未跑） | `connectNative` 抛错 → 失败提示 + 告知运行 install-host.bat |
| node 已运行 | 横幅本就隐藏；即使点按钮，health 立即通过 |
| node 启动慢 | 轮询最多 ~15s，成功则刷新 |
| 启动后仍离线 | 超时提示 + 可重试 |
| 端口被其他进程占用 | health 不通过 → 超时提示（不误报成功） |
