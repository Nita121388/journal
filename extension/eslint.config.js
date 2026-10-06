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
        HTMLElement: 'readonly',
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
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  // ── 分层边界（架构契约，见 docs/adr/0001 与 tasks/10-06-*/design.md §7）─────────
  // 仅约束已存在的分层目录；随搬迁逐步收紧。目标：
  //   shared  是叶子，不得 import 其他层、不得引用平台/浏览器 API
  //   platform 不得 import 上层（state/views/features/components/entries）
  //   state/views/features/components 不得 import platform/**
  //   entries  是组合根，可 import 全部
  {
    files: ['shared/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/platform/**', '**/state/**', '**/views/**', '**/features/**',
                    '**/components/**', '**/entries/**', '**/lib/**'],
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
  {
    files: ['platform/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/state/**', '**/views/**', '**/features/**', '**/components/**', '**/entries/**'],
            message: 'platform/ 是适配层，不得依赖上层业务代码。' },
        ],
      }],
    },
  },
  {
    files: ['state/**/*.js', 'views/**/*.js', 'features/**/*.js', 'components/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/platform/**'],
            message: '平台能力必须由 entries/ 注入（PlatformPort），禁止直接 import platform/。' },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'chrome', message: '平台 API 只能出现在 platform/。' },
      ],
    },
  },
];
