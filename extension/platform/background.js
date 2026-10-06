/**
 * background.js — MV3 Service Worker（**平台层文件**）
 *
 * 职责：① 点击扩展图标在新标签页打开主界面；② 通过 native messaging 启动本机 host。
 * 位置：属 platform/ —— Service Worker 天生是 Chrome 平台代码，此处允许直接使用 chrome.*。
 *
 * 页面侧不直接与 native messaging 交互，而是经 `platform/chrome.js` 的 startHost()
 * 经由 `sendMessage({type: MESSAGES.startHost})` 转发到这里。
 */

import { MESSAGES } from '../shared/protocol.js';

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
