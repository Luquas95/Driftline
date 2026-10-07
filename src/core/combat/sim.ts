/**
 * Real-time combat simulation, pure and deterministic. `stepCombat(c, dt)` advances the fight by dt seconds
 * (the UI calls it at a fixed 0.1 s step; auto-combat loops until an outcome). All randomness comes from
 * `c.rng`, so a combat can be saved mid-fight and replayed identically.
 */
import { RACES_BY_ID } from '../../content/crew';
import { weaponStats } from '../../content/weapons';
import { Rng } from '../rng';
import { perf } from '../ship';
import { aiControl, assignPlayerCrew, chooseRoom } from './ai';
import type { CCrew, CRoom, CShip, CombatState, PowerGroup, Projectile, Side } from './types';

export const DT = 0.1;
export const MAX_FIGHT_SECONDS = 420;

const MOVE_TIME = 1.1;

/* ------------------------------ helpers ------------------------------ */

export function shipsOf(c: CombatState): CShip[] {
  return [c.player, ...c.enemies];
}

function foesOf(c: CombatState, s: CShip): CShip[] {
  return s.side === 'player' ? c.enemies : [c.player];
}

export function powerEff(s: CShip, g: PowerGroup): number {
  const need = s.need[g];
  if (need <= 0) return 1;
  if (s.overheated && (g === 'weapons' || g === 'shields')) return 0;
  let wsum = 0;
  for (const k of Object.keys(s.weights) as PowerGroup[]) if (s.need[k] > 0) wsum += s.weights[k];
  if (wsum <= 0) return 0;
  return Math.min(1, (s.powerOut * s.weights[g]) / wsum / need);
}

function roomOf(s: CShip, kind: string): CRoom | undefined {
  return s.rooms.find((r) => r.kind === kind);
}

/** Working efficiency of a room's system: damage, ion lock and fire. */
export function roomPerf(r: CRoom): number {
  if (r.ion > 0) return 0;
  return perf(r.sys);
}

export function pilotSkill(s: CShip): number {
  const er = s.rooms.findIndex((r) => r.kind === 'engine');
  const p = s.crew.find((c) => c.room === er && c.role === 'pilot' && c.boardedOn < 0);
  return p ? p.skills.piloting : 0;
}

export function evasionOf(s: CShip): number {
  const er = roomOf(s, 'engine');
  if (!er || s.agility <= 0) return 0;
  const ps = pilotSkill(s);
  const sk = s.crew.some((c) => c.officer === 'ghost' && c.room === s.rooms.indexOf(er)) ? 0.08 : 0;
  return Math.max(
    0,
    Math.min(0.55, 0.1 * s.agility * powerEff(s, 'engines') * roomPerf(er) * (1 + 0.06 * ps) + sk),
  );
}

function emit(c: CombatState, e: CombatState['events'][number]): void {
  c.events.push(e);
  if (c.events.length > 400) c.events.splice(0, c.events.length - 400);
}

function log(c: CombatState, key: string, params?: Record<string, string | number>): void {
  c.log.push({ time: c.time, key, params });
  if (c.log.length > 80) c.log.shift();
}

/* ------------------------------ movement ------------------------------ */

/** Shortest room path (BFS over room adjacency), excluding the start. */
export function pathTo(s: CShip, from: number, to: number): number[] {
  if (from === to) return [];
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const u = q.shift()!;
    if (u === to) break;
    for (const v of s.rooms[u].adj) {
      if (!prev.has(v)) {
        prev.set(v, u);
        q.push(v);
      }
    }
  }
  if (!prev.has(to)) return [];
  const out: number[] = [];
  for (let n = to; n !== from; n = prev.get(n)!) out.push(n);
  return out.reverse();
}

export function moveCrew(c: CombatState, crewId: string, room: number): boolean {
  const s = c.player;
  const m = s.crew.find((x) => x.id === crewId);
  if (!m || room < 0 || room >= s.rooms.length || m.boardedOn >= 0) return false;
  m.post = room;
  m.path = pathTo(s, m.room, room);
  m.stepT = MOVE_TIME;
  return true;
}

/* ------------------------------ weapons ------------------------------ */

export function weaponReady(s: CShip, w: CombatState['player']['weapons'][number]): boolean {
  const r = s.rooms[w.room];
  return r.sys > 0 && r.ion <= 0 && powerEff(s, 'weapons') > 0 && !s.overheated;
}

