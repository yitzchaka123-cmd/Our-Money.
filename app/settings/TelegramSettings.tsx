'use client';

import { useState, useTransition } from 'react';

import { setConfirmMode, setNudgeFrequency } from '@/lib/telegram/settings-actions';
import { CONFIRM_CHOICES, NUDGE_CHOICES, type ConfirmMode, type NudgeFrequency } from '@/lib/telegram/settings';

export interface TelegramMemberSettings {
  id: string;
  name: string;
  isYou: boolean;
  nudge: NudgeFrequency;
  confirm: ConfirmMode;
}

export interface TelegramSettingsData {
  members: TelegramMemberSettings[];
}

/**
 * Settings → טלגרם (feedback video 4, items 2 and 4): per person, how often
 * the bot asks in the evening whether there was cash spending today, and
 * whether a spend sent to the bot is saved at once or waits for "לאשר".
 */
export function TelegramSettings({ data }: { data: TelegramSettingsData }) {
  return (
    <section className="settings-group tg-settings" aria-labelledby="tg-settings-title">
      <h2 className="settings-group-title" id="tg-settings-title">
        טלגרם
      </h2>
      {data.members.map((m) => (
        <MemberSettings key={m.id} member={m} />
      ))}
    </section>
  );
}

function MemberSettings({ member }: { member: TelegramMemberSettings }) {
  const [nudge, setNudge] = useState<NudgeFrequency>(member.nudge);
  const [confirm, setConfirm] = useState<ConfirmMode>(member.confirm);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pickConfirm = (value: ConfirmMode) => {
    const before = confirm;
    setConfirm(value);
    setError(null);
    start(async () => {
      const result = await setConfirmMode(member.id, value);
      if (!result.ok) {
        setConfirm(before);
        setError(result.error);
      }
    });
  };

  const pickNudge = (value: NudgeFrequency) => {
    const before = nudge;
    setNudge(value);
    setError(null);
    start(async () => {
      const result = await setNudgeFrequency(member.id, value);
      if (!result.ok) {
        setNudge(before);
        setError(result.error);
      }
    });
  };

  return (
    <div className="tg-member">
      <p className="tg-member-name">
        {member.name}
        {member.isYou ? <span className="settings-you">אני</span> : null}
      </p>

      <fieldset className="tg-field" disabled={pending}>
        <legend className="tg-legend">תזכורת בערב: ״היו היום הוצאות במזומן?״</legend>
        <div className="chips" role="radiogroup" aria-label={`תזכורת בערב ל${member.name}`}>
          {NUDGE_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={nudge === c.value}
              className="chip"
              data-selected={nudge === c.value}
              onClick={() => pickNudge(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="tg-field" disabled={pending}>
        <legend className="tg-legend">הוצאה ששולחים לבוט</legend>
        <div className="chips" role="radiogroup" aria-label={`רישום הוצאות של ${member.name}`}>
          {CONFIRM_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={confirm === c.value}
              className="chip"
              data-selected={confirm === c.value}
              onClick={() => pickConfirm(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="tg-hint">{CONFIRM_CHOICES.find((c) => c.value === confirm)?.hint}</p>
      </fieldset>

      {error ? <p className="tg-error">{error}</p> : null}
    </div>
  );
}
