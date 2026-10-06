# Electron 桌面壳 PoC

## Goal

新增 platforms/desktop/（main/preload/platform），内嵌 spawn host，加载同一套 UI，验证读写同一 SQLite，无需 native messaging。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

---

## 状态：**本期不做（用户决定）**

> 用户指令（2026-10-06）：**"先不用做桌面端 只是预留可行性"**。

因此本任务**不实现 Electron 壳**，其"可行性"目标已由 `10-06-platform-port` 交付：

1. `chrome.*` 全部收敛到 `extension/platform/**`（UI 层零平台引用）；
2. 提供可替换的 `PlatformPort` 契约（`platform/index.js`）；
3. 提供 `platform/web.js` 参考实现作为可移植性证明（11 个方法，可构造）。

**若未来实现桌面壳，只需新增 `platform/desktop.js` 实现同一契约**：
文件系统存储 + 直连 host + 内嵌进程启动（Electron `main.js` spawn `host/server.js`，
`preload.js` 经 contextBridge 暴露端口）。UI 与 state 代码一行不用改。

本任务归档为"后续可选"，不阻塞父任务验收（父任务 AC7 已明确 Electron PoC 不要求）。
