/** Shared UI primitives (panels, buttons, tabs, modals, bars, stats, tags) used by every screen. */
import { Component, type ComponentChildren, type JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon';
import { fmt, t } from '../i18n';
import { sfx } from '../audio/audio';

/** Titled card; the header is rendered only when there is a title or actions. */
export function Panel({
  title,
  icon,
  actions,
  children,
  class: cls,
  id,
  'data-testid': testid,
}: {
  title?: string;
  icon?: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
  id?: string;
  'data-testid'?: string;
}) {
  return (
    <section class={`panel ${cls ?? ''}`} id={id} data-testid={testid}>
      {(title || actions) && (
        <header class="panel-head">
          <h2>
            {icon && <Icon name={icon} />} {title}
          </h2>
          {actions && <div class="panel-actions">{actions}</div>}
        </header>
      )}
      <div class="panel-body">{children}</div>
    </section>
  );
}

type BtnProps = {
  children?: ComponentChildren;
  onClick?: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'good';
  disabled?: boolean;
  icon?: string;
  title?: string;
  small?: boolean;
  class?: string;
  testid?: string;
  active?: boolean;
  sound?: boolean;
};

/** Button with the click sound built in; `testid` maps to data-testid for the e2e suite. */
export function Btn({
  children,
  onClick,
  kind,
  disabled,
  icon,
  title,
  small,
  class: cls,
  testid,
  active,
  sound = true,
}: BtnProps) {
  return (
    <button
      type="button"
      class={`btn ${kind ?? ''} ${small ? 'small' : ''} ${active ? 'active' : ''} ${cls ?? ''}`}
      disabled={disabled}
      title={title}
      // icon-only buttons need the title as their accessible name
      aria-label={title && !children ? title : undefined}
      data-testid={testid}
      onClick={() => {
        if (sound) sfx('click');
        onClick?.();
      }}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** Tab strip; each tab gets data-testid `tab-<id>`, which the e2e tests rely on. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; icon?: string; badge?: number | string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          role="tab"
          aria-selected={value === tb.id}
          class={`tab ${value === tb.id ? 'active' : ''}`}
          data-testid={`tab-${tb.id}`}
          onClick={() => {
            sfx('click');
            onChange(tb.id);
          }}
        >
          {tb.icon && <Icon name={tb.icon} />}
          <span>{tb.label}</span>
          {tb.badge !== undefined && tb.badge !== 0 && <span class="badge">{tb.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Dialog over a backdrop; Escape and a backdrop click close it only when `onClose` is given. */
export function Modal({
  title,
  children,
  onClose,
  wide,
  testid,
  footer,
}: {
  title: string;
  children: ComponentChildren;
  onClose?: () => void;
  wide?: boolean;
  testid?: string;
  footer?: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    // capture phase + stopPropagation: Escape closes the dialog without App also navigating back
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        class={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        data-testid={testid}
      >
        <header class="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button class="icon-btn" type="button" onClick={onClose} aria-label={t('ui.close')}>
              <Icon name="close" />
            </button>
          )}
        </header>
        <div class="modal-body">{children}</div>
        {footer && <footer class="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Progress bar, clamped to 0–100 %; `segments` draws a stacked bar instead of one fill. */
export function Bar({
  value,
  max,
  tone,
  label,
  segments,
}: {
  value: number;
  max: number;
  tone?: 'good' | 'warn' | 'bad' | 'accent';
  label?: string;
  segments?: { v: number; cls: string; title?: string }[];
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      class="bar"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemax={Math.round(max)}
      aria-label={label}
    >
      {segments ? (
        segments.map((s, i) => (
          <div
            key={i}
            class={`bar-seg ${s.cls}`}
            style={{ width: `${max > 0 ? Math.min(100, (s.v / max) * 100) : 0}%` }}
            title={s.title}
          />
        ))
      ) : (
        <div class={`bar-fill ${tone ?? 'accent'}`} style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}

/** Label/value tile for the stats grids. */
export function Stat({
  label,
  value,
  sub,
  tone,
  icon,
  testid,
}: {
  label: string;
  value: ComponentChildren;
  sub?: ComponentChildren;
  tone?: string;
  icon?: string;
  testid?: string;
}) {
  return (
    <div class={`stat ${tone ?? ''}`} data-testid={testid}>
      <div class="stat-label">
        {icon && <Icon name={icon} size={14} />} {label}
      </div>
      <div class="stat-value mono">{value}</div>
      {sub && <div class="stat-sub">{sub}</div>}
    </div>
  );
}

/** "before → after" with the after value coloured; `invert` for stats where lower is better. */
export function Delta({
  before,
  after,
  digits = 0,
  unit = '',
  invert = false,
}: {
  before: number;
  after: number;
  digits?: number;
  unit?: string;
  invert?: boolean;
}) {
  const d = after - before;
  // a change that rounds away at the shown precision stays uncoloured
  const same = Math.abs(d) < Math.pow(10, -digits) / 2;
  const good = invert ? d < 0 : d > 0;
  const f = (n: number) => fmt(n, digits);
  return (
    <span class="delta mono">
      {f(before)}
      {unit} <Icon name="arrow" size={12} />{' '}
      <b class={same ? '' : good ? 'pos' : 'neg'}>
        {f(after)}
        {unit}
      </b>
    </span>
  );
}

/** Small pill label; `tone` is a CSS modifier (good, warn, bad, accent). */
export function Tag({
  children,
  tone,
  title,
}: {
  children: ComponentChildren;
  tone?: string;
  title?: string;
}): JSX.Element {
  return (
    <span class={`tag ${tone ?? ''}`} title={title}>
      {children}
    </span>
  );
}

/** Module quality letter with its colour class. */
export function QualityBadge({ q }: { q: string }) {
  return (
    <span class={`quality q-${q}`} title={t('ui.quality', { q })}>
      {q}
    </span>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="empty">{children}</p>;
}

/** Last line of defence: a render error shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<
  { children: ComponentChildren; onReset?: () => void },
  { err: boolean }
> {
  state = { err: false };
  componentDidCatch(error: unknown): void {
    console.error('ui error', error);
    this.setState({ err: true });
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div class="modal-backdrop">
        <div class="modal" role="alertdialog" data-testid="error-boundary">
          <header class="modal-head">
            <h2>{t('err.crashTitle')}</h2>
          </header>
          <div class="modal-body">
            <p>{t('err.crashText')}</p>
          </div>
          <footer class="modal-foot">
            <button
              type="button"
              class="btn primary"
              onClick={() => {
                this.props.onReset?.();
                this.setState({ err: false });
              }}
            >
              {t('err.crashBack')}
            </button>
          </footer>
        </div>
      </div>
    );
  }
}
