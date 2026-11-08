# 执行计划

## 1. 代码（dev/local 分支）

- [ ] T1 `host/deploy-host.ps1`：部署 + 接线 + 注册表（含端口自检、data junction 校验）
- [ ] T2 `host/deploy-dev-host.bat` / `host/deploy-prod-host.bat` 零参 wrapper
- [ ] T3 `extension/shared/protocol.js` 增加 `NATIVE_HOST_NAME = 'com.journal.host.dev'`
- [ ] T4 `extension/platform/background.js` 改用 `NATIVE_HOST_NAME`
- [ ] T5 `extension/features/host-status.js` 失败文案改为指向 `host\deploy-host.ps1`
- [ ] T6 `extension/shared/protocol.test.js`：端口断言改为分支无关（`8765|8766`），补 `NATIVE_HOST_NAME` 断言
- [ ] T7 `host/start-dev.bat`：8766 已在监听时直接退出（与 prod 启动脚本同策略）

## 2. 文档

- [ ] T8 `docs/local-dev-layout.md`：新增「dev host 部署」小节（目录 / host 名 / 命令 / 自检点）
- [ ] T9 `host/README.md`：启动器章节补充「两个 host 名 + deploy 脚本」

## 3. 部署到 D:（本机，不属于 git）

- [ ] T10 跑 `host\deploy-dev-host.bat` → 生成 `D:\...\journal-dev\host\`、junction、manifest、注册表
- [ ] T11 跑 `host\deploy-prod-host.bat -NoRegister` 之外的等价动作时注意：**prod 目录复制会覆盖线上 host 源码**。
      本机策略：只用脚本重新生成 prod manifest（保持 `allowed_origins` 收敛），**不复制源码**（避免打断线上）。
      → 实现：`deploy-host.ps1` 增加 `-ManifestOnly` 开关，prod 收口只走这个模式。
- [ ] T12 把改动后的 `protocol.js` / `background.js` / `host-status.js` 同步到 `D:\...\journal-dev\extension\`

## 4. 验证

- [ ] V1 注册表两个键指向两个不同 exe（`Get-Item ... GetValue('')`）
- [ ] V2 native messaging 协议驱动 dev exe → 8766 健康检查 ok，日志数据路径为 `journal-dev\journal.db`
- [ ] V3 prod 8765 仍在线；`E:\primary\data\journal\journal.db-wal` mtime 未被本次操作改变
- [ ] V4 prod manifest `allowed_origins` 只剩 prod id
- [ ] V5 `npm run lint` && `npm --prefix extension run test` 全绿
- [ ] V6 清理：验证产生的临时 node 进程按 PID 结束（禁止按进程名批量杀）

## 5. 收尾

- [ ] T13 spec 更新：`.trellis/spec/`（若有 host 部署相关条目）
- [ ] T14 commit（dev/local），follow-up：main 分支同步同一套脚本 + 分叉值还原（8765 / com.journal.host）
