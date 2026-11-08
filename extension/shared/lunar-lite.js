/**
 * lunar-lite.js — 固定节日查表（shared 叶子）
 *
 * 只覆盖**公历固定日**的常见节日，供月/周视图日期头副标使用。
 * 农历节日（春节/端午/中秋…）需要农历换算表，本期不引入（见 task design.md D5），
 * 因此这里只放能用 `MM-DD` 直接命中的节日。
 *
 * 无 DOM / 无 storage / 无平台依赖。
 */

/** @type {Record<string, string>} 'MM-DD' → 节日名 */
const FIXED_FESTIVALS = {
  '01-01': '元旦',
  '02-14': '情人节',
  '03-08': '妇女节',
  '03-12': '植树节',
  '04-01': '愚人节',
  '05-01': '劳动节',
  '05-04': '青年节',
  '06-01': '儿童节',
  '07-01': '建党节',
  '08-01': '建军节',
  '09-10': '教师节',
  '10-01': '国庆节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
};

/** 节气近似日期（每年浮动 ±1 天，此处只取常见值，纯展示不参与计算）。 */
const SOLAR_TERMS = {
  '02-04': '立春', '03-06': '惊蛰', '03-21': '春分', '04-05': '清明',
  '05-06': '立夏', '05-21': '小满', '06-06': '芒种', '06-21': '夏至',
  '07-07': '小暑', '07-23': '大暑', '08-08': '立秋', '08-23': '处暑',
  '09-08': '白露', '09-23': '秋分', '10-08': '寒露', '10-23': '霜降',
  '11-07': '立冬', '11-22': '小雪', '12-07': '大雪', '12-22': '冬至',
};

/**
 * 查某天的节日/节气名。
 *
 * 节日优先于节气（同一天时显示节日）。
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string} 节日名，无则空串
 */
export function festivalOf(dayKey) {
  if (typeof dayKey !== 'string' || dayKey.length < 10) return '';
  const md = dayKey.slice(5, 10);
  return FIXED_FESTIVALS[md] ?? SOLAR_TERMS[md] ?? '';
}

/**
 * 是否固定节日（不含节气）。用于今天标记等「更重」的场合。
 * @param {string} dayKey YYYY-MM-DD
 * @returns {boolean}
 */
export function isFixedFestival(dayKey) {
  if (typeof dayKey !== 'string' || dayKey.length < 10) return false;
  return Boolean(FIXED_FESTIVALS[dayKey.slice(5, 10)]);
}
