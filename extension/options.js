/**
 * options.js — Journal 设置页逻辑
 * 职责：主题切换、host 健康探测、prompt 复制
 */

import { getSettings } from './lib/store.js';

/* ─── 常量 ──────────────────────────────────────────────── */

const REPO = 'https://github.com/Nita121388/journal';
const RAW_SKILL = `${REPO}/raw/main/.agents/skills/journal/SKILL.md`;
const HOST = 'http://127.0.0.1:8765';

const PROMPT_TEMPLATE = `我想用 Journal 扩展的 AI 能力写日志。请先获取并阅读技能文件：

方式 A（轻量，推荐）：直接读 raw 内容
  打开 ${RAW_SKILL}
  读完即按其中说明操作（host 服务 + CLI 用法都在里面）。

方式 B（完整）：clone 仓库后在本项目内操作
  git clone ${REPO}.git
  技能文件在项目 .agents/skills/journal/SKILL.md，按说明操作。

前置：如果 host 服务未启动，在项目根目录运行 node host/server.js（监听 127.0.0.1:8765）。

之后我会这样说，请照做：
- "今天记录一下：xxx" → 写今天日志
- "给 7/8 加一条：yyy" → read+write 指定日期
- "我的待办有哪些" → todo list
- "加个待办：写周报，明天截止" → todo add

现在开始，等我的指令。`;

/* ─── DOM 引用 ──────────────────────────────────────────── */

const els = {
  hostDot: document.getElementById('host-dot'),
  hostLabel: document.getElementById('host-label'),
  hostCmdHint: document.getElementById('host-cmd-hint'),
  promptTextarea: document.getElementById('prompt-textarea'),
  copyBtn: document.getElementById('copy-prompt'),
  copyFeedback: document.getElementById('copy-feedback'),
};

/* ─── 主题 ──────────────────────────────────────────────── */

async function applyTheme() {
  try {
    const settings = await getSettings();
    const theme = settings.theme ?? 'auto';
    if (theme === 'dark' ||
        (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.dataset.theme = 'dark';
    }
  } catch {
    // 非扩展环境（开发/预览），忽略
  }
}

/* ─── host 健康探测 ──────────────────────────────────────── */

async function probeHost() {
  try {
    const res = await fetch(`${HOST}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json();
    if (data.ok || data.status === 'running') {
      els.hostDot.classList.add('is-online');
      els.hostLabel.textContent = 'host 已就绪';
      els.hostCmdHint.classList.add('hidden');
    } else {
      throw new Error('unexpected response');
    }
  } catch {
    els.hostDot.classList.remove('is-online');
    els.hostLabel.textContent = 'host 未启动';
    els.hostCmdHint.classList.remove('hidden');
  }
}

/* ─── 复制 prompt ────────────────────────────────────────── */

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(PROMPT_TEMPLATE);
    els.copyBtn.textContent = '✅ 已复制';
    els.copyFeedback.textContent = 'Prompt 已复制到剪贴板，去粘贴给 Agent 吧';
  } catch {
    els.copyBtn.textContent = '❌ 复制失败';
    els.copyFeedback.textContent = '剪贴板权限受限，请手动选中复制';
  }
  setTimeout(() => {
    els.copyBtn.textContent = '📋 复制 Prompt';
    els.copyFeedback.textContent = '';
  }, 2500);
}

/* ─── 初始化 ──────────────────────────────────────────────── */

async function init() {
  await applyTheme();
  els.promptTextarea.value = PROMPT_TEMPLATE;
  probeHost(); // 尽力而为，不 await（失败不影响页面）
  els.copyBtn.addEventListener('click', copyPrompt);
}

init();
