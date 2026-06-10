import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: [
        { find: '@renderer', replacement: resolve(__dirname, 'src/renderer/src') },
        { find: 'react/jsx-runtime', replacement: resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
        { find: 'react/jsx-dev-runtime', replacement: resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
        { find: 'react', replacement: resolve(__dirname, 'node_modules/react/index.js') },
        {
          find: '@limecloud/desktop-platform-contracts',
          replacement: resolve(__dirname, '../lime-desktop-platform/packages/contracts/dist/index.js'),
        },
        {
          find: '@limecloud/desktop-platform-react',
          replacement: resolve(__dirname, '../lime-desktop-platform/packages/react/dist/index.js'),
        },
      ],
    },
  },
});
