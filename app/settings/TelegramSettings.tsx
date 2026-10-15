'use client';

import { useState, useTransition } from 'react';

import { setNudgeFrequency } from '@/lib/telegram/settings-actions';
import { NUDGE_CHOICES, type ConfirmMode, type NudgeFrequency } from '@/lib/telegram/settings';

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
 * Settings → טלגרם (feedback video 4, item 2): per person, how often the bot
 * asks in the evening whether there was cash spending today.
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
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

      {error ? <p className="tg-error">{error}</p> : null}
    </div>
  );
}
