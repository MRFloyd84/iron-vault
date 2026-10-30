// Brücke zwischen Spiel (Renderer) und Desktop-App: nur die Grafikkarten-Wahl.
// Im Browser fehlt sie – das Spiel blendet die Einstellung dann aus.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ironVault', {
  gpu: {
    /** { mode, active, devices: [{ vendor, device, active }] } */
    get: () => ipcRenderer.invoke('gpu:get'),
    /** Wahl speichern; wirkt nach dem Neustart. */
    set: (mode) => ipcRenderer.invoke('gpu:set', mode),
    /** App neu starten (z. B. nach Wechsel der Grafikkarte). */
    restart: () => ipcRenderer.invoke('app:restart'),
  },
});