export function setTarget(c: CombatState, weaponId: string, ship: number, room: number | null): boolean {
  const w = c.player.weapons.find((x) => x.id === weaponId);
  if (!w) return false;
  w.target = room === null ? null : { ship, room };
  return true;
}

export function setWeights(c: CombatState, weights: Partial<Record<PowerGroup, number>>): void {
  for (const [k, v] of Object.entries(weights)) c.player.weights[k as PowerGroup] = Math.max(0, v);
}

export function setFleeing(c: CombatState, side: Side, on: boolean): boolean {
  const s = side === 'player' ? c.player : c.enemies[0];
  if (on && !s.canFlee) return false;
  s.fleeing = on;
  if (!on) s.jumpCharge = Math.max(0, s.jumpCharge - 0.15);
  return true;
}

function fire(c: CombatState, rng: Rng, s: CShip, wi: number): void {
  const w = s.weapons[wi];
  const ws = weaponStats(w.kind, w.size, w.quality);
  const foes = foesOf(c, s).filter((f) => f.alive && f.out === null);
  if (w.kind === 'drones') {
    if (w.cooldown > 0) return;
    const bay = ws.drones;
    for (let i = 0; i < bay; i++)
      s.drones.push({
        id: `d${c.nextId++}`,
        kind: i % 2 === 0 ? 'attack' : 'defense',
        ttl: 26,
        cd: 0.5 + i * 0.4,
      });
    w.charge = 0;
    w.cooldown = 8;
    return;
  }
  if (w.kind === 'teleporter') return;
  if (!w.target) return;
  const t = foes.find((f) => f.index === w.target!.ship) ?? foes[0];
  if (!t) return;
  const room = w.target.room < t.rooms.length ? w.target.room : 0;
  if (ws.ammo > 0) {
    if (s.missiles < ws.ammo) return;
    s.missiles -= ws.ammo;
  }
  w.charge = 0;
  s.heat += ws.heat;
  const mannedGunner = s.crew.find((x) => x.room === w.room && x.role === 'gunner' && x.boardedOn < 0);
  if (mannedGunner) mannedGunner.xp.gunnery = (mannedGunner.xp.gunnery ?? 0) + 0.02;
  c.projectiles.push({
    id: c.nextId++,
    from: s.side,
    fromShip: s.index,
    fromRoom: w.room,
    toShip: t.index,
    toRoom: room,
    kind: w.kind,
    dmg: ws.dmg,
    t: ws.speed + rng.range(0, 0.15),
    total: ws.speed + 0.1,
    quality: 1,
    ws,
  });
  emit(c, {
    t: 'fire',
    side: s.side,
    ship: s.index,
    room: w.room,
    kind: w.kind,
    toShip: t.index,
    toRoom: room,
  });
}

function resolveHit(c: CombatState, rng: Rng, p: Projectile): void {
  const ts = p.from === 'player' ? c.enemies[p.toShip] : c.player;
  if (!ts || !ts.alive || ts.out) return;
  const ws = p.ws;
  if (!ws) return;
  const isMissileLike = p.kind === 'missile';
  // defence drones intercept missiles and drone shots
  if (isMissileLike) {
    const defenders = ts.drones.filter((d) => d.kind === 'defense' && d.ttl > 0);
    if (defenders.length && rng.chance(0.45 * Math.min(2, defenders.length))) {
      emit(c, { t: 'miss', ship: ts.index, side: ts.side, room: p.toRoom });
      log(c, 'combat.log.intercept', { ship: ts.name });
      return;
    }
  }
  const ev = evasionOf(ts) * (isMissileLike ? 0.6 : p.kind === 'ion' ? 0.8 : 1);
  if (rng.chance(ev)) {
    emit(c, { t: 'miss', ship: ts.index, side: ts.side, room: p.toRoom });
    const pilot = ts.crew.find((x) => x.role === 'pilot' && x.boardedOn < 0);
    if (pilot) pilot.xp.piloting = (pilot.xp.piloting ?? 0) + 0.08;
    return;
  }
  const room = ts.rooms[p.toRoom];
  let scale = 1;
  if (ws.shieldDmg > 0 || (ws.hullDmg === 0 && ws.ion > 0)) {
    if (ts.shield > 0 && !isMissileLike) {
      const need = Math.max(0.01, ws.shieldDmg);
      if (ts.shield >= need) {
        ts.shield -= need;
        ts.heat += 0.05 * need;
        emit(c, {
          t: 'hit',
          ship: ts.index,
          side: ts.side,
          room: p.toRoom,
          shield: true,
          dmg: need,
          kind: p.kind,
        });
        emit(c, { t: 'shield', ship: ts.index, side: ts.side });
        return;
      }
      scale = (need - ts.shield) / need;
      ts.shield = 0;
      emit(c, { t: 'shield', ship: ts.index, side: ts.side });
    }
  }
  const hullDmg = ws.hullDmg * scale;
  ts.hull -= hullDmg;
  room.sys = Math.max(0, room.sys - ws.sysDmg * scale);
  if (ws.ion > 0 && scale > 0) room.ion += ws.ion * scale;
  for (const m of ts.crew) {
    if (m.room === p.toRoom && m.boardedOn < 0 && ws.dmg > 0) {
      m.hp -= ws.dmg * scale * 0.28;
    }
  }
  if (rng.chance(ws.breach * scale) && room.breach <= 0) {
    room.breach = 100;
    emit(c, { t: 'breach', ship: ts.index, side: ts.side, room: p.toRoom });
  }
  if (rng.chance(ws.fire * scale) && room.fire < 25 && room.o2 > 15) {
    room.fire = 25;
    emit(c, { t: 'fire-start', ship: ts.index, side: ts.side, room: p.toRoom });
  }
  emit(c, {
    t: 'hit',
    ship: ts.index,
    side: ts.side,
    room: p.toRoom,
    shield: false,
    dmg: hullDmg,
    kind: p.kind,
  });
  if (ts.hull <= 0) destroyShip(c, ts);
}

