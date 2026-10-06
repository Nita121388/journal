import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
const src = readFileSync('entries/sidepanel.js', 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
const from = Number(process.argv[2] || 0), to = Number(process.argv[3] || 1e9);
for (const n of ast.body) {
  let name = null;
  if (n.type === 'FunctionDeclaration') name = n.id?.name;
  else if (n.type === 'VariableDeclaration') name = n.declarations[0]?.id?.name;
  else continue;
  const s = src.slice(0, n.start).split('\n').length, e = src.slice(0, n.end).split('\n').length;
  if (s >= from && s <= to && name) console.log(`${s}-${e} ${name}`);
}
