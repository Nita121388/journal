# 实施计划 — P5 弹窗与附属页

## 通用门禁（每阶段收尾都跑）

```bash
cd E:/primary/projects/journal
cd extension && npm run lint && npm test          # 单测（含改动的 components/*.test.js）
cd ../dev-loop && node dev-loop.mjs --width 320,400 --scenario shell   # 外壳不回退
```

一个阶段一次 commit，commit message 用 `feat(editor|options|version): …`。

## S0 前置（10 分钟，先做，避免"做完还看不到"）

- [ ] `extension/manifest.json`：`version` → `0.2.0`，加 `"version_name": "0.2.0 Quiet Desk"`
- [ ] `components/version-badge.js` + `version-badge.test.js`
- [ ] `platform/chrome.js` 加 `getManifest`；`platform/web.js` 加同签名兜底
- [ ] `sidepanel.html` / `options.html` 挂 `#app-version`；两个 entry 各加 2 行渲染
- [ ] robocopy 到 `D:\Apps\ChromeExtensions\journal-dev\extension`，读回部署后的
      `manifest.json` 核验 version == 0.2.0，结果记入本任务 `notes`
- **回滚点**：只有新增文件 + 2 行 CSS，无行为变更；出问题 revert 单个 commit 即可

## S1 属性集（核心，风险最高 → 单独 commit）

- [ ] `features/editor-fields.js`（新）：`DEFAULT_FIELDS` / `resolveFields()` / `applyFields()`
      + `editor-fields.test.js`（纯函数，覆盖：默认集、模板并集、已删 key 过滤、顺序稳定）
- [ ] `sidepanel.html`：9 个 `.prop-row` 加 `data-field`（`data-key` 双写保留）
- [ ] `features/card-editor.js`：`openEditor` 增第 5 参 `{ templateId, fields }`；
      调 `applyFields()`；头部 `模板：<名> · 更改` 一行
- [ ] `features/template-menu.js`：`createFromTemplate` 传 `{ templateId, fields }`
- [ ] `sidepanel.css`：`.prop-row[hidden]{display:none}`；模板行样式；`data-key` 旧选择器保留一版
- **验收**：空白新建可见 4 行属性；模板新建可见 = 并集；`saveEditor` 存出的卡片数据与改动前一致
  （用 dev-loop `smoke` 建一张卡，比对字段前后）
- **回滚点**：`applyFields()` 改「全显示」即回旧行为

## S2 图标与违例收口

- [ ] `components/icon.js` 新增 `gauge` / `flag` / `clock` / `play` / `note`；
      `icon.test.js` 补 5 条（路径非空、无 emoji、viewBox 24）
- [ ] `sidepanel.html` 编辑器/模板构建器/app-dialog 内 17 处功能 emoji → `<i data-icon>`；
      类型 `<option>` 去 emoji（纯文字）
- [ ] `sidepanel.css`：删 `.overlay` 的 `backdrop-filter`；优先级圆点改单色；
      删三条 `.seg[data-priority=…] .seg-dot` 规则
- [ ] `options.css`：删 header 的 `backdrop-filter`；`options.html` 📓/⚡ → SVG
- [ ] 页脚/工具位按钮接 `.btn` 基元（`data-variant` / `data-size`）
- **验收**：`grep -rn "backdrop-filter" extension/*.css` 只剩注释；
  `grep -rn "var(--prio-" extension/` 为空；`grep` emoji 正则命中 0（白名单外）
- **回滚点**：图标替换是纯 DOM 文本/标签替换，单 commit 可整段 revert

## S3 dev-loop 回归场景（不能省，这是"改了看不到"的根治）

- [ ] `dev-loop/scenarios/editor.mjs`：按 design.md §5 的 5 条断言 + 2 宽度截图
- [ ] 场景注册进 `dev-loop/dev-loop.mjs` 的 scenario 列表
- [ ] 跑 `--scenario editor --width 320,400`，把 `report.md` 摘要贴进任务 notes
- **回滚点**：新文件，删掉即恢复

## S4 部署与目视验收

- [ ] robocopy 仓库 `extension/` → dev 部署目录，核验 `sidepanel.html` 与仓库一致（md5）
- [ ] 用户在 `chrome://extensions` 确认显示 `0.2.0 Quiet Desk`，侧栏 header 显示 `v0.2.0`
- [ ] 目视一次：空白新建 / 模板新建 / options / select 四页
- [ ] 记录未推进项：prod 部署仍是旧包（需从 `main` 分支走 `deploy-prod-host.bat` 流程，
      不在本任务范围），在 notes 里明确告知用户

## 收尾

- [ ] `trellis-check` 走一遍（spec 合规、跨层数据流、无死代码）
- [ ] spec 更新：`.trellis/spec/frontend/design-system.md` 补「编辑器属性集 = 模板字段驱动」契约；
      `dev-loop.md` 补 editor 场景
- [ ] commit + 归档本任务；父任务 `11-08-visual-redesign-quiet-desk` 记 P5 完成（4/7）

## 依赖与顺序

S0 → S1 → S2 → S3 → S4 串行。S2 与 S1 不改同一批选择器（S2 只碰 icon/overlay/prio/btn），
若并行必须分 worktree。S3 依赖 S1+S2 的最终 DOM 契约。
