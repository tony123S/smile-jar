// main.js: Electron main process for Smile Monster (formerly Smile Jar).
//
// 1. Points the SmartSpectra binding at the bundled native runtime when packaged.
// 2. Creates one sandboxed window that loads only the local index.html.
// 3. Wires the SmartSpectra IPC bridge (the SDK runs here, frames come from the renderer).
// 4. Grants camera (video only, no microphone) to the local page and nothing else.
//    The renderer only asks for the camera after the user has given consent in-app
//    and picked a game. It is never requested during the story or on the home screen.

'use strict';

const path = require('path');
const { app, BrowserWindow, session, shell } = require('electron');

if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
  const LIB = {
    darwin: 'libsmartspectra_capi.dylib',
    win32: 'smartspectra_capi.dll',
    linux: 'libsmartspectra_capi.so',
  }[process.platform];
  if (LIB) process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', LIB);
}

const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');

// The packaged app was called "Smile Jar". Keep its data folder so existing saves still load.
if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Smile Jar'));

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#fdf0ff',
    title: 'Smile Monster',
    webPreferences: {
      preload: require.resolve('@smartspectra/node-sdk/preload'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  bindSmartSpectraIpc(win);

  // Never navigate away from the bundled page; open https links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.loadFile(path.join(__dirname, 'index.html'));
  if (process.env.SMILEJAR_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
    const mediaTypes = (details && details.mediaTypes) || [];
    const cameraOnly = mediaTypes.length === 1 && mediaTypes[0] === 'video';
    callback(permission === 'media' && cameraOnly && url.startsWith('file://'));
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
