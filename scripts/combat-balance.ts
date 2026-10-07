/* Quick combat balance report to the console: npx tsx scripts/combat-balance.ts [duels per pairing] */
import { combatReport } from '../src/sim/combatBalance';

const n = Number(process.argv[2] ?? 8);
console.log(
  combatReport({ duelsPer: n, lootFights: Math.max(4, Math.floor(n / 2)), tradeSeeds: 0, tradeDays: 0 }).join(
    '\n',
  ),
);
