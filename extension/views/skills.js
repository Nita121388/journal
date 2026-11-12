/**
 * skills.js — 本机 Skills 状态（views 层）
 *
 * 从 host 拉取 skill-status，渲染到右上角弹窗（#skills-popover），同步 header 状态点。
 * 弹窗生命周期走 features/layer-stack（Esc / 外点关闭），与其它浮层同一套优先级；
 * 不再在左栏占区块（2026-11-12 改为右上角入口）。
 *
 * host 侧的 `install counts` 只反映「文件在不在」，本层额外用 `lines/sameAsSource`
 * 标出「装着但落后于项目源」的副本 —— 那才是最常见的坏状态（文件存在 → 界面显示 ✅，
 * 但 agent 读到的是旧版 skill）。
 */

import { els } from '../components/dom-refs.js';
import { showToast } from '../features/toast.js';
import { popLayer, pushLayer } from '../features/layer-stack.js';
import { getPort } from '../platform/index.js';
import { ROUTES } from '../shared/protocol.js';

const POP_ID = 'skills-popover';
/** 缓存有效期：过期后打开弹窗自动重拉（一次 GET + 几次 stat，代价很低） */
const CACHE_TTL_MS = 5 * 60 * 1000;

export let skillsCache = null;
let skillsLoadedAt = 0;
let anchorEl = null;

/* ---------- 纯逻辑（无 DOM，便于单测） ---------- */

/**
 * 缓存是否仍然新鲜。
 * @param {number} [now]
 */
export function hasFreshCache(now = Date.now()) {
  return Boolean(skillsCache) && (now - skillsLoadedAt) < CACHE_TTL_MS;
}

/**
 * 顶部结论行。
 * tone: ok / stale / bad / unknown —— 同时决定 header 状态点颜色。
 * @param {ReturnType<typeof normalizeStatus>} s
 * @returns {{text: string, tone: 'ok'|'stale'|'bad'|'unknown', installed: boolean}}
 */
export function skillSummary(s) {
  if (!s) return { text: '⚠️ host 未连接，无法检测', tone: 'unknown', installed: false };
  const base = `journal skill：${s.installed ? '✅ 已安装' : '❌ 未安装'}（${s.installedCount}/${s.total}）`;
  if (s.staleCount > 0) {
    return { text: `${base} · ${s.staleCount} 处落后于项目源`, tone: 'stale', installed: s.installed };
  }
  return { text: base, tone: s.installed ? 'ok' : 'bad', installed: s.installed };
}

/**
 * 单个位置的徽标：落后时把「本处行数 / 项目源行数」塞进 title。
 * @param {{installed?: boolean, sameAsSource?: boolean, lines?: number}} loc
 * @param {number|null} [sourceLines]
 * @returns {{text: string, title: string}}
 */
export function skillItemBadge(loc, sourceLines) {
  if (!loc?.installed) return { text: '❌', title: '未安装' };
  // 只有 host **明确**说“内容不同”才报落后；旧 host 不返回该字段时不误报
  if (loc.sameAsSource !== false) return { text: '✅', title: '与项目源一致' };
  const lines = loc.lines ?? '?';
  const src = sourceLines ?? '?';
  return { text: '⚠️', title: `落后于项目源（${lines}/${src} 行）—— 需要重新同步` };
}

/**
 * host 回包 → 渲染用的稳定结构（缺失字段归一，避免渲染层到处判空）。
 * @param {any} s
 */
export function normalizeStatus(s) {
  if (!s) return null;
  const locations = Array.isArray(s.locations) ? s.locations : [];
  const source = locations.find(l => l.platform === '项目自带') ?? null;
  return {
    installed: Boolean(s.installed),
    installedCount: Number(s.installedCount ?? 0),
    total: Number(s.total ?? locations.length),
    staleCount: Number(s.staleCount ?? 0),
    sourceLines: source?.lines ?? null,
    locations,
  };
}

/* ---------- 渲染 ---------- */

/** header 状态点（tone → class） */
function setHeaderTone(tone) {
  const btn = els.skillsBtn;
  if (!btn) return;
  btn.classList.remove('is-ok', 'is-stale', 'is-bad', 'is-unknown');
  btn.classList.add(`is-${tone}`);
  const label = { ok: '已安装', stale: '副本落后', bad: '未安装', unknown: '检测中' }[tone] ?? '检测中';
  btn.title = `AI Skill 状态：${label}（点击查看各 agent 的安装/同步情况）`;
}

export function renderSkillStatus() {
  const s = normalizeStatus(skillsCache);
  const sum = skillSummary(s);
  setHeaderTone(sum.tone);
  if (els.skillsOverall) {
    els.skillsOverall.textContent = sum.text;
    els.skillsOverall.dataset.tone = sum.tone;
  }
  els.skillsList?.replaceChildren();
  if (!s || !els.skillsList) return;

  for (const loc of s.locations) {
    const li = document.createElement('li');
    li.className = 'skills-item';

    const info = document.createElement('div');
    info.className = 'skills-item-info';

    const top = document.createElement('div');
    top.className = 'skills-item-top';
    const badge = skillItemBadge(loc, s.sourceLines);
    const dot = document.createElement('span');
    dot.textContent = badge.text;
    dot.title = badge.title;
    dot.className = 'skills-item-dot';
    const name = document.createElement('span');
    name.className = 'skills-item-name';
    name.textContent = loc.platform;
    top.append(dot, name);
    info.append(top);

    const path = document.createElement('div');
    path.className = 'skills-item-desc';
    path.textContent = loc.path;
    path.title = loc.path;
    info.append(path);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'skills-copy-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(loc.path);
        showToast(`✅ 已复制 ${loc.platform} 路径`, 'success');
      } catch {
        showToast('复制失败，请手动复制', 'error');
      }
    });

    li.append(info, copyBtn);
    els.skillsList.append(li);
  }
}

/* ---------- 加载 ---------- */

export async function loadSkillStatus() {
  try {
    const data = await getPort().hostFetch('GET', ROUTES.skillStatus);
    skillsCache = data?.data ?? null;
  } catch {
    skillsCache = null;
  }
  skillsLoadedAt = Date.now();
  renderSkillStatus();
}

/* ---------- 弹窗生命周期（右上角入口） ---------- */

export function closeSkillsPopover() {
  popLayer(POP_ID);
  els.skillsPopover?.classList.add('hidden');
  anchorEl?.setAttribute('aria-expanded', 'false');
  anchorEl = null;
}

/**
 * 打开/切换 Skills 弹窗（锚定在 header 按钮下方，右对齐）。
 * 同锚点重复点击 = 关闭（点锚点不算外点，见 layer-stack 的 ignore）。
 * @param {HTMLElement|null} anchor
 */
export async function openSkillsPopover(anchor) {
  const pop = els.skillsPopover;
  if (!pop || !anchor) return;
  if (anchorEl === anchor && !pop.classList.contains('hidden')) { closeSkillsPopover(); return; }
  closeSkillsPopover();

  anchorEl = anchor;
  pop.classList.remove('hidden');
  anchor.setAttribute('aria-expanded', 'true');

  // 固定定位在按钮下方、右边缘对齐（窄侧栏也保证不出界）
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${Math.round(r.bottom + 6)}px`;
  pop.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;

  pushLayer({ id: POP_ID, el: pop, close: closeSkillsPopover, ignore: [anchor] });

  if (hasFreshCache()) renderSkillStatus();
  else await loadSkillStatus();
}
