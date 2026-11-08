# 本机环境布局（chemclin 这台机器）

> 这份文档记录**这台机器**上 Journal 的实际落盘位置。
> 其他机器的路径可能不同；`README.md` 里写的是通用流程。
>
> 最后核对：2026-11-07

---

## 一句话

**只有一个开发目录。** `main`（稳定）和 `dev/local`（开发）是同一个目录里的两个分支，
不是两个文件夹。

---

## 三处位置

### ① 开发（源码）

```
E:\primary\projects\journal          ← 唯一目录，git 仓库
```

| 分支 | 角色 | 端口 | 扩展 key | 数据 |
|---|---|---|---|---|
| `main` | **稳定版** | 8765 | prod | `E:\primary\data\journal` |
| `dev/local` | **开发版** | 8766 | dev | `E:\primary\data\journal-dev` |

两个分支的代码差异**只有 3 个文件 5 行**：

```
extension/shared/protocol.js   DEFAULT_HOST_PORT  8765 / 8766
                               NATIVE_HOST_NAME   com.journal.host / com.journal.host.dev
host/server.js                 DEFAULT_PORT       8765 / 8766
extension/manifest.json        name + key         Journal / Journal (dev)
```

其余代码完全一致。

### ② 部署（Chrome 加载 + prod host 运行）

```
D:\Apps\ChromeExtensions\journal\extension       ← Chrome 加载（prod）
D:\Apps\ChromeExtensions\journal\host            ← prod host 从这里跑（8765）

D:\Apps\ChromeExtensions\journal-dev\extension   ← Chrome 加载（dev）
```

每个目录同级还有 `HOW-TO-LOAD.txt`、`deploy-records\`、`extension.bak-*\`。

**关键设计**：prod host 运行在 `D:\...\journal\host`，**不在 git 工作区里**。
因此切换分支永远不会打断线上服务。

### ③ 数据

```
E:\primary\data\journal\         prod 权威库（journal.db + -wal + -shm + 历史 .bak）
E:\primary\data\journal-dev\     dev 库（同上 + config.json，内含 API key，不入库）
E:\primary\data\journal-data\    私有 git 备份仓（backup.bat 备份 SQLite 三件套）
E:\primary\data\journal-keys\    扩展签名密钥（*.pem 私钥，勿外传）
```

接线（junction）：

```
D:\Apps\ChromeExtensions\journal\host\data  -->  E:\primary\data\journal
```

---

## 扩展 ID

已用 manifest 的 `key` 字段固定，**与路径无关**，以后怎么搬都不会变。

| 变体 | 扩展 ID | 名称 |
|---|---|---|
| prod | `lpgikgjoebiolgkanfmaoffbhiphiali` | Journal |
| dev | `plfeioojhaglgflfdhphdhlnkmohoaig` | Journal (dev) |

密钥来源：`E:\primary\data\journal-keys\journal-{prod,dev}.key.b64`（公钥 base64）。
推导方式：`sha256(DER 公钥)[:32]` 映射成 `a..p`。

---

## 日常流程

### 开发

```bash
cd /e/primary/projects/journal
git checkout dev/local          # ← 开发就在这个分支

npm run lint
npm test
cd dev-loop && node dev-loop.mjs --width 320,360,400,500
```

dev 扩展已加载 `D:\Apps\ChromeExtensions\journal-dev\extension`。
改完 `extension/` 后同步到部署目录：

```cmd
robocopy "E:\primary\projects\journal\extension" "D:\Apps\ChromeExtensions\journal-dev\extension" /E /XD node_modules coverage
```

dev host（可选，需要落库时起）：

```cmd
E:\primary\projects\journal\host\start-dev.bat     :: 8766，用 dev 数据
```

或直接点 dev 扩展 header 的 🔴 按钮（走 native messaging，见下「两个 native host 名」）。

### 两个 native host 名（重要）

Chrome 只按 **host 名** 查 manifest。prod 与 dev 若共用一个名字，就只能指向
同一个启动器、同一个端口 —— dev 永远点不起来。所以现在是两条独立链路：

| 变体 | host 名 | 启动器 | 端口 | 数据 |
|---|---|---|---|---|
| prod | `com.journal.host` | `D:\Apps\ChromeExtensions\journal\host\journal-host-launcher.exe` | 8765 | `E:\primary\data\journal` |
| dev | `com.journal.host.dev` | `D:\Apps\ChromeExtensions\journal-dev\host\journal-host-launcher.exe` | 8766 | `E:\primary\data\journal-dev` |

**为什么不用改 launcher 二进制**：launcher 只做 `node server.js`，cwd = 自己所在目录，
**不注入任何 `JOURNAL_*` 环境变量**。所以默认端口由「部署目录里的 server.js 源码」决定
（main=8765，dev/local=8766），数据目录永远是 `<部署目录>\data`（junction）。
同一个 exe 在两个目录里就是两个变体。

部署 / 重新注册（脚本会自检「源码默认端口 == 目标端口」，不符直接报错）：

```cmd
:: dev（必须在 dev/local 分支执行）
E:\primary\projects\journal\host\deploy-dev-host.bat

:: prod（必须在 main 分支执行）
E:\primary\projects\journal\host\deploy-prod-host.bat

:: 只重建 manifest（收敛 allowed_origins，不动源码、不重启）
E:\primary\projects\journal\host\deploy-prod-host.bat -ManifestOnly
```

### 发布（dev → stable）

```bash
git checkout main
git merge dev/local --no-ff

# 重新应用 prod 配置（3 处）
#   extension/shared/protocol.js : DEFAULT_HOST_PORT = 8765, NATIVE_HOST_NAME = 'com.journal.host'
#   host/server.js               : DEFAULT_PORT = 8765
#   extension/manifest.json      : name=Journal, key=<journal-prod.key.b64>

git commit -am "release: <说明>"

# 部署（用脚本，别手工 robocopy 注册表/manifest）
robocopy extension → D:\Apps\ChromeExtensions\journal\extension
host\deploy-prod-host.bat          # 必须在 main 分支跑（会自检 8765）
# 重启 prod host
```

---

## 注意事项

1. **不要在仓库里起 prod host**。仓库的 `host\data` 已移除 junction，
   在仓库起 host 会用 `start-dev.bat`（dev 数据）或空目录。
2. **`start-dev.bat` 显式指向 `E:\primary\data\journal-dev`**，
   不会误写 prod 数据。
3. **native host 名已按变体分开**：prod `com.journal.host`（8765）、dev `com.journal.host.dev`（8766）。
   prod 的 manifest `allowed_origins` 只含 prod 扩展 id；dev 扩展已无法借 prod 入口拉起 8765 实例。
   注册用 `host\deploy-{dev,prod}-host.bat`，不要手写注册表。
4. **`journal-data\backup.bat`** 备份的是 SQLite 三件套，
   不是已废弃的 `journal-data.json`。
5. 该目录**禁用 `git clean -xdf`** —— 会删掉 `dev-loop/out`（历史报告）等未跟踪产物。

---

## 历史迁移记录

- `E:\primary\_backup\journal-migration-2026-11-07\` — 路径迁移（项目/数据/部署三分）
- `E:\primary\_backup\journal-upgrade-20261107\` — 旧版 → 新版架构升级 + 合并单目录
- 2026-11-08 — dev host 独立部署 + native host 名分离（修复 dev「启动 host」必失败）
