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

两个分支的代码差异**只有 3 个文件 4 行**：

```
extension/shared/protocol.js   DEFAULT_HOST_PORT  8765 / 8766
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

### 发布（dev → stable）

```bash
git checkout main
git merge dev/local --no-ff

# 重新应用 prod 配置（3 处）
#   extension/shared/protocol.js : DEFAULT_HOST_PORT = 8765
#   host/server.js               : DEFAULT_PORT = 8765
#   extension/manifest.json      : name=Journal, key=<journal-prod.key.b64>

git commit -am "release: <说明>"

# 部署
robocopy extension → D:\Apps\ChromeExtensions\journal\extension
robocopy host      → D:\Apps\ChromeExtensions\journal\host   (XD data)
# 重启 prod host
```

---

## 注意事项

1. **不要在仓库里起 prod host**。仓库的 `host\data` 已移除 junction，
   在仓库起 host 会用 `start-dev.bat`（dev 数据）或空目录。
2. **`start-dev.bat` 显式指向 `E:\primary\data\journal-dev`**，
   不会误写 prod 数据。
3. **两个扩展共用 native host 名 `com.journal.host`**，注册表只能指一个，
   当前指向 prod（`D:\...\journal\host\com.journal.host.json`）。
   dev 请用 `start-dev.bat` 手动启动。
4. **`journal-data\backup.bat`** 备份的是 SQLite 三件套，
   不是已废弃的 `journal-data.json`。
5. 该目录**禁用 `git clean -xdf`** —— 会删掉 `dev-loop/out`（历史报告）等未跟踪产物。

---

## 历史迁移记录

- `E:\primary\_backup\journal-migration-2026-11-07\` — 路径迁移（项目/数据/部署三分）
- `E:\primary\_backup\journal-upgrade-20261107\` — 旧版 → 新版架构升级 + 合并单目录
