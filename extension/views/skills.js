/**
 * skills.js — 本机 Skills 状态视图（views 层）
 *
 * 从 host 拉取 skill-status，渲染技能列表与复制入口。
 */

import { els } from '../components/dom-refs.js';
import { showToast } from '../features/toast.js';
import { getPort } from '../platform/index.js';
import { ROUTES } from '../shared/protocol.js';
export let skillsCache = null;

export async function loadSkillStatus() {
  try {
    const data = await getPort().hostFetch('GET', ROUTES.skillStatus);
    skillsCache = data?.data ?? null;
  } catch {
    skillsCache = null;
  }
  renderSkillStatus();
}

export function renderSkillStatus() {
  const s = skillsCache;
  els.skillsList.replaceChildren();

  if (!s) {
    els.skillsCount.textContent = '—';
    els.skillsOverall.textContent = '⚠️ host 未连接，无法检测';
    return;
  }

  els.skillsCount.textContent = s.installed ? '✅' : '❌';
  els.skillsOverall.textContent = s.installed
    ? `journal skill：✅ 已安装（${s.installedCount}/${s.total}）`
    : `journal skill：❌ 未安装（${s.installedCount}/${s.total}）`;

  for (const loc of s.locations) {
    const li = document.createElement('li');
    li.className = 'skills-item';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const dot = document.createElement('span');
    dot.textContent = loc.installed ? '✅' : '❌';
    const name = document.createElement('span');
    name.className = 'skills-item-name';
    name.style.flex = '';
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
