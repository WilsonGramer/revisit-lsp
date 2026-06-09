/// <reference types="vitest/config" />
import { defaultClientMainFields, defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    build: {
      lib: mode === 'lsp' ? {
        entry: 'src/lsp/index.ts',
        formats: ['cjs'],
        fileName: 'lsp/index',
      } : undefined,
      sourcemap: true,
    },
    base: command === 'build' ? env.VITE_BASE_PATH : '/',
    plugins: [
      react({ devTarget: 'es2022' }),
    ],
    resolve: {
      alias: {
        // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
        '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
      },
      // For LSP: https://github.com/microsoft/vscode-languageserver-node/issues/1352
      mainFields: mode === 'lsp' ? defaultClientMainFields.filter((f) => f !== 'browser') : undefined,
    },
    test: {
      exclude: ['./tests/**', 'node_modules/**'],
      setupFiles: ['vitest-localstorage-mock'],
      fileParallelism: true,
      maxWorkers: '100%',
      minWorkers: 1,
    },
  };
});
