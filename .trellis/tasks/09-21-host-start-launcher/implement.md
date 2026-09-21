# 实施计划 — 扩展一键启动 host

依赖：`Go 1.25`（macOS 交叉编译）；Windows 真机仅用于注册表写入与 Chrome 验证（用户配合）。

## 步骤

- [ ] **S1 原生启动器**
  - `host/launcher/main.go`：Native Messaging 协议（stdin 4B 长度 + JSON），`type=="start"` → `exec.Command("node","server.js")`，`Dir`=exe 目录，`HideWindow`，回写 `{success:true}` 后退出。含 go.mod。
  - 交叉编译：`cd host/launcher && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ../journal-host-launcher.exe .`
  - 校验：`file host/journal-host-launcher.exe` → `PE32+ executable ... x86-64`；本机 `node server.js` 冒烟（node 拉起后 `/api/health` 返回 running）。

- [ ] **S2 Native 注册脚本**
  - `host/install-host.bat`：由 `%~dp0` 推导 `HOST_DIR` → 生成 `com.journal.host.json`（`path`=exe 绝对路径，`allowed_origins` 含扩展 id，脚本内带可替换占位与注释）→ `reg add` 写 Chrome/Edge 的 HKCU NativeMessagingHosts 键；幂等；失败打印提示。
  - 校验：脚本可执行逻辑在 macOS 无法跑通，改在 Windows 上人工执行（见 S5）。

- [ ] **S3 扩展权限**
  - `extension/manifest.json`：`permissions` 增加 `nativeMessaging`。
  - 校验：manifest JSON 合法（`python3 -m json.tool`）。

- [ ] **S4 sidepanel 按钮与状态**
  - `sidepanel.html`：header 下新增 `#host-banner`（hidden 默认），含状态文案 + `#btn-start-host`。
  - `sidepanel.css`：横幅/按钮样式，跟随主题变量。
  - `sidepanel.js`：
    - `els` 增加 `hostBanner`、`btnStartHost`。
    - `checkHostHealth()`：`fetch /api/health`（`AbortSignal.timeout(1200)`）→ 在线隐藏横幅 / 离线显示。
    - `startHost()`：`connectNative('com.journal.host')` → `postMessage({type:'start'})` → 轮询 `/api/health`（500ms 间隔，≤15s）→ 成功 `await pullFromHost()` + toast + 隐藏横幅；失败/`connectNative` 抛错 → 提示安装步骤；按钮启动期间 disabled。
    - `init()`：末尾调用 `checkHostHealth()`；绑定 `btnStartHost` click → `startHost()`。
  - 校验：`node --check extension/sidepanel.js`；在 macOS 静态读码 review（无法真机触发 native）。

- [ ] **S5 Windows 人工验证（用户配合）**
  - 在 chemclin Windows 机器：把更新拉到 `E:\projects\journal` → 运行 `host\install-host.bat`（核对 allowed_origins 里的扩展 id 与实际 `chrome://extensions` 一致）→ Chrome 重载扩展 → 不启动 host → sidepanel 显示横幅 → 点「启动 host」→ host 拉起、横幅消失、数据刷新。
  - 记录结果并归档任务。

## 验证命令汇总

```bash
python3 -m json.tool extension/manifest.json
node --check extension/sidepanel.js
file host/journal-host-launcher.exe
cd host/launcher && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ../journal-host-launcher.exe .
```

## 回滚点

- 各文件独立；回滚即 `git checkout -- <file>`。`journal-host-launcher.exe` 与 `install-host.bat` 为新增文件，删除即可。
- 注册表键可手动删除：`reg delete HKCU\Software\Google\Chrome\NativeMessagingHosts\com.journal.host /f`（及 Edge 同名）。
