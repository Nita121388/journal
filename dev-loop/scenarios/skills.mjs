/**
 * skills scenario — 右上角 AI Skill 弹窗（2026-11-12 从左栏底部折叠区块迁移而来）
 *
 * 覆盖：
 *  - header 右侧有 #btn-skills 入口 + 状态点 tone（is-ok/stale/bad/unknown）
 *  - 左栏旧区块（#skills-section / #btn-skills-toggle / #skills-panel）彻底退场
 *  - 点击打开：弹窗可见、右对齐不溢出视口、aria-expanded、总览行、位置条目
 *  - 生命周期：Esc 关闭 / 外点关闭 / 重复点按钮 toggle 关闭（layer-stack 接管）
 */

export async function runSkills({ page }) {
  const checks = [];
  const add = (n, ok, d) => checks.push([n, Boolean(ok), d || '']);

  // ── 1. 入口与旧区块退场 ──────────────────────────
  add('header 右侧有 #btn-skills 入口', await page.$('#btn-skills'));
  add('入口在 #header-right 内', await page.evaluate(() =>
    !!document.querySelector('#header-right #btn-skills')));
  add('左栏旧折叠区块已删（#skills-section/#btn-skills-toggle/#skills-panel）', await page.evaluate(() =>
    !document.getElementById('skills-section') &&
    !document.getElementById('btn-skills-toggle') &&
    !document.getElementById('skills-panel')));

  // ── 2. header 状态点（app 启动时 loadSkillStatus 已跑过一次） ──
  const tone = await page.evaluate(() =>
    [...document.getElementById('btn-skills').classList]
      .find(c => c.startsWith('is-')) ?? '');
  add('状态点 tone ∈ {ok,stale,bad,unknown}', /^(is-ok|is-stale|is-bad|is-unknown)$/.test(tone), tone);

  // ── 3. 点击打开 ────────────────────────────────
  await page.click('#btn-skills');
  const opened = await page.evaluate(() => {
    const p = document.getElementById('skills-popover');
    const r = p.getBoundingClientRect();
    return {
      visible: !p.classList.contains('hidden'),
      inViewport: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      aria: document.getElementById('btn-skills').getAttribute('aria-expanded'),
      items: p.querySelectorAll('.skills-item').length,
      overall: (document.getElementById('skills-overall').textContent ?? '').trim(),
      copyAll: !!document.getElementById('btn-skills-copy'),
      refresh: !!document.getElementById('btn-skills-refresh'),
    };
  });
  add('点击后弹窗可见', opened.visible);
  add('aria-expanded=true', opened.aria === 'true');
  add('弹窗在视口内（右对齐不溢出）', opened.inViewport);
  add('总览行非空', opened.overall.length > 0, opened.overall);
  add('至少一条位置条目', opened.items >= 1, `${opened.items} item(s)`);
  add('「复制所有路径给 AI」按钮存在', opened.copyAll);
  add('「重新检测」按钮存在', opened.refresh);

  // ── 4. 生命周期（layer-stack：Esc / 外点 / toggle） ──
  await page.keyboard.press('Escape');
  add('Esc 关闭弹窗', await page.evaluate(() =>
    document.getElementById('skills-popover').classList.contains('hidden')));

  await page.click('#btn-skills'); // 重开
  await page.mouse.click(10, 10); // header 左侧空白 = 外点（不在 ignore 列表）
  add('外点关闭弹窗', await page.evaluate(() =>
    document.getElementById('skills-popover').classList.contains('hidden')));

  await page.click('#btn-skills'); // 再开
  await page.click('#btn-skills'); // 重复点触发器 = 关闭（ignore 语义）
  add('重复点按钮 = 关闭', await page.evaluate(() =>
    document.getElementById('skills-popover').classList.contains('hidden')));

  return { checks };
}
