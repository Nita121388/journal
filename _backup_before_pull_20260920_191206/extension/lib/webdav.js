/* ================================================================
   Journal — webdav.js
   WebDAV 公共能力（坚果云等），供 sync.js 使用。
   配置来自 settings.webdav = { server, user, password, path }
   ================================================================ */

'use strict';

import { getState } from './store.js';

export function davAvailable() {
  return !!getState().settings.webdav?.server;
}

/** 返回 { base, dir, path, user, password }；未配置时 throw */
export function davBase() {
  const w = getState().settings.webdav || {};
  if (!w.server) throw new Error('WebDAV 未配置');
  const base = w.server.endsWith('/') ? w.server : w.server + '/';
  const path = (w.path || 'journal/data.json').replace(/^\/+/, '');
  return {
    base,
    path,
    dir: path.split('/')[0] || 'journal',
    user: w.user || '',
    password: w.password || '',
  };
}

function headers(extra = {}) {
  const { user, password } = davBase();
  return { Authorization: `Basic ${btoa(`${user}:${password}`)}`, ...extra };
}

const ensuredDirs = new Set();

/** 逐级确保目录存在 */
export async function davEnsureDir(relDir) {
  const { base } = davBase();
  const clean = String(relDir).replace(/^\/+|\/+$/g, '');
  if (!clean || ensuredDirs.has(clean)) return;
  let acc = '';
  for (const seg of clean.split('/')) {
    acc = acc ? `${acc}/${seg}` : seg;
    if (ensuredDirs.has(acc)) continue;
    let res = await fetch(base + acc + '/', { method: 'PROPFIND', headers: headers({ Depth: '0' }) });
    if (res.status === 404) {
      const mk = await fetch(base + acc + '/', { method: 'MKCOL', headers: headers() });
      if (!mk.ok && mk.status !== 405) throw new Error(`WebDAV MKCOL ${acc} ${mk.status}`);
    } else if (!res.ok && res.status !== 207) {
      throw new Error(`WebDAV PROPFIND ${acc} ${res.status}`);
    }
    ensuredDirs.add(acc);
  }
  ensuredDirs.add(clean);
}

export async function davPutFile(relPath, text) {
  const { base } = davBase();
  const dir = relPath.split('/').slice(0, -1).join('/');
  await davEnsureDir(dir);
  const res = await fetch(base + relPath, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: text,
  });
  if (!res.ok) throw new Error(`WebDAV PUT ${res.status}`);
  return true;
}

export async function davGetFile(relPath) {
  const { base } = davBase();
  const res = await fetch(base + relPath, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`WebDAV GET ${res.status}`);
  return res.text();
}

/** 连接测试 */
export async function davTestConnection() {
  const { base, dir } = davBase();
  let res = await fetch(base + dir + '/', {
    method: 'PROPFIND', headers: headers({ Depth: '0' }),
  });
  if (res.status === 404) {
    await fetch(base + dir + '/', { method: 'MKCOL', headers: headers() });
    res = await fetch(base + dir + '/', { method: 'PROPFIND', headers: { Depth: '0' } });
  }
  if (!res.ok && res.status !== 207) throw new Error(`WebDAV 连接失败 (${res.status})`);
  return { ok: true, server: base + dir };
}
