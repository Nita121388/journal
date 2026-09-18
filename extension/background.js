/**
 * background.js — MV3 Service Worker
 * 职责：点击扩展图标时在新标签页打开 Journal 主界面（sidepanel.html）
 */

/**
 * 点击扩展图标 → 新标签打开主界面
 * 注意：chrome.action.onClicked 只在没有 default_popup 时触发
 */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
});
