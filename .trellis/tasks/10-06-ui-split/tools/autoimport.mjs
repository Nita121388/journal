/**
 * autoimport.mjs — 为一个刚提取出来的模块自动推导 import 块。
 *
 * 原理：用 eslint-scope 求模块的「未解析引用」（自由变量），
 *       再到入口文件的 import 声明里查每个自由变量的来源模块；
 *       入口自身定义的（而非 import 的）名字单独列出，需人工决定归属。
 *
 * 用法（在 extension/ 下运行）：node __autoimport.mjs views/rightview.js
 */
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const BUILTINS = new Set([
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Math', 'Date', 'JSON', 'Error',
  'Set', 'Map', 'Promise', 'RegExp', 'Symbol', 'BigInt', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'Intl', 'Option',
  'Function', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Uint8Array', 'undefined',
  'NaN', 'Infinity', 'globalThis', 'arguments',
  'document', 'window', 'console', 'fetch', 'crypto', 'navigator', 'localStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'queueMicrotask', 'structuredClone', 'performance',
  'getComputedStyle', 'AbortSignal', 'URL', 'URLSearchParams', 'Blob', 'FormData',
  'Headers', 'Request', 'Response', 'TextEncoder', 'TextDecoder', 'MutationObserver',
  'ResizeObserver', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'Image', 'indexedDB',
  'alert', 'confirm', 'prompt', 'chrome', 'matchMedia',
]);

const target = process.argv[2];
const ENTRY = process.argv[3] || 'entries/sidepanel.js';

function freeVars(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  const out = new Set();
  for (const ref of sm.globalScope.through) {
    const n = ref.identifier.name;
    if (!BUILTINS.has(n)) out.add(n);
  }
  return out;
}

function importMap(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const m = new Map();
  for (const n of ast.body) {
    if (n.type !== 'ImportDeclaration') continue;
    for (const s of n.specifiers) {
      if (s.type === 'ImportSpecifier') m.set(s.local.name, { source: n.source.value, imported: s.imported.name });
    }
  }
  return m;
}

function definedNames(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const s = new Set();
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration' && n.id) s.add(n.id.name);
    else if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id?.name) s.add(d.id.name);
  }
  return s;
}

const targetSrc = readFileSync(target, 'utf8');
const entrySrc = readFileSync(ENTRY, 'utf8');
const entryImports = importMap(entrySrc);
const entryDefined = definedNames(entrySrc);

const bySource = new Map();
const fromEntry = [];
const unknown = [];

for (const name of freeVars(targetSrc)) {
  const hit = entryImports.get(name);
  if (hit) {
    if (!bySource.has(hit.source)) bySource.set(hit.source, []);
    bySource.get(hit.source).push(hit.imported === name ? name : `${hit.imported} as ${name}`);
  } else if (entryDefined.has(name)) {
    fromEntry.push(name);
  } else {
    unknown.push(name);
  }
}

console.log('// ── 可从共享模块 import ──');
for (const [src, names] of [...bySource].sort()) {
  console.log(`import { ${[...new Set(names)].sort().join(', ')} } from '${src}';`);
}
console.log('\n// ── 入口自身定义（需人工决定归属）──');
console.log(fromEntry.sort().join(', ') || '(无)');
console.log('\n// ── 未知来源 ──');
console.log(unknown.sort().join(', ') || '(无)');
