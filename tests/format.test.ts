import { describe, expect, it } from 'vitest';

import {
  categoryKeyboard,
  decodeCallback,
  encodeCallback,
  formatIls,
  friendlyDate,
  packUuid,
  unpackUuid,
} from '@/lib/telegram/format';

const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('callback data', () => {
  it('round-trips a uuid through the packed form', () => {
    expect(unpackUuid(packUuid(UUID))).toBe(UUID);
  });

  it.each([
    { kind: 'delete', spendId: UUID },
    { kind: 'pick_category', spendId: UUID },
    { kind: 'confirm', spendId: UUID },
    { kind: 'set_category', spendId: UUID, categoryIndex: 7 },
  ] as const)('round-trips %j', (action) => {
    expect(decodeCallback(encodeCallback(action))).toEqual(action);
  });

  it('stays within Telegram\'s 64-byte callback_data limit', () => {
    // Category indexes are used instead of Hebrew labels precisely because of
    // this cap; a regression here breaks every button silently.
    const longest = encodeCallback({ kind: 'set_category', spendId: UUID, categoryIndex: 999 });
    expect(Buffer.byteLength(longest, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('rejects malformed payloads instead of throwing', () => {
    expect(decodeCallback('del:not-a-uuid')).toBeNull();
    expect(decodeCallback('bogus')).toBeNull();
    expect(decodeCallback('')).toBeNull();
    expect(decodeCallback(`sc:${packUuid(UUID)}:-1`)).toBeNull();
    expect(decodeCallback(`sc:${packUuid(UUID)}:abc`)).toBeNull();
  });

  it('rejects an unknown prefix', () => {
    expect(decodeCallback(`zz:${packUuid(UUID)}`)).toBeNull();
  });
});

describe('formatIls', () => {
  it('omits decimals on whole shekels', () => {
    expect(formatIls(80)).toBe('₪80');
  });

  it('pads agorot to two digits, as money should read', () => {
    expect(formatIls(12.5)).toBe('₪12.50');
    expect(formatIls(12.34)).toBe('₪12.34');
  });
});

describe('friendlyDate', () => {
  const today = '2026-09-15';

  it('names today', () => {
    expect(friendlyDate('2026-09-15', today)).toBe('היום');
  });

  it('names yesterday', () => {
    expect(friendlyDate('2026-09-14', today)).toBe('אתמול');
  });

  it('names the day before that', () => {
    expect(friendlyDate('2026-09-13', today)).toBe('שלשום');
  });

  it('falls back to a plain date further back', () => {
    expect(friendlyDate('2026-09-01', today)).toBe('01/09/2026');
  });

  it('handles a month boundary', () => {
    expect(friendlyDate('2026-08-31', '2026-09-01')).toBe('אתמול');
  });
});

describe('categoryKeyboard', () => {
  it('lays categories out two per row', () => {
    const keyboard = categoryKeyboard(UUID, ['א', 'ב', 'ג']);
    expect(keyboard).toHaveLength(2);
    expect(keyboard[0]).toHaveLength(2);
    expect(keyboard[1]).toHaveLength(1);
  });

  it('encodes each button with its own index', () => {
    const keyboard = categoryKeyboard(UUID, ['א', 'ב']);
    expect(decodeCallback(keyboard[0]![1]!.callback_data)).toEqual({
      kind: 'set_category',
      spendId: UUID,
      categoryIndex: 1,
    });
  });
});
