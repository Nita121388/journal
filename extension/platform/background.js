/**
 * background.js — MV3 Service Worker（**平台层文件**）
 *
 * 职责：① 点击扩展图标在新标签页打开主界面；② 通过 native messaging 启动本机 host。
 * 位置：属 platform/ —— Service Worker 天生是 Chrome 平台代码，此处允许直接使用 chrome.*。
 *
 * 页面侧不直接与 native messaging 交互，而是经 `platform/chrome.js` 的 startHost()
 * 经由 `sendMessage({type: MESSAGES.startHost})` 转发到这里。
 */

import { MESSAGES, DEFAULT_HOST_BASE } from '../shared/protocol.js';
import { REMINDED_KEY, pickDueCards, pruneReminded, reminderText } from '../shared/reminders.js';
import { todayKey } from '../shared/model.js';

/* ─── 到点提醒 ───────────────────────────────────────────
 * 「日程 + 待办」产品最常见的流失原因是：用户必须自己想起来打开侧栏。
 * 这里用 chrome.alarms 每分钟检查一次，命中即发系统通知（不依赖任何服务器）。
 * 算「该提醒哪些」的纯逻辑在 shared/reminders.js（纯函数，有单测）。 */

/** 提醒开关的存储键（设置页可关；默认开）。 */
const REMINDERS_ENABLED_KEY = 'journal.remindersEnabled';

/** "HH:MM"（本地时间）。 */
function nowHHMM(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 确保每分钟一次的 alarm 已注册（幂等）。 */
function ensureReminderAlarm() {
  if (typeof chrome.alarms === 'undefined') return;
  chrome.alarms.create('journal:reminders', { periodInMinutes: 1 });
}

/** 读 host 的今日卡片；host 离线返回 null（静默不提醒，不报错）。 */
async function fetchCards() {
  try {
    const res = await fetch(`${DEFAULT_HOST_BASE}/api/cards`, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    return json?.ok ? (json.data ?? []) : null;
  } catch {
    return null; // host 未启动：提醒静默失效，不影响其它功能
  }
}

/** 一次提醒检查。导出以便手动/测试触发。 */
export async function checkReminders() {
  const prefs = await chrome.storage.local.get([REMINDERS_ENABLED_KEY, REMINDED_KEY]);
  if (prefs[REMINDERS_ENABLED_KEY] === false) return [];

  const day = todayKey();
  const record = pruneReminded(prefs[REMINDED_KEY], day);
  const cards = await fetchCards();
  if (!cards) return [];

  const due = pickDueCards(cards, day, nowHHMM(), record.ids);
  for (const card of due) {
    const { title, message } = reminderText(card);
    try {
      await chrome.notifications.create(`journal:${card.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title,
        message,
        priority: 1,
      });
    } catch (e) {
      console.warn('[journal] 通知发送失败:', e?.message || e);
    }
  }
  if (due.length) {
    record.ids.push(...due.map((c) => c.id));
    await chrome.storage.local.set({ [REMINDED_KEY]: record });
  }
  return due;
}

if (typeof chrome.alarms !== 'undefined') {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === 'journal:reminders') void checkReminders();
  });
}
chrome.runtime.onInstalled.addListener(ensureReminderAlarm);
chrome.runtime.onStartup.addListener(ensureReminderAlarm);
ensureReminderAlarm();

/**
 * 显式关闭"点击图标打开侧边栏"行为。
 * setPanelBehavior({ openPanelOnActionClick: true }) 是持久化设置，
 * 即使旧代码已删除，Chrome 仍会记住该行为，导致 onClicked 不触发。
 * 必须在每次 SW 唤醒时显式设 false 覆盖。
 */
function disablePanelOnActionClick() {
  if (typeof chrome.sidePanel === 'undefined') return;
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .then(() => console.debug('[journal] openPanelOnActionClick=false'))
    .catch((err) => console.warn('[journal] setPanelBehavior reset failed:', err));
}

chrome.runtime.onInstalled.addListener(disablePanelOnActionClick);
chrome.runtime.onStartup.addListener(disablePanelOnActionClick);
disablePanelOnActionClick();

/**
 * 点击扩展图标 → 新标签打开主界面
 * 注意：chrome.action.onClicked 只在没有 default_popup 时触发
 */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // 设置页/侧栏可手动触发一次检查（调试与「立即测试提醒」用）
  if (message?.type === 'journal:check-reminders') {
    checkReminders()
      .then((due) => sendResponse({ ok: true, due: due.length }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (message?.type !== MESSAGES.startHost) return;
  try {
    const port = chrome.runtime.connectNative('com.journal.host');
    const finish = (payload) => {
      try { port.disconnect(); } catch { /* already closed */ }
      sendResponse(payload);
    };
    port.onMessage.addListener((response) => finish({
      ok: response?.success !== false,
      error: response?.error || '',
    }));
    port.onDisconnect.addListener(() => finish({
      ok: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message || '',
    }));
    port.postMessage({ type: 'start' });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
  return true;
});
