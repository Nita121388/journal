# 部署与 native messaging（Backend）

> prod / dev 两个变体如何在同一台机器上共存。**这是本项目最容易踩的坑。**

---

## 唯一事实：launcher 不注入环境变量

`journal-host-launcher.exe`（native messaging 宿主）的实际行为（隔离目录实测）：

```
spawn(node, ["server.js"], { cwd: <exe 所在目录>, env: os.Environ() })   // 没有 JOURNAL_*
```

推论（写代码/改部署时必须先想清楚这一条）：

| 由谁决定 | 决定什么 |
|---|---|
| **部署目录里的 `host/server.js` 源码** | 默认端口（`main`=8765，`dev/local`=8766） |
| **部署目录下的 `data` junction** | 实际库文件（`<dir>/data/journal.db`） |
| 二进制本身 | 只负责 `node server.js`，两个变体共用同一份 exe |

所以**不需要两套二进制，也不需要重编译**（本机无 Go 工具链，且 README 已声明「不要求用户装 Go」）。

---

## 两个变体

| 变体 | 部署目录 | native host 名 | 端口 | 数据 | 源码分支 |
|---|---|---|---|---|---|
| prod | `D:\Apps\ChromeExtensions\journal\host` | `com.journal.host` | 8765 | `E:\primary\data\journal` | `main` |
| dev | `D:\Apps\ChromeExtensions\journal-dev\host` | `com.journal.host.dev` | 8766 | `E:\primary\data\journal-dev` | `dev/local` |

**Chrome 只按 host 名查 manifest**（`HKCU\Software\{Google\Chrome,Microsoft\Edge}\NativeMessagingHosts\<name>`）。
两个变体共用一个名字 = 只能有一个启动器 = dev 永远点不起来（历史 bug 就是这么来的）。
所以 `extension/shared/protocol.js` 里的 `NATIVE_HOST_NAME` 必须与 `DEFAULT_HOST_PORT` **同源分叉**，
`protocol.test.js` 有断言守着这对不变量。

---

## 部署命令

```cmd
host\deploy-dev-host.bat                 :: 必须在 dev/local 分支
host\deploy-prod-host.bat                :: 必须在 main 分支
host\deploy-prod-host.bat -ManifestOnly  :: 只重建 manifest（不动源码、不重启线上）
```

`host/deploy-host.ps1` 的硬护栏（改动脚本时不许放松）：

1. 读 `host/server.js` 的 `const DEFAULT_PORT = <n>`，与 `-Port` 不符 → **throw**
   （唯一能拦住「main 源码部署进 dev 目录 / 反之」的闸门）。
2. `data` 已存在但不是 junction → **throw**；是 junction 但指向别的目录 → **throw**。
3. 只复制白名单文件，**永不删除**目标目录内容（里面有库、有历史 `.bak`）。
4. dev 目录不部署 `install-host.bat`（它硬编码 prod 的 host 名，跑一次就会劫持 prod 入口）。
5. prod manifest 的 `allowed_origins` 只写 prod 扩展 id；dev 扩展不得能拉起 8765。

---

## 已知陷阱

| 陷阱 | 症状 | 对策 |
|---|---|---|
| 两个变体共用 host 名 | dev 点「启动 host」超时（实际去拉 prod，8765 已占用） | 独立 host 名 + 独立部署目录 |
| 直接对 prod 目录跑 dev 源码 | 上线服务被换成 8766 | 端口自检 |
| `startServer()` 先开库再 `listen()` | 起不来时也会打开库（可能摸到生产库） | 物理隔离数据目录，别共用 |
| `.bat` 用 LF 换行 | `^` 续行失效，脚本静默什么都不做 | `.bat` 必须 CRLF |
| 部署漏 `host/package.json` | `Cannot find module` / CJS 解析报错（`type: module` 丢了） | 复制清单里必须有它 |
| 部署目录缺同级 `extension/shared/` | `server.js` 相对 import 失败 | 部署根下必须有 `extension/` |
