/**
 * build-milkdown.mjs — 把 Milkdown 只读渲染器打成单文件 ESM 产物
 *
 * 为什么需要这一步：`extension/` 是零 JS 构建的 Chrome MV3 扩展（load unpacked 免构建），
 * Chrome 不解析 node_modules 裸说明符，MV3 CSP 又禁止 CDN（`script-src 'self'`）。
 * 所以把 Milkdown 预打包成 `dist/milkdown.bundle.js`（产物提交进仓库），
 * 由 `views/milkdown-mount.js` 用动态 `import()` 懒加载。
 *
 * 产物只导出 mountReadonly / unmount / version 三个 API，
 * 不把 Milkdown 内部对象泄给视图层，便于将来整体替换实现。
 *
 * 用法：npm run build:js
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = path.join(here, 'milkdown-entry.js');
const outfile = path.join(root, 'dist', 'milkdown.bundle.js');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  target: 'chrome114',
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  // Milkdown/ProseMirror 依赖 `process.env.NODE_ENV` 做开发期断言；浏览器里必须替换掉，
  // 否则运行时抛 `process is not defined`。
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
