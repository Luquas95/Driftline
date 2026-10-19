import { describe, expect, it } from 'vitest';
import { messagesSince, msg } from '../src/core/state';
import { mk } from './helpers';

describe('message cursor', () => {
  it('keeps reporting new messages after the capped log is full', () => {
    const s = mk('MSG1');
    for (let i = 0; i < 150; i++) msg(s, 'msg.spoiled');
    expect(s.messages.length).toBe(120);
    let last = s.messages.at(-1)!;
    msg(s, 'msg.starving', undefined, 'bad');
    expect(s.messages.length).toBe(120);
    expect(messagesSince(s.messages, last).map((m) => m.key)).toEqual(['msg.starving']);
    last = s.messages.at(-1)!;
    expect(messagesSince(s.messages, last)).toEqual([]);
  });

  it('treats everything as new when the cursor was trimmed away or never set', () => {
    const s = mk('MSG2');
    const old = { day: 0, key: 'msg.gone', tone: 'info' as const };
    msg(s, 'msg.spoiled');
    expect(messagesSince(s.messages, old)).toHaveLength(s.messages.length);
    expect(messagesSince(s.messages, null)).toHaveLength(s.messages.length);
  });
});
