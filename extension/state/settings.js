/**
 * settings.js — 扩展本地设置（state 层）
 *
 * 本地设置只存在平台 storage，不涉及 host；与卡片数据（host 权威）互不干扰。
 */

import { getPort } from '../platform/index.js';

const KEY = 'settings';

/**
 * 读取设置（缺失项补默认值）。
 * @returns {Promise<{sync:{enabled:boolean,provider:string,endpoint:string},ai:{provider:string,apiKey:string,inferMode:string},theme:string}>}
 */
export async function getSettings() {
  const { [KEY]: raw } = await getPort().storageGet(KEY);
  return {
    sync: { enabled: false, provider: '', endpoint: '', ...(raw?.sync || {}) },
    ai: { provider: 'local', apiKey: '', inferMode: 'auto', ...(raw?.ai || {}) },
    theme: raw?.theme ?? 'auto',
  };
}

/**
 * 局部更新设置（浅合并各分组）。
 * @param {{sync?:object, ai?:object, theme?:string}} patch
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const merged = {
    sync: { ...current.sync, ...patch.sync },
    ai: { ...current.ai, ...patch.ai },
    theme: patch.theme ?? current.theme,
  };
  await getPort().storageSet({ [KEY]: merged });
}
