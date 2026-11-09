/**
 * editor scenario — P5 卡片编辑器回归（属性集 / 基元 / 版本可见）。
 *
 * 存在理由（2026-11-09 实测教训）：`scenarios/` 里原本**没有**编辑器场景，
 * 于是连续两天的视觉重构都绕过了这个弹窗 —— 它既没进回归，也没进部署包，
 * 用户看到的还是两天前的旧设计。本场景把弹窗纳入硬门。
 *
 * 守住：
 *   ① 默认属性集 = 状态 / 标签（产品原则：默认少量必要属性，其余由模板引入）
 *   ② 弹窗内无功能 emoji（内容 emoji：卡片图标 / 用户自选，不在此列）
 *   ③ 遮罩无 backdrop-filter（全站 0 处合成层）
 *   ④ 页脚按钮走 button 基元的 data-variant/data-size
 *   ⑤ 版本徽标文本 === manifest.version（「改了看不到」的自查路径）
 */

/** 属性区默认可见行（features/editor-fields.js 的 BASE_FIELDS + 固定顺序） */
const DEFAULT_VISIBLE = ['status', 'tags'];

/**
 * 数隔离 host 里的卡片（P1 缺陷 1 回归用）。
 * @param {number} port 隔离 host 端口
 * @param {string} [title] 给了就只数该标题的卡（同一 host 会被多个宽度复用）
 * @returns {Promise<number>}
 */
async function countCards(port, title) {
  const res = await fetch(`http://127.0.0.1:${port}/api/cards`);
  const j = await res.json().catch(() => null);
  const cards = Array.isArray(j?.data) ? j.data : [];
  return title === undefined ? cards.length : cards.filter((c) => c.title === title).length;
}

/**
 * @param {{ page: import('playwright').Page, width: number, hostPort?: number|null }} ctx
 */
