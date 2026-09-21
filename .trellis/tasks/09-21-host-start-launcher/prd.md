# 扩展一键启动 host（Host 未连接时按钮拉起）

## Goal

当 Journal 扩展在 sidepanel 中检测到本地 host（`127.0.0.1:8765`）未连接时，用户能通过扩展内一个「启动 host」按钮一键拉起 host 服务，无需手动去双击批处理脚本。核心约束：Chrome MV3 扩展沙箱无法直接 spawn 本地进程，必须借助 **Chrome Native Messaging Host** 桥接启动动作。

## Background / Confirmed Facts

- host = `node server.js`，监听 `127.0.0.1:8765`，数据在 `host/data/journal-data.json`；`/api/health` 返回 `{status:'running'}`。
- 现有自动启动：`host/start-journal-host.bat`（登录时静默拉起，经 `wscript start-hidden.vbs` 隐藏窗口跑 node）。
- 扩展现在只在写入/拉取失败时弹 toast「host 未连接」，没有显式启动能力，也没有常驻的连接状态提示。
- **关键技术事实**：Chrome 的 Native Messaging Host 清单 `path` 必须指向一个真正的 PE 可执行文件（`.exe`），不能直接指向 `.bat`/`.cmd`/`.js`。本机 macOS 有 Go 1.25，可交叉编译 Windows amd64 `.exe`，因此启动器采用 Go 编译成 exe 随包发布。
- 实现产物可在 macOS 编写 + 交叉编译；**注册表写入与 Chrome 真机验证必须在 Windows（chemclin 机器）执行**。

## Requirements

- **原生启动器**：一个 Windows 可执行文件（Go 交叉编译 `host/journal-host-launcher.exe`），实现 Native Messaging Host 协议；收到 `{type:"start"}` 消息后隐藏窗口拉起 `node server.js`（工作目录取自身所在目录），并回写一条确认 JSON。
- **Native 注册**：`host/install-host.bat` 一次性写入注册表 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.journal.host`（及 Edge 同名键），指向 native host 清单文件；清单内 `path` 为 exe 的绝对路径（由安装脚本生成，避免写死盘符）。
- **扩展权限**：`extension/manifest.json` 的 `permissions` 增加 `nativeMessaging`。
- **按钮与状态**：sidepanel 在 host 离线时展示一个常驻的「host 未连接」横幅，内含「启动 host」按钮；点击后经 `chrome.runtime.connectNative` 发 `start`，随后轮询 `/api/health` 直到在线（含超时与失败提示），成功后自动刷新数据（复用现有拉取逻辑）。
- **host 在线时**：横幅隐藏（不打扰）；可选显示轻量的在线状态。

## Acceptance Criteria

- [ ] `host/journal-host-launcher.exe` 存在且为 Windows PE（`file` 可识别），源码 `host/launcher/main.go` 可读可改。
- [ ] `host/install-host.bat` 生成 native 清单并写入 Chrome/Edge 的 HKCU NativeMessagingHosts 注册表键；重复运行幂等。
- [ ] `extension/manifest.json` 包含 `nativeMessaging` 权限。
- [ ] sidepanel 离线时出现横幅 +「启动 host」按钮；在线时不显示横幅。
- [ ] 点击按钮 → 启动成功 → 轮询到 `/api/health` 在线 → 横幅消失且数据已刷新。
- [ ] 点击按钮但 host 仍无法启动时，给出明确的失败/超时提示，不崩溃、可重试。
- [ ] （Windows 人工验证）在 `chrome://extensions` 重载扩展后，未启动 host 状态下点按钮能把 host 拉起。

## Out of Scope

- 修改 host 服务本身的数据逻辑/API。
- 跨平台（macOS/Linux）的自动启动。
- 卸载清理脚本（可选，不在本轮）。
- 改动日志/热力图/TODO 功能本体。

## Open Questions

- 无（方案 A + Go exe + HKCU 注册 + 按钮/横幅交互均已收敛）。
- 备注：`nativeMessagingHosts` 注册键是否同时覆盖 Edge，本轮默认 Chrome + Edge 均写入；如仅需 Chrome 可在 review 时删掉 Edge 分支。

## Notes

- Windows 侧安装与验证需要用户配合运行 `host/install-host.bat` 并在 Chrome 中重载扩展。
- 执行步骤见 `implement.md`；技术方案见 `design.md`。
