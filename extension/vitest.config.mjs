import { defineConfig } from 'vitest/config';

/**
 * vitest.config.mjs — 单元测试与覆盖率门禁
 *
 * 两层互补（口径诚实化，见 quality-guidelines.md）：
 *   ① 本文件（node + jsdom）：`shared/` `state/` 的逻辑 + `views/` 的渲染分支。
 *   ② dev-loop（真 Chromium）：真实 DOM/CSS/交互，包括布局、对比度、键盘可达。
 *
 * 覆盖率门禁只卡 `shared/` + `state/`（逻辑所在层）：
 *   行/函数/语句 ≥ 80%，分支 ≥ 70%。
 * `views/` `features/` 仍以 dev-loop 端到端回归为准，**不**拿它们的行数去稀释这个数字。
 *
 * 排除说明：
 *   - `shared/emoji-data.js` 为纯数据表（1686 行），非逻辑，纳入会稀释覆盖率；
 *   - 测试文件自身不计入。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{shared,state,views}/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['shared/**/*.js', 'state/**/*.js'],
      exclude: [
        '**/*.test.js',
        'shared/emoji-data.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