export async function runEditor({ page, width, hostPort }) {
  /** @type {Array<[string, boolean, string]>} */
  const checks = [];
  const add = (name, ok, detail = '') => checks.push([name, Boolean(ok), String(detail)]);

  // ── 打开编辑器（视图头的「＋ 新建」是首屏可达入口） ──
  const addBtn = page.locator('#btn-quick-add');
  const hasAdd = await addBtn.count();
  add('存在新建入口 #btn-quick-add', hasAdd === 1, `count=${hasAdd}`);
  if (hasAdd !== 1) return { checks };

  await addBtn.click();
  const overlay = page.locator('#card-editor-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  add('编辑器已打开', await overlay.isVisible());

  // ── ① 默认属性集 ──
  const rows = await page.evaluate(() => {
    const list = [...document.querySelectorAll('#card-editor-props .prop-row')];
    return {
      all: list.map((r) => r.dataset.field).filter(Boolean),
      visible: list.filter((r) => !r.hidden).map((r) => r.dataset.field),
      templateLabel: document.getElementById('card-editor-template-name')?.textContent || '',
    };
  });
  add('属性行全部带 data-field', rows.all.length >= 7, `rows=${rows.all.join(',')}`);
  add(
    '默认可见属性行 = 状态 / 标签',
    JSON.stringify(rows.visible) === JSON.stringify(DEFAULT_VISIBLE),
    rows.visible.join(','),
  );
  add('默认模板标签为「空白」', rows.templateLabel === '空白', rows.templateLabel);

  // ── ①b 类型退场（2026-11-09）：形态由模板承担，不再让用户选「文本/任务/想法」 ──
  const typeGone = await page.evaluate(() => {
    const subrow = document.querySelector('#card-editor .ce-head-subrow');
    const text = (subrow?.textContent || '').trim();
    return {
      hasSelect: !!document.getElementById('card-editor-type'),
      subrowText: text,
      hasTypeWord: /文本|任务|想法/.test(text),
      previewIsGlyph: !!document.querySelector('#emoji-preview svg'),
      previewText: (document.getElementById('emoji-preview')?.textContent || '').trim(),
    };
  });
  add('编辑器已无「类型」下拉', !typeGone.hasSelect);
  add('头部无「文本/任务/想法」文案', !typeGone.hasTypeWord, typeGone.subrowText.slice(0, 40));
  add('未选图标时图标位是 line 图标（非 📝）', typeGone.previewIsGlyph && typeGone.previewText === '',
    `svg=${typeGone.previewIsGlyph} text="${typeGone.previewText}"`);

  // ── ② 功能 emoji 清零（白名单：卡片图标预览 / 表情选择器） ──
  const emojiHits = await page.evaluate(() => {
    const PICTO = /\p{Extended_Pictographic}/u;
    const root = document.getElementById('card-editor-overlay');
    if (!root) return [];
    const out = [];
    for (const el of root.querySelectorAll('.prop-key, button, summary, .seg, .props-add-btn')) {
      // 白名单：卡片图标按钮里的 emoji 是**内容**（用户自选的卡片图标），不是功能图标
      if (el.id === 'btn-emoji-tile' || el.querySelector('#emoji-preview') || el.closest('#emoji-picker')) continue;
      const text = (el.textContent || '').trim();
      if (PICTO.test(text)) out.push(`${el.className || el.tagName}: ${text.slice(0, 16)}`);
    }
    return out;
  });
  add('弹窗内无功能 emoji', emojiHits.length === 0, emojiHits.join(' | '));

  // ── ③ 遮罩无合成层 ──
  const blur = await page.evaluate(() =>
    getComputedStyle(document.getElementById('card-editor-overlay')).backdropFilter);
  add('遮罩 backdrop-filter = none', blur === 'none', blur);

  // ── ④ 按钮基元 ──
  const buttons = await page.evaluate(() => {
    const read = (id) => {
      const el = document.getElementById(id);
      return el ? { variant: el.dataset.variant || '', size: el.dataset.size || '' } : null;
    };
    return { save: read('card-editor-save'), cancel: read('card-editor-cancel') };
  });
  add('保存 = solid/md', buttons.save?.variant === 'solid' && buttons.save?.size === 'md', JSON.stringify(buttons.save));
  add('取消 = outline/md', buttons.cancel?.variant === 'outline' && buttons.cancel?.size === 'md', JSON.stringify(buttons.cancel));

  // ── ⑤ 版本徽标 === manifest.version ──
  const version = await page.evaluate(() => {
    const el = document.getElementById('app-version');
    return {
      text: (el?.textContent || '').trim(),
      display: el ? getComputedStyle(el).display : 'missing',
      manifest: chrome.runtime.getManifest().version,
    };
  });
  add('版本徽标 = manifest.version', version.text === `v${version.manifest}`, `${version.text} vs ${version.manifest}`);
  add('版本徽标可见（非 display:none）', version.display !== 'none' && version.text !== '', version.display);

  // ── ①c 内建可选字段可在编辑器里按需加入 / 隐藏（2026-11-10）──
  // 守住：新建卡片不再必须“先建模板”才能用优先级；默认集不变（上面已断言）。
  await page.locator('#card-editor-add-field').click();
  const fieldPicker = page.locator('#editor-field-picker');
  await fieldPicker.waitFor({ state: 'visible', timeout: 3000 });
  add('「＋ 添加属性」浮层可打开', await fieldPicker.isVisible());
  add(
    '浮层含内建可选（优先级）',
    await fieldPicker.getByRole('button', { name: /优先级/ }).count() === 1,
  );
  await fieldPicker.getByRole('button', { name: /优先级/ }).click();
  const afterAdd = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#card-editor-props .prop-row')];
    return rows.filter((r) => !r.hidden).map((r) => r.dataset.field);
  });
  add('选中「优先级」后本卡可见', afterAdd.includes('priority'), afterAdd.join(','));
  add(
    '添加按钮仍在属性行之后',
    await page.evaluate(() => {
      const kids = [...document.getElementById('card-editor-props').children];
      return kids[kids.length - 1]?.id === 'card-editor-add-field';
    }),
  );
  // 锁定行不注入隐藏按钮
  add(
    'status/tags 无隐藏按钮（锁定行）',
    await page.evaluate(() =>
      !document.querySelector('#card-editor-props [data-field="status"] .prop-key-hide')
      && !document.querySelector('#card-editor-props [data-field="tags"] .prop-key-hide')),
  );
  await page.locator('#card-editor-props [data-field="priority"] .prop-key-hide').click();
  const afterHide = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#card-editor-props .prop-row')];
    return rows.filter((r) => !r.hidden).map((r) => r.dataset.field);
  });
  add('可隐藏刚加入的「优先级」', !afterHide.includes('priority'), afterHide.join(','));

  // ── 模板切换入口（只改可见性，不清空已填内容） ──
  await page.locator('#card-editor-template').click();
  // 下拉项是异步拉 host meta 后才渲染的，必须等出现再断言（否则 400px 下偶发空列表）
  await page.waitForFunction(
    () => document.querySelectorAll('#editor-template-menu .tpl-item').length > 0,
    null,
    { timeout: 4000 },
  ).catch(() => {});
  const pickerItems = await page.evaluate(() =>
    [...document.querySelectorAll('#editor-template-menu .tpl-item')].map((b) => b.textContent.trim()));
  add('模板下拉含「空白」项', pickerItems.some((t) => t.includes('空白')), pickerItems.join(' | '));

  // ── P1 缺陷 1 回归：快速连点两次保存只创建一张卡（withBusy in-flight 去重） ──
  // 复现的就是实锤 bug 的路径：鼠标点一下「保存」后紧跟一次 ⌘⏎。
  // ⌘⏎ 在 bind-editor.js 里**直调** saveEditor（不经过按钮，所以 disabled 挡不住它），
  // 没有 withBusy 守卫时两次都会走到 createCardEntry → 建出两张卡。
  if (hostPort) {
    const title = `连点保存只建一张-${width}`;
    // 模板下拉可能还开着：点标题会先触发外部点击关闭，再聚焦输入
    await page.locator('#card-editor-title').click();
    await page.locator('#card-editor-title').fill(title);
    const before = await countCards(hostPort);
    // 两次触发在**同一个任务**里同步派发，保证第二次落在第一次的 in-flight 窗口内
    await page.evaluate(() => {
      document.getElementById('card-editor-save').click();
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', metaKey: true, bubbles: true, cancelable: true,
      }));
    });
    await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const after = await countCards(hostPort);
    const sameTitle = await countCards(hostPort, title);
    add(
      '快速连点两次保存只创建一张卡',
      after - before === 1 && sameTitle === 1,
      `before=${before} after=${after} 同标题=${sameTitle}`,
    );
  } else {
    add('快速连点两次保存只创建一张卡', false, 'skipped：需要 host（--host-mode isolated/write）');
  }

  return { checks };
}