function destroyShip(c: CombatState, s: CShip): void {
  if (!s.alive) return;
  s.hull = 0;
  s.alive = false;
  s.out = 'destroyed';
  emit(c, { t: 'explode', ship: s.index, side: s.side });
  log(c, 'combat.log.destroyed', { ship: s.name });
}

/* ------------------------------ ship step ------------------------------ */

function stepRooms(c: CombatState, rng: Rng, s: CShip, dt: number): void {
  const lifeEff = powerEff(s, 'life');
  const lifeRoom = roomOf(s, 'life');
  const lifePerf = lifeRoom ? roomPerf(lifeRoom) || 0.2 : 0.2;
  const refill = 6 * lifeEff * Math.max(0.15, lifePerf);
  const next: number[] = s.rooms.map((r) => r.o2);
  s.rooms.forEach((r, i) => {
    if (r.ion > 0) r.ion = Math.max(0, r.ion - dt);
    let o2 = r.o2 + refill * dt;
    for (const a of r.adj) o2 += (s.rooms[a].o2 - r.o2) * 0.35 * dt;
    if (r.breach > 0) o2 -= 15 * dt;
    next[i] = Math.max(0, Math.min(100, o2));
  });
  s.rooms.forEach((r, i) => {
    r.o2 = next[i];
    if (r.fire > 0) {
      if (r.o2 < 12 || r.breach > 0) r.fire = Math.max(0, r.fire - 9 * dt);
      else r.fire = Math.min(100, r.fire + 1.8 * dt);
      r.sys = Math.max(0, r.sys - r.fire * 0.035 * dt);
      for (const a of r.adj) {
        const ar = s.rooms[a];
        if (ar.fire <= 0 && ar.o2 > 20 && rng.chance((r.fire / 100) * 0.07 * dt)) {
          ar.fire = 12;
          emit(c, { t: 'fire-start', ship: s.index, side: s.side, room: a });
        }
      }
      if (r.fire > 0 && r.fire < 0.5) r.fire = 0;
    }
  });
  // hull damage from open breaches is not modelled; fire and vacuum hurt the crew
  for (const m of s.crew) {
    const r = s.rooms[m.room];
    const race = RACES_BY_ID[m.race];
    if (r.fire > 0) m.hp -= r.fire * 0.04 * race.fire * dt;
    if (r.o2 < 25) m.hp -= 2.2 * race.breath * (1 - r.o2 / 25) * dt;
  }
}

