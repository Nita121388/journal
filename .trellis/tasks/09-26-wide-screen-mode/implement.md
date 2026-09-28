# 宽屏模式 — Implement

## 前置
- PRD：`09-26-wide-screen-mode/prd.md`
- Design：同目录 `design.md`

## 步骤
1. `extension/sidepanel.html`：
   - 在视图工具区 `.view-tools` 内（`.view-span-btn` 附近）加宽屏切换按钮，id
     `btn-wide-mode`。
2. `extension/sidepanel.css`：
   - 新增 `html.wide-mode` 覆盖段（放在文件末尾、@media 之后）：
     - `html.wide-mode main { max-width: none; }`
     - 宽屏下加大月历格子与周历列 min-height、加宽卡片摘要可显示文字（保留现有
       ellipsis）。
     - 按钮三态样式。
   - 不改任何现有规则。
3. `extension/sidepanel.js`：
   - `computeWide()` + `applyWide()`（toggle `wide-mode` class）。
   - `localStorage['journal.wideMode']` 三态解析与持久化。
   - `matchMedia('(min-width: 1100px)')` change 监听（auto 时重算）。
   - init 时调用一次 applyWide；按钮点击三态循环。

## 验证命令
```bash
# 无构建步骤（原生 JS），手工验证：
# 1) 宽标签页打开看铺满 + 按钮循环
# 2) 窄侧边栏验证无回归
```
无需跑 host 测试（纯前端）。

## Review gate
- 窄屏视口：不存在 `html.wide-mode` 类，行为与改动前一致。
- 手动 on 在窄窗口也应加类（铺不满但按钮生效）；自动只影响 ≥1100px。

## Rollback
改动仅前端三文件，可整文件 revert，无数据影响。