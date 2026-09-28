/**
 * Template-builder scenario — regression for the F1/F5 fixes:
 *  - F5: builder must render on top of the card editor (not hidden behind it).
 *  - F1: 「＋ 添加属性」must be visible & clickable; candidates + new-prop form reachable.
 *  - Builder closes cleanly and the card editor becomes interactive again.
 */

export async function runTpl({ page, width }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);

  // Open card editor → open template builder from it
  await page.locator('#btn-quick-add').click();
  await page.waitForTimeout(500);
  await page.locator('#card-editor-save-template').click();
  await page.waitForTimeout(600);

  // F5: builder overlay visible & topmost at the add-button point
  const builderTop = await page.evaluate(() => {
    const btn = document.querySelector('.tpl-add-btn');
    if (!btn) return { visible: false };
    const r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { visible: btn.offsetParent !== null, top: el ? el.id || el.className || el.tagName : null };
  });
  add('构建器在上层（添加按钮可命中）', builderTop.visible && /tpl/.test(builderTop.top || ''), builderTop.top);

  // F1: add button visible & clickable
  await page.locator('.tpl-add-btn').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  const candidates = await page.locator('.tpl-add-item').count();
  add('「＋添加属性」展开候选列表', candidates > 0, `${candidates} 项`);

  // New-prop form reachable
  await page.locator('.tpl-add-new').click({ timeout: 4000 });
  await page.waitForTimeout(400);
  const formVisible = await page.locator('#tpl-newprop-form:not(.hidden)').isVisible().catch(() => false);
  add('「新建属性…」表单可达', formVisible);
  if (formVisible) {
    const overflow = await page.evaluate(() => {
      const f = document.querySelector('#tpl-newprop-form');
      const rows = [...f.querySelectorAll('.prop-form-row')];
      return rows.some((r) => r.scrollWidth > r.clientWidth + 1);
    });
    add('新建属性表单无横向溢出', !overflow);
    await page.locator('#tpl-np-cancel').click();
    await page.waitForTimeout(200);
  }

  // Close builder → card editor interactive again
  await page.locator('#tpl-cancel').click();
  await page.waitForTimeout(400);
  const builderHidden = await page.locator('#template-builder-overlay').evaluate((el) => el.classList.contains('hidden'));
  add('关闭构建器', builderHidden);
  const editorInteractive = await page.locator('#card-editor-content').click({ timeout: 3000 }).then(() => true).catch(() => false);
  add('卡片编辑器恢复可交互', editorInteractive);

  return { checks };
}