function stepCrew(c: CombatState, rng: Rng, s: CShip, foes: CShip[], dt: number): void {
  const medicSkill = Math.max(0, ...s.crew.filter((m) => m.role === 'medic').map((m) => m.skills.medicine));
  for (const m of s.crew) {
    const race = RACES_BY_ID[m.race];
    // walking
    if (m.path.length) {
      m.stepT -= dt;
      m.task = 'idle';
      if (m.stepT <= 0) {
        m.room = m.path.shift()!;
        m.stepT = MOVE_TIME / (0.9 + 0.1 * (1 + m.skills.piloting * 0));
      }
      continue;
    }
    const r = s.rooms[m.room];
    const foesHere = foes.flatMap((f) => f.crew).filter((x) => x.boardedOn === s.index && x.room === m.room);
    const eng = m.skills.engineering;
    const roleMult = m.role === 'engineer' ? 1 : 0.5;
    const officerMult = m.officer === 'mender' ? 1.5 : 1;
    if (foesHere.length) {
      m.task = 'fight';
      const tgt = foesHere[0];
      tgt.hp -= (2.4 + m.skills.gunnery * 0.25) * race.melee * dt;
      m.xp.gunnery = (m.xp.gunnery ?? 0) + 0.01 * dt * 10;
    } else if (r.fire > 0) {
      m.task = 'fire';
      r.fire = Math.max(0, r.fire - 9 * (0.6 + 0.1 * eng) * roleMult * 1.6 * dt);
      m.xp.engineering = (m.xp.engineering ?? 0) + 0.01 * dt * 10;
    } else if (r.breach > 0) {
      m.task = 'breach';
      r.breach = Math.max(0, r.breach - 12 * (0.6 + 0.12 * eng) * roleMult * race.repair * dt);
      m.xp.engineering = (m.xp.engineering ?? 0) + 0.012 * dt * 10;
    } else if (r.kind && r.sys < 100 && r.sys > 0.0001 + 0) {
      m.task = 'repair';
      r.sys = Math.min(100, r.sys + 4.2 * (1 + 0.18 * eng) * race.repair * roleMult * officerMult * dt);
      m.xp.engineering = (m.xp.engineering ?? 0) + 0.008 * dt * 10;
    } else if (r.kind && r.sys <= 0.0001 && r.kind !== null) {
      m.task = 'repair';
      r.sys = Math.min(100, r.sys + 3 * (1 + 0.18 * eng) * race.repair * roleMult * officerMult * dt);
    } else if (m.role === 'medic' || medicSkill > 0) {
      const hurt = s.crew.find((o) => o.room === m.room && o.hp < o.maxHp - 0.5 && o.boardedOn < 0);
      if (hurt && (m.role === 'medic' || r.kind === 'life')) {
        m.task = 'heal';
        hurt.hp = Math.min(
          hurt.maxHp,
          hurt.hp + 3 * (1 + 0.2 * m.skills.medicine) * (m.role === 'medic' ? 1 : 0.3) * officerMult * dt,
        );
        m.xp.medicine = (m.xp.medicine ?? 0) + 0.01 * dt * 10;
      } else m.task = 'man';
    } else m.task = 'man';
  }
  // casualties
  for (let i = s.crew.length - 1; i >= 0; i--) {
    if (s.crew[i].hp <= 0) {
      emit(c, { t: 'crew-down', ship: s.index, side: s.side, name: s.crew[i].name });
      log(c, 'combat.log.crewDown', { name: s.crew[i].name });
      s.crew.splice(i, 1);
    }
  }
  // idle crew without a post look for work (handled by AI helper in ai.ts for both sides)
  void rng;
}

function stepWeapons(c: CombatState, rng: Rng, s: CShip, dt: number): void {
  const eff = powerEff(s, 'weapons');
  if (s.side === 'player') {
    // unattended weapons keep shooting at something sensible
    const foes = c.enemies.filter((f) => f.alive && !f.out);
    for (const w of s.weapons) {
      if (w.kind === 'drones' || w.kind === 'teleporter' || !foes.length) continue;
      const t = w.target && foes.find((f) => f.index === w.target!.ship);
      if (!t || t.rooms[w.target!.room].sys <= 0) {
        const f = foes[0];
        w.target = { ship: f.index, room: chooseRoom(rng, w.kind, f) };
      }
    }
  }
  s.weapons.forEach((w, i) => {
    if (w.cooldown > 0) w.cooldown = Math.max(0, w.cooldown - dt);
    const r = s.rooms[w.room];
    if (r.sys <= 0 || r.ion > 0 || eff <= 0 || s.overheated) return;
    const ws = weaponStats(w.kind, w.size, w.quality);
    const gunner = s.crew.find(
      (x) => x.room === w.room && x.role === 'gunner' && x.boardedOn < 0 && x.path.length === 0,
    );
    const sharp = gunner?.officer === 'sharpshooter' ? 0.12 : 0;
    const manned = gunner ? 0.2 + 0.05 * gunner.skills.gunnery + sharp : 0.0;
    const rate = eff * roomPerfFor(r) * (0.82 + manned);
    if (w.charge < 1) w.charge = Math.min(1, w.charge + (dt / ws.charge) * rate);
    if (w.charge >= 1 && w.auto) {
      if (w.kind === 'drones') {
        if (w.cooldown <= 0 && s.drones.length < ws.drones * 2) fire(c, rng, s, i);
      } else if (w.kind !== 'teleporter' && w.target) fire(c, rng, s, i);
    }
  });
}

