import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const REQUIRED_PACKAGES = [
  '@limecloud/desktop-platform-contracts',
  '@limecloud/desktop-platform-react',
  '@limecloud/desktop-platform-electron-adapter',
];

const missing = REQUIRED_PACKAGES.filter((packageName) => {
  try {
    require.resolve(packageName);
    return false;
  } catch {
    return true;
  }
});

if (missing.length > 0) {
  console.error([
    '[desktop-platform-packages] missing production npm packages:',
    ...missing.map((packageName) => `- ${packageName}`),
    '',
    '生产 build/dist 不允许使用本地 lime-desktop-platform alias。',
    '请先将对应 @limecloud/desktop-platform-* 包发布到 npmjs 并写入 package.json / package-lock.json。',
  ].join('\n'));
  process.exit(1);
}

console.log(`[desktop-platform-packages] ok packages=${REQUIRED_PACKAGES.join(',')}`);
