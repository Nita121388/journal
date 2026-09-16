/**
 * background.js — MV3 Service Worker
 * 职责：处理扩展图标点击 → 打开/切换侧边栏
 */

chrome.action.onClicked.addListener(async (tab) => {
  try {
    // MV3 需要在用户手势中调用 sidePanel.open
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    // 某些页面（如 chrome:// 页）无法打开侧边栏，忽略
    console.warn('[journal] failed to open side panel:', err);
  }
});

// 可选：允许用户在指定站点自动显示侧边栏（暂不启用，保持最小权限）
// chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
