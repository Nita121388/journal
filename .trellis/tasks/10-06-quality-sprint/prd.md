# 质量冲刺：代码质量 / 用户体验 / 产品竞争力 → 双评审 ≥99

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 前置：分包重构 8 个子任务全部落地（S7 桌面壳按用户决定本期不做）

## Goal

在重构成果之上继续开发，直到**资深研发经理**与**资深产品经理**（两个独立子代理）
在各自 100 分制评分表上**均 ≥ 99 分**后停止。

## 三轮工作

### 第 1 轮（已完成）— 重构收尾
1. **文档与代码脱节**（最高优先）：`lib/` 已被拆掉，但 `.trellis/spec/frontend/` 有
   **5 个文件**仍在教人往 `lib/` 写代码（`directory-structure` / `hook-guidelines` /
   `state-management` / `type-safety` / `quality-guidelines` / `index`）；
   `component-guidelines` / `design-system` / `dev-loop` 有过时路径；README 的功能与结构段
   描述的是已被卡片化改版移除的「每日日志 Markdown 编辑器」。
   → 全部按真实代码重写。
2. **安全（注入）**：`typeIcon()` 原样返回 `card.emoji`，并有两处拼进 `innerHTML`
   （`timeline-card.js` header、`rightview.js` summary）；`provenance.project`
   （用户自由输入）直接拼进 `title` **属性**，可闭合引号注入。emoji/project 都可能来自
   AI 建卡、导入、多端同步，属于真实注入面。
   → `sanitizeEmoji()` 边界过滤 + 两处改为 DOM API 构建 + `escapeHtml` 收敛为单一实现。
3. **功能缺口**：`CARD_TYPES` 含 `idea` 但编辑器类型选择器不可达；
   `priority` 是注册表内建可选字段、卡片池早已渲染其徽标，却**没有任何手设入口**
   （只能靠 AI 或模板）。→ 补「💡 想法」+ 优先级分段控件。
4. **DOM 引用收敛**：`template-builder.js` 内联 15 处、`bind-editor.js` 11 处
   `getElementById` 与 `components/dom-refs.js` 重复；视图直接摸编辑器 DOM。
   → 全部归入 dom-refs；新增 `actions.openEditorRange` 让视图不再越层。
5. **可读性**：`openEditor` 的项目预填是三层嵌套 `?.`/`??` 三元且重复 `find` 三次。
   → 提取 `existing` 快照，一次查找、行为等价。
6. **测试**：补 7 个单测（含注入回归）+ smoke 场景 7 项断言（新功能永久覆盖）。
7. **工具**：dev-loop 在 `--host-mode off` 下把预期的 `ERR_CONNECTION_REFUSED`
   计为失败（离线是该模式**被测行为本身**）→ 不再计入 error 门禁。

### 第 2 轮 — 双视角子代理评审
两个独立子代理（研发经理 / 产品经理），各自 100 分制加权评分表，要求：
- 必须**实际复跑门禁**与**真的看截图**，不得只信描述
- 每条扣分必须有 `文件:行号` 或可复现命令
- 明确纪律：99 分 = 接近行业顶级、只剩可忽略问题；**不得抬分**

### 第 3 轮 — 按评审结论迭代
修复两份清单中的全部 P0/P1，再评审，直到两项均 ≥99。

## Acceptance Criteria

- [ ] 研发经理评审 **≥99/100**（含证据）
- [ ] 产品经理评审 **≥99/100**（含证据）
- [ ] 两份评审列出的 P0/P1 问题全部修复并有回归证据
- [ ] `npm run lint` 0 errors
- [ ] `npm test` 全绿（extension + host）
- [ ] 覆盖率门禁通过
- [ ] dev-loop 全场景全绿（含新增断言）
- [ ] spec 与 README 与代码一致（无过时路径/流程）

## Constraints

- 不引入框架、不引入打包器
- 不降低既有门禁的严格度（不得为了好看而放宽阈值）
- 每批修复独立提交、可回滚
- 评审必须由**子代理**产出，不得自评自证

## Out of scope

- Electron 桌面端实现（用户明确本期不做；仅保留 `PlatformPort` 可行性）
- 视觉重设计（除非评审认定存在可用性缺陷）
