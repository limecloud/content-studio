import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const desktopPlatformDir = existsSync(resolve(__dirname, '.tmp/lime-desktop-platform'))
  ? resolve(__dirname, '.tmp/lime-desktop-platform')
  : resolve(__dirname, '../lime-desktop-platform');
const desktopPlatformPackageAliases = [
  {
    find: '@limecloud/desktop-platform-electron-adapter',
    replacement: resolve(desktopPlatformDir, 'packages/electron-adapter/dist/packages/electron-adapter/src/index.js'),
  },
  {
    find: '@limecloud/desktop-platform-contracts',
    replacement: resolve(desktopPlatformDir, 'packages/contracts/dist/index.js'),
  },
  {
    find: '@limecloud/desktop-platform-react',
    replacement: resolve(desktopPlatformDir, 'packages/react/dist/index.js'),
  },
];
const limePackagesDir = resolve(__dirname, '../../aiclientproxy/lime/packages');
const limeAgentPackageAliases = [
  {
    find: '@limecloud/agent-ui-contracts',
    replacement: resolve(limePackagesDir, 'agent-ui-contracts/dist/index.js'),
  },
  {
    find: '@limecloud/agent-runtime-projection',
    replacement: resolve(limePackagesDir, 'agent-runtime-projection/dist/index.js'),
  },
  {
    find: '@limecloud/agent-runtime-ui',
    replacement: resolve(limePackagesDir, 'agent-runtime-ui/dist/index.js'),
  },
  {
    find: '@limecloud/agent-runtime-client/sessionGateway',
    replacement: resolve(limePackagesDir, 'agent-runtime-client/dist/sessionGateway.js'),
  },
  {
    find: '@limecloud/agent-runtime-client',
    replacement: resolve(limePackagesDir, 'agent-runtime-client/dist/index.js'),
  },
  {
    find: '@limecloud/app-server-client',
    replacement: resolve(limePackagesDir, 'app-server-client/dist/index.js'),
  },
];

function shouldUseLimeAgentPackageAliases(command: 'build' | 'serve'): boolean {
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') return false;
  return (command === 'serve' && process.env.npm_lifecycle_event === 'dev')
    || process.env.CONTENT_STUDIO_LOCAL_BUILD === '1';
}

function shouldUseDesktopPlatformPackageAliases(command: 'build' | 'serve'): boolean {
  if (process.env.CONTENT_STUDIO_USE_NPM_DESKTOP_PLATFORM === '1') return false;
  return command === 'serve' || process.env.CONTENT_STUDIO_LOCAL_BUILD === '1';
}

export default defineConfig(({ command }) => {
  const useLimeAgentPackageAliases = shouldUseLimeAgentPackageAliases(command);
  const useDesktopPlatformPackageAliases = shouldUseDesktopPlatformPackageAliases(command);

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: [
          ...(useLimeAgentPackageAliases ? limeAgentPackageAliases : []),
          ...(useDesktopPlatformPackageAliases ? [desktopPlatformPackageAliases[0]] : []),
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
          ...(useLimeAgentPackageAliases ? limeAgentPackageAliases : []),
          ...(useDesktopPlatformPackageAliases ? desktopPlatformPackageAliases.slice(1) : []),
          { find: '@renderer', replacement: resolve(__dirname, 'src/renderer/src') },
          { find: 'react/jsx-runtime', replacement: resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
          { find: 'react/jsx-dev-runtime', replacement: resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
          { find: 'react', replacement: resolve(__dirname, 'node_modules/react/index.js') },
        ],
      },
    },
  };
});
