/** Consumables block at the top of the market tab: fuel, supplies, probes and missiles. */
import { analysis, act, report, toast } from '../store';
import { buyFuel, buySupplies, buyProbes, buyMissiles, serviceCost } from '../../core/game';
import { unitsOf } from '../../core/cargo';
import { T } from '../../core/tuning';
import { fmt, money, t } from '../../i18n';
import { Bar, Btn, Panel } from '../components';
import { Icon } from '../Icon';
import { sfx } from '../../audio/audio';
import type { GameState, StationStatic } from '../../core/types';

/** Service purchases; prices are the tuning base times the station's service multiplier. */
export function ServiceBlock({ s, st }: { s: GameState; st: StationStatic }) {
  const a = analysis.value!;
  // regional/difficulty multiplier applied by the core to every consumable
  const mult = serviceCost(s, st.id);
  const fuelPrice = T.fuelPrice * mult;
  const supPrice = T.suppliesPrice * mult;
  const probePrice = T.probePrice * mult;
  const room = Math.floor(a.stats.fuelCap - s.ship.fuel);
  return (
    <Panel title={t('station.services')} icon="fuel">
      <div class="service-row">
        <div class="service" data-testid="service-fuel">
          <div class="spread">
            <span class="dim">
              <Icon name="fuel" size={14} /> {t('top.fuel')}
            </span>
            <span class="mono">
              {fmt(s.ship.fuel, 0)}
              <span class="dim">/{fmt(a.stats.fuelCap, 0)}</span>
            </span>
          </div>
          <Bar
            value={s.ship.fuel}
            max={a.stats.fuelCap}
            tone={s.ship.fuel / a.stats.fuelCap < 0.25 ? 'bad' : 'accent'}
            label={t('top.fuel')}
          />
          <div class="row wrap">
            <Btn
              small
              disabled={room <= 0}
              testid="btn-refuel"
              onClick={() => {
                // "fill up" asks for far more than fits; the core clamps to free room and credits
                const r = act((x) => buyFuel(x, st.id, 9999));
                if (report(r) && r.ok) {
                  sfx('buy');
                  toast(t('station.bought', { n: r.units, what: t('top.fuel'), price: money(r.paid) }));
                }
              }}
            >
              {t('station.fillUp')} ({money(room * fuelPrice)})
            </Btn>
            <Btn
              small
              disabled={room <= 0}
              onClick={() => {
                const r = act((x) => buyFuel(x, st.id, 10));
                if (report(r)) sfx('buy');
              }}
            >
              +10
            </Btn>
            <span class="faint">
              {money(fuelPrice)}/{t('unit.unit')}
            </span>
          </div>
        </div>
        <div class="service">
          <div class="spread">
            <span class="dim">
              <Icon name="supplies" size={14} /> {t('top.supplies')}
            </span>
            <span class="mono">
              {fmt(s.ship.supplies, 0)}
              <span class="dim">/{fmt(a.stats.suppliesCap, 0)}</span>
            </span>
          </div>
          <Bar
            value={s.ship.supplies}
            max={a.stats.suppliesCap}
            tone={s.ship.supplies / a.stats.suppliesCap < 0.25 ? 'bad' : 'accent'}
            label={t('top.supplies')}
          />
          <div class="row wrap">
            <Btn
              small
              disabled={s.ship.supplies >= a.stats.suppliesCap - 1}
              onClick={() => {
                const r = act((x) => buySupplies(x, st.id, 9999));
                if (report(r)) sfx('buy');
              }}
            >
              {t('station.fillUp')}
            </Btn>
            <span class="faint">
              {money(supPrice)}/{t('unit.unit')} · {fmt(a.stats.suppliesPerDay, 1)}/{t('unit.day')}
            </span>
          </div>
        </div>
        <div class="service">
          <div class="spread">
            <span class="dim">
              <Icon name="probe" size={14} /> {t('top.probes')}
            </span>
            <span class="mono">{s.ship.probes}</span>
          </div>
          <div class="row wrap">
            <Btn
              small
              onClick={() => {
                const r = act((x) => buyProbes(x, st.id, 1));
                if (report(r)) sfx('buy');
              }}
            >
              +1
            </Btn>
            <Btn
              small
              onClick={() => {
                const r = act((x) => buyProbes(x, st.id, 5));
                if (report(r)) sfx('buy');
              }}
            >
              +5
            </Btn>
            <span class="faint">
              {money(probePrice)}/{t('unit.piece')}
            </span>
          </div>
        </div>
        <div class="service">
          <div class="spread">
            <span class="dim">{t('good.missiles')}</span>
            {/* missiles are a cargo good (ammo for launchers), not a ship counter */}
            <span class="mono" data-testid="missile-count">
              {unitsOf(s.cargo, 'missiles')}
            </span>
          </div>
          <div class="row wrap">
            {[5, 10].map((n) => (
              <Btn
                key={n}
                small
                testid={`btn-missiles-${n}`}
                onClick={() => {
                  const r = act((x) => buyMissiles(x, st.id, n));
                  if (report(r)) sfx('buy');
                }}
              >
                +{n}
              </Btn>
            ))}
            <span class="faint">
              {money(Math.round(T.missilePrice * serviceCost(s, st.id)))}/{t('unit.piece')}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
