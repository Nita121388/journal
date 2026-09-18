# Implement: Agent 接入引导设置页

## 实现顺序

1. **manifest.json**：新增 `"options_page": "options.html"`（无需新权限）
2. **options.html**：新建
   - 页面结构：标题区 + host 状态区 + skill 获取区（GitHub 链接）+ prompt 复制区
   - `prompt-textarea`（readonly）+ `copy-prompt` 按钮 + 复制反馈元素
   - 平台备注（Pi / Claude Code / Codex 通读 `.agents/skills/`）
3. **options.js**：新建
   - 主题逻辑（复用 sidepanel 模式：getSettings → data-theme）
   - host 健康探测（fetch /api/health，2s 超时，降级文案）
   - 复制按钮：`navigator.clipboard.writeText` + 反馈
   - prompt 模板（JS 常量，design.md 内容原样，方便未来维护）
4. **options.css**：新建（复制 sidepanel.css 的 `:root` 变量 + 状态灯/按钮样式）
5. **sidepanel.js**：`#btn-settings` 增加 `chrome.runtime.openOptionsPage()` 处理
6. **SKILL.md**（可选小改）：顶部加各平台技能加载说明一句（Pi 自动发现；Claude Code / Codex 把 `.agents/skills` 指认或复制到各自 skills 目录）

## 验证命令

```bash
# 1. 语法检查（无 ESLint，用 node --check）
node --check extension/options.js

# 2. 手动验证（chrome://extensions）
#   - Journal 出现"扩展程序选项"且可打开 options 页
#   - options 页：host 状态灯正常（host 在线绿 / 离线灰+启动命令）
#   - 复制按钮 → 剪贴板内容为完整 prompt（无本机 E:\ 路径）
#   - 侧边栏 ⚙️ 打开 options 页
#   - dark mode 正常
#   - 侧边栏功能不受影响

# 3. 一致性检查
#   - 无 innerHTML 用户内容
#   - GITHUB 链接无硬编码散落（集中在 options.js 常量区）
```

## 完成后回到

- Phase 2.2：质量检查（`trellis-check`）
- Phase 3.3：spec 更新
- Phase 3.4：commit
