import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';

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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: '内容工坊',
    backgroundColor: '#060514',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerContextMenu(mainWindow);
  registerIpc(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
