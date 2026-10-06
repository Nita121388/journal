import { defineConfig } from 'vitest/config';

/**
 * vitest.config.mjs — shared / state 的单元测试与覆盖率门禁
 *
 * 门禁（`.trellis/spec/frontend/quality-guidelines.md`）：
 *   shared/ + state/ 行/函数/语句覆盖率 ≥ 80%，分支 ≥ 70%。
 *
 * 排除说明：
 *   - `shared/emoji-data.js` 为纯数据表（1686 行），非逻辑，纳入会稀释覆盖率；
 *   - 测试文件自身不计入。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{shared,state}/**/*.test.js'],
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
