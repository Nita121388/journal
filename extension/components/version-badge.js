/**
 * version-badge.js — 版本徽标（components 层）
 *
 * 存在理由（2026-11-09 实测教训）：样式重构完成后用户连续两天"看不出变化"，
 * 根因是 Chrome 加载的部署副本停留在两天前的构建，而界面上没有任何版本标识，
 * 用户无法自行判断"我看到的是新包还是旧包"。版本号进 UI 后，
 * 这一整类"改了看不到"的沟通成本归零。
 *
 * 契约：
 *   - 单一真值 = `chrome.runtime.getManifest()`（由 platform 端口注入），**不**在代码里写常量；
 *   - 纯渲染，无平台依赖，可单测；
 *   - 版本文本进 `textContent`（不用 innerHTML），并写进 `title` 供鼠标悬停查看 version_name。
 */

/**
 * 从 manifest 取展示用版本信息（容错：manifest 缺失/字段残缺时不抛错）。
 * @param {{version?: string, version_name?: string, name?: string}|null|undefined} manifest
 * @returns {{label: string, title: string}}
 */
export function formatVersion(manifest) {
  const version = String(manifest?.version || '').trim();
  const versionName = String(manifest?.version_name || '').trim();
  const name = String(manifest?.name || '').trim();
  const label = version ? `v${version}` : '';
  const parts = [name, version ? `v${version}` : '', versionName].filter(Boolean);
  return { label, title: parts.join(' · ') };
}

/**
 * 把版本徽标渲染到指定元素。
 * @param {HTMLElement|null|undefined} el 目标元素（可为 null —— 页面没有该挂载点时应静默跳过）
 * @param {{version?: string, version_name?: string, name?: string}|null|undefined} manifest
 */
export function renderVersionBadge(el, manifest) {
  if (!el) return;
  const { label, title } = formatVersion(manifest);
  el.textContent = label;
  if (title) el.title = title;
  // 无版本信息时整块隐藏，避免留一条空白的 header 尾巴
  el.hidden = !label;
}
