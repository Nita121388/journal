// 根 ESLint —— 只覆盖 `host/` 与 `dev-loop/`。
//
// 为什么需要：这两个目录此前**零静态分析**（root `npm run lint` 只跑 `--prefix extension`），
// 于是 `no-undef`、未使用变量之类的错误只会在运行时才暴露。
//
// `extension/` 有自己的配置（`extension/eslint.config.js`），含分层边界规则，不在这里重复。
export default [
  { ignores: ['**/node_modules/**', '**/out/**', 'extension/**'] },
  {
    files: ['host/**/*.js', 'host/**/*.mjs', 'dev-loop/**/*.js', 'dev-loop/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        structuredClone: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        queueMicrotask: 'readonly',
        globalThis: 'readonly',
        performance: 'readonly',
        Buffer: 'readonly',
        // dev-loop 的 scenario 代码里会写浏览器上下文（page.evaluate 的入参），
        // 文本上仍在 Node 文件里，故这些 DOM 全局也要登记。
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        chrome: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLSelectElement: 'readonly',
        Option: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        ImageData: 'readonly',
        MouseEvent: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-debugger': 'error',
    },
  },
];
