// Mehrsprachigkeit. Der Quelltext bleibt deutsch; `tr()` übersetzt beim Anzeigen.
//
// - Genaue Treffer kommen aus dem Wörterbuch (lib/i18n-en.ts).
// - Zusammengesetzte Meldungen („Gehen gesperrt: Parkverriegelung zuerst lösen.“)
//   erkennt ein Muster mit Platzhaltern {0}, {1} …; die eingesetzten Teile werden
//   ihrerseits übersetzt.
// - Dezimalkomma wird im Englischen zum Punkt (3,0 s → 3.0 s).
// - Fehlt eine Übersetzung, bleibt der deutsche Text stehen (nie leer).
// Übersetzt wird erst beim Zeichnen; Zustandslogik und Tests bleiben deutsch.
import { EN } from './i18n-en';

export type Lang = 'de' | 'en';
export const LANGUAGES: readonly { id: Lang; name: string; short: string }[] = [
  { id: 'de', name: 'Deutsch', short: 'DE' },
  { id: 'en', name: 'English', short: 'EN' },
];
const STORAGE_KEY = 'iron-vault.lang';

function initialLang(): Lang {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored === 'de' || stored === 'en') return stored;
  } catch {
    // Speicher gesperrt (privates Fenster): Systemsprache nehmen.
  }
  // Ohne gespeicherte Wahl: Sprache von Browser bzw. System. Außerhalb des Browsers
  // (Tests, Werkzeuge) bleibt es beim deutschen Quelltext.
  if (typeof document === 'undefined') return 'de';
  const nav = globalThis.navigator?.language ?? 'de';
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let lang: Lang = initialLang();
const listeners = new Set<(l: Lang) => void>();
const cache = new Map<string, string>();

export const getLang = () => lang;
export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  cache.clear();
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neustart
  }
  if (globalThis.document) document.documentElement.lang = next;
  for (const l of listeners) l(next);
}
/** Meldet Sprachwechsel (z. B. um feste Texturen neu zu zeichnen). Gibt Abmeldung zurück. */
export function onLangChange(cb: (l: Lang) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

type Template = { re: RegExp; out: string; weight: number };
const exact = new Map<string, string>();
const templates: Template[] = [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [de, en] of Object.entries(EN)) {
  if (/\{\d\}/.test(de)) {
    const parts = de.split(/(\{\d\})/);
    const order: number[] = [];
    const pattern = parts
      .map((p) => {
        const m = /^\{(\d)\}$/.exec(p);
        if (!m) return escape(p);
        order.push(Number(m[1]));
        return '(.+?)';
      })
      .join('');
    // Platzhalter dürfen im Englischen umgestellt werden: {1} … {0}
    let out = en;
    order.forEach((n, i) => (out = out.split('{' + n + '}').join('\uE000' + i + '\uE000')));
    templates.push({ re: new RegExp('^' + pattern + '$', 's'), out, weight: de.length });
  } else exact.set(de, en);
}
// Längere, genauere Muster zuerst.
templates.sort((a, b) => b.weight - a.weight);

const decimal = (s: string) => s.replace(/(\d),(\d)/g, '$1.$2');

function translate(text: string, depth: number): string {
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  const trimmed = text.trim();
  if (trimmed !== text && trimmed) {
    const inner = translate(trimmed, depth);
    if (inner !== trimmed) return text.replace(trimmed, inner);
  }
  if (depth < 4)
    for (const t of templates) {
      const m = t.re.exec(text);
      if (!m) continue;
      return t.out.replace(/\uE000(\d)\uE000/g, (_, i) => translate(m[Number(i) + 1], depth + 1));
    }
  return decimal(text);
}

/** Text in der aktuellen Sprache (Quelle: deutscher Text). */
export function tr(text: string): string {
  if (lang === 'de' || !text) return text;
  let out = cache.get(text);
  if (out === undefined) {
    out = translate(text, 0);
    if (cache.size > 4000) cache.clear();
    cache.set(text, out);
  }
  return out;
}

/** Für Tests: Übersetzung unabhängig von der eingestellten Sprache. */
export function trIn(target: Lang, text: string) {
  return target === 'de' ? text : translate(text, 0);
}
