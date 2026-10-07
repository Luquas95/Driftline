import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createBackdropScene } from '../../render/backdrop';
import { hullThumb } from '../../render/hullThumb';
import { HULLS_BY_ID } from '../../content/hulls';
import { STATION_TYPES_BY_ID } from '../../content/stations';
import {
  buildOfferShip,
  buyFirstShip,
  firstShipOffers,
  previewOffer,
  suggestShipName,
  type ShipOffer,
} from '../../core/firstShip';
import { computeShipStats, hullSlots } from '../../core/ship';
import { galaxyOf } from '../../core/state';
import { fmt, money, t } from '../../i18n';
import { sfx } from '../../audio/audio';
import { Btn, Tag } from '../components';
import { settings } from '../settings';
import { act, game, report, rev } from '../store';
import { useScene } from '../useScene';

function useThumb(hullId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void hullThumb(hullId).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [hullId]);
  return url;
}

function OfferStats({ offer }: { offer: ShipOffer }) {
  const s = game.value!;
  const ship = useMemo(() => buildOfferShip(offer, 'x', () => 'p'), [offer.id]);
  const st = useMemo(() => computeShipStats(ship), [offer.id]);
  const slots = hullSlots(offer.hullId).filter((x) => !x.core);
  const count = (z: string) => slots.filter((x) => x.size === z).length;
  void s;
  return (
    <dl class="kv first-stats">
      <dt>{t('first.cargo')}</dt>
      <dd class="mono">{st.cargoCells}</dd>
      <dt>{t('first.range')}</dt>
      <dd class="mono">{fmt(st.rangeFull, 0)} ly</dd>
      <dt>{t('first.slots')}</dt>
      <dd class="mono">
        S {count('S')} · M {count('M')} · L {count('L')}
      </dd>
      <dt>{t('first.power')}</dt>
      <dd class="mono">{fmt(st.powerOut, 0)}</dd>
      <dt>{t('first.hull')}</dt>
      <dd class="mono">
        {Math.round(ship.hp)}/{st.hpMax}
      </dd>
      <dt>{t('first.crew')}</dt>
      <dd class="mono">{HULLS_BY_ID[offer.hullId].crew}</dd>
    </dl>
  );
}

function OfferCard({
  offer,
  selected,
  onSelect,
  credits,
}: {
  offer: ShipOffer;
  selected: boolean;
  onSelect: () => void;
  credits: number;
}) {
  const h = HULLS_BY_ID[offer.hullId];
  const thumb = useThumb(offer.hullId);
  const can = credits >= offer.price;
  return (
    <button
      type="button"
      class={`offer-card ${selected ? 'active' : ''} ${can ? '' : 'poor'}`}
      aria-pressed={selected}
      data-testid={`offer-${offer.id}`}
      data-price={offer.price}
      onClick={onSelect}
    >
      <span class="offer-pic">{thumb ? <img src={thumb} alt="" /> : <span class="offer-pic-ph" />}</span>
      <span class="offer-main">
        <span class="spread">
          <b>
            {t(`hull.${offer.hullId}`)}
            {offer.used && <span class="dim"> · {t('first.used')}</span>}
          </b>
          <span class={`mono ${can ? '' : 'neg'}`}>{money(offer.price)}</span>
        </span>
        <span class="row wrap" style={{ gap: 4 }}>
          <Tag tone="accent">{t(`hull.role.${h.role}`)}</Tag>
          {offer.used && <Tag tone="warn">{t('first.condition', { n: offer.condition })}</Tag>}
          {!can && <Tag tone="bad">{t('first.cantAfford')}</Tag>}
        </span>
      </span>
    </button>
  );
}

/** The first screen of a new game: pick a ship from the offers, cheapest first. */
export function FirstShipScreen() {
  void rev.value;
  const s = game.value!;
  const g = galaxyOf(s);
  const st = g.stationsById[s.location.stationId!];
  const sys = g.systems[st.systemId];
  const offers = useMemo(() => firstShipOffers(s), [s.seed, s.difficulty.prices]);
  const [sel, setSel] = useState<string>(
    () => offers.find((o) => o.price <= s.credits * 0.3)?.id ?? offers[0].id,
  );
  const offer = offers.find((o) => o.id === sel) ?? offers[0];
  const [name, setName] = useState(() => suggestShipName(s.seed, offer.hullId));
  const nameTouched = useRef(false);
  const prev = previewOffer(s, offer);
  const thumb = useThumb(offer.hullId);
  useEffect(() => {
    if (!nameTouched.current) setName(suggestShipName(s.seed, offer.hullId));
  }, [sel]);
  useScene(
    () =>
      createBackdropScene({
        body: sys.bodies[st.bodyIndex],
        station: st,
        spectral: sys.spectral,
        starSeed: sys.starSeed,
        tint: st.type.length,
      }),
    [st.id],
  );
  const warn =
    prev.warning === 'tight'
      ? t('first.warnTight', { left: fmt(prev.left) })
      : prev.warning === 'broke'
        ? t('first.warnBroke')
        : t('first.leftOk', { left: fmt(prev.left) });
  const buy = () => {
    const r = act((x) => buyFirstShip(x, offer.id, name));
    if (report(r) && r.ok) {
      s.tutorial.done = !settings.value.tutorial;
      sfx('success');
      rev.value++;
    }
  };
  return (
    <div class="screen first-ship" data-testid="screen-firstship">
      <div class="first-wrap">
        <header class="first-head">
          <h2>{t('first.title')}</h2>
          <p class="dim">
            {t('first.sub', {
              captain: s.captain,
              station: st.name,
              type: t(`st.${st.type}`),
            })}
          </p>
          <p class="first-capital">
            {t('first.capital')}{' '}
            <b class="mono" data-testid="first-credits">
              {money(s.credits)}
            </b>
            {STATION_TYPES_BY_ID[st.type].shipyard > 0 ? '' : ''}
          </p>
        </header>
        <div class="first-body">
          <div class="offer-list" role="list" aria-label={t('first.listLabel')} data-testid="offer-list">
            {offers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                selected={o.id === sel}
                credits={s.credits}
                onSelect={() => {
                  setSel(o.id);
                  sfx('click');
                }}
              />
            ))}
          </div>
          <aside class="offer-detail panel" data-testid="offer-detail">
            <div class="offer-big">{thumb && <img src={thumb} alt={t(`hull.${offer.hullId}`)} />}</div>
            <h3>
              {t(`hull.${offer.hullId}`)}
              {offer.used ? ` · ${t('first.used')}` : ''}
            </h3>
            <p class="dim">{t(`hull.${offer.hullId}.desc`)}</p>
            <OfferStats offer={offer} />
            <p
              class={`first-left ${prev.warning !== 'none' ? (prev.warning === 'broke' ? 'neg' : 'warn') : ''}`}
              data-testid="first-left"
            >
              {warn}
            </p>
            <label class="field">
              {t('first.name')}
              <input
                type="text"
                value={name}
                maxLength={28}
                data-testid="first-name"
                onInput={(e) => {
                  setName((e.target as HTMLInputElement).value);
                  nameTouched.current = true;
                }}
              />
            </label>
            <Btn kind="primary" disabled={!prev.affordable} testid="btn-buy-ship" onClick={buy}>
              {t('first.buy', { price: money(offer.price) })}
            </Btn>
          </aside>
        </div>
      </div>
    </div>
  );
}
