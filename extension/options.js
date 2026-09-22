/**
 * options.js — Journal 设置页逻辑
 * 职责：主题切换、host 健康探测、prompt 复制、数据导出、数据同步配置
 */

import { getSettings } from './lib/store.js';
import { getSyncStatus, syncNow, getSyncConfig, saveSyncConfig, testSync } from './lib/sync.js';

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
  exportBtn: document.getElementById('export-data'),
  exportFeedback: document.getElementById('export-feedback'),
  // 同步
  syncDot: document.getElementById('sync-dot'),
  syncLabel: document.getElementById('sync-label'),
  syncMeta: document.getElementById('sync-meta'),
  syncProvider: document.getElementById('sync-provider'),
  syncLocal: document.getElementById('sync-local'),
  syncWebdav: document.getElementById('sync-webdav'),
  syncGithub: document.getElementById('sync-github'),
  localDir: document.getElementById('local-dir'),
  webdavBase: document.getElementById('webdav-base'),
  webdavUser: document.getElementById('webdav-user'),
  webdavPass: document.getElementById('webdav-pass'),
  webdavPath: document.getElementById('webdav-path'),
  ghRepo: document.getElementById('gh-repo'),
  ghBranch: document.getElementById('gh-branch'),
  ghPath: document.getElementById('gh-path'),
  ghToken: document.getElementById('gh-token'),
  syncSave: document.getElementById('sync-save'),
  syncTest: document.getElementById('sync-test'),
  syncNow: document.getElementById('sync-now'),
  syncFeedback: document.getElementById('sync-feedback'),
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
    const res = await fetch(`${HOST}/api/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    if (data.ok || data.status === 'running') {
      els.hostDot.classList.add('is-online');
      els.hostLabel.textContent = 'host 已就绪';
      els.hostCmdHint.classList.add('hidden');
      return true;
    }
    throw new Error('unexpected response');
  } catch {
    els.hostDot.classList.remove('is-online');
    els.hostLabel.textContent = 'host 未启动';
    els.hostCmdHint.classList.remove('hidden');
    return false;
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

/* ─── 导出扩展数据 ───────────────────────────────────────── */

async function exportData() {
  const { journals = {}, todos = [], settings: rawSettings = {} } =
    await chrome.storage.local.get(['journals', 'todos', 'settings']);
  const exportObj = {
    _exportedAt: new Date().toISOString(),
    _source: 'journal-extension-chrome-storage',
    journals,
    todos,
    settings: rawSettings,
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `journal-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  els.exportBtn.textContent = '✅ 已导出';
  els.exportFeedback.textContent = '文件已下载，发送给 AI 助手即可完成数据合并';
  setTimeout(() => {
    els.exportBtn.textContent = '⬇️ 导出扩展数据';
    els.exportFeedback.textContent = '';
  }, 3000);
}

/* ─── 数据同步 ──────────────────────────────────────────── */

function splitRepo(value) {
  const [owner, repo] = String(value || '').split('/');
  return { owner: owner || '', repo: repo || '' };
}

function toggleProviderFields(provider) {
  els.syncLocal.classList.toggle('hidden', provider !== 'local');
  els.syncWebdav.classList.toggle('hidden', provider !== 'webdav');
  els.syncGithub.classList.toggle('hidden', provider !== 'github');
}

function setSyncFeedback(msg, ok = true) {
  els.syncFeedback.textContent = msg;
  els.syncFeedback.style.color = ok ? '' : '#e5534b';
}

async function loadSyncConfig() {
  const cfg = await getSyncConfig();
  if (!cfg) {
    els.syncLabel.textContent = 'host 未启动，无法配置同步';
    els.syncDot.classList.remove('is-online');
    return;
  }
  const provider = cfg.provider || 'off';
  els.syncProvider.value = provider;
  toggleProviderFields(provider);

  els.localDir.value = cfg.local?.dir ?? '';
  els.webdavBase.value = cfg.webdav?.baseUrl ?? '';
  els.webdavUser.value = cfg.webdav?.username ?? '';
  els.webdavPass.value = '';
  els.webdavPass.placeholder = cfg.webdav?.passwordSet ? '已设置，留空表示不修改' : '密码 / 应用密码';
  els.webdavPath.value = cfg.webdav?.path ?? 'journal/data.json';

  els.ghRepo.value = cfg.github ? `${cfg.github.owner || ''}/${cfg.github.repo || ''}` : '';
  els.ghBranch.value = cfg.github?.branch ?? 'sync-data';
  els.ghPath.value = cfg.github?.path ?? 'journal-sync.json';
  els.ghToken.value = '';
  els.ghToken.placeholder = cfg.github?.tokenSet ? '已设置，留空表示不修改' : '访问 Token（repo 权限）';
}

