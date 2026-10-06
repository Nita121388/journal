/**
 * eslint-boundaries.test.js — 元测试：分层边界规则必须**真的**会报错
 *
 * 为什么需要：ESLint flat config 里同名规则是**覆盖**而非合并。
 * 曾经把边界规则拆成多个 `files` 重叠的配置对象，结果先写的
 * `no-restricted-imports`（禁 platform 具体实现）被后者整条替换 ——
 * 规则看起来还在，实际成了死规则，`npm run lint` 永远绿。
 * （当时的探针：state/ import platform/chrome.js，eslint exit 0。）
 *
 * 这个测试对每个「必须被禁止的组合」跑一次真实 ESLint，
 * 断言确实命中 `no-restricted-imports`。规则再被覆盖就会红灯。
 */
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const CWD = fileURLToPath(new URL('.', import.meta.url));

/** 用真实配置 lint 一段内存代码。 */
async function lint(code, relPath) {
  const eslint = new ESLint({ cwd: CWD });
  const [res] = await eslint.lintText(code, { filePath: join(CWD, relPath) });
  return res.messages;
}

const IMPORT_CASES = [
  // [被测文件, 被禁止的 import, 说明]
  ['state/repository.js', '../platform/chrome.js', 'state 不得依赖 platform 具体实现'],
  ['views/pool.js', '../platform/web.js', 'views 不得依赖 platform 具体实现'],
  ['features/card-editor.js', '../platform/desktop.js', 'features 不得依赖 platform 具体实现'],
  ['components/dom-refs.js', '../platform/chrome.js', 'components 不得依赖 platform 具体实现'],
  ['components/dom-refs.js', '../state/view-state.js', 'components 不得依赖 state'],
  ['state/repository.js', '../views/pool.js', 'state 不得依赖 views'],
  ['views/pool.js', '../entries/app.js', 'views 不得依赖组合根 entries'],
  ['features/toast.js', '../entries/app.js', 'features 不得依赖组合根 entries'],
  ['shared/model.js', '../platform/index.js', 'shared 不得依赖任何其他层'],
  ['shared/model.js', '../state/repository.js', 'shared 不得依赖任何其他层'],
  ['platform/chrome.js', '../state/view-state.js', 'platform 不得依赖上层业务代码'],
];

describe('分层边界：import 限制真的生效', () => {
  for (const [file, target, label] of IMPORT_CASES) {
    it(`${label}（${file} → ${target}）`, async () => {
      const code = `import { x } from '${target}';\nexport const y = x;\n`;
      const msgs = await lint(code, file);
      const hit = msgs.some((m) => m.ruleId === 'no-restricted-imports');
      expect(hit, `期望报 no-restricted-imports，实际：${JSON.stringify(msgs.map((m) => m.ruleId))}`).toBe(true);
    });
  }
});

describe('分层边界：全局能力归属真的生效', () => {
  const GLOBAL_CASES = [
    ['views/pool.js', 'const a = chrome.runtime.id;', 'chrome'],
    ['state/settings.js', "localStorage.setItem('a', 'b');", 'localStorage'],
    ['views/pool.js', "await fetch('/x');", 'fetch'],
    ['shared/model.js', 'const a = document.body;', 'document'],
    ['shared/model.js', 'const a = chrome.runtime;', 'chrome'],
  ];
  for (const [file, code, name] of GLOBAL_CASES) {
    it(`${file} 不得使用 ${name}`, async () => {
      const msgs = await lint(`${code}\nexport const z = 1;\n`, file);
      const hit = msgs.some((m) => m.ruleId === 'no-restricted-globals');
      expect(hit, `期望报 no-restricted-globals，实际：${JSON.stringify(msgs.map((m) => m.ruleId))}`).toBe(true);
    });
  }
});

describe('分层边界：合法用法不得误报', () => {
  it('views 可依赖 shared / state / components / features', async () => {
    const code = [
      "import { typeIcon } from '../shared/format.js';",
      "import { vs } from '../state/view-state.js';",
      "import { els } from '../components/dom-refs.js';",
      "import { showToast } from '../features/toast.js';",
      'export const y = [typeIcon, vs, els, showToast];',
    ].join('\n') + '\n';
    const msgs = await lint(code, 'views/pool.js');
    expect(msgs.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  });

  it('entries 可 import 任意层（含 platform 具体实现）', async () => {
    const code = [
      "import { createChromePort } from '../platform/chrome.js';",
      "import { vs } from '../state/view-state.js';",
      'export const y = [createChromePort, vs];',
    ].join('\n') + '\n';
    const msgs = await lint(code, 'entries/app.js');
    expect(msgs.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  });
});
