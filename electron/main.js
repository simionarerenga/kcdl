// electron/main.js
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 860,
    minWidth: 360,
    minHeight: 600,
    icon: path.join(__dirname, '../public/img/icon_bg.png'),
    title: "Copra Inspector's Report",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC: Save data backup to a file chosen by user
ipcMain.handle('backup-data', async (_event, jsonData) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save Backup',
    defaultPath: `copra-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { success: false, reason: 'canceled' };
  try {
    fs.writeFileSync(filePath, jsonData, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, reason: err.message };
  }
});

// IPC: Open a file for report sending (email client / attachment stub)
ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
