// ESLint flat config — Journal 扩展（无框架，原生 ES module）
// 规则来源：.trellis/spec/frontend/quality-guidelines.md
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
        localStorage: 'readonly',
        indexedDB: 'readonly',
        Image: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLSelectElement: 'readonly',
        Option: 'readonly',
        matchMedia: 'readonly',
        Node: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        performance: 'readonly',
        navigator: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      // 未声明标识符即报错：否则“忘了 import”会在 lint 里静默通过，
      // 只到浏览器里变成 ReferenceError（曾真实发生：cardPrimaryText）。
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  // ── 分层边界（架构契约，见 docs/adr/0001 与 tasks/10-06-*/design.md §7）─────────
  // 规则总览：
  //   chrome 全局  —— 只允许出现在 platform/**（先全局禁用，再对 platform 解除）
  //   shared       —— 纯逻辑叶子：不依赖任何其他层，不碰 DOM/存储/网络
  //   platform     —— 适配层：不得依赖上层业务代码
  //   state/views/features/components —— 只可依赖 platform/index.js 的**契约**，
  //                                      禁止 import 具体实现（chrome/web/desktop）
  //   entries      —— 组合根，可 import 全部
  {
    files: ['**/*.js'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'chrome', message: 'chrome.* 只能出现在 extension/platform/**（平台适配层）。' },
        { name: 'localStorage', message: 'localStorage 只能出现在 platform/**；其余层请用 getPort().prefGet/prefSet。' },
        { name: 'fetch', message: '网络请求只能出现在 platform/**；业务层请用 state/host-client.js（经端口 hostFetch）。' },
      ],
    },
  },
  {
    // 平台适配层是 chrome.* / localStorage 的唯一合法归属地。
    files: ['platform/**/*.js'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/state/**', '**/views/**', '**/features/**', '**/components/**', '**/entries/**'],
            message: 'platform/ 是适配层，不得依赖上层业务代码。' },
        ],
      }],
    },
  },
  {
    files: ['shared/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/platform/**', '**/state/**', '**/views/**', '**/features/**',
                    '**/components/**', '**/entries/**'],
            message: 'shared/ 是纯逻辑叶子，不得依赖其他层。' },
          { group: ['node:*'], message: 'shared/ 必须可在浏览器与 Node 双方运行，禁止 node: 内置模块。' },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'chrome', message: '平台 API 只能出现在 platform/。' },
        { name: 'document', message: 'shared/ 不得触碰 DOM。' },
        { name: 'window', message: 'shared/ 不得触碰 DOM/window。' },
        { name: 'localStorage', message: 'shared/ 不得直接访问存储。' },
        { name: 'fetch', message: 'shared/ 不得直接发起网络请求。' },
      ],
    },
  },
  // ── 完整层序矩阵 ────────────────────────────────────────────────
  // 声明层序：shared → platform / state / components → (features | views) → entries
  // features 与 views 是**同层对等**（交互 vs 渲染），允许互相引用；
  // 但两者都不得反向依赖 entries —— 反向调用一律经 state/actions.js。
  //
  // ⚠️ 关键约束：ESLint flat config 里同名规则是**覆盖**而非合并 ——
  // 若同一文件同时命中两个都写 `no-restricted-imports` 的配置对象，
  // 只有**后者**生效，前者会静默失效（曾因此让两条边界规则变成死规则，
  // 探针验证：state/ import platform/chrome.js 不报错）。
  // 所以每个文件 glob 必须**只写一条** no-restricted-imports，把该层所有禁令列在里面。
  {
    files: ['state/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/views/**', '**/features/**', '**/components/**', '**/entries/**'],
            message: 'state/ 不得依赖 UI 层（views/features/components/entries）。' },
          { group: ['**/platform/chrome.js', '**/platform/web.js', '**/platform/desktop.js'],
            message: '只可依赖 platform/index.js 的端口契约；具体实现由 entries/ 选择并注入。' },
        ],
      }],
    },
  },
  {
    files: ['components/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/state/**', '**/views/**', '**/features/**', '**/entries/**'],
            message: 'components/ 是最底层 UI 原子，不得依赖 state/views/features/entries。' },
          { group: ['**/platform/chrome.js', '**/platform/web.js', '**/platform/desktop.js'],
            message: '只可依赖 platform/index.js 的端口契约；具体实现由 entries/ 选择并注入。' },
        ],
      }],
    },
  },
  {
    files: ['views/**/*.js', 'features/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/entries/**'],
            message: 'UI 层不得依赖组合根 entries/；反向调用请经 state/actions.js。' },
          { group: ['**/platform/chrome.js', '**/platform/web.js', '**/platform/desktop.js'],
            message: '只可依赖 platform/index.js 的端口契约；具体实现由 entries/ 选择并注入。' },
        ],
      }],
    },
  },
];