function roomPerfFor(r: CRoom): number {
  return perf(r.sys);
}

function stepDrones(c: CombatState, rng: Rng, s: CShip, dt: number): void {
  const foes = foesOf(c, s).filter((f) => f.alive && !f.out);
  for (let i = s.drones.length - 1; i >= 0; i--) {
    const d = s.drones[i];
    d.ttl -= dt;
    d.cd -= dt;
    if (d.ttl <= 0) {
      s.drones.splice(i, 1);
      continue;
    }
    if (d.kind === 'attack' && d.cd <= 0 && foes.length) {
      d.cd = 2.2;
      const t = rng.pick(foes);
      const room = rng.int(0, t.rooms.length - 1);
      const ws = weaponStats('drones', 'S', 'C');
      c.projectiles.push({
        id: c.nextId++,
        from: s.side,
        fromShip: s.index,
        fromRoom: -1,
        toShip: t.index,
        toRoom: room,
        kind: 'drone',
        dmg: ws.dmg,
        t: 0.7,
        total: 0.7,
        quality: 1,
        ws,
      });
      emit(c, {
        t: 'fire',
        side: s.side,
        ship: s.index,
        room: 0,
        kind: 'drone',
        toShip: t.index,
        toRoom: room,
      });
    }
  }
}

function stepThermal(c: CombatState, s: CShip, dt: number): void {
  const eng = Math.max(0, ...s.crew.filter((m) => m.role === 'engineer').map((m) => m.skills.engineering));
  s.heat = Math.max(0, s.heat - s.cooling * (1 + 0.04 * eng) * dt);
  if (!s.overheated && s.heat >= 100) {
    s.overheated = true;
    s.heat = 100;
    emit(c, { t: 'overheat', ship: s.index, side: s.side });
    log(c, 'combat.log.overheat', { ship: s.name });
  } else if (s.overheated && s.heat < 55) s.overheated = false;
}

function stepShield(s: CShip, dt: number): void {
  if (s.shieldMax <= 0) return;
  const r = roomOf(s, 'shield');
  const perfS = r ? roomPerf(r) : 1;
  s.shield = Math.min(s.shieldMax * perfS, s.shield + s.shieldRegen * powerEff(s, 'shields') * perfS * dt);
  if (s.shield > s.shieldMax * perfS) s.shield = s.shieldMax * perfS;
}

function stepJump(c: CombatState, s: CShip, dt: number): void {
  if (!s.fleeing || !s.canFlee || s.out) return;
  const jr = roomOf(s, 'jump');
  if (!jr || jr.sys <= 0 || jr.ion > 0) return;
  const t = 14 / Math.max(0.05, powerEff(s, 'engines') * roomPerf(jr) * (1 + 0.06 * pilotSkill(s)));
  s.jumpCharge += dt / Math.min(60, t);
  if (s.jumpCharge >= 1) {
    s.out = 'fled';
    s.alive = true;
    emit(c, { t: 'jump', side: s.side });
    log(c, 'combat.log.fled', { ship: s.name });
  }
}

/* ------------------------------ main step ------------------------------ */

function finish(c: CombatState): void {
  if (c.outcome) return;
  const p = c.player;
  if (p.out === 'destroyed') {
    c.outcome = 'defeat';
    return;
  }
  if (p.out === 'fled') {
    c.outcome = 'fled';
    return;
  }
  const open = c.enemies.filter((e) => e.out === null);
  if (open.length === 0) {
    const down = (e: CShip) => e.out === 'destroyed' || e.out === 'surrendered';
    const yielded = c.enemies.every(down) && c.enemies.some((e) => e.out === 'surrendered');
    c.outcome = c.enemies.some(down) ? (yielded ? 'surrender' : 'victory') : 'enemy-fled';
  }
}

