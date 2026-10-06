# 合并数据真源为 ui/state repository

## Goal

新增 ui/state/repository.js（内存单一真源 + 订阅）与 sync-bridge.js，合并 store.js + host-sync.js + 轮询 + onChanged 为一条通知链，删除 no-op 残骸。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
