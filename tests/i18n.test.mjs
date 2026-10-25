import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { EN } from '../lib/i18n-en.ts';
import { trIn, tr, getLang } from '../lib/i18n.ts';
import { HELP } from '../app/help-content.ts';

// Erkennt deutsche Anzeigetexte: Umlaute/ß oder typische deutsche Wörter.
const GERMAN =
  /[äöüÄÖÜß]|\b(und|oder|der|die|das|den|dem|nicht|ist|mit|für|zuerst|aus|ein|eine|auf|einschalten|ausschalten|gesperrt|bereit|prüfen|starten|anzeigen|wählen|verbinden|trennen|läuft|Leistung|Druck|Kühlung|Hauptstrom|Strom|Bewegung|Gehen|Tor|Zustand|Freigabe|Verriegelung|Parkverriegelung|Schritt|Stufe|Halle|Hangarstrom|Neurohelm|Warnung|Störung|Prüfung|Systemtest|Leistungshebel|Rechts|Links|Seite|Vorne|Hinten|Werkstatt|Rohrleitung|Lichtmast|Container|Versorgung|Sicht|Ton)\b/i;
const NOT_SHOWN = new Set([
  // Objektnamen, Konsolen- und Diagnosetexte, Dateinamen – nie in der Oberfläche
  'Knie',
  'Sprunggelenk',
  'Deutsch',
  'yard-container',
  'container',
  // Im Englischen gleich bzw. Eigenname (Namensschild)
  'Container',
  'MÜLLER K.',
]);

