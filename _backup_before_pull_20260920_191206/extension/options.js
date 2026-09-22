/* ================================================================
   Journal — options.js
   设置页逻辑：WebDAV 同步配置、本机 Agent 配置、数据导入导出。
   ================================================================ */

'use strict';

import { init, getState, exportJson, mergeFromRemote, emptyState } from './lib/store.js';
import { davTestConnection } from './lib/webdav.js';
import { runSync, getSyncStatus, scheduleSync } from './lib/sync.js';
import { reconnect, onHostStatus, getHostStatus } from './lib/bridge.js';
import { todayStr } from './lib/model.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  await init();
  const s = getState();

  // 同步配置回填
  $('syncProvider').value = s.settings.syncProvider || 'off';
  $('davServer').value = s.settings.webdav?.server || '';
  $('davUser').value = s.settings.webdav?.user || '';
  $('davPassword').value = s.settings.webdav?.password || '';
  $('davPath').value = s.settings.webdav?.path || 'journal/data.json';
  toggleWebdavFields(s.settings.syncProvider === 'webdav');

  // Host 配置回填
  $('hostPort').value = s.settings.hostPort || 23517;
  $('hostToken').value = s.settings.hostToken || '';

  renderSyncHint();
  renderStorageHint();
  renderHostHint();

  // 事件
  $('syncProvider').addEventListener('change', (e) => toggleWebdavFields(e.target.value === 'webdav'));
  $('saveSyncBtn').addEventListener('click', saveSync);
  $('syncNowBtn').addEventListener('click', async () => {
    setResult('syncResult', '同步中…');
    try {
      const r = await runSync('auto');
      setResult('syncResult', r.pushed ? '同步完成 ✓' : '已是最新', 'ok');
      renderSyncHint();
    } catch (e) {
      setResult('syncResult', '同步失败: ' + e.message, 'err');
    }
  });
  $('davTestBtn').addEventListener('click', async () => {
    await saveSyncFields();
    setResult('davTestResult', '测试中…');
    try {
      const r = await davTestConnection();
      setResult('davTestResult', '连接成功 ✓ ' + r.server, 'ok');
    } catch (e) {
      setResult('davTestResult', '连接失败: ' + e.message, 'err');
    }
  });
  $('saveHostBtn').addEventListener('click', saveHost);
  $('testHostBtn').addEventListener('click', testHost);
  $('exportBtn').addEventListener('click', exportData);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', importData);
  $('resetBtn').addEventListener('click', resetData);
}

/* ─── 同步 ───────────────────────────────────────────────────── */

function toggleWebdavFields(show) {
  $('webdavFields').classList.toggle('hidden', !show);
}

async function saveSyncFields() {
  const s = getState();
  s.settings.syncProvider = $('syncProvider').value;
  s.settings.webdav = {
    server: $('davServer').value.trim(),
    user: $('davUser').value.trim(),
    password: $('davPassword').value.trim(),
    path: $('davPath').value.trim() || 'journal/data.json',
  };
  await chrome.storage.local.set({ journal_state: s });
}

async function saveSync() {
  await saveSyncFields();
  setResult('syncResult', '已保存 ✓', 'ok');
  renderSyncHint();
}

function renderSyncHint() {
  const st = getSyncStatus();
  const s = getState();
  if (st.provider === 'off') {
    $('syncStatusHint').textContent = '同步关闭：数据仅存在本机浏览器。';
  } else {
    const server = s.settings.webdav?.server || '?';
    const last = st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleString() : '从未';
    $('syncStatusHint').textContent = `WebDAV: ${server} · 上次同步 ${last}`;
  }
}

/* ─── Host ───────────────────────────────────────────────────── */

async function saveHost() {
  const s = getState();
  s.settings.hostPort = Number($('hostPort').value) || 23517;
  s.settings.hostToken = $('hostToken').value.trim();
  await chrome.storage.local.set({ journal_state: s });
  reconnect();
  setResult('hostResult', '已保存，正在重连…', 'ok');
  renderHostHint();
}

async function testHost() {
  await saveHost();
  setResult('hostResult', '连接中…');
  const st = getHostStatus();
  // 等 bridge 重连
  const unsub = onHostStatus((s) => {
    setResult('hostResult', s.connected ? '连接成功 ✓' : '未连接（host 未启动？）', s.connected ? 'ok' : 'err');
    unsub();
  });
  setTimeout(() => {
    unsub();
    const now = getHostStatus();
    setResult('hostResult', now.connected ? '连接成功 ✓' : '未连接（host 未启动？）', now.connected ? 'ok' : 'err');
  }, 2000);
}

function renderHostHint() {
  const setup = `# 启动本机 host
cd ~/Primary/projects/journal/host
npm install
node server.mjs

# 首次运行会生成 token 到 ~/journal/config.json
# 把 token 填到上面的 Token 输入框

# MCP 接入（Claude Code / Pi Agent）：
# node ~/Primary/projects/journal/host/server.mjs (stdio)`;
  $('hostSetupHint').textContent = setup;
}

/* ─── 数据管理 ───────────────────────────────────────────────── */

function exportData() {
  const data = exportJson();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `journal-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setResult('dataResult', '已导出 ✓', 'ok');
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await mergeFromRemote(data);
    setResult('dataResult', '导入完成 ✓（合并模式）', 'ok');
    renderStorageHint();
  } catch (err) {
    setResult('dataResult', '导入失败: ' + err.message, 'err');
  }
  e.target.value = '';
}

async function resetData() {
  if (!confirm('确定重置全部数据？此操作不可撤销（建议先导出备份）。')) return;
  if (!confirm('再次确认：真的要清空所有日志和待办吗？')) return;
  const s = getState();
  s.days = [];
  s.todos = [];
  await chrome.storage.local.set({ journal_state: s });
  setResult('dataResult', '已重置 ✓', 'ok');
  renderStorageHint();
}

function renderStorageHint() {
  chrome.storage.local.getBytesInUse('journal_state').then(bytes => {
    const kb = (bytes / 1024).toFixed(1);
    $('storageHint').textContent = `本地存储占用：${kb} KB`;
  }).catch(() => {
    $('storageHint').textContent = '本地存储：chrome.storage.local';
  });
}

function setResult(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = 'result' + (cls ? ' ' + cls : '');
}

boot().catch(e => console.error('[journal] options boot failed', e));