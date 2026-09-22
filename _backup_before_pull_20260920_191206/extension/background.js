/* ================================================================
   Journal — background.js
   Service Worker：打开侧边栏 + 初始化同步调度。
   ================================================================ */

'use strict';

import { init } from './lib/store.js';
import { startAutoSync, scheduleSync } from './lib/sync.js';

// 初始化数据层
init().catch(e => console.error('[journal] init failed', e));

// 点击工具栏图标 → 打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// 同步调度（数据变更 30s 自动同步 / 30min 兜底）
startAutoSync();

chrome.runtime.onStartup.addListener(() => {
  scheduleSync().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleSync().catch(() => {});
});

console.log('[journal] background ready');