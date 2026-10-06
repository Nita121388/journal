/**
 * wide-mode.js — 宽屏模式（features 层）
 *
 * 三态偏好（auto/on/off）持久化在平台偏好端口；按视口宽度切换 board 布局。
 */

import { els } from '../components/dom-refs.js';
import { getPort } from '../platform/index.js';
export const WIDE_QUERY = matchMedia('(min-width: 1100px)');
export const WIDE_STATE_KEY = 'journal.wideMode'; // 'auto' | 'on' | 'off'（缺失视为 auto）

/** 当前生效的宽屏状态：手动 on/off 优先，否则跟随视口宽度 */
export function widePreference() {
  return getPort().prefGet(WIDE_STATE_KEY); // null | 'on' | 'off' | 'auto'
}
export function computeWide() {
  const p = widePreference();
  if (p === 'on') return true;
  if (p === 'off') return false;
  return WIDE_QUERY.matches; // auto
}
export function applyWide() {
  document.documentElement.classList.toggle('wide-mode', computeWide());
  updateWideButton();
}
export function updateWideButton() {
  if (!els.btnWide) return;
  const p = widePreference();
  const isOn = computeWide();
  els.btnWide.classList.toggle('is-on', p === 'on');
  els.btnWide.classList.toggle('is-off', p === 'off');
  els.btnWide.title = isOn
    ? '宽屏布局已开启' + (p === 'on' ? '（手动）' : '（自动跟随窗口）')
    : '宽屏布局未开启（点击切换：自动/强制宽屏/强制窄屏）';
}
