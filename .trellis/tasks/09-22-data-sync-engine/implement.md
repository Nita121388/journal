# Implement — 数据同步引擎

## 文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `host/lib/logger.js` | 新增 | 结构化 stderr 日志 `[host][level] component: msg` |
| `host/lib/storage.js` | 新增 | SQLite 存储（+ JSON 回退）；cards/settings/meta；journals 派生；迁移 |
| `host/sync/merge.js` | 新增 | 纯函数 LWW + 墓碑合并 |
| `host/sync/backplane.js` | 新增 | Memory / LocalFolder / WebDAV / GitHub |
| `host/sync/engine.js` | 新增 | runSync 编排 |
| `host/sync/index.js` | 新增 | 汇总导出 |
| `host/server.js` | 重构 | 使用 `lib/storage.js`，新增 `/api/sync/*`，可测试化导出 `startServer` |
| `host/test/merge.test.mjs` | 新增 | 合并引擎单测 |
| `host/test/backplane.test.mjs` | 新增 | 4 种 backplane 单测（mock fetch） |
| `host/test/engine.test.mjs` | 新增 | 端到端收敛/删除/幂等 |
| `host/test/server.test.mjs` | 新增 | host REST 集成测试 |
| `host/package.json` | 修改 | 增加 `test` 脚本 |
| `extension/lib/sync.js` | 修改 | 调用 host `/api/sync/*` |
| `extension/options.html` + `options.js` | 修改 | 同步 provider 配置 + 立即同步按钮 + 状态 |
| `.trellis/spec/backend/database-guidelines.md` | 修改 | 更新为 SQLite + 同步设计 |
| `README.md` | 修改 | 同步说明 |

## 分步

1. `logger.js` + `storage.js`：先写存储与迁移，单测 `storage`（临时库 + 迁移用例）。
2. `sync/merge.js`：纯函数 + 表驱动测试。
3. `sync/backplane.js`：Memory/LocalFolder 先跑通，再加 WebDAV/GitHub（mock fetch）。
4. `sync/engine.js`：编排 + 端到端测试。
5. `server.js` 重构 + `/api/sync/*` + 集成测试。
6. 扩展侧接线（sync.js / options）。
7. 文档 + spec 更新。

## 验证命令

```bash
cd host && node --test                      # 全部测试
cd host && node --test test/merge.test.mjs  # 单文件
for f in host/**/*.mjs host/*.js; do node --check "$f"; done   # 语法
node host/server.js                          # 手动起服务（127.0.0.1:8765）
curl -s http://127.0.0.1:8765/api/health
curl -s http://127.0.0.1:8765/api/sync/status
```

## 约束
- 不加第三方依赖（用 `node:sqlite` / `node:test` / 原生 `fetch`）。
- 只 bind `127.0.0.1`。
- 响应统一 `{ ok, data | error:{code,message} }`。
- 不改 `/api/cards` 等既有 REST 契约。
