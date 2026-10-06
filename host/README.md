# `host/` — 本地权威服务

扩展的**权威数据源**与同步引擎。只监听 `127.0.0.1`，不经任何远程服务器。

```
host/
├── server.js              REST 服务（createApp / startServer）+ skills 扫描
├── cli.mjs                agent / CLI 客户端（直连同一 REST）
├── auto-summary.mjs       定时摘要（可选）
├── lib/
│   ├── storage.js         SQLite 权威存储（node:sqlite；JSON 回退；加列迁移）
│   ├── llm.js             LLM 代理（三协议 + 三级结构化降级；密钥永不外泄）
│   ├── llm-providers.js   服务商数据表（host 单一来源，下发给扩展）
│   └── logger.js          结构化日志（[host][level] component: msg）
├── sync/
│   ├── engine.js          同步编排
│   ├── merge.js           逐卡 LWW + 删除墓碑
│   ├── mdformat.js        Markdown 序列化
│   └── backplane.js       local / webdav / github 可插拔介质
├── launcher/              native-messaging 启动器的 **Go 源码**
├── test/                  node:test 测试
└── data/                  journal.db / config.json（.gitignore，含隐私）
```

## 启动

```bash
node host/server.js                      # 默认 127.0.0.1:8766（可用 JOURNAL_PORT 覆盖）
node host/cli.mjs --help                 # CLI / agent 客户端
JOURNAL_DATA_DIR=/tmp/x node host/server.js   # 隔离数据目录（测试/调试用）
```

环境变量：`JOURNAL_PORT` · `JOURNAL_DATA_DIR` · `JOURNAL_AI_CONFIG` · `JOURNAL_SKILLS_DIR`。

## 安全模型（重要）

`host` 监听本机端口，而**任意网页都能向 localhost 发起请求**，因此：

| 机制 | 说明 |
|---|---|
| **来源白名单** | 无 `Origin`（CLI / agent）放行；`chrome-extension://*` 与 `127.0.0.1`/`localhost` 放行并回显 CORS；**其余一律 403**且不下发 CORS 头 |
| **无通配 CORS** | 不再有 `Access-Control-Allow-Origin: *`；扩展侧改用 `manifest.host_permissions` 授权 |
| **AI 端点护栏** | 修改 `baseURL` 时必须同时重新提交 `apiKey`，阻断「改端点 → 让 host 用旧 key 请求攻击者服务器」的密钥外泄链 |
| **请求体上限** | 8MB（超限 413，超 64MB 断连） |
| **密钥处理** | API key 只存 `host/data/config.json`；`GET /api/ai/config`、`GET /api/sync/config` 一律脱敏（只回 `*Set`），永不回显、永不写日志 |

回归测试：`test/server-security.test.mjs`（10 例，含裸 socket 取证 413）。

> 从任意网页控制台执行 `fetch('http://127.0.0.1:8766/api/cards')` **必须失败**。

## 启动器二进制（为什么入库）

| 文件 | 平台 | 来源 |
|---|---|---|
| `journal-host-launcher.exe` | Windows x64 | `go build ./launcher` |
| `journal-host-launcher` | macOS arm64 | 同上 |

这两个二进制是 **native messaging** 的宿主入口（供侧栏「启动服务」按钮拉起 host）。
入库是**产品决策**：安装扩展的用户不应被要求装 Go。

- 源码在 `launcher/`（`main.go` + 平台相关 `hide_*.go`），可随时重新构建。
- 重新构建后请一并提交，保持二进制与源码同步。
- `install-host.bat` 会把它们注册为 native messaging host。

## 数据与迁移

- 权威存储：`data/journal.db`（SQLite）。JSON 回退：`data/journal-data.json`。
- 加列迁移：`VACUUM INTO` 备份 → `ALTER TABLE` → **迁移前后真实快照的结构化比对** → 失败自动回滚。
  校验精确到字段名（`field mismatch <id> @ <field>`），且比较是结构比较（`props` 是对象，不能用 `===`）。
- 同步：逐卡 LWW（`updatedAt` 新者胜）+ 删除墓碑（删除永远传播、不复活）。

## 测试

```bash
cd host && npm test          # node --test test/
```
