/**
 * now-marker.js — 「现在 HH:mm」当前时间指示线（views 层）
 *
 * 日视图时间线与周视图「今天」列共用**同一实现**。此前两处各写了一份
 * （week.js 里是复制的内联版本），改一次视觉要改两处，且两份已经飘了
 * （一处 `● 现在`，一处 `● 现在`+不同 class 顺序）。
 *
 * 形态（design.md §5.1）：`--accent` 2px 线 + 8px 圆点 + `现在 HH:mm` 胶囊。
 * 胶囊在窄列（周视图 < 56px）里由 CSS 隐藏，只留线与圆点（列宽装不下文案）。
 *
 * 交互语义不变：整条线是 `role=button`，点击 / Enter / Space 在当前时间新建卡片。
 */

import { actions } from '../state/actions.js';
import { currentTime, snapUpToQuarter } from '../shared/model.js';

/** `现在` 后面的时间文案：HH:mm（24 小时制，补零）。 */
export function nowLabel(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 构建当前时间指示线。
 *
 * @param {object} opts
 * @param {string} opts.dayKey 目标日期（新建卡片落在这一天）
 * @param {number} opts.top 距画布顶部的像素偏移
 * @param {string} [opts.label] 时间文案，默认取本机当前时间
 * @returns {HTMLElement}
 */
export function createNowMarker({ dayKey, top, label }) {
  const marker = document.createElement('div');
  marker.className = 'timeline-now-marker';
  marker.style.top = `${top}px`;
  marker.title = '点击在当前时间新建卡片';
  marker.setAttribute('role', 'button');
  marker.tabIndex = 0;

  const dot = document.createElement('span');
  dot.className = 'timeline-now-dot';
  dot.setAttribute('aria-hidden', 'true');

  const tag = document.createElement('span');
  tag.className = 'timeline-now-tag';
  tag.textContent = `现在 ${label ?? nowLabel()}`;

  const line = document.createElement('span');
  line.className = 'timeline-now-line';
  line.setAttribute('aria-hidden', 'true');

  marker.append(dot, tag, line);

  const createAtNow = () => actions.openEditor(null, snapUpToQuarter(currentTime()), dayKey);
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    createAtNow();
  });
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      createAtNow();
    }
  });

  return marker;
}
