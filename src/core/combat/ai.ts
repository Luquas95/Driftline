import type { Rng } from '../rng';
import { ROLE_ROOM } from './build';
import { pathTo, powerEff, shipsOf } from './sim';
import type { CCrew, CShip, CombatState, PowerGroup } from './types';

const PRIORITY: Record<string, number> = {
  energy: 5,
  kinetic: 5,
  missile: 5,
  ion: 5,
  drones: 4,
  teleporter: 2,
  shield: 4.5,
  reactor: 3.2,
  engine: 3,
  jump: 2.2,
  life: 2,
  sensors: 1,
  cooler: 1,
  radiator: 1.4,
  repair: 1.5,
};

function foesOf(c: CombatState, s: CShip): CShip[] {
  return (s.side === 'player' ? c.enemies : [c.player]).filter((f) => f.alive && !f.out);
}

/** Pick the room a weapon should aim at, by weapon type and the foe's state. */
export function chooseRoom(rng: Rng, kind: string, foe: CShip): number {
  const scored = foe.rooms.map((r, i) => {
    let s = (PRIORITY[r.kind ?? ''] ?? 0.3) + rng.range(0, 0.9);
    if (r.sys <= 0) s -= 4;
    if (kind === 'ion')
      s += r.kind === 'shield' || ['energy', 'kinetic', 'missile'].includes(r.kind ?? '') ? 1.5 : -1;
    if (kind === 'energy' && foe.shield > 4 && r.kind === 'shield') s += 1.5;
    if (kind === 'kinetic' && ['energy', 'kinetic', 'missile'].includes(r.kind ?? '')) s += 0.8;
    if (kind === 'missile' && r.kind === 'reactor') s += 1;
    if (foe.canFlee && r.kind === 'jump') s += foe.fleeing ? 3.5 : 0.7;
    if (r.ion > 0 && kind === 'ion') s -= 3;
    return { i, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].i;
}

function jobScore(s: CShip, ri: number, crew: CCrew): number {
  const r = s.rooms[ri];
  let v = r.fire * 1.6 + (r.breach > 0 ? 55 : 0) + (r.kind ? Math.max(0, 70 - r.sys) * 0.5 : 0);
  if (ROLE_ROOM[crew.role] === r.kind) v += 6;
  if (crew.role === 'gunner' && s.weapons.some((w) => w.room === ri)) v += 8;
  if (crew.role === 'medic') v += s.crew.filter((o) => o.room === ri && o.hp < o.maxHp * 0.7).length * 20;
  return v;
}

function assignCrew(s: CShip): void {
  for (const m of s.crew) {
    if (m.boardedOn >= 0 || m.path.length) continue;
    const busy =
      m.task === 'fire' ||
      m.task === 'breach' ||
      m.task === 'repair' ||
      m.task === 'heal' ||
      m.task === 'fight';
    if (busy) continue;
    const home = m.post ?? s.rooms.findIndex((r) => r.kind === ROLE_ROOM[m.role]);
    let best = -1;
    let bestV = 8;
    for (let ri = 0; ri < s.rooms.length; ri++) {
      const d = pathTo(s, m.room, ri).length;
      if (d > 2) continue;
      // somebody already working there? count other crew in or heading to the room
      const covered = s.crew.some(
        (o) =>
          o !== m &&
          (o.room === ri || o.path[o.path.length - 1] === ri) &&
          ['fire', 'breach', 'repair'].includes(o.task),
      );
      const v = jobScore(s, ri, m) - d * 3 - (covered ? 25 : 0);
      if (v > bestV) {
        bestV = v;
        best = ri;
      }
    }
    if (best >= 0 && best !== m.room) {
      m.path = pathTo(s, m.room, best);
      m.stepT = 1.1;
    } else if (best < 0 && home >= 0 && home !== m.room) {
      m.path = pathTo(s, m.room, home);
      m.stepT = 1.1;
    }
  }
}

/** One AI decision pass (twice per second) for a ship: power, targets, fleeing and crew work. */
export function aiControl(c: CombatState, rng: Rng, s: CShip, dt: number): void {
  const tick = Math.floor(c.time * 2) !== Math.floor((c.time - dt) * 2);
  if (!tick) return;
  const foes = foesOf(c, s);
  // power: personalities lean on weapons or shields, and back off when hot
  const lean: Record<string, Partial<Record<PowerGroup, number>>> = {
    aggressive: { weapons: 1.5, shields: 0.9, engines: 0.6 },
    cautious: { weapons: 0.9, shields: 1.5, engines: 1.0 },
    greedy: { weapons: 1.2, engines: 0.8 },
    feral: { weapons: 1.4, engines: 0.7 },
    turret: { weapons: 1.5 },
  };
  const mult = lean[s.personality] ?? {};
  for (const g of Object.keys(s.need) as PowerGroup[]) {
    s.weights[g] =
      s.need[g] > 0 ? s.need[g] * (mult[g] ?? 1) * (g === 'weapons' && s.heat > 80 ? 0.4 : 1) : 0;
  }
  if (!foes.length) return;
  // targeting
  const foe = [...foes].sort((a, b) => a.hull / a.hullMax - b.hull / b.hullMax)[0];
  for (const w of s.weapons) {
    if (w.kind === 'drones' || w.kind === 'teleporter') continue;
    const valid =
      w.target && foes.some((f) => f.index === w.target!.ship) && (foe.rooms[w.target.room]?.sys ?? 0) > 0;
    if (!valid || (Math.floor(c.time) % 6 === 0 && rng.chance(0.3)))
      w.target = {
        ship: foe.index,
        room: chooseRoom(
          rng,
          w.kind,
          foes.find((f) => f.index === foe.index)!,
        ),
      };
  }
  // fleeing
  const hullPct = s.hull / s.hullMax;
  const outgunned = foes.reduce((n, f) => n + f.weapons.length, 0) > s.weapons.length * 2 && hullPct < 0.6;
  if (!s.fleeing && s.canFlee && s.personality !== 'feral' && s.personality !== 'turret') {
    const limit = s.personality === 'cautious' ? 0.45 : s.personality === 'greedy' ? 0.35 : 0.22;
    const unarmed = s.weapons.length === 0 && foes.some((f) => f.weapons.length > 0);
    if (hullPct < limit || outgunned || unarmed) s.fleeing = true;
  }
  if (s.personality === 'cautious' && !s.canFlee && hullPct < 0.2 && s.out === null && s.side === 'enemy') {
    s.out = 'surrendered';
    c.log.push({ time: c.time, key: 'combat.log.surrender', params: { ship: s.name } });
  }
  void powerEff;
  void shipsOf;
  assignCrew(s);
}

/** Crew-only AI for the player's ship when the player is not micromanaging (also used by auto-combat). */
export function assignPlayerCrew(c: CombatState): void {
  assignCrew(c.player);
}
