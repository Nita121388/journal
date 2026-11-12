// @vitest-environment jsdom
/**
 * skills.test.js — 本机 Skills 状态（jsdom）
 *
 * 覆盖纯逻辑分支（结论行语气 ok/stale/bad/unknown、单位置徽标、归一化兜底）
 * 与渲染链路（假端口注入 → loadSkillStatus → 弹窗条目 / header 状态点）。
 * 弹窗开关本身走 layer-stack（Esc / 外点），那部分由 dev-loop 端到端断言。
 */
import { describe, it, expect, vi } from 'vitest';
import { makePort, apiOk } from '../test-helpers.mjs';
import { ROUTES } from '../shared/protocol.js';

/** 干净加载：els 是模块级 DOM 引用，必须先在 document 里摆好再 import。
 * platform 端口在 resetModules 后会换新实例，必须在 reset 之后再注入。 */
async function loadSkills(port) {
  vi.resetModules();
  const { setPort } = await import('../platform/index.js');
  setPort(port ?? makePort());
  document.body.innerHTML = `
    <button id="btn-skills"></button>
    <div id="skills-popover" class="hidden"></div>
    <div id="skills-overall"></div>
    <ul id="skills-list"></ul>
    <button id="btn-skills-refresh"></button>
    <button id="btn-skills-copy"></button>
  `;
  return import('./skills.js');
}

/** 一份典型的 host 回包（项目源 344 行，Claude 一处落后，skillshare 未安装） */
function sampleStatus() {
  return {
    installed: true, installedCount: 4, total: 5, staleCount: 1, sourceLines: 344,
    locations: [
      { platform: '项目自带', path: 'a/SKILL.md', installed: true, lines: 344, sameAsSource: true },
      { platform: 'Pi', path: 'b/SKILL.md', installed: true, lines: 344, sameAsSource: true },
      { platform: 'Claude', path: 'c/SKILL.md', installed: true, lines: 125, sameAsSource: false },
      { platform: 'Codex', path: 'd/SKILL.md', installed: true, lines: 344, sameAsSource: true },
      { platform: 'skillshare全局', path: 'e/SKILL.md', installed: false },
    ],
  };
}

describe('skillSummary', () => {
  it('无缓存 → unknown（host 未连接）', async () => {
    const m = await loadSkills();
    expect(m.skillSummary(null)).toEqual({ text: '⚠️ host 未连接，无法检测', tone: 'unknown', installed: false });
  });
  it('全部一致 → ok；有落后 → stale 并计数', async () => {
    const m = await loadSkills();
    const ok = { ...sampleStatus(), staleCount: 0 };
    expect(m.skillSummary(ok).tone).toBe('ok');
    expect(m.skillSummary(ok).text).toContain('已安装（4/5）');
    const stale = m.skillSummary(sampleStatus());
    expect(stale.tone).toBe('stale');
    expect(stale.text).toContain('1 处落后于项目源');
  });
  it('一处都没装 → bad', async () => {
    const m = await loadSkills();
    expect(m.skillSummary({ installed: false, installedCount: 0, total: 5, staleCount: 0, locations: [] }).tone).toBe('bad');
  });
});

describe('skillItemBadge', () => {
  it('未装 → ❌；一致 → ✅；落后 → ⚠️ 且 title 带行数对比', async () => {
    const m = await loadSkills();
    expect(m.skillItemBadge({ installed: false }, 344).text).toBe('❌');
    expect(m.skillItemBadge({ installed: true, sameAsSource: true }, 344)).toEqual({ text: '✅', title: '与项目源一致' });
    const b = m.skillItemBadge({ installed: true, sameAsSource: false, lines: 125 }, 344);
    expect(b.text).toBe('⚠️');
    expect(b.title).toContain('125/344 行');
  });
  it('行数缺失 → title 用 ? 兜底，不抛错', async () => {
    const m = await loadSkills();
    expect(m.skillItemBadge({ installed: true, sameAsSource: false }, null).title).toContain('?/? 行');
  });
  it('旧 host 不返回 sameAsSource → 不误报落后（视为一致）', async () => {
    const m = await loadSkills();
    expect(m.skillItemBadge({ installed: true }, 344)).toEqual({ text: '✅', title: '与项目源一致' });
  });
});

describe('normalizeStatus', () => {
  it('缺字段归一：staleCount/total 兜底，locations 缺省空数组', async () => {
    const m = await loadSkills();
    expect(m.normalizeStatus(null)).toBeNull();
    const n = m.normalizeStatus({ installed: true, installedCount: 3 });
    expect(n).toMatchObject({ installed: true, installedCount: 3, total: 0, staleCount: 0, sourceLines: null, locations: [] });
  });
  it('sourceLines 取自「项目自带」那一行', async () => {
    const m = await loadSkills();
    expect(m.normalizeStatus(sampleStatus()).sourceLines).toBe(344);
  });
});

describe('loadSkillStatus → 渲染', () => {
  it('host 离线：总览提示 + header 点 is-unknown', async () => {
    const port = makePort(); // 无响应队列 → 离线
    const m = await loadSkills(port);
    await m.loadSkillStatus();
    const overall = document.getElementById('skills-overall');
    expect(overall.textContent).toBe('⚠️ host 未连接，无法检测');
    expect(overall.dataset.tone).toBe('unknown');
    expect(document.getElementById('btn-skills').className).toContain('is-unknown');
    expect(document.getElementById('skills-list').children.length).toBe(0);
  });

  it('有数据：走 ROUTES.skillStatus，渲染 5 条 + 落后条目标 ⚠️ + header is-stale', async () => {
    const port = makePort();
    port._pushResponse(apiOk(sampleStatus()));
    const m = await loadSkills(port);
    await m.loadSkillStatus();

    const call = port.calls.filter(c => c.kind === 'hostFetch').at(-1);
    expect(call.path).toBe(ROUTES.skillStatus);

    const list = document.getElementById('skills-list');
    expect(list.children.length).toBe(5);
    expect(list.querySelectorAll('.skills-item-dot')[2].textContent).toBe('⚠️');
    expect(list.querySelectorAll('.skills-item-dot')[0].textContent).toBe('✅');
    expect(document.getElementById('skills-overall').dataset.tone).toBe('stale');
    expect(document.getElementById('btn-skills').className).toContain('is-stale');
    expect(m.hasFreshCache()).toBe(true);
  });
});
