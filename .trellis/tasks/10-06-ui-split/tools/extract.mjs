/**
 * extract.mjs — 通用「从某文件提取模块」工具（自动推导 import 与上游 export）
 *
 * 用法（在 extension/ 下运行）：node __extract.mjs <config.json> [--dry]
 *
 * config.json:
 * {
 *   "entry": "features/template-builder.js",   // 缺省 entries/sidepanel.js
 *   "out": "features/template-menu.js",
 *   "first": "saveTemplateBuilder",            // 起始顶层声明名
 *   "last": "saveEditorAsTemplate",            // 结束顶层声明名
 *   "doc": "模块说明（可选）",                  // 生成文件头注释
 *   "comment": "写回源文件替换行的注释",
 *   "transforms": [{"re": "...", "to": "...", "flags": "g"}],
 *   "exports": ["..."]                         // 需要 export 的（含上游）
 * }
 *
 * 自动行为：
 *   - 计算被提取块的「未解析引用」；
 *   - 能从源文件 import 到的 → 生成 import 语句；
 *   - 源文件自身定义的 → 给源文件的定义补 export，并让新模块从源模块 import；
 *   - header 为 "__AUTO__" 时自动生成 import 块。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, resolve } from 'node:path';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const cfgPath = process.argv[2];
const dry = process.argv.includes('--dry');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const ENTRY = cfg.entry || 'entries/sidepanel.js';

let src = readFileSync(ENTRY, 'utf8');
let ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });

function unwrap(raw) {
  return raw.type === 'ExportNamedDeclaration' && raw.declaration ? raw.declaration : raw;
}
function findNode(name) {
  for (const raw of ast.body) {
    if (raw.type === 'ImportDeclaration') continue;
    const n = unwrap(raw);
    if (n.type === 'FunctionDeclaration' && n.id?.name === name) return raw;
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id?.name === name) return raw;
  }
  return null;
}

const a = findNode(cfg.first);
const b = findNode(cfg.last);
if (!a || !b) { console.error('找不到节点:', cfg.first, cfg.last); process.exit(1); }
if (b.start < a.start) { console.error('last 在 first 之前'); process.exit(1); }

let block = src.slice(a.start, b.end);
for (const t of cfg.transforms || []) block = block.replace(new RegExp(t.re, t.flags || 'g'), t.to);

function ensureExport(text, name) {
  const patterns = [
    new RegExp('^(export )?(async )?function ' + name + '[(]', 'm'),
    new RegExp('^(export )?(const|let) ' + name + ' ?=', 'm'),
  ];
  for (const re of patterns) {
    if (!re.test(text)) continue;
    return text.replace(re, (m) => (m.startsWith('export ') ? m : 'export ' + m));
  }
  return null;
}

for (const name of cfg.exports || []) {
  const next = ensureExport(block, name);
  if (next === null) { console.error('export 失败（未匹配）:', name); process.exit(2); }
  block = next;
}

// 源文件去掉被提取块
let entryRest = src.slice(0, a.start) + (cfg.comment || '') + '\n\n' + src.slice(b.end);

// ── 自动 import 推导 ──────────────────────────────────────
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
function definedNames(code, exclude) {
  const t = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const s = new Set();
  for (const raw of t.body) {
    const n = unwrap(raw);
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name !== exclude) s.add(n.id.name);
    else if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id?.name && d.id.name !== exclude) s.add(d.id.name);
  }
  return s;
}

const blockFv = freeVars(block);
const entryImports = importMap(entryRest);
const entryDefined = definedNames(entryRest);

const bySource = new Map();
const fromEntry = [];
for (const name of blockFv) {
  if (entryImports.has(name)) {
    const h = entryImports.get(name);
    if (!bySource.has(h.source)) bySource.set(h.source, []);
    bySource.get(h.source).push(h.imported === name ? name : h.imported + ' as ' + name);
  } else if (entryDefined.has(name)) {
    fromEntry.push(name);
  }
}

// 给源文件的这些定义补 export，并让新模块从源模块 import
const srcModulePath = './' + relative(dirname(cfg.out), ENTRY).replace(/\\/g, '/');
let missing = [];
for (const name of fromEntry) {
  let next = ensureExport(entryRest, name);
  if (next === null) { missing.push(name); continue; }
  entryRest = next;
}
if (missing.length) { console.error('源文件无法 export（可能是块内已移出）:', missing.join(', ')); }

const importLines = [];
for (const [s, names] of [...bySource].sort()) importLines.push(`import { ${[...new Set(names)].sort().join(', ')} } from '${s}';`);
if (fromEntry.length) {
  const names = [...new Set(fromEntry)].sort();
  importLines.push(`import { ${names.join(', ')} } from '${srcModulePath}';`);
}

const header = cfg.header === '__AUTO__' || !cfg.header
  ? (cfg.doc ? `/**\n * ${cfg.doc}\n */\n\n` : '') + importLines.join('\n') + (importLines.length ? '\n' : '')
  : cfg.header;

const outSrc = header + '\n' + block + '\n';

try { acorn.parse(outSrc, { ecmaVersion: 'latest', sourceType: 'module' }); }
catch (err) { console.error('产物语法错误:', err.message); process.exit(3); }
try { acorn.parse(entryRest, { ecmaVersion: 'latest', sourceType: 'module' }); }
catch (err) { console.error('源文件语法错误:', err.message); process.exit(4); }

if (!dry) {
  writeFileSync(cfg.out, outSrc);
  writeFileSync(ENTRY, entryRest);
}

console.log('== 自动 import ==');
console.log(importLines.join('\n') || '(无)');
console.log('== 从源模块 import:', fromEntry.length, '个 ==', fromEntry.join(', '));
console.log('== out lines:', outSrc.split('\n').length, '| entry lines:', entryRest.split('\n').length, '==');
