/**
 * background.js — MV3 Service Worker
 * 职责：配置点击扩展图标时自动打开/关闭侧边栏
 */

// 官方推荐：点击 action 图标自动切换侧边栏（无需 onClicked 监听）
// openPanelOnActionClick: true 时，点击图标即开/关侧边栏，且不触发 action.onClicked
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// 也确保 SW 激活时行为已设置（onInstalled 可能在已安装后才被信任）
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.warn('[journal] setPanelBehavior failed:', err);
});
