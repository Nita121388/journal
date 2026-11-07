<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

---

## 本机环境布局（非 Trellis 管理，可自由编辑）

改代码前请先读 **[docs/local-dev-layout.md](docs/local-dev-layout.md)**。要点：

- **只有一个开发目录**：`E:\primary\projects\journal`。
  `main`（稳定，8765）与 `dev/local`（开发，8766）是同一目录的两个分支，不是两个文件夹。
- **部署在 D: 盘**：`D:\Apps\ChromeExtensions\journal\{extension,host}`（prod）、
  `D:\Apps\ChromeExtensions\journal-dev\extension`（dev）。
  Chrome 加载的是部署副本，**不是仓库里的 `extension/`**。
- **数据在 E: 盘**：`E:\primary\data\journal{,-dev}`。
  prod host 的数据经 junction `D:\...\journal\host\data` 指向 `E:\primary\data\journal`。
- **prod host 不在 git 工作区运行**，所以切分支不会打断线上。
- 在仓库里起 host 请用 `host\start-dev.bat`（8766 + dev 数据），**不要**默认端口。
- 本目录**禁用 `git clean -xdf`**（会删 `dev-loop/out` 等未跟踪产物）。
- 扩展 ID 已用 manifest `key` 固定，与路径无关：
  prod `lpgikgjoebiolgkanfmaoffhbiphiali`、dev `plfeioojhaglgflfdhphdhlnkmohoaig`。
