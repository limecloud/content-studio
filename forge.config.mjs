function rootPattern(name) {
  return new RegExp(`^/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|/)`);
}

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  outDir: 'forge-out',
  packagerConfig: {
    name: '布谷AI',
    executableName: 'content-studio',
    appBundleId: 'ai.limecloud.contentstudio',
    appCategoryType: 'public.app-category.productivity',
    asar: true,
    icon: 'build/icon',
    extraResource: ['resources/app-server'],
    ignore: [
      rootPattern('.content-studio'),
      rootPattern('.github'),
      rootPattern('.tmp'),
      rootPattern('.wrangler'),
      rootPattern('docs'),
      rootPattern('internal'),
      rootPattern('oem'),
      rootPattern('release'),
      rootPattern('forge-out'),
      rootPattern('scripts'),
      rootPattern('src'),
      rootPattern('tmp'),
      rootPattern('tests'),
      rootPattern('test-results'),
      rootPattern('playwright-report'),
      /^\/electron-builder\.yml$/,
      /^\/electron\.vite\.config\.ts$/,
      /^\/tsconfig\.json$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'content_studio',
        authors: '布谷AI',
        exe: 'content-studio.exe',
        setupExe: 'content-studio-setup.exe',
        setupIcon: 'build/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
      config: {},
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        icon: 'build/icon.icns',
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          name: 'content-studio',
          productName: '布谷AI',
          genericName: 'AI Content Studio',
          categories: ['Utility'],
          icon: 'build/icon.png',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          name: 'content-studio',
          productName: '布谷AI',
          genericName: 'AI Content Studio',
          categories: ['Utility'],
          icon: 'build/icon.png',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};

export default config;
