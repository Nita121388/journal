/** sync/index.js — 同步模块汇总导出 */
export { mergeCardSets, pickWinner, cardsEqual, normalizeCard as normalizeSyncCard, CARD_FIELDS } from './merge.js';
export {
  MemoryBackplane, LocalFolderBackplane, WebDAVBackplane, GitHubBackplane,
  createBackplane, buildSnapshot, parseSnapshot, SNAPSHOT_SCHEMA_VERSION,
} from './backplane.js';
export { runSync, syncStatus } from './engine.js';
