import { spawn } from 'node:child_process';
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..');
const HOST_DIR = join(REPO_ROOT, 'host');
const HOST_JS = join(HOST_DIR, 'server.js');
const EXT_SRC = join(REPO_ROOT, 'extension');

/**
 * Dev-loop host/build isolation.
 * Starts an isolated host (temp data dir + ephemeral port) and materializes a test
 * build of the extension with the host port rewritten, so the agent never touches
 * the user's running host (8765/8766) or product data. Product source is untouched.
 */

export function log(level, msg) {
  console.log(`[dev-loop][${level}] ${msg}`);
}

/** Detect the host port the product currently targets (e.g. 8765 prod / 8766 dev). */
export function detectHostPort(extSrc = EXT_SRC) {
  const f = join(extSrc, 'lib', 'host-sync.js');
  const m = readFileSync(f, 'utf8').match(/127\.0\.0\.1:(\d{4,5})/);
  if (!m) throw new Error(`[dev-loop] cannot detect host port from ${f}`);
  return Number(m[1]);
}

/** Find a free localhost port. */
export function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

/** Rewrite the host port in extension js/json/html to the ephemeral test port. */
export function buildTestExtension({ workDir, testPort }) {
  const out = join(workDir, 'extension');
  copyDir(EXT_SRC, out);
  let rewritten = 0;
  const rewrite = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { rewrite(p); continue; }
      if (!/\.(js|json|html)$/.test(name)) continue;
      const src = readFileSync(p, 'utf8');
      const next = src.replace(/127\.0\.0\.1:\d{4,5}/g, `127.0.0.1:${testPort}`);
      if (next !== src) { writeFileSync(p, next, 'utf8'); rewritten++; }
    }
  };
  rewrite(out);
  log('info', `test extension built at ${out} (port → ${testPort}, ${rewritten} file(s) rewritten)`);
  return out;
}

/** Start an isolated host on `port` with a temp data dir. Returns { proc, dataDir }. */
export function startHost({ port, projectDir = REPO_ROOT }) {
  const dataDir = mkdtempSync(join(tmpdir(), 'journal-devloop-data-'));
  const proc = spawn(process.execPath, [HOST_JS], {
    cwd: HOST_DIR,
    env: { ...process.env, JOURNAL_PORT: String(port), JOURNAL_DATA_DIR: dataDir, JOURNAL_PROJECT_DIR: projectDir, JOURNAL_AI_CONFIG: join(dataDir, 'config.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => log('host', String(d).trim()));
  proc.stderr.on('data', (d) => log('host', String(d).trim()));
  return { proc, dataDir };
}

export async function waitForHealth(port, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`[dev-loop] host health not ok on 127.0.0.1:${port} within ${timeoutMs}ms`);
}

export function makeWorkDir(tag = 'run') {
  return mkdtempSync(join(tmpdir(), `journal-devloop-${tag}-`));
}

export function cleanupDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
