import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const KNOWN_GLOBALS = new Set([
  'document', 'window', 'console', 'fetch', 'crypto', 'navigator', 'localStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'queueMicrotask', 'structuredClone', 'performance', 'getComputedStyle',
  'AbortSignal', 'URL', 'URLSearchParams', 'Blob', 'FormData', 'Headers', 'Request', 'Response',
  'TextEncoder', 'TextDecoder', 'MutationObserver', 'ResizeObserver', 'CustomEvent', 'Event',
  'HTMLElement', 'Node', 'Image', 'indexedDB', 'alert', 'confirm', 'prompt', 'globalThis',
  'chrome', 'arguments', 'undefined', 'NaN', 'Infinity', 'globalThis',
  // 标准内置（不作为“未解析”报告）
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Math', 'Date', 'JSON', 'Error',
  'Set', 'Map', 'Promise', 'RegExp', 'Symbol', 'BigInt', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'Intl', 'Option',
  'matchMedia', 'Function', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Uint8Array',
]);

function freeVars(file) {
  const src = readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  const out = new Set();
  for (const ref of sm.globalScope.through) {
    const n = ref.identifier.name;
    if (!KNOWN_GLOBALS.has(n)) out.add(n);
  }
  return [...out].sort();
}

let bad = 0;
for (const f of process.argv.slice(2)) {
  const fv = freeVars(f);
  if (fv.length) { bad++; console.log(`${f}: 未解析引用 → ${fv.join(', ')}`); }
  else console.log(`${f}: ✅ 无未解析引用`);
}
process.exit(bad ? 1 : 0);
