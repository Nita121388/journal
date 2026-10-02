/**
 * LLM-infer 场景 — 双层推断的 mock 断言（无需真实 key）：
 *  - 未配置 key → host 返回 not_configured，UI 走纯本地（无 AI 建议徽标）
 *  - 高置信名（重要度，rule）→ 0 次 /api/ai/infer-prop 请求
 *  - 长尾名（难搞的词）→ 1 次请求；mock 返回 LLM 结果 → 出「✨ AI 建议」徽标
 *  - mock 让 LLM 挂掉 → 静默降级（无徽标、无错误、无阻塞）
 */

export async function runLlm({ page }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);

  // 进入模板构建器
  await page.locator('#btn-quick-add').click();
  await page.waitForTimeout(500);
  await page.locator('#card-editor-save-template').click();
  await page.waitForTimeout(600);

  // 1) 高置信名：拦截计数 → 应 0 请求
  let inferCalls = [];
  await page.route('**/api/ai/infer-prop', async (route) => {
    const body = route.request().postDataJSON?.() || {};
    inferCalls.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { source: 'llm', icon: '⭐️', type: 'select', options: ['高', '中', '低'], defaultValue: '' } }),
    });
  });

  // 高置信：「重要度」→ 本地 rule，直接返回，不发请求
  await page.locator('.tpl-add-row').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  await page.locator('#tpl-prop-list .tpl-prop-name-input').fill('重要度');
  await page.locator('#tpl-prop-list .tpl-prop-name-input').press('Enter');
  await page.waitForTimeout(800);
  add('高置信名（重要度）不发 LLM 请求', inferCalls.length === 0, `calls=${inferCalls.length}`);
  const noBadgeRule = await page.evaluate(() => document.querySelectorAll('.tpl-llm-suggestion').length);
  add('高置信名无 AI 建议徽标', noBadgeRule === 0, `badges=${noBadgeRule}`);

  // 2) 长尾名：难搞的词 → 本地 fallback → 发 1 次请求 → 徽标出现
  inferCalls = [];
  await page.locator('.tpl-add-row').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  await page.locator('#tpl-prop-list .tpl-prop-name-input').fill('客户满意度');
  await page.locator('#tpl-prop-list .tpl-prop-name-input').press('Enter');
  await page.waitForTimeout(1200);
  add('长尾名触发 1 次 LLM 请求', inferCalls.length === 1, `calls=${inferCalls.length} names=${JSON.stringify(inferCalls.map((c) => c.name))}`);
  const badge = await page.evaluate(() => {
    const b = document.querySelector('.tpl-llm-suggestion');
    return b ? b.textContent : null;
  });
  add('长尾名出现「AI 建议」徽标', Boolean(badge && /AI 建议/.test(badge)), badge || '(无徽标)');

  // 3) 采纳 → 类型应用、徽标消失
  if (badge) {
    await page.locator('.tpl-llm-suggestion .tpl-llm-act:not(.tpl-llm-ignore)').click();
    await page.waitForTimeout(400);
    const afterAccept = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.tpl-extra-row')]
        .find((r) => (r.querySelector('.tpl-prop-name')?.textContent || '').includes('客户满意度'));
      return {
        badgeGone: !row?.querySelector('.tpl-llm-suggestion'),
        hasSelect: Boolean(row?.querySelector('.tpl-prop-value select')),
      };
    });
    add('采纳后应用类型且徽标消失', afterAccept?.badgeGone && afterAccept?.hasSelect, JSON.stringify(afterAccept));
  }

  await page.unroute('**/api/ai/infer-prop');

  // 4) LLM 挂掉（host 返回 fallback）→ 静默降级（无徽标、无错误）
  await page.route('**/api/ai/infer-prop', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { source: 'fallback', icon: '📄', type: 'text', options: null } }),
    });
  });
  await page.locator('.tpl-add-row').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  await page.locator('#tpl-prop-list .tpl-prop-name-input').fill('血标本采集时限');
  await page.locator('#tpl-prop-list .tpl-prop-name-input').press('Enter');
  await page.waitForTimeout(1000);
  const degrade = await page.evaluate(() => {
    const rows = document.querySelectorAll('.tpl-extra-row');
    return { rows: rows.length, badges: document.querySelectorAll('.tpl-llm-suggestion').length };
  });
  add('LLM 故障静默降级（行正常、无徽标）', degrade?.rows >= 3 && degrade?.badges === 0, JSON.stringify(degrade));
  await page.unroute('**/api/ai/infer-prop');

  // 5) 右键「✨ AI 重新推断」：force 路径，高置信名也能问 LLM
  inferCalls = [];
  await page.route('**/api/ai/infer-prop', async (route) => {
    const body = route.request().postDataJSON?.() || {};
    inferCalls.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { source: 'llm', icon: '🎯', type: 'select', options: ['优', '良', '差'], defaultValue: '' } }),
    });
  });
  // 对已存在的高置信行「重要度」右键 → 菜单里应能看到 AI 重新推断
  const aiMenuItem = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.tpl-extra-row')]
      .find((r) => (r.querySelector('.tpl-prop-name')?.textContent || '') === '重要度');
    if (!row) return null;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
    return true;
  });
  await page.waitForTimeout(300);
  const hasAiItem = await page.evaluate(() => {
    const item = [...document.querySelectorAll('#tpl-prop-menu .tpl-ctx-item')].find((el) => /AI 重新推断/.test(el.textContent));
    return Boolean(item);
  });
  add('右键菜单含「✨ AI 重新推断」', aiMenuItem && hasAiItem, `menuItem=${hasAiItem}`);
  // 点它 → force 触发一次请求
  if (hasAiItem) {
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('#tpl-prop-menu .tpl-ctx-item')].find((el) => /AI 重新推断/.test(el.textContent));
      item?.click();
    });
    await page.waitForTimeout(1200);
    add('「✨ 重新推断」强制触发 LLM（高置信也发）', inferCalls.length === 1, `calls=${inferCalls.length}`);
  }
  await page.unroute('**/api/ai/infer-prop');

  // 关闭构建器
  await page.locator('#tpl-cancel').click();
  await page.waitForTimeout(400);
  const builderHidden = await page.locator('#template-builder-overlay').evaluate((el) => el.classList.contains('hidden'));
  add('关闭构建器', builderHidden);

  return { checks };
}
