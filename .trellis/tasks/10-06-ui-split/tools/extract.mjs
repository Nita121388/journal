/**
 * extract.mjs — 通用「从入口提取模块」工具
 *
 * 用法（在 extension/ 下运行）：node __extract.mjs <config.json> [--dry]
 *
 * config.json:
 * {
 *   "out": "features/card-editor.js",
 *   "first": "editorOverlay",        // 起始顶层声明名
 *   "last": "saveEditor",            // 结束顶层声明名
 *   "header": "…模块头 + import 块…",
 *   "comment": "…（写回入口替换行的注释）…",
 *   "transforms": [{"re": "...", "to": "...", "flags": "g"}],
 *   "exports": ["openEditor", "closeEditor"]
 * }
 *
 * 保证：写盘前用 acorn 自检产物语法；失败不写。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const cfgPath = process.argv[2];
const dry = process.argv.includes('--dry');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const ENTRY = cfg.entry || 'entries/sidepanel.js';

let src = readFileSync(ENTRY, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });

function findNode(name) {
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration' && n.id?.name === name) return n;
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) if (d.id?.name === name) return n;
    }
  }
  return null;
}

const a = findNode(cfg.first);
const b = findNode(cfg.last);
if (!a || !b) { console.error('找不到节点:', cfg.first, cfg.last); process.exit(1); }
if (b.start < a.start) { console.error('last 在 first 之前'); process.exit(1); }

let block = src.slice(a.start, b.end);

for (const t of cfg.transforms || []) {
  block = block.replace(new RegExp(t.re, t.flags || 'g'), t.to);
}

for (const name of cfg.exports || []) {
  const patterns = [
    new RegExp('^(async )?function ' + name + '[(]', 'm'),
    new RegExp('^(const|let) ' + name + ' ?=', 'm'),
  ];
  let ok = false;
  for (const re of patterns) {
    const next = block.replace(re, (m) => 'export ' + m);
    if (next !== block) { block = next; ok = true; break; }
  }
  if (!ok) { console.error('export 失败（未匹配）:', name); process.exit(2); }
}

const outSrc = (cfg.header ? cfg.header + '\n' : '') + block + '\n';

const entryNext = src.slice(0, a.start) + (cfg.comment || '') + '\n\n' + src.slice(b.end);

try { acorn.parse(outSrc, { ecmaVersion: 'latest', sourceType: 'module' }); }
catch (err) { console.error('产物语法错误:', err.message); process.exit(3); }
try { acorn.parse(entryNext, { ecmaVersion: 'latest', sourceType: 'module' }); }
catch (err) { console.error('入口语法错误:', err.message); process.exit(4); }

if (!dry) {
  writeFileSync(cfg.out, outSrc);
  writeFileSync(ENTRY, entryNext);
}

// 报告入口还需要哪些 import（用 eslint-scope 求未解析引用）
const BUILTINS = new Set(['Array','Object','String','Number','Boolean','Math','Date','JSON','Error','Set','Map','Promise','RegExp','Symbol','BigInt','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','Intl','Option','Function','WeakMap','WeakSet','Proxy','Reflect','Uint8Array','undefined','NaN','Infinity','globalThis','arguments','document','window','console','fetch','crypto','navigator','localStorage','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','queueMicrotask','structuredClone','performance','getComputedStyle','AbortSignal','URL','URLSearchParams','Blob','FormData','Headers','Request','Response','TextEncoder','TextDecoder','MutationObserver','ResizeObserver','CustomEvent','Event','HTMLElement','Node','Image','indexedDB','alert','confirm','prompt','chrome','matchMedia']);

function freeVars(code) {
  const t = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const sm = eslintScope.analyze(t, { ecmaVersion: 2022, sourceType: 'module' });
  const s = new Set();
  for (const r of sm.globalScope.through) if (!BUILTINS.has(r.identifier.name)) s.add(r.identifier.name);
  return s;
}

function importMap(code) {
  const t = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const m = new Map();
  for (const n of t.body) {
    if (n.type !== 'ImportDeclaration') continue;
    for (const s of n.specifiers) if (s.type === 'ImportSpecifier') m.set(s.local.name, { source: n.source.value, imported: s.imported.name });
  }
  return m;
}

const bySource = new Map();
const fromEntry = [];
for (const name of freeVars(outSrc)) {
  const hit = importMap(entryNext).get(name);
  if (hit) {
    if (!bySource.has(hit.source)) bySource.set(hit.source, []);
    bySource.get(hit.source).push(hit.imported === name ? name : hit.imported + ' as ' + name);
  } else fromEntry.push(name);
}

console.log('== ' + cfg.out + ' 需要的 import ==');
for (const [s, names] of [...bySource].sort()) console.log(`import { ${[...new Set(names)].sort().join(', ')} } from '${s}';`);
console.log('-- 入口自身定义（需人工处理）:', fromEntry.sort().join(', ') || '(无)');
console.log('== 写入完成:', cfg.out, '| entry lines:', entryNext.split('\n').length, '==');
