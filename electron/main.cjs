// IRON VAULT als Desktop-App (Electron). Lädt den fertigen Vite-Build aus `dist/`
// über ein eigenes Protokoll app://iron-vault/ – so funktionieren fetch() für Modelle,
// Texturen und Sounds genau wie auf einem Webserver (mit file:// ginge das nicht).
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const ORIGIN = 'app://iron-vault';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
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
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  serve();
  const win = createWindow();
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});
app.on('window-all-closed', () => app.quit());
