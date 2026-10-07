import { describe, expect, it } from 'vitest';
import { cs } from '../src/i18n/cs';
import { t, plural, fmt, money, hasKey, addLanguage, setLanguage } from '../src/i18n';
import { requiredKeys } from '../scripts/i18n-keys';

describe('i18n', () => {
  it('has every key the code can request (no missing translations)', () => {
    const need = requiredKeys();
    const missing = [...need.keys()].filter((k) => !(k in cs) && !hasKey(k));
    expect(missing).toEqual([]);
  });

  it('interpolates parameters and falls back to the key', () => {
    expect(t('top.docked', { station: 'Aurora' })).toBe('Přistáno: Aurora');
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(t('top.docked')).toContain('{station}');
  });

  it('supports adding another language with fallback to Czech', () => {
    addLanguage('en', { 'ui.back': 'Back' });
    setLanguage('en');
    expect(t('ui.back')).toBe('Back');
    expect(t('ui.close')).toBe('Zavřít');
    setLanguage('cs');
    expect(t('ui.back')).toBe('Zpět');
  });

  it('formats numbers and Czech plurals', () => {
    expect(plural(1, 'skok', 'skoky', 'skoků')).toBe('skok');
    expect(plural(3, 'skok', 'skoky', 'skoků')).toBe('skoky');
    expect(plural(7, 'skok', 'skoky', 'skoků')).toBe('skoků');
    expect(fmt(1234.5, 1)).toMatch(/1.234,5/);
    expect(money(1500)).toContain('kr');
  });
});
