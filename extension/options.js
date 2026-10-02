/**
 * options.js — Journal 设置页逻辑
 * 职责：主题切换、host 健康探测、prompt 复制、数据导出、数据同步配置
 */

import { getSettings, saveSettings } from './lib/store.js';
import { getSyncStatus, syncNow, getSyncConfig, saveSyncConfig, testSync } from './lib/sync.js';

/* ─── 常量 ──────────────────────────────────────────────── */

const REPO = 'https://github.com/Nita121388/journal';
const RAW_SKILL = `${REPO}/raw/main/.agents/skills/journal/SKILL.md`;
const HOST = 'http://127.0.0.1:8766';

const PROMPT_TEMPLATE = `我想用 Journal 扩展的 AI 能力写日志。请先获取并阅读技能文件：

方式 A（轻量，推荐）：直接读 raw 内容
  打开 ${RAW_SKILL}
  读完即按其中说明操作（host 服务 + CLI 用法都在里面）。

方式 B（完整）：clone 仓库后在本项目内操作
  git clone ${REPO}.git
  技能文件在项目 .agents/skills/journal/SKILL.md，按说明操作。

前置：如果 host 服务未启动，在项目根目录运行 node host/server.js（监听 127.0.0.1:8766）。

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
  // AI 增强
  aiSection: document.getElementById('ai-section'),
  aiDot: document.getElementById('ai-dot'),
  aiLabel: document.getElementById('ai-label'),
  aiEnabled: document.getElementById('ai-enabled'),
  aiProvider: document.getElementById('ai-provider'),
  aiBase: document.getElementById('ai-base'),
  aiModel: document.getElementById('ai-model'),
  aiKey: document.getElementById('ai-key'),
  aiInferMode: document.getElementById('ai-infer-mode'),
  aiSave: document.getElementById('ai-save'),
  aiTest: document.getElementById('ai-test'),
  aiFeedback: document.getElementById('ai-feedback'),
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

/* ─── AI 增强设置 ─────────────────────────────────────────── */

/** 服务商预设：选 provider 自动填 baseURL + model */
const AI_PROVIDERS = {
  deepseek:    { baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  qwen:        { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  kimi:        { baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  zhipu:       { baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  siliconflow: { baseURL: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  ollama:      { baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:3b' },
  custom:      { baseURL: '', model: '' },
};

/** 按 baseURL 反查 provider（迁移旧配置时用） */
function providerFromBase(baseURL) {
  const b = (baseURL || '').trim();
  if (!b) return 'custom';
  for (const [key, p] of Object.entries(AI_PROVIDERS)) {
    if (key !== 'custom' && b.startsWith(new URL(p.baseURL).origin)) return key;
  }
  return 'custom';
}

function setAiFeedback(msg, kind = '') {
  if (els.aiFeedback) {
    els.aiFeedback.textContent = msg;
    els.aiFeedback.className = 'copy-feedback' + (kind ? ' ' + kind : '');
  }
}

/** 读 host 配置 + 扩展 inferMode → 填表单（key 永不回显） */
async function loadAiSettings() {
  try {
    const res = await fetch(`${HOST}/api/ai/config`, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json())?.data;
    if (data) {
      if (els.aiEnabled) els.aiEnabled.checked = Boolean(data.enabled);
      if (els.aiBase) els.aiBase.value = data.baseURL || '';
      if (els.aiModel) els.aiModel.value = data.model || '';
      if (els.aiProvider) {
        // 反查 provider（不匹配预设时落到「自定义」，用户已填的 base/model 保留）
        els.aiProvider.value = providerFromBase(data.baseURL);
      }
      renderAiStatus(data.configured);
    } else {
      renderAiStatus(false);
    }
  } catch {
    renderAiStatus(false);
  }
  // inferMode 来自扩展 settings
  try {
    const settings = await getSettings();
    if (els.aiInferMode) els.aiInferMode.value = settings?.ai?.inferMode ?? 'auto';
  } catch { /* 忽略 */ }
}

/** 状态点：configured → 绿 + 「已配置」；否则灰 + 「未配置」 */
function renderAiStatus(configured) {
  if (els.aiDot) els.aiDot.className = 'status-dot' + (configured ? ' is-online' : '');
  if (els.aiLabel) els.aiLabel.textContent = configured ? '已配置' : '未配置';
}

/** 选 provider → 自动填 baseURL + model */
function onAiProviderChange() {
  const p = AI_PROVIDERS[els.aiProvider.value] || AI_PROVIDERS.custom;
  if (els.aiBase) els.aiBase.value = p.baseURL;
  if (els.aiModel) els.aiModel.value = p.model;
}

/** 保存：PUT 到 host（key 只进 host）+ 扩展 inferMode */
async function onAiSave() {
  const payload = {
    enabled: els.aiEnabled.checked,
    provider: els.aiProvider.value,
    baseURL: els.aiBase.value.trim(),
    model: els.aiModel.value.trim(),
  };
  const key = (els.aiKey.value || '').trim();
  if (key) payload.apiKey = key;
  try {
    const res = await fetch(`${HOST}/api/ai/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json())?.data;
    if (data) {
      if (els.aiKey) els.aiKey.value = ''; // 只在成功时清空 key（失败让用户改完重试）
      renderAiStatus(data.configured);
      setAiFeedback(data.configured ? '✅ 已保存（AI 已启用）' : '已保存，但缺少 API Key 或 Base URL 尚未启用', 'ok');
    } else {
      setAiFeedback('保存失败：host 返回异常', 'err');
    }
  } catch {
    setAiFeedback('保存失败：host 服务未连接（127.0.0.1:8766）', 'err');
  }
  // 扩展侧 inferMode：无论 host 是否连上，都保存到扩展（下次生效）
  try {
    const settings = await getSettings();
    await saveSettings({ ai: { ...(settings?.ai || {}), inferMode: els.aiInferMode.value } });
  } catch { /* 忽略 */ }
}

/** 连接测试：只读状态，不写、不含 key */
async function onAiTest() {
  try {
    const res = await fetch(`${HOST}/api/ai/config`, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json())?.data;
    if (data) {
      renderAiStatus(data.configured);
      setAiFeedback(
        data.configured
          ? `✅ 已连接（${data.provider || 'AI'} / ${data.model || ''}）`
          : 'host 在线但 AI 未配置（缺 key 或未启用）',
        data.configured ? 'ok' : '',
      );
    } else {
      setAiFeedback('host 返回异常', 'err');
    }
  } catch {
    setAiFeedback('连接失败：host 服务未启动', 'err');
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

  // AI 增强
  if (els.aiProvider) els.aiProvider.addEventListener('change', onAiProviderChange);
  if (els.aiSave) els.aiSave.addEventListener('click', onAiSave);
  if (els.aiTest) els.aiTest.addEventListener('click', onAiTest);
  await loadAiSettings();

  const online = await probeHost(); // 尽力而为
  if (online) {
    await loadSyncConfig();
    await renderSyncStatus();
  } else {
    els.syncLabel.textContent = 'host 未启动，无法同步';
  }
}

init();
