import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './host.mjs';

/**
 * Report writer: aggregates per-width results into a single structured report
 * (JSON + Markdown) under the run's output directory.
 */

export function writeReport({ outDir, startedAt, results, hostMode, summary }) {
  const report = {
    ok: summary.ok,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    hostMode,
    summary,
    widths: results.map((r) => ({
      width: r.width,
      settled: r.settled,
      checks: r.checks,
      errors: r.errors,
      screenshot: r.screenshot,
      screenshots: r.screenshots,
      combos: r.combos,
    })),
  };
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'report.json');
  const mdPath = join(outDir, 'report.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdPath, toMarkdown(report), 'utf8');
  log('info', `report written: ${mdPath}`);
  return { jsonPath, mdPath };
}

function toMarkdown(report) {
  const lines = [];
  lines.push(`# dev-loop report — ${report.finishedAt}`);
  lines.push('');
  lines.push(`**Result:** ${report.ok ? '✅ PASS' : '❌ FAIL'}  ·  hostMode: ${report.hostMode}`);
  lines.push('');
  for (const w of report.widths) {
    lines.push(`## width=${w.width}px  ${w.settled ? '' : '⚠️ not settled'}`);
    lines.push('');
    lines.push(`| check | result |`);
    lines.push(`|---|---|`);
    for (const [name, ok, detail] of w.checks) {
      lines.push(`| ${name} | ${ok ? '✅' : '❌'}${detail ? ' — ' + detail : ''} |`);
    }
    if (w.errors.length) {
      lines.push('');
      lines.push(`### console/page errors (${w.errors.length})`);
      w.errors.slice(0, 20).forEach((e) => lines.push(`- \`${e}\``));
    }
    lines.push('');
    lines.push(`screenshot: \`${w.screenshot}\``);
    lines.push('');
  }
  lines.push('---');
  lines.push(`**Summary:** ${report.summary.passed}/${report.summary.total} checks passed · ${report.summary.errorCount} console errors`);
  return lines.join('\n');
}
