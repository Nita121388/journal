/**
 * Options 场景 — 选项页 AI 设置 + 默认折叠：
 *  - 5 个设置卡片默认折叠（无 details[open]）
 *  - 点击标题可展开
 *  - 选服务商自动填 baseURL/model
 *  - 保存 → host GET /api/ai/config configured=true（key 不回显）
 *  - 触发策略存扩展 settings
 */

export async function runOptions({ page, extId }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);

  await page.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 1) 默认折叠：所有 collapsible 都无 open
  const collapsed = await page.evaluate(() => {
    const dets = [...document.querySelectorAll('details.card.collapsible')];
    return { total: dets.length, openCount: dets.filter((d) => d.open).length, ids: dets.map((d) => d.id) };
  });
  add('5 个设置卡片存在且默认全折叠', collapsed.total === 5 && collapsed.openCount === 0, `total=${collapsed.total} open=${collapsed.openCount}`);

  // 2) 点击标题可展开
  await page.locator('#ai-section summary').click();
  await page.waitForTimeout(300);
  const aiOpen = await page.locator('#ai-section').evaluate((el) => el.open);
  add('点击标题可展开 AI 卡片', aiOpen);

  // 3) 选服务商自动填 base/model
  await page.locator('#ai-provider').selectOption('qwen');
  await page.waitForTimeout(300);
  const autoFill = await page.evaluate(() => ({
    base: document.getElementById('ai-base').value,
    model: document.getElementById('ai-model').value,
  }));
  add('选服务商自动填 baseURL + model',
    autoFill.base.includes('dashscope') && autoFill.model === 'qwen-plus', JSON.stringify(autoFill));

  // 4) 保存配置 → host configured=true
  await page.locator('#ai-enabled').check();
  await page.locator('#ai-key').fill('sk-OPTIONS-SECRET');
  await page.locator('#ai-save').click();
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(async () => {
    const mod = await import(chrome.runtime.getURL('lib/host-sync.js'));
    const res = await fetch(`${mod.HOST}/api/ai/config`);
    const data = (await res.json())?.data;
    return { configured: data?.configured, label: document.getElementById('ai-label')?.textContent };
  });
  add('保存后 host configured=true', saved?.configured === true, JSON.stringify(saved));
  add('key 不回显到表单/状态', !(JSON.stringify(saved)).includes('SECRET'));

  // 5) 触发策略 → 扩展 settings
  await page.locator('#ai-infer-mode').selectOption('always');
  await page.locator('#ai-save').click();
  await page.waitForTimeout(1000);
  const mode = await page.evaluate(async () => {
    const { [('settings')]: raw } = await chrome.storage.local.get('settings');
    return raw?.ai?.inferMode;
  });
  add('触发策略写入扩展 settings', mode === 'always', `inferMode=${mode}`);

  return { checks };
}
