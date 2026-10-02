/**
 * Template-builder scenario — regression for flat Notion-style property rows:
 *  - Builder is a flat list (no group boxes / "必备" heading).
 *  - One-line add row: click → new row, inline name edit, live inference.
 *  - Row interactions: icon picker, dblclick rename, right-click context menu.
 *  - Builder closes cleanly and the card editor becomes interactive again.
 */

export async function runTpl({ page }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);

  // Open card editor → open template builder from it
  await page.locator('#btn-quick-add').click();
  await page.waitForTimeout(500);
  await page.locator('#card-editor-save-template').click();
  await page.waitForTimeout(600);

  // Flat list: no group boxes / no 「✓ 必备」heading
  const flat = await page.evaluate(() => {
    const groups = document.querySelectorAll('.tpl-group');
    const reqHead = [...document.querySelectorAll('.tpl-group-summary, .tpl-group-title')]
      .some((el) => /必备|额外属性/.test(el.textContent || ''));
    const rows = document.querySelectorAll('#tpl-prop-list .tpl-prop-row');
    const locked = document.querySelectorAll('#tpl-prop-list .tpl-prop-row.is-locked').length;
    return { groupCount: groups.length, reqHead, rowCount: rows.length, locked };
  });
  add('属性区扁平化（无分组盒子/标题）', flat.groupCount === 0 && !flat.reqHead, `groups=${flat.groupCount} head=${flat.reqHead}`);
  add('内置三件套行仍在（锁定）', flat.locked === 3, `locked=${flat.locked}`);

  // One-line add row: click → new row in edit mode
  await page.locator('.tpl-add-row').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  const newInput = await page.evaluate(() => {
    const inp = document.querySelector('#tpl-prop-list .tpl-prop-name-input');
    return inp ? { active: document.activeElement === inp, value: inp.value } : null;
  });
  add('点击添加行 → 新行进入命名编辑', Boolean(newInput?.active), JSON.stringify(newInput));

  // Live inference: type a recognizable name, expect icon/type to update
  if (newInput) {
    await page.locator('#tpl-prop-list .tpl-prop-name-input').fill('重要度');
    await page.waitForTimeout(200);
    const inferred = await page.evaluate(() => {
      const row = document.querySelector('.tpl-extra-row:last-of-type');
      if (!row) return null;
      const icon = row.querySelector('.tpl-prop-icon')?.textContent;
      const typeEl = row.querySelector('.tpl-prop-value select');
      const opts = typeEl ? [...typeEl.options].map((o) => o.value).filter(Boolean) : [];
      return { icon, isSelect: Boolean(typeEl), opts };
    });
    add('输入「重要度」自动推断 图标⭐️+select+高/中/低',
      inferred?.icon === '⭐️' && inferred?.isSelect && inferred?.opts?.join(',') === '高,中,低',
      JSON.stringify(inferred));
  }

  // Commit name → row persists with inferred def
  await page.locator('#tpl-prop-list .tpl-prop-name-input').press('Enter');
  await page.waitForTimeout(300);
  const committed = await page.evaluate(() => {
    const row = document.querySelector('.tpl-extra-row:last-of-type');
    const name = row?.querySelector('.tpl-prop-name')?.textContent;
    return { name, rows: document.querySelectorAll('.tpl-extra-row').length };
  });
  add('回车确认 → 行以「重要度」命名保留', committed?.name === '重要度', JSON.stringify(committed));

  // 保留字段拦截：输入 status → 不提交、保持编辑态
  await page.locator('.tpl-add-row').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  await page.locator('#tpl-prop-list .tpl-prop-name-input').fill('status');
  await page.locator('#tpl-prop-list .tpl-prop-name-input').press('Enter');
  await page.waitForTimeout(300);
  const reservedBlocked = await page.evaluate(() => {
    const stillEditing = document.querySelectorAll('#tpl-prop-list .tpl-prop-name-input').length;
    // 已提交的行（非编辑态）不应出现名为 status 的属性
    const committedStatus = [...document.querySelectorAll('.tpl-extra-row .tpl-prop-name')].some((n) => n.textContent === 'status');
    const toast = document.querySelector('#toast')?.textContent || '';
    return { stillEditing, committedStatus, toast };
  });
  add('保留字段「status」被拦截（保持编辑态、未提交）',
    reservedBlocked?.stillEditing === 1 && reservedBlocked?.committedStatus === false && /保留字段/.test(reservedBlocked?.toast || ''),
    JSON.stringify(reservedBlocked));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const afterCancel = await page.evaluate(() => document.querySelectorAll('.tpl-extra-row').length);
  add('拦截后 Esc 取消 → 草稿行移除', afterCancel === 1, `rows=${afterCancel}`);

  // Right-click menu on the row
  await page.locator('.tpl-extra-row:last-of-type').click({ button: 'right', timeout: 3000 });
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('#tpl-prop-menu');
    if (!m) return null;
    return {
      items: [...m.querySelectorAll('.tpl-ctx-item')].map((el) => el.textContent.trim()),
      removeDisabled: [...m.querySelectorAll('.tpl-ctx-item.tpl-ctx-del')].some((el) => el.disabled),
      hasRemove: m.querySelectorAll('.tpl-ctx-item.tpl-ctx-del').length > 0,
    };
  });
  add('右键菜单：编辑/改类型/上下移/移除',
    Boolean(menu?.items?.length >= 5) && menu?.hasRemove && !menu?.removeDisabled, JSON.stringify(menu));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Locked rows: right-click menu must NOT offer removal
  await page.locator('.tpl-prop-row.is-locked').first().click({ button: 'right', timeout: 3000 });
  await page.waitForTimeout(300);
  const lockedMenu = await page.evaluate(() => {
    const m = document.querySelector('#tpl-prop-menu');
    if (!m) return null;
    return { hasRemove: m.querySelectorAll('.tpl-ctx-item.tpl-ctx-del').length > 0, hasType: /修改属性类型/.test(m.textContent || '') };
  });
  add('内置行右键无「移除/改类型」', Boolean(lockedMenu) && !lockedMenu.hasRemove && !lockedMenu.hasType, JSON.stringify(lockedMenu));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 内置三件套：双击改名 + 点图标换图标（reqOv 持久化路径）
  await page.locator('.tpl-prop-row.is-locked .tpl-prop-name').first().dblclick({ timeout: 3000 });
  await page.waitForTimeout(200);
  await page.locator('.tpl-prop-row.is-locked .tpl-prop-name-input').fill('标题（改）');
  await page.locator('.tpl-prop-row.is-locked .tpl-prop-name-input').press('Enter');
  await page.waitForTimeout(300);
  const reqRenamed = await page.evaluate(() => {
    const row = document.querySelector('.tpl-prop-row.is-locked[data-key="title"]');
    return { name: row?.querySelector('.tpl-prop-name')?.textContent, key: row?.dataset.key };
  });
  add('内置行可改名且 key 不变', reqRenamed?.name === '标题（改）' && reqRenamed?.key === 'title', JSON.stringify(reqRenamed));

  // 保存 → 直读 host API 验证内置覆盖已持久化
  await page.locator('#tpl-builder-name').fill('回归测试模板');
  await page.locator('#tpl-save').click();
  await page.waitForTimeout(800);
  const savedTpl = await page.evaluate(async () => {
    // 从扩展模块拿真实 host 地址（dev-loop 会重写端口）
    const mod = await import(chrome.runtime.getURL('lib/host-sync.js'));
    const res = await fetch(`${mod.HOST}/api/meta/templates`);
    const data = await res.json();
    const list = data?.data || data || [];
    const t = list.find((x) => x.name === '回归测试模板');
    const titleField = t?.fields?.find((f) => f.key === 'title');
    const impField = t?.fields?.find((f) => f.key === '重要度');
    const lib = await fetch(`${mod.HOST}/api/meta/propertyLibrary`).then((r) => r.json());
    const libData = lib?.data || lib || {};
    const impDef = libData['重要度'];
    return { titleLabel: titleField?.label, hasImpField: Boolean(impField), impLibType: impDef?.type, impLibLabel: impDef?.label };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  add('保存后内置覆盖写入模板字段', savedTpl?.titleLabel === '标题（改）', JSON.stringify(savedTpl));
  add('推断的自定义属性入库（type=select,label=重要度）', savedTpl?.hasImpField && savedTpl?.impLibType === 'select' && savedTpl?.impLibLabel === '重要度', JSON.stringify(savedTpl));

  // 重新打开构建器（底层卡片编辑器仍开着）
  await page.locator('#card-editor-save-template').click({ timeout: 4000 });
  await page.waitForTimeout(600);

  // Close builder → card editor interactive again
  await page.locator('#tpl-cancel').click();
  await page.waitForTimeout(400);
  const builderHidden = await page.locator('#template-builder-overlay').evaluate((el) => el.classList.contains('hidden'));
  add('关闭构建器', builderHidden);
  const editorInteractive = await page.locator('#card-editor-content').click({ timeout: 3000 }).then(() => true).catch(() => false);
  add('卡片编辑器恢复可交互', editorInteractive);

  return { checks };
}
