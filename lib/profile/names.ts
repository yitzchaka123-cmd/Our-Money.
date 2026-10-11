/**
 * What to call a household member. The Telegram account's display name is
 * often not the person's name at all (a nickname, a relative's account), so
 * the greeting only ever uses the name the member chose. Until they choose
 * one, the card says just "היי".
 */

export const PREFERRED_NAME_MAX = 40;

export interface NamedMember {
  display_name: string;
  preferred_name?: string | null;
}

/** The greeting's name: the chosen one, or nothing. */
export function greetingName(member: NamedMember | undefined | null): string {
  return member?.preferred_name?.trim() ?? '';
}

/** A label for lists (who logged this): the chosen name, else the Telegram one. */
export function memberName(member: NamedMember): string {
  return member.preferred_name?.trim() || member.display_name;
}

export type NameCheck = { ok: true; value: string | null } | { ok: false; error: string };

/** Clean a typed name. Empty means "clear it" and says just "היי" again. */
export function normalizePreferredName(input: string): NameCheck {
  const value = input.replace(/\s+/g, ' ').trim();
  if (!value) return { ok: true, value: null };
  if (value.length > PREFERRED_NAME_MAX) {
    return { ok: false, error: `השם ארוך מדי — עד ${PREFERRED_NAME_MAX} תווים.` };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(value)) {
    return { ok: false, error: 'אפשר להשתמש רק באותיות, מספרים ורווחים.' };
  }
  return { ok: true, value };
}