function sourceStrings() {
  const files = [
    ...fs
      .readdirSync(new URL('../app', import.meta.url))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => 'app/' + f),
    ...fs
      .readdirSync(new URL('../lib', import.meta.url))
      .filter((f) => /\.ts$/.test(f))
      .map((f) => 'lib/' + f),
    ...fs.readdirSync(new URL('../lib/scene', import.meta.url)).map((f) => 'lib/scene/' + f),
  ].filter((f) => !/i18n-en|help-content/.test(f));
  const out = [];
  for (const f of files) {
    const code = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const src = ts.createSourceFile(
      f,
      code,
      ts.ScriptTarget.Latest,
      true,
      f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        const p = n.parent;
        const call = ts.findAncestor(n, (a) => ts.isCallExpression(a) || ts.isNewExpression(a));
        const skip =
          ts.isImportDeclaration(p) ||
          (ts.isPropertyAssignment(p) && p.name === n) ||
          (ts.isBinaryExpression(p) && /=/.test(p.operatorToken.getText())) ||
          ts.isCaseClause(p) ||
          ts.findAncestor(n, (a) => ts.isTypeNode(a)) ||
          (call && /^(console\.|new Error|.*warn)/.test(call.expression.getText())) ||
          /^\s*\/\/|^\[IRON|#include|vec[234]|gl_/.test(n.text);
        const text = n.text.trim();
        if (!skip && text && GERMAN.test(text) && !NOT_SHOWN.has(text))
          out.push({
            where: f + ':' + (src.getLineAndCharacterOfPosition(n.getStart()).line + 1),
            text,
          });
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return out;
}

test('jeder deutsche Anzeigetext im Quelltext hat eine englische Übersetzung', () => {
  const keys = Object.keys(EN);
  // Ein Text gilt als abgedeckt, wenn er Schlüssel ist oder als Teil eines Musters vorkommt.
  const missing = sourceStrings().filter(
    ({ text }) => !(text in EN) && !keys.some((k) => /\{\d\}/.test(k) && k.includes(text)),
  );
  assert.deepEqual(
    missing,
    [],
    'ohne Übersetzung:\n' + missing.map((m) => m.where + '  ' + m.text).join('\n'),
  );
});

test('Übersetzungen sind vollständig englisch und behalten Platzhalter', () => {
  for (const [de, en] of Object.entries(EN)) {
    assert.ok(en.trim(), 'leer: ' + de);
    assert.ok(!/[äöüÄÖÜß]/.test(en), 'Umlaut im Englischen: ' + en);
    const ph = (s) => (s.match(/\{\d\}/g) ?? []).sort().join();
    assert.equal(ph(en), ph(de), 'Platzhalter: ' + de);
  }
});

test('zusammengesetzte Meldungen, Zahlen und Rückfall', () => {
  assert.equal(
    trIn('en', 'Gehen gesperrt: Parkverriegelung zuerst lösen.'),
    'Walking locked: Release the parking lock first.',
  );
  assert.equal(
    trIn('en', 'Druck stabil. Halteprüfung 2,4 / 3,0 s.'),
    'Pressure stable. Hold check 2.4 / 3.0 s.',
  );
  assert.equal(
    trIn('en', 'Hallensäule – Bewegung angehalten. Zurücksetzen oder neu ausrichten.'),
    'Hall pillar – movement stopped. Back up or realign.',
  );
  assert.equal(
    trIn('en', 'SCHUTZ AUSGELÖST: HANGARSTROM / MAIN GEN'),
    'PROTECTION TRIPPED: HANGAR POWER / MAIN GEN',
  );
  assert.equal(trIn('en', 'Kamera 3 · VORNE RECHTS'), 'Camera 3 · FRONT RIGHT');
  // Unbekannt bleibt unverändert, Deutsch bleibt Deutsch
  assert.equal(trIn('en', 'IV-04'), 'IV-04');
  assert.equal(trIn('de', 'Gehen gesperrt: X'), 'Gehen gesperrt: X');
  // Tests laufen in Deutsch: tr ändert nichts
  assert.equal(getLang(), 'de');
  assert.equal(tr('Hauptstrom'), 'Hauptstrom');
});

test('Hilfe gibt es in beiden Sprachen mit gleicher Gliederung', () => {
  assert.equal(HELP.en.sections.length, HELP.de.sections.length);
  assert.equal(HELP.en.notes.length, HELP.de.notes.length);
  for (const [title, text] of HELP.en.sections) {
    assert.ok(!/[äöüÄÖÜß]/.test(title + text), title);
  }
});

test('Zufallsdurchläufe: alle erzeugten Meldungen und Checklisten werden englisch', async () => {
  const M = await import('../lib/machine.ts');
  const { mobilityCommand } = await import('../lib/mobility.ts');
  const { hangarCommand } = await import('../lib/hangar.ts');
  const { walkInput, walkSetting } = await import('../lib/walking.ts');
  const german =
    /[äöüÄÖÜß]|\b(und|oder|nicht|ist|mit|für|zuerst|einschalten|ausschalten|gesperrt|bereit|prüfen|starten|abwarten|stellen|Leistung|Druck|Kühlung|Hauptstrom|Strom|Gehen|Freigabe|Verriegelung|Stufe|Warnung|Störung|Prüfung|wird|werden|bleibt|auf|zum|vom|der|die|das|den)\b/;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const texts = new Set();
  for (let run = 0; run < 120; run++) {
    let s = M.initialState(),
      now = 0;
    for (let k = 0; k < 300; k++) {
      now += 70 + rnd() * 900;
      const r = rnd();
      if (r < 0.2) s = M.command(s, Math.floor(rnd() * 6), now);
      else if (r < 0.4) s = M.overheadCommand(s, 40 + Math.floor(rnd() * 12), now);
      else if (r < 0.5) s = M.serviceCommand(s, 60 + Math.floor(rnd() * 30));
      else if (r < 0.6) s = M.auxiliary(s, 20 + Math.floor(rnd() * 16));
      else if (r < 0.68) s = mobilityCommand(s, 80 + Math.floor(rnd() * 16));
      else if (r < 0.72) s = hangarCommand(s, 85 + Math.floor(rnd() * 6));
      else if (r < 0.76) s = M.throttleCommand(s, rnd() < 0.5 ? 1 : -1);
      else if (r < 0.78) s = M.startShutdown(s);
      else if (r < 0.8) s = M.startSystemTest(s);
      else if (r < 0.82) s = walkInput(s, { forward: 1, turn: 0, brake: false });
      else if (r < 0.83) s = walkSetting(s, 94);
      for (let t = 0; t < 4; t++) s = M.tick(s, (now += 250));
      texts.add(s.message);
      texts.add(s.testMessage);
      for (const t of [...M.startChecklist(s), ...M.shutdownChecklist(s)]) {
        texts.add(t.label);
        texts.add(t.hint);
      }
      texts.add(M.nextStartInstruction(s));
      texts.add(M.shutdownInstruction(s));
    }
  }
  const bad = [...texts]
    .filter(Boolean)
    .map((t) => trIn('en', t))
    .filter((en) => german.test(en));
  assert.ok(texts.size > 150, 'genug verschiedene Meldungen: ' + texts.size);
  assert.deepEqual(bad, []);
});
