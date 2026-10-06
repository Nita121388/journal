/**
 * deps.mjs — 提取视图模块后，检查它引用了哪些「仍定义在 entries/sidepanel.js」的名字，
 * 以便补齐 import。用法：node __deps.mjs views/pool.js
 */
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';

const target = process.argv[2];
const ENTRY = 'entries/sidepanel.js';

function topLevelNames(file) {
  const src = readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = [];
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && node.id) names.push(node.id.name);
    else if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id?.name) names.push(d.id.name);
  }
  return names;
}

const entryNames = new Set(topLevelNames(ENTRY));
const targetSrc = readFileSync(target, 'utf8');
const toks = new Set(targetSrc.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []);
const hits = [...entryNames].filter((n) => toks.has(n)).sort();
console.log(`# ${target} 引用了 entries 顶层名（需处理）: ${hits.length}`);
console.log(hits.join(', '));
