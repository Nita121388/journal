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

  // 3) 服务商下拉：动态渲染 24 家 + 自定义
  const providerCount = await page.locator('#ai-provider option').count();
  add('服务商下拉渲染 24 家 + 自定义', providerCount === 25, `options=${providerCount}`);

  // 4) 选 deepseek（有推荐模型）→ 自动填 baseURL + 第一个推荐模型
  await page.locator('#ai-provider').selectOption('deepseek');
  await page.waitForTimeout(400);
  const autoFill = await page.evaluate(() => ({
    base: document.getElementById('ai-base').value,
    model: document.getElementById('ai-model').value,
    datalist: document.querySelectorAll('#ai-model-options option').length,
  }));
  add('选 deepseek 自动填 baseURL + 推荐模型（下拉）',
    autoFill.base.includes('deepseek') && autoFill.model === 'deepseek-v4-pro' && autoFill.datalist >= 3,
    JSON.stringify(autoFill));

  // 5) 选 ollama（无需 key）→ API Key 置灰 + 本地地址
  await page.locator('#ai-provider').selectOption('ollama');
  await page.waitForTimeout(400);
  const ollamaState = await page.evaluate(() => ({
    base: document.getElementById('ai-base').value,
    keyDisabled: document.getElementById('ai-key').disabled,
    keyHint: document.getElementById('ai-key-hint')?.textContent || '',
  }));
  add('选 ollama：无需 key 置灰 + 本地地址',
    ollamaState.base === 'http://127.0.0.1:11434/v1' && ollamaState.keyDisabled === true && /无需/.test(ollamaState.keyHint),
    JSON.stringify(ollamaState));

  // 6) 选无 defaultBaseUrl 的 bedrock → 提示需云厂商凭据
  await page.locator('#ai-provider').selectOption('bedrock');
  await page.waitForTimeout(400);
  const bedrockState = await page.evaluate(() => ({
    base: document.getElementById('ai-base').value,
    hint: document.getElementById('ai-base-hint')?.textContent || '',
    keyDisabled: document.getElementById('ai-key').disabled,
  }));
  add('选 bedrock（无 baseURL）→ 提示需云厂商凭据',
    bedrockState.base === '' && /云厂商凭据/.test(bedrockState.hint) && bedrockState.keyDisabled === true,
    JSON.stringify(bedrockState));

  // 回到 deepseek 继续保存流程
  await page.locator('#ai-provider').selectOption('deepseek');
  await page.waitForTimeout(400);

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
