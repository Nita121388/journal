/**
 * checkexports.mjs — 静态校验：所有相对 import 的名字，目标模块是否真的导出。
 *
 * 为什么需要：ESM 缺少导出时只在浏览器运行时报 "does not provide an export named ..."，
 * lint/freevars 都发现不了。此脚本把该错误提前到静态检查。
 *
 * 用法（在 extension/ 下运行）：node __checkexports.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd();
const DIRS = ['entries', 'views', 'features', 'state', 'components', 'platform', 'shared'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = DIRS.flatMap((d) => { try { return walk(join(ROOT, d)); } catch { return []; } });

function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = new Set();
  for (const n of ast.body) {
    const push = (id) => { if (id?.name) names.add(id.name); };
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) {
        if (n.declaration.type === 'FunctionDeclaration') push(n.declaration.id);
        else if (n.declaration.type === 'VariableDeclaration') for (const d of n.declaration.declarations) push(d.id);
      }
      for (const s of n.specifiers || []) push(s.exported);
    } else if (n.type === 'ExportDefaultDeclaration') {
      names.add('default');
    }
  }
  return names;
}

const cache = new Map();
function getExports(file) {
  if (!cache.has(file)) cache.set(file, exportsOf(file));
  return cache.get(file);
}

let bad = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const n of ast.body) {
    if (n.type !== 'ImportDeclaration') continue;
    const spec = n.source.value;
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    let ex;
    try { ex = getExports(target); } catch (e) { console.log(`✗ ${relative(ROOT, file)} → ${spec}: 无法读取 (${e.message})`); bad++; continue; }
    for (const s of n.specifiers) {
      if (s.type !== 'ImportSpecifier') continue;
      const imported = s.imported.name;
      if (!ex.has(imported)) {
        console.log(`✗ ${relative(ROOT, file)}: 从 ${spec} 导入 '${imported}'，但该模块未导出`);
        bad++;
      }
    }
  }
}

console.log(bad ? `\n共 ${bad} 处导出缺失` : '✅ 所有相对 import 的名字都能在目标模块导出中找到');
process.exit(bad ? 1 : 0);