async function renderSyncStatus() {
  const status = await getSyncStatus();
  if (!status) {
    els.syncLabel.textContent = 'host 未启动，同步不可用';
    els.syncDot.classList.remove('is-online');
    els.syncMeta.textContent = '';
    return;
  }
  const on = status.enabled;
  els.syncDot.classList.toggle('is-online', on);
  els.syncLabel.textContent = on ? `同步已开启（${status.provider}）` : '同步未开启';
  const parts = [];
  if (status.lastSyncAt) parts.push(`上次同步：${new Date(status.lastSyncAt).toLocaleString()}`);
  if (status.deviceId) parts.push(`设备：${status.deviceId}`);
  els.syncMeta.textContent = parts.join(' · ');
}

function collectSyncConfig() {
  const provider = els.syncProvider.value;
  const cfg = { provider };
  if (provider === 'local') cfg.local = { dir: els.localDir.value.trim() };
  if (provider === 'webdav') {
    cfg.webdav = {
      baseUrl: els.webdavBase.value.trim(),
      username: els.webdavUser.value.trim(),
      password: els.webdavPass.value, // 留空 = 不修改
      path: els.webdavPath.value.trim() || 'journal/data.json',
    };
  }
  if (provider === 'github') {
    const { owner, repo } = splitRepo(els.ghRepo.value.trim());
    cfg.github = {
      owner, repo,
      branch: els.ghBranch.value.trim() || 'sync-data',
      path: els.ghPath.value.trim() || 'journal-sync.json',
      token: els.ghToken.value, // 留空 = 不修改
    };
  }
  return cfg;
}

async function onSaveSync() {
  try {
    await saveSyncConfig(collectSyncConfig());
    setSyncFeedback('✅ 同步配置已保存');
    await loadSyncConfig();
    await renderSyncStatus();
  } catch (e) {
    setSyncFeedback(`❌ ${e.message}`, false);
  }
}

async function onTestSync() {
  try {
    const r = await testSync();
    setSyncFeedback(`✅ 连接正常：${r.provider} ${r.server || r.repo || r.dir || ''}`);
  } catch (e) {
    setSyncFeedback(`❌ ${e.message}`, false);
  }
}

async function onSyncNow() {
  els.syncNow.disabled = true;
  setSyncFeedback('同步中…');
  try {
    const r = await syncNow('auto');
    const m = r.merged;
    setSyncFeedback(`✅ 同步完成：新增 ${m?.added ?? 0}，更新 ${m?.updated ?? 0}，删除 ${m?.deleted ?? 0}`);
    await renderSyncStatus();
  } catch (e) {
    setSyncFeedback(`❌ ${e.message}`, false);
  } finally {
    els.syncNow.disabled = false;
  }
}

/* ─── 初始化 ──────────────────────────────────────────────── */

async function init() {
  await applyTheme();
  els.promptTextarea.value = PROMPT_TEMPLATE;
  els.copyBtn.addEventListener('click', copyPrompt);
  els.exportBtn.addEventListener('click', exportData);

  els.syncProvider.addEventListener('change', () => toggleProviderFields(els.syncProvider.value));
  els.syncSave.addEventListener('click', onSaveSync);
  els.syncTest.addEventListener('click', onTestSync);
  els.syncNow.addEventListener('click', onSyncNow);

  const online = await probeHost(); // 尽力而为
  if (online) {
    await loadSyncConfig();
    await renderSyncStatus();
  } else {
    els.syncLabel.textContent = 'host 未启动，无法同步';
  }
}

init();
