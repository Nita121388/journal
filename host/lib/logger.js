/**
 * logger.js — 结构化 stderr 日志（host）
 * 格式：`[host][<level>] <component>: <message>`
 * 规范：只记录元数据（day key、计数、op 名），绝不记录日志正文 / 密钥 / WebDAV 凭据。
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.JOURNAL_LOG_LEVEL] ?? LEVELS.info;

function emit(level, component, message, extra) {
  if (LEVELS[level] < threshold) return;
  const line = `[host][${level}] ${component}: ${message}`;
  if (level === 'error' || level === 'warn') {
    console.error(line, extra ?? '');
  } else {
    console.error(line, extra ?? '');
  }
}

export function createLogger(component) {
  return {
    debug: (msg, extra) => emit('debug', component, msg, extra),
    info: (msg, extra) => emit('info', component, msg, extra),
    warn: (msg, extra) => emit('warn', component, msg, extra),
    error: (msg, extra) => emit('error', component, msg, extra),
  };
}

export const logger = createLogger('host');
