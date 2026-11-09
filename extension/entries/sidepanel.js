/**
 * sidepanel.js — 启动引导（entries 层）
 *
 * 本文件只负责启动。真正的装配与启动顺序见同目录：
 *   app.js        组合根（启动顺序 + 注入 actions）
 *   bind-shell.js 外壳交互
 *   bind-views.js 视图导航与视图内交互
 *   bind-editor.js 编辑器 / 模板构建器事件
 */

import { init } from './app.js';
import { renderVersionBadge } from '../components/version-badge.js';
import { getPort } from '../platform/index.js';

// 版本先渲染，再走 init：host 离线 / init 抛错时用户仍能确认装的是哪个包
// （2026-11-09“改了看不到”的直接解药）。
renderVersionBadge(document.getElementById('app-version'), getPort().getManifest?.());

init().catch(err => console.error('[journal] init failed:', err));