export function stepCombat(c: CombatState, dt = DT): void {
  if (c.outcome) return;
  const rng = Rng.restore(c.rng);
  c.time += dt;
  const ships = shipsOf(c);
  // AI decisions (enemies always; the player's ship only when auto-combat drives it)
  for (const s of ships) {
    if (!s.alive || s.out) continue;
    if (s.side === 'enemy' || (c.demand === null && c.auto)) aiControl(c, rng, s, dt);
    else if (s.side === 'player' && Math.floor(c.time * 2) !== Math.floor((c.time - dt) * 2))
      assignPlayerCrew(c);
  }
  for (const s of ships) {
    if (!s.alive || s.out) continue;
    const foes = foesOf(c, s);
    stepThermal(c, s, dt);
    stepRooms(c, rng, s, dt);
    stepCrew(c, rng, s, foes, dt);
    stepShield(s, dt);
    stepWeapons(c, rng, s, dt);
    stepDrones(c, rng, s, dt);
    stepJump(c, s, dt);
  }
  // projectiles
  for (let i = c.projectiles.length - 1; i >= 0; i--) {
    const p = c.projectiles[i];
    p.t -= dt;
    if (p.t <= 0) {
      c.projectiles.splice(i, 1);
      resolveHit(c, rng, p);
    }
  }
  // greedy demand (pauses until answered)
  if (c.demand === null && !c.enemies[0]?.demanded) {
    const e = c.enemies.find((x) => x.personality === 'greedy' && x.alive && !x.out && !x.demanded);
    if (e) {
      const er = roomOf(c.player, 'engine');
      if (c.player.hull < c.player.hullMax * 0.45 || (er && er.sys <= 0)) {
        e.demanded = true;
        c.demand = 0.4;
        c.paused = true;
        log(c, 'combat.log.demand', { ship: e.name });
      }
    }
  }
  if (c.time >= MAX_FIGHT_SECONDS) {
    for (const e of c.enemies) if (!e.out) e.out = 'fled';
  }
  finish(c);
  c.rng = rng.getState();
}

/** Player answers a tribute demand. Accepting ends the fight at the cost of cargo; refusing resumes it. */
export function answerDemand(c: CombatState, accept: boolean): void {
  if (c.demand === null) return;
  if (accept) {
    c.outcome = 'tribute';
  } else {
    c.paused = false;
    log(c, 'combat.log.refused');
  }
  c.demand = c.outcome ? c.demand : null;
}

/** Teleport crew to an enemy room. Needs a charged, working teleporter. */
export function sendBoarders(c: CombatState, crewIds: string[], enemy: number, room: number): boolean {
  const s = c.player;
  const wi = s.weapons.findIndex((w) => w.kind === 'teleporter' && w.charge >= 1 && weaponReady(s, w));
  const foe = c.enemies[enemy];
  if (wi < 0 || !foe || !foe.alive || foe.out || room < 0 || room >= foe.rooms.length) return false;
  if (foe.shield > foe.shieldMax * 0.6 && foe.shieldMax > 0) return false;
  const moved: CCrew[] = [];
  for (const id of crewIds) {
    const i = s.crew.findIndex((m) => m.id === id && m.boardedOn < 0);
    if (i >= 0) {
      const [m] = s.crew.splice(i, 1);
      m.boardedOn = enemy;
      m.room = room;
      m.path = [];
      m.post = null;
      moved.push(m);
    }
  }
  if (!moved.length) return false;
  foe.crew.push(...moved);
  s.weapons[wi].charge = 0;
  log(c, 'combat.log.boarded', { n: moved.length });
  return true;
}

/** Boarders on an enemy ship may be called back when the teleporter recharges. Returns survivors to the player ship. */
export function recallBoarders(c: CombatState): void {
  for (const e of c.enemies) {
    for (let i = e.crew.length - 1; i >= 0; i--) {
      const m = e.crew[i];
      if (m.boardedOn >= 0) {
        e.crew.splice(i, 1);
        m.boardedOn = -1;
        m.room = Math.max(
          0,
          c.player.rooms.findIndex((r) => r.kind === 'life'),
        );
        m.post = m.room;
        c.player.crew.push(m);
      }
    }
  }
}

export function drainEvents(c: CombatState): CombatState['events'] {
  const e = c.events;
  c.events = [];
  return e;
}
