/**
 * background.js — MV3 Service Worker
 * 职责：配置点击扩展图标时自动打开/关闭侧边栏
 */

/**
 * 确保 setPanelBehavior 被设置。
 * onInstalled 只在安装/更新时触发；onStartup 在浏览器启动时触发；
 * 顶层调用覆盖 Service Worker 每次唤醒。三者叠加保证行为一定生效。
 *
 * 注意：chrome.sidePanel 只有在 manifest permissions 声明了 "sidePanel"
 * 才可用；若不可用需先修 manifest，不要在此处硬抛。
 */
function ensurePanelBehavior() {
  if (typeof chrome.sidePanel === 'undefined') {
    console.warn('[journal] chrome.sidePanel unavailable — check manifest permissions includes "sidePanel"');
    return;
  }
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .then(() => console.debug('[journal] setPanelBehavior OK'))
    .catch((err) => console.warn('[journal] setPanelBehavior failed:', err));
}

chrome.runtime.onInstalled.addListener(ensurePanelBehavior);
chrome.runtime.onStartup.addListener(ensurePanelBehavior);
ensurePanelBehavior();
