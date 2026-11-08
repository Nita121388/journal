# dev host 独立部署 + native messaging 分离

## 背景（实测证据）

dev 扩展（`D:\Apps\ChromeExtensions\journal-dev\extension`，id `plfeioojhaglgflfdhphdhlnkmohoaig`）
点 header 的 🔴「启动 host」按钮必然失败，报「启动失败：启动超时」。

根因链：

1. `HKCU\...\NativeMessagingHosts\com.journal.host` 只有一个条目，指向
   `D:\Apps\ChromeExtensions\journal\host\journal-host-launcher.exe`（prod）。
   Chrome 按 **host 名** 查 manifest，prod / dev 扩展共用同一个名字 → 永远只有一个 launcher。
2. 该 exe 是 2026-09-23 编译的（git `ee1317a`），二进制里**没有** `JOURNAL_PORT` /
   `JOURNAL_DATA_DIR` 字符串（`grep -a` 0 命中，隔离目录实测其传给 node 的环境为 null）。
   而 `host/launcher/main.go` 里写死 8766 是 9/30 的 `a43c86a` 才加的，**exe 从未重编译**。
3. 于是链路是：dev 按钮 → native messaging → prod launcher → `node server.js`（cwd = prod host 目录）
   → 默认 8765 → 与现役进程（PID 14568）抢端口 → node 立即退出（launcher 已回 success:true）
   → dev 扩展轮询 8766 等 15s → 超时失败。
4. 附带风险：`startServer()` 先 `createStore()` 再 `listen()`，所以这条失败链路会**打开一次生产库**。
5. 即使重编译 exe 带上 8766 也不够：它的 `cmd.Dir` 是 prod 目录、`data` 是指向
   `E:\primary\data\journal` 的 junction → dev 读写会落进生产库。

## 目标

dev 扩展点「启动 host」能真正拉起 8766 的 dev host，读写 `E:\primary\data\journal-dev`，
且**任何情况下不影响** prod（8765 / `E:\primary\data\journal`）。

## 方案（用户已确认 B）

沿用现有 launcher 二进制（本机无 Go 工具链，且 README 已把「不要求用户装 Go」定为产品决策），
靠**部署目录**做隔离：

- dev host 部署到 `D:\Apps\ChromeExtensions\journal-dev\host\`，源码来自 `dev/local` 分支
  （`host/server.js` 的 `DEFAULT_PORT` 已是 8766），`data\` 用 junction 指向 `E:\primary\data\journal-dev`。
- launcher 不传任何 env → node 走 dev 源码里的默认值 → 8766 + `<部署目录>\data` → 正确。
- native messaging 用**独立 host 名** `com.journal.host.dev` 注册到 dev 目录的 exe；
  prod 保持 `com.journal.host`。两个扩展各走各的。
- 部署动作脚本化（`host/deploy-host.ps1` + dev/prod 两个零参 wrapper），避免下次再靠手工复制。

## 需求

| # | 需求 |
|---|---|
| R1 | dev 扩展点按钮 → 8766 dev host 起来，数据落 `E:\primary\data\journal-dev` |
| R2 | prod 链路（8765 / 生产库 / `com.journal.host`）行为完全不变 |
| R3 | prod manifest 的 `allowed_origins` 收敛为仅 prod 扩展 id，dev id 从 prod 入口移除 |
| R4 | 部署可重复执行：一条命令把当前分支 host 部署到指定目录，并注册对应 host 名 |
| R5 | 部署脚本能自检「源码默认端口 == 目标端口」，防止把 main 源码部署成 dev（或反之） |
| R6 | dev host 已在跑时，`start-dev.bat` 不报端口占用错误 |
| R7 | 文档同步：`docs/local-dev-layout.md`、`host/README.md` 写清两个 host 名与部署命令 |

## 非目标

- 不改 launcher 源码 / 不重编译二进制（本机无 Go，且不改变「二进制入库」的产品决策）。
- 不改 host 的 HTTP API、存储层、同步引擎。
- 不处理 main 分支同步（单独一步：cherry-pick 后把两处分叉值改回 8765 / `com.journal.host`）。

## 验收标准

1. 注册表里存在两个 host 名，分别指向两个目录的 exe：
   - `com.journal.host` → `D:\Apps\ChromeExtensions\journal\host\journal-host-launcher.exe`
   - `com.journal.host.dev` → `D:\Apps\ChromeExtensions\journal-dev\host\journal-host-launcher.exe`
2. 用 native messaging 协议（4 字节小端长度 + `{"type":"start"}`）驱动 **dev** exe，3s 内
   `http://127.0.0.1:8766/api/health` 返回 ok，且日志显示
   `file=E:\primary\data\journal-dev\journal.db`。
3. 同时 prod `8765/api/health` 仍在线，prod 数据目录未被 dev 写入（`journal.db-wal` mtime 不变）。
4. `D:\Apps\ChromeExtensions\journal-dev\host\data` 是指向 `E:\primary\data\journal-dev` 的 junction。
5. prod manifest 的 `allowed_origins` 只剩 `lpgikgjoebiolgkanfmaoffhbiphiali`。
6. `npm run lint` + `npm --prefix extension run test` 全绿。
