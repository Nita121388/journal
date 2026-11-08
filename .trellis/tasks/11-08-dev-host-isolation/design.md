# 技术设计

## 1. 关键洞察：不需要重编译 launcher

`journal-host-launcher.exe` 的行为（隔离实测）：

```
spawn(node, ["server.js"], { cwd: <exe 所在目录>, env: os.Environ() })  // 未注入任何 JOURNAL_*
```

因此 **node 侧的所有默认值都由「部署目录里的源码」决定**：

| 部署目录里的 `host/server.js` | 默认端口 | 默认数据目录 |
|---|---|---|
| `dev/local` 分支源码 | 8766 | `<部署目录>/data` |
| `main` 分支源码 | 8765 | `<部署目录>/data` |

→ 只要 dev / prod 各自有一份目录 + 各自的 `data` junction，同一个 exe 就能服务两个变体。
这也是本设计不碰 Go、不碰二进制的原因。

已验证的前置条件：
- `host/server.js:15,17` 相对 import 了 `../extension/shared/{md-export,model}.js`；
  `lib/storage.js`、`sync/merge.js` 引用 `../../extension/shared/card-schema.js`。
  → 部署根目录下必须同时有 `extension/shared/`（dev 目录已存在：`D:\...\journal-dev\extension`）。
- `host/package.json` 有 `"type": "module"`，**必须一起复制**，否则 node 按 CJS 解析 `.js` 直接崩。

## 2. 布局

```
D:\Apps\ChromeExtensions\journal\            prod
├── extension\                              id lpgikgjoebiolgkanfmaoffhbiphiali
└── host\
    ├── server.js  lib\  sync\  package.json  (来自 main)
    ├── journal-host-launcher.exe
    ├── com.journal.host.json               name=com.journal.host
    └── data\ --> E:\primary\data\journal

D:\Apps\ChromeExtensions\journal-dev\        dev
├── extension\                              id plfeioojhaglgflfdhphdhlnkmohoaig
└── host\                                   ← 本任务新建
    ├── server.js  lib\  sync\  package.json  (来自 dev/local)
    ├── journal-host-launcher.exe
    ├── com.journal.host.dev.json           name=com.journal.host.dev
    └── data\ --> E:\primary\data\journal-dev
```

注册表（Chrome + Edge 各一份，值 = manifest 绝对路径）：

```
com.journal.host      -> ...\journal\host\com.journal.host.json
com.journal.host.dev  -> ...\journal-dev\host\com.journal.host.dev.json
```

## 3. 契约变更：host 名进 protocol（分支分叉点）

`extension/shared/protocol.js` 新增：

```js
/** native messaging host 名。prod=com.journal.host，dev=com.journal.host.dev。 */
export const NATIVE_HOST_NAME = 'com.journal.host.dev';
```

`extension/platform/background.js`：`chrome.runtime.connectNative(NATIVE_HOST_NAME)`（替换硬编码字面量）。

分支差异从 3 文件 4 行变成 3 文件 5 行（`protocol.js` 多一行），仍然只在既有分叉文件内。

## 4. 部署脚本

`host/deploy-host.ps1`（唯一实现）：

```powershell
param(
  [Parameter(Mandatory)][ValidateSet('prod','dev')][string]$Variant,
  [Parameter(Mandatory)][string]$TargetDir,
  [Parameter(Mandatory)][string]$DataDir,
  [Parameter(Mandatory)][int]$Port,
  [Parameter(Mandatory)][string]$HostName,
  [Parameter(Mandatory)][string[]]$ExtensionIds,
  [switch]$NoRegister
)
```

步骤与护栏：

1. `$RepoRoot = Split-Path $PSScriptRoot -Parent`。
2. **端口自检**：正则读 `host/server.js` 里的 `const DEFAULT_PORT = (\d+);`，与 `-Port` 不符直接
   `throw`（拦住「main 源码部署到 dev 目录」这类事故）。
3. 复制清单（只用 `Copy-Item -Force`，**不删目标目录**，避免误删 `data` / 历史备份）：
   `server.js`、`package.json`、`cli.mjs`、`auto-summary.mjs`、`README.md`、`lib\`、`sync\`、
   `journal-host-launcher.exe`、`start-dev.bat`、`start-journal-host.bat`、`install-host.bat`。
4. `data` 接线：不存在 → `cmd /c mklink /J`；已存在且为目录 → 校验其真实路径等于 `-DataDir`，
   否则 **throw**（绝不对着生产库部署 dev）。
5. 写 `$HostName.json`：`path` = 目标目录 exe，`type` = `stdio`，
   `allowed_origins` = `chrome-extension://<id>/`。
6. `-NoRegister` 未给时写注册表（HKCU Chrome + Edge）。
7. 输出回执：端口 / 目录 / 数据真实路径 / host 名 / 注册表值。

`host/deploy-dev-host.bat` / `host/deploy-prod-host.bat`：零参 wrapper，把本机路径常量收在一处。

## 5. 安全收敛

prod manifest 由 `deploy-prod-host.bat` 重新生成时只写 prod id（R3）。
dev 扩展从此无法借 `com.journal.host` 拉起 prod host；两条链路互不越界。

## 6. 兼容与回滚

| 场景 | 行为 |
|---|---|
| 用户不跑部署脚本 | 一切照旧；dev 按钮仍失败，但 `start-dev.bat` 可用 |
| 回滚 | 删注册表 `com.journal.host.dev` 键 + 删 `journal-dev\host` 目录；prod 无任何改动 |
| prod 安装流程 | `install-host.bat` 保持原样（兼容旧文档），新流程走 `deploy-prod-host.bat` |

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 误把 dev 源码部署进 prod 目录 | 端口自检 + 已存在 `data` junction 目标校验，不符即 throw |
| 复制漏文件导致 `Cannot find module` | 复制清单是硬编码白名单；部署后跑一次 `node --check` / 实启健康检查 |
| 生产库被动打开 | dev 走独立目录 + 独立数据 junction，物理隔离 |
| main 分支尚未有同样脚本 | 本任务只交付 dev/local；main 同步在完工时列为 follow-up |
