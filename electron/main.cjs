// IRON VAULT als Desktop-App (Electron). Lädt den fertigen Vite-Build aus `dist/`
// über ein eigenes Protokoll app://iron-vault/ – so funktionieren fetch() für Modelle,
// Texturen und Sounds genau wie auf einem Webserver (mit file:// ginge das nicht).
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const ORIGIN = 'app://iron-vault';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
// Laptop mit Intel/AMD + NVIDIA: gewählte Grafikkarte nutzen (muss vor dem GPU-Prozess
// passieren). Die Wahl kommt aus dem Grafikmenü und liegt in <userData>/gpu.json.
const gpu = require('./gpu.cjs');
const GPU_FILE = path.join(app.getPath('userData'), 'gpu.json');
const gpuStart = gpu.preferDedicatedGpu(GPU_FILE);
// Ton ohne vorherigen Klick erlauben; Wayland automatisch nutzen, wenn vorhanden.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
// Ein einziges Fenster: zweiter Start holt das laufende nach vorn.
if (!app.requestSingleInstanceLock()) app.quit();

function serve() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    // Nichts außerhalb von dist/ ausliefern; unbekannte Pfade → Startseite.
    if (!file.startsWith(DIST)) return new Response('Nicht gefunden', { status: 404 });
    const target = pathname === '/' || !path.extname(file) ? path.join(DIST, 'index.html') : file;
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'IRON VAULT',
    backgroundColor: '#0b0f0c',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.once('ready-to-show', () => win.show());
  // F11: Vollbild; Externe Links im normalen Browser öffnen.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });
  void win.loadURL(ORIGIN + '/');
  return win;
}

// Automatische Updates über GitHub Releases (siehe package.json → build.publish).
// Nur im installierten AppImage; ohne Internet startet die App ganz normal.
// IRON_VAULT_UPDATE_URL=http://… nutzt stattdessen einen eigenen Webserver (z. B. Pi).
function checkForUpdates(win) {
  if (!app.isPackaged || !process.env.APPIMAGE) return;
  const log = (...a) => console.log('[Update]', ...a);
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  if (process.env.IRON_VAULT_UPDATE_URL)
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.IRON_VAULT_UPDATE_URL });
  autoUpdater.on('update-available', (info) => log('verfügbar', info.version));
  autoUpdater.on('update-not-available', () => log('aktuell', app.getVersion()));
  autoUpdater.on('download-progress', (p) => {
    log('lade', Math.round(p.percent) + ' %');
    win.setProgressBar(p.percent / 100);
  });
  autoUpdater.on('error', (e) => {
    log('nicht möglich:', e.message.split('\n')[0]);
    win.setProgressBar(-1);
  });
  autoUpdater.on('update-downloaded', async (info) => {
    log('bereit', info.version);
    win.setProgressBar(-1);
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'IRON VAULT – Update',
      message: `Update auf Version ${info.version} ist bereit.`,
      detail: 'Jetzt neu starten? Mit „Später“ wird es beim nächsten Beenden eingespielt.',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch(() => {});
}

// Neustart (z. B. nach Wechsel der Grafikkarte). Im AppImage startet app.relaunch() über
// einen Helfer aus dem eingehängten AppImage, das beim Beenden ausgehängt wird – der neue
// Start scheiterte dann mit „Cannot mount AppImage“. Deshalb starten wir die AppImage-Datei
// selbst als eigenständigen Prozess (wie electron-updater bei Updates) und beenden uns.
function restartApp() {
  const appImage = process.env.APPIMAGE;
  if (!appImage) {
    app.relaunch();
    app.exit(0);
    return;
  }
  const env = { ...process.env };
  // Variablen der laufenden AppImage-Instanz nicht an die neue weiterreichen.
  for (const k of ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k];
  gpu.clearOwnEnv(env);
  app.releaseSingleInstanceLock();
  // Electron vererbt offene Dateien aus dem alten Einhängepunkt (app.asar, ICU-Daten);
  // die würden ihn bis zum nächsten Beenden blockieren. bash schließt sie vor dem Start.
  const args = process.argv.slice(1);
  const viaBash = fs.existsSync('/bin/bash');
  const closeFds =
    'for f in /proc/$$/fd/*; do n=${f##*/}; [ "$n" -gt 2 ] && eval "exec $n>&-"; done 2>/dev/null; exec "$0" "$@"';
  const cmd = viaBash ? '/bin/bash' : appImage;
  const cmdArgs = viaBash ? ['-c', closeFds, appImage, ...args] : args;
  const child = spawn(cmd, cmdArgs, {
    detached: true,
    stdio: 'ignore',
    env,
    cwd: process.env.OWD || process.cwd(),
  });
  child.unref();
  app.exit(0);
}

// Grafikkarten-Wahl für das Grafikmenü im Spiel.
function gpuIpc() {
  ipcMain.handle('gpu:get', async () => {
    let devices = [];
    try {
      const info = await app.getGPUInfo('basic');
      devices = (info.gpuDevice || []).map((d) => ({
        vendor: d.vendorId,
        device: d.deviceId,
        active: !!d.active,
      }));
    } catch {
      // ohne GPU-Infos bleibt die Liste leer
    }
    return {
      mode: gpuStart.mode,
      saved: gpu.readMode(GPU_FILE),
      offload: Object.keys(gpuStart.set).length > 0,
      devices,
    };
  });
  ipcMain.handle('gpu:set', (_e, mode) => gpu.writeMode(GPU_FILE, mode));
  ipcMain.handle('app:restart', () => restartApp());
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  gpuIpc();
  serve();
  const win = createWindow();
  // Erst prüfen, wenn das Spiel geladen ist – der Download stört den Start nicht.
  win.webContents.once('did-finish-load', () => setTimeout(() => checkForUpdates(win), 4000));
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});
app.on('window-all-closed', () => app.quit());
