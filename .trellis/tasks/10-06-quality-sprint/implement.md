# Implement — 质量冲刺（代码质量 / 用户体验 / 产品竞争力 → 双评审 ≥99）

> 状态：**进行中**（第 1 轮评审完成并已修复，第 2 轮评审进行中）

## 执行方式

每轮 = 「双视角子代理评审 → 逐条修复 P0/P1 → 复跑全部门禁 → 再评审」。
每个修复批次独立提交，可单独 revert。门禁基线：

| 门禁 | 命令 |
|---|---|
| 静态 | `npm run lint`（ESLint 9 + 分层边界 + no-undef + chrome/fetch 收敛） |
| 单测 | `npm test`（extension vitest + host node:test） |
| 覆盖率 | `npm run test:coverage`（shared+state：行/函数/语句 ≥80、分支 ≥70） |
| UI 端到端 | `cd dev-loop && node dev-loop.mjs --scenario {smoke,select,tpl,options,tailwind-migrated,audit}`（真实 Chromium） |

---

## 第 1 轮评审结论（子代理，无 shell —— 只有只读工具）

- **资深研发经理：64/100，Merge verdict `BLOCK`**
  1 个 P0（本机 API 无鉴权 + 通配 CORS → 任意网站可读写本机日志、可窃取 LLM Key）
  + 6 个 P1（离线谎报成功/真丢数据、写失败无反馈、门禁是"哑门"、空断言、
  分层规则不完整、迁移校验是恒等式）+ 12 个 P2
- **资深产品经理：61/100，Merge verdict `BLOCK`**
  1 个 P0（只填标题点保存会静默丢卡）+ 8 个 P1（空态引导在视口外、窄栏头部破损、
  主视图日期塌成 0 宽、无搜索、术语三重载、删除不可撤销、离线静默失败、
  遮罩点击语义与 Esc 相反）+ 7 个 P2

---

## 第 1 轮修复（已落地，按提交顺序）

### C1 `f891f21` 安全 + 门禁可信 + 窄栏布局
- **P0 安全**：`host/server.js` 增加来源白名单（无 Origin 放行／`chrome-extension://` 与
  回环放行并回显／**其余 403 且不下发 CORS 头**）；移除 `Access-Control-Allow-Origin: *`；
  `manifest` 增加 `host_permissions`；`/api/ai/config` 改 `baseURL` 时必须重交 `apiKey`
  （阻断「改端点继承旧 key」的密钥外泄链）；请求体上限 8MB / 64MB 断连。
  新增 `host/test/server-security.test.mjs`（10 例，含**裸 socket 取证 413**）。
- **门禁**：dev-loop 退出码纳入断言失败数与 `settled`（此前只看 console error →
  断言全挂也会打印 LOOP PASS）；smoke 的恒真空断言（`#host-banner` 当时不存在）
  换成真实信号；新增布局硬断言（无横向溢出／标题不折行／日期不折行／主视图日期宽 ≥60px）。
- **UX**：新增**持久离线横幅** `#host-banner`（含「启动服务」按钮），替代 2.6s 瞬时 toast；
  ≤420px 头部收 padding/字号 + `min-width:0` + nowrap + ellipsis；`.view-header` 允许换行；
  新增 `compactDateLabel`。**顺带修掉**：`views/timeline.js` 与 `rightview.js`
  都在写 `#timeline-date-header`，后者覆盖前者——这正是"改了没生效"的原因。

### C2 `26d392d` 数据安全 + 应用内对话框
- **P0 丢卡**：`saveEditor` 改判「标题或内容至少填一个」并给 warn 提示。
- **P1 假成功/真丢数据**：`setHostMeta` 失败改为抛错；新增 `updateHostMeta`（读→改→写，
  读不到已有值就**拒绝写入**），模板/命名视图/属性库全部改走该路径。
- **P1 静默失败**：`toast.runWrite` 统一兜底；新增 `features/card-actions.js`
  （`patchCard` / `deleteCardWithUndo`：确认 → 删除 → 6s「撤销」）。
- **UX**：新增 `features/dialog.js`（`promptDialog`/`confirmDialog`/`pickDialog`，
  capture 阶段 Esc 取消），替换 8 处原生 `confirm/prompt`；模板管理从
  「输入编号」两连弹改为可点选列表。

### C3 `4d6cb2f` 分层强制 + 迁移校验真化 + 仓库卫生
- **P1 分层**：eslint 补完整层序矩阵（state 禁依赖 UI 层；components 禁依赖 state/views/features；
  features/views 禁依赖 entries，二者为**同层对等**）；新增 **`no-undef`**
  （立刻抓到 `cardPrimaryText` 未 import）；全局禁 `fetch`，
  把 `features/host-status.js` 与 `entries/options.js` 的 6 处裸 fetch 收进 `host-client`。
- **P1 假保险**：`migrateAddColumn` 的零丢失校验原本从 `after` 派生 `before`（恒等式），
  改为 `ALTER` **之前**取真实快照；并修 `cardsEqualExceptTags` 的对象比较
  （`props` 是对象，`===` 恒 false，旧代码靠恒等快照掩盖了这个 bug）。
  新增**真实迁移路径**测试（旧 schema 库 → 打开 → 断言零丢失 + 备份存在）。
- **数据**：`CARD_FIELDS` 补 `emoji`；`shortDate` 改用本地 `toDayKey`；
  轮询新增 `getWriteSeq` 丢弃陈旧响应（并有"去掉守卫应当失败"的验证）。
