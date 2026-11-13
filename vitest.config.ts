import { defineConfig } from 'vitest/config'
import path from 'path'
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // 'node': jsdom is not installed in this sandbox (npm install fails with
  // EPERM on large writes — see README "Known environment notes"), and every
  // test in the repo runs under a `// @vitest-environment node` pragma.
  // If a DOM component test is ever added, install jsdom and revisit this.
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Playwright specs live under tests/e2e and run via `playwright test`
    // against a preview server — vitest must not collect them (their
    // test() collides with vitest's). This keeps the default excludes and
    // adds the e2e directory.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'tests/e2e/**',
    ],
  },
})
