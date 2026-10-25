// Sprachwahl oben rechts: kleines Menü mit allen Sprachen, Auswahl wird gespeichert.
import { useEffect, useRef, useState } from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES, getLang, onLangChange, setLang, tr, type Lang } from '../lib/i18n';

/** Aktuelle Sprache; die Komponente zeichnet bei einem Wechsel neu. */
export function useLang(): Lang {
  const [lang, set] = useState(getLang());
  useEffect(() => {
    const off = onLangChange(set);
    return () => {
      off();
    };
  }, []);
  return lang;
}

export default function LanguageMenu() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const current = LANGUAGES.find((l) => l.id === lang)!;
  return (
    <div className="language-menu" ref={root}>
      <button
        className="icon-button language-button"
        title={tr('Sprache')}
        aria-label={tr('Sprache wählen')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Languages size={16} />
        <span>{current.short}</span>
      </button>
      {open && (
        <ul className="language-list" role="listbox" aria-label={tr('Sprache')}>
          {LANGUAGES.map((l) => (
            <li key={l.id}>
              <button
                role="option"
                aria-selected={l.id === lang}
                onClick={() => {
                  setLang(l.id);
                  setOpen(false);
                }}
              >
                <b>{l.short}</b>
                {l.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