- **卫生**：删除入库的 `_backup_before_pull_*/`（22 文件）与死代码；
  新增 `host/README.md`、`.gitattributes`；skills 默认目录从 homedir 推导。

### C4 `92d1221` 对比度达 WCAG AA
- token：`--color-muted` `#9e9e9e`→`#6b7280`（2.68→4.83:1）、暗色 `#757575`→`#a0a0a0`（3.62→6.38:1）、
  `--color-warn` `#ef6c00`→`#bf360c`；新增 `--color-accent-strong: #2e7d32`（白字 5.13:1）
  专供文字底/徽标底，`--color-accent` 留给装饰性填充。
- 分段控件（12px 白字）全部换深色：状态 `#455a64/#8d6e00/#1565c0/#2e7d32`，
  优先级 `#c62828/#8d6e00/#2e7d32`。
- **门禁由「比对 hex」改为「计算 WCAG 对比度并卡 ≥4.5」**，并新增暗色对比度断言。

### C5 `8887cfd` 死代码/重复实现 + 深色入门禁 + CI
- 删除 8 处死代码（`getCardPool`/`groupCardsForTimeline`/`aggregateHeatmap`（恒等别名）/
  `todoSummary`/`diffLocalRemote`/`dynamicEl`/`emojiFreeInput`/无 importer 的 `host/sync/index.js`）。
- 新增 `views/range-select.js`：日视图与周视图**共用**框选实现（此前两份 ~60 行已分叉，
  周视图漏了 `.schedule-grid-label` 守卫 → 在整点标签上按下会误触发框选）。
- 抽出 `dev-loop/lib/a11y.mjs`；smoke 增加深色模式断言；**修掉 visselect 场景的脆弱断言**
  （固定 sleep → 轮询到实际变化，连跑 3 次稳定）。
- 视觉审计确认 **P1-1**（空日 focusScroll 把空态引导滚出视口）→ 空日回到顶部 + 断言。

### C6 `4448b0c` 时间线卡片键盘可达 + 注释清理 + P0 端到端回归
- 时间线卡片补 `tabIndex=0` + `role=button` + `aria-label` + Enter/Space 打开。
- 清理 `vs.vs.viewStartMin` 笔误、被孤立注释顶掉的 JSDoc。
- smoke 新增：只填标题 → 保存 → 断言卡片真的落到时间线、不显示「空卡片」、
  tabIndex/role/aria 正确（**P0 修复此前只有单测覆盖**）。

### C7 `5566ddd` 视图层单测 + 覆盖率口径诚实化
- 引入 jsdom，新增 `views/heatmap.test.js`（7 例，**首次覆盖打卡宽限口径**）
  与 `views/calendar.test.js`（9 例：roving tabindex / 计数指示器 / aria-label / 方向键边界）。
- `vitest.config.mjs` 明确写出：覆盖率门禁只卡 `shared`+`state`（逻辑所在层），
  `views`/`features` 由 dev-loop 真实浏览器回归兜底，**不拿行数稀释百分比**。

### C8 `85e2f4a` 从权威库全量导出 + 用户指南
- host 新增 `GET /api/export`（JSON）与 `?format=markdown`（`text/markdown` 附件）；
  格式化放 `extension/shared/md-export.js`，host 与扩展**共用一份**。
- 设置页两个按钮（导出全部数据 / 导出为 Markdown）；新增 `docs/user-guide.md`。

### C9 `7c781ba` 关闭语义统一
- 新增 `formSnapshot`/`isEditorDirty`/`requestCloseEditor`：遮罩点击、Esc、取消、关闭按钮
  **统一**先做脏检查（有改动弹「放弃修改？」）。
- 危险确认框主按钮改为 `primary + is-danger`（原来两个按钮外观相同）。
- 端到端测试连带抓到两个真实缺陷：① `#app-dialog` 与编辑器浮层 `z-index` 相同 →
  从编辑器内触发的确认框被浮层盖住、点击被拦截；② `openEditorRange` 在快照之后才写结束时间
  → 框选建卡后编辑器「一打开就是脏状态」。
- smoke 新增 6 项断言 + **场景自清理**（此前创建的卡片会污染后续宽度的空日断言）。

---

## 当前门禁

| 门禁 | 结果 |
|---|---|
| `npm run lint` | ✅ 0 errors |
| `npm test` | ✅ extension **161** + host **115** |
| `npm run test:coverage` | ✅ 语句 93.37 / 分支 82.96 / 函数 92.30 / 行 96.41 |
| dev-loop `smoke` 320/360/400/500 | ✅ **47/47** ×4（可重复） |
| dev-loop `select` / `options` / `tpl` / `tailwind-migrated` | ✅ 46/46 · 10/10 · 17/17 · 22/22 |
| dev-loop `smoke --host-mode off` | ✅ 47/47（预期离线噪声不计入门禁） |
| 深色模式 | ✅ 纳入 smoke 必跑 + audit 12 张 dark 截图已人工核对 |
| CI | ✅ `.github/workflows/ci.yml`（quality + ui 两个 job） |

---

## 第 2 轮评审

使用**独立外部 CLI 子代理**（`codex-exec` 研发经理 / `claude-code` 产品经理），
明确要求它们**实际执行门禁命令**并给出真实输出，避免上一轮"无 shell、只做静态取证"的局限。

> 结论与后续修复：见 `prd.md` 的 Acceptance Criteria（两项均需 ≥99）。
