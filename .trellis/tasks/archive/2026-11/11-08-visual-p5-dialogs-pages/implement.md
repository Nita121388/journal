# 实施计划 — P5 弹窗与附属页

## 通用门禁（每阶段收尾都跑）

```bash
cd E:/primary/projects/journal
cd extension && npm run lint && npm test          # 单测（含改动的 components/*.test.js）
cd ../dev-loop && node dev-loop.mjs --width 320,400 --scenario shell   # 外壳不回退
```

一个阶段一次 commit，commit message 用 `feat(editor|options|version): …`。

## S0 前置（10 分钟，先做，避免"做完还看不到"）

- [x] `extension/manifest.json`：`version` → `0.2.0`，加 `"version_name": "0.2.0 Quiet Desk"`
- [x] `components/version-badge.js` + `version-badge.test.js`
- [x] `platform/chrome.js` 加 `getManifest`；`platform/web.js` 加同签名兜底
- [x] `sidepanel.html` / `options.html` 挂 `#app-version`；两个 entry 各加 2 行渲染
- [x] robocopy 到 `D:\Apps\ChromeExtensions\journal-dev\extension`，读回部署后的
      `manifest.json` 核验 version == 0.2.0，结果记入本任务 `notes`
- **回滚点**：只有新增文件 + 2 行 CSS，无行为变更；出问题 revert 单个 commit 即可

## S1 属性集（核心，风险最高 → 单独 commit）

- [x] `features/editor-fields.js`（新）：`DEFAULT_FIELDS` / `resolveFields()` / `applyFields()`
      + `editor-fields.test.js`（纯函数，覆盖：默认集、模板并集、已删 key 过滤、顺序稳定）
- [x] `sidepanel.html`：9 个 `.prop-row` 加 `data-field`（`data-key` 双写保留）
- [x] `features/card-editor.js`：`openEditor` 增第 5 参 `{ templateId, fields }`；
      调 `applyFields()`；头部 `模板：<名> · 更改` 一行
- [x] `features/template-menu.js`：`createFromTemplate` 传 `{ templateId, fields }`
- [x] `sidepanel.css`：`.prop-row[hidden]{display:none}`；模板行样式；`data-key` 旧选择器保留一版
- **验收**：空白新建可见 4 行属性；模板新建可见 = 并集；`saveEditor` 存出的卡片数据与改动前一致
  （用 dev-loop `smoke` 建一张卡，比对字段前后）
- **回滚点**：`applyFields()` 改「全显示」即回旧行为

## S2 图标与违例收口

- [x] `components/icon.js` 新增 `gauge` / `flag` / `clock` / `play` / `note`；
      `icon.test.js` 补 5 条（路径非空、无 emoji、viewBox 24）
- [x] `sidepanel.html` 编辑器/模板构建器/app-dialog 内 17 处功能 emoji → `<i data-icon>`；
      类型 `<option>` 去 emoji（纯文字）
- [x] `sidepanel.css`：删 `.overlay` 的 `backdrop-filter`；优先级圆点改单色；
      删三条 `.seg[data-priority=…] .seg-dot` 规则
- [x] `options.css`：删 header 的 `backdrop-filter`；`options.html` 📓/⚡ → SVG
- [x] 页脚/工具位按钮接 `.btn` 基元（`data-variant` / `data-size`）
- **验收**：`grep -rn "backdrop-filter" extension/*.css` 只剩注释；
  `grep -rn "var(--prio-" extension/` 为空；`grep` emoji 正则命中 0（白名单外）
- **回滚点**：图标替换是纯 DOM 文本/标签替换，单 commit 可整段 revert

## S3 dev-loop 回归场景（不能省，这是"改了看不到"的根治）

- [x] `dev-loop/scenarios/editor.mjs`：按 design.md §5 的 5 条断言 + 2 宽度截图
- [x] 场景注册进 `dev-loop/dev-loop.mjs` 的 scenario 列表
- [x] 跑 `--scenario editor --width 320,400`，把 `report.md` 摘要贴进任务 notes
- **回滚点**：新文件，删掉即恢复

## S4 部署与目视验收

- [x] robocopy 仓库 `extension/` → dev 部署目录，核验 `sidepanel.html` 与仓库一致（md5）
- [x] 用户在 `chrome://extensions` 确认显示 `0.2.0 Quiet Desk`，侧栏 header 显示 `v0.2.0`
- [x] 目视一次：空白新建 / 模板新建 / options / select 四页
- [x] 记录未推进项：prod 部署仍是旧包（需从 `main` 分支走 `deploy-prod-host.bat` 流程，
      不在本任务范围），在 notes 里明确告知用户

## 收尾

- [x] `trellis-check` 走一遍（spec 合规、跨层数据流、无死代码）
- [x] spec 更新：`.trellis/spec/frontend/design-system.md` 补「编辑器属性集 = 模板字段驱动」契约；
      `dev-loop.md` 补 editor 场景
- [x] commit + 归档本任务；父任务 `11-08-visual-redesign-quiet-desk` 记 P5 完成（4/7）

## 依赖与顺序

S0 → S1 → S2 → S3 → S4 串行。S2 与 S1 不改同一批选择器（S2 只碰 icon/overlay/prio/btn），
若并行必须分 worktree。S3 依赖 S1+S2 的最终 DOM 契约。

---

## 完成情况（2026-11-09 收尾）

S0-S4 全部完成，另有 4 个用户实测反馈驱动的追加修复（见 task notes）。

| 阶段 | 结果 | 证据 |
|---|---|---|
| S0 版本可见 | 完成 | `d2357b2`；manifest 0.2.0 + version_name；侧栏/设置页显示 `v0.2.0` |
| S1 属性集 | 完成 | `432e7ff`；默认集 = 状态/标签；模板字段并入；`fieldsWithValues` 兜历史卡 |
| S2 图标与违例 | 完成 | `8ac5e3f`；17 处 emoji → SVG；0 处 backdrop-filter；优先级单色；按钮基元 |
| S3 dev-loop 场景 | 完成 | `a7a6605`；`editor` 12/12 × 320/400 |
| S4 部署核验 | 完成 | dev 部署 128 文件 md5 与仓库逐字节一致；version=0.2.0 |
| 收尾 trellis-check | 完成（主会话自检） | lint 0 / 328 单测 / 6 场景全绿；死代码与单真值 grep 已核 |

追加修复（同日，用户实测驱动）：
`4b52070` 设置页收进 Quiet Desk · `a779b22` 状态词单真值 · `c488dd7` 弹窗控件标尺与单环焦点 ·
`d4e5c6d` 新增属性交互对齐构建器 + 修 blur 竞态/ESM 只读绑定 · `de0cf70` 删按类型隐藏进度的旧规则。

未推进（不在本任务范围）：prod 部署仍是 2026-11-07 旧包，需从 `main` 分支走部署流程。
