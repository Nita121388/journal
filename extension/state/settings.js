/**
 * settings.js — 扩展本地设置（state 层）
 *
 * 本地设置只存在平台 storage，不涉及 host；与卡片数据（host 权威）互不干扰。
 */

import { getPort } from '../platform/index.js';

const KEY = 'settings';

/**
 * 读取设置（缺失项补默认值）。
 *
 * 注意：这里**只放扩展本地偏好**。同步凭据与 AI key 一律只存在 host
 * （`host/data/config.json`），扩展侧不再保留任何副本 ——
 * 曾经残留的 `sync.*` / `ai.apiKey` / `ai.provider` 字段无任何读写方，
 * 却会变成未来「顺手把密钥也存进来」的收纳处（安全评审 P2-11）。
 * @returns {Promise<Settings>}
 */
export async function getSettings() {
  const { [KEY]: raw } = await getPort().storageGet(KEY);
  return {
    ai: { inferMode: 'auto', ...(raw?.ai || {}) },
    theme: raw?.theme ?? 'auto',
  };
}

/**
 * 局部更新设置（浅合并各分组）。
 * @param {{ai?:object, theme?:string}} patch
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const merged = {
    ai: { ...current.ai, ...patch.ai },
    theme: patch.theme ?? current.theme,
  };
  await getPort().storageSet({ [KEY]: merged });
}

/* ─── 类型 ─────────────────────────────────────────────── */

/**
 * 扩展本地设置（**不含任何凭据**；同步与 AI 的密钥只存 host）。
 * @typedef {object} Settings
 * @property {{inferMode:'auto'|'always'|'never'}} ai
 * @property {'auto'|'light'|'dark'} theme
 */
