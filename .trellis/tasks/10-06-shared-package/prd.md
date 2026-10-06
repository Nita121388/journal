# 抽取 shared 纯逻辑包

## Goal

把 model/field-registry/prop-infer 移入 shared/，新增 shared/card-schema.js（与 host storage 去重）与 shared/protocol.js（HTTP 路由 + 消息类型契约）。零行为变更，纯文件搬迁 + 去重。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
