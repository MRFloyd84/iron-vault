// Zustand der zerstörbaren Ziele (rein, testbar): Trefferpunkte, Zerstörung,
// Druckwelle auf Ziele in der Nähe, Wiederaufbau für einen neuen Einsatz.
import { TARGETS, type Target } from './world-layout';

export type TargetDamage = {
  hp: Record<string, number>;
  /** Zeitpunkt der Zerstörung (s) – fehlt, solange das Ziel steht */
  destroyedAt: Record<string, number>;
};

export const initialDamage = (): TargetDamage => ({
  hp: Object.fromEntries(TARGETS.map((t) => [t.id, t.hp])),
  destroyedAt: {},
});

export const isDestroyed = (d: TargetDamage, id: string) => id in d.destroyedAt;

/** Schaden an einem Ziel. Liefert neuen Zustand und die dabei zerstörten Ziele. */
export function damageTarget(d: TargetDamage, id: string, amount: number, time: number) {
  if (!(id in d.hp) || isDestroyed(d, id)) return { damage: d, destroyed: [] as string[] };
  const hp = Math.max(0, d.hp[id] - amount);
  const next: TargetDamage = { hp: { ...d.hp, [id]: hp }, destroyedAt: d.destroyedAt };
  if (hp > 0) return { damage: next, destroyed: [] as string[] };
  next.destroyedAt = { ...d.destroyedAt, [id]: time };
  return { damage: next, destroyed: [id] };
}

/** Druckwelle eines zerstörten Ziels: Schaden an Zielen im Umkreis (nimmt nach außen ab). */
export function blastDamage(source: Target, others: readonly Target[] = TARGETS) {
  const hits: { id: string; amount: number; distance: number }[] = [];
  for (const t of others) {
    if (t.id === source.id) continue;
    const d = Math.hypot(t.x - source.x, t.z - source.z);
    if (d >= source.blast) continue;
    hits.push({ id: t.id, amount: Math.ceil(t.hp * 0.85 * (1 - d / source.blast)), distance: d });
  }
  return hits;
}

/** Ziele wieder aufbauen (Beginn eines Einsatzes). */
export function restoreTargets(d: TargetDamage, ids: readonly string[]): TargetDamage {
  const hp = { ...d.hp },
    destroyedAt = { ...d.destroyedAt };
  for (const id of ids) {
    const t = TARGETS.find((x) => x.id === id);
    if (!t) continue;
    hp[id] = t.hp;
    delete destroyedAt[id];
  }
  return { hp, destroyedAt };
}
