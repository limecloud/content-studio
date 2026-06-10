import { app, BrowserWindow, ipcMain, Menu, net, protocol, type MenuItemConstructorOptions } from 'electron';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerIpc } from './ipc';
import { getOemRuntimeConfig } from './services/oemRuntimeConfig';

const mainModuleDir = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
const pendingSkillPackages: string[] = [];
let rendererAcceptsSkillPackages = false;

function shouldHideWindowForTests(): boolean {
  if (process.env.CONTENT_STUDIO_TEST_SILENT === '0') return false;
  return process.env.CONTENT_STUDIO_SMOKE === '1' || process.env.CONTENT_STUDIO_E2E === '1' || process.env.CONTENT_STUDIO_TEST_SILENT === '1';
}

function findSkillPackagePath(argv: string[]): string | null {
  return argv.find((arg) => extname(arg).toLowerCase() === '.skill') ?? null;
}

function dispatchSkillPackage(packagePath: string): void {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) {
    pendingSkillPackages.push(packagePath);
    return;
  }
  if (!mainWindow.webContents.isLoading() && rendererAcceptsSkillPackages) {
    mainWindow.webContents.send('skills:packageOpenRequest', packagePath);
    return;
  }
  pendingSkillPackages.push(packagePath);
}

function flushPendingSkillPackages(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererAcceptsSkillPackages) return;
  const packages = pendingSkillPackages.splice(0);
  for (const packagePath of packages) {
    mainWindow.webContents.send('skills:packageOpenRequest', packagePath);
  }
}

function registerContextMenu(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const editItems: MenuItemConstructorOptions[] = params.isEditable
      ? [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
        ]
      : [
          { role: 'copy', enabled: params.selectionText.trim().length > 0 },
          { type: 'separator' },
        ];

    const template: MenuItemConstructorOptions[] = [
      ...editItems,
      {
        label: '刷新',
        accelerator: 'CmdOrCtrl+R',
        click: () => mainWindow.webContents.reload(),
      },
      {
        label: '强制刷新',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: async () => {
          await mainWindow.webContents.session.clearCache();
          mainWindow.webContents.reloadIgnoringCache();
        },
      },
      { type: 'separator' },
      {
        label: '打开开发者工具',
        click: () => mainWindow.webContents.openDevTools({ mode: 'detach' }),
      },
    ];

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

function createWindow(): BrowserWindow {
  rendererAcceptsSkillPackages = false;
  const hideWindowForTests = shouldHideWindowForTests();
  const appTitle = getOemRuntimeConfig().productName || '布谷AI';
  const windowTitle = '';
  app.setName(appTitle);
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: windowTitle,
    show: !hideWindowForTests,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#060514',
    webPreferences: {
      preload: join(mainModuleDir, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerContextMenu(mainWindow);
  registerIpc(mainWindow);
  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow?.setTitle(windowTitle);
  });
  mainWindow.webContents.on('did-finish-load', flushPendingSkillPackages);
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererAcceptsSkillPackages = false;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(mainModuleDir, '../renderer/index.html'));
  }
  return mainWindow;
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { bypassCSP: true, supportFetchAPI: true } },
]);

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  const initialSkillPackage = findSkillPackagePath(process.argv);
  if (initialSkillPackage) pendingSkillPackages.push(initialSkillPackage);

  app.on('second-instance', (_event, argv) => {
    const packagePath = findSkillPackagePath(argv);
    if (!mainWindow) createWindow();
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
    if (packagePath) dispatchSkillPackage(packagePath);
  });

  app.on('open-file', (event, filePath) => {
    if (extname(filePath).toLowerCase() !== '.skill') return;
    event.preventDefault();
    dispatchSkillPackage(filePath);
  });

  ipcMain.on('skills:packageOpenReady', () => {
    rendererAcceptsSkillPackages = true;
    flushPendingSkillPackages();
  });

  app.whenReady().then(() => {
    protocol.handle('local-asset', (request) => {
      const filePath = decodeURIComponent(new URL(request.url).pathname);
      return net.fetch(pathToFileURL(filePath).toString());
    });

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
