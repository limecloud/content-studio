import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const desktopPlatformDir = existsSync(resolve(__dirname, '.tmp/lime-desktop-platform'))
  ? resolve(__dirname, '.tmp/lime-desktop-platform')
  : resolve(__dirname, '../lime-desktop-platform');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: [
        {
          find: '@limecloud/desktop-platform-electron-adapter',
          replacement: resolve(desktopPlatformDir, 'packages/electron-adapter/dist/packages/electron-adapter/src/index.js'),
        },
      ],
    },
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
          replacement: resolve(desktopPlatformDir, 'packages/contracts/dist/index.js'),
        },
        {
          find: '@limecloud/desktop-platform-react',
          replacement: resolve(desktopPlatformDir, 'packages/react/dist/index.js'),
        },
      ],
    },
  },
});
