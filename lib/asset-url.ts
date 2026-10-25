// Pfad zu einer Datei aus public/. Berücksichtigt den Basis-Pfad des Builds: im Browser und
// in der Desktop-App liegt das Spiel unter „/“, die Web-Demo auf GitHub Pages unter
// „/iron-vault/“ (vite.config.ts → base). Außerhalb von Vite (Tests) gilt „/“.
const BASE: string = import.meta.env?.BASE_URL ?? '/';
export const assetUrl = (path: string) => BASE + path.replace(/^\//, '');
