'use client';

import { useState, useTransition } from 'react';

import { Chat, Check, Plus } from '@/app/dashboard/components/icons-extra';
import { BotFeatureToggles } from '@/app/settings/BotFeatureToggles';
import type { BotFeatures } from '@/lib/telegram/bot-features';
import { setConfirmMode, setNudgeFrequency } from '@/lib/telegram/settings-actions';
import { CONFIRM_CHOICES, NUDGE_CHOICES, type ConfirmMode, type NudgeFrequency } from '@/lib/telegram/settings';

export interface TelegramMemberSettings {
  id: string;
  name: string;
  isYou: boolean;
  nudge: NudgeFrequency;
  confirm: ConfirmMode;
}

export interface FamilyGroupData {
  /** The connected group, or null. */
  connected: { title: string | null; fromServerSetting: boolean } | null;
  /** https://t.me/<bot>?startgroup=…, or null when the bot's name is unknown. */
  addToGroupUrl: string | null;
}

export interface TelegramSettingsData {
  members: TelegramMemberSettings[];
  group?: FamilyGroupData;
  /** Household-wide switches: the Sunday summary and "מה קניתם כאן?". */
  features?: BotFeatures;
}

/**
 * Settings → טלגרם (feedback video 4, items 2 and 4): per person, how often
 * the bot asks in the evening whether there was cash spending today, and
 * whether a spend sent to the bot is saved at once or waits for "לאשר".
 */
export function TelegramSettings({ data }: { data: TelegramSettingsData }) {
  return (
    <>
      <section className="settings-group tg-settings" aria-labelledby="tg-settings-title">
        <h2 className="settings-group-title" id="tg-settings-title">
          טלגרם
        </h2>
        {data.members.map((m) => (
          <MemberSettings key={m.id} member={m} />
        ))}
        {data.features ? <BotFeatureToggles features={data.features} /> : null}
      </section>
      {data.group ? <FamilyGroupSettings group={data.group} /> : null}
    </>
  );
}

/**
 * Settings → קבוצה משפחתית (feedback video 3 #1, video 4 #3): one tap to add
 * the bot to a group with your partner. The bot remembers the group itself.
 */
export function FamilyGroupSettings({ group }: { group: FamilyGroupData }) {
  return (
    <section className="settings-group tg-group" aria-labelledby="tg-group-title">
      <h2 className="settings-group-title" id="tg-group-title">
        קבוצה משפחתית
      </h2>
      {group.connected ? (
        <>
          <div className="settings-row settings-row--static">
            <span className="settings-ico tg-group-ok">
              <Check size={22} />
            </span>
            <span className="settings-row-text">
              <span className="settings-row-title">
                מחוברת{group.connected.title ? `: ${group.connected.title}` : ''}
              </span>
              <span className="settings-row-sub">
                כל הוצאה והכנסה במזומן נשלחת לקבוצה — מי רשם, כמה, ובאיזו מעטפה. שניכם יכולים לרשום גם מתוכה.
                {group.connected.fromServerSetting ? ' (הקבוצה נקבעה בהגדרות השרת.)' : ''}
              </span>
            </span>
          </div>
          {group.addToGroupUrl ? (
            <a className="settings-row settings-link" href={group.addToGroupUrl} target="_blank" rel="noopener noreferrer">
              <span className="settings-ico">
                <Chat />
              </span>
              <span className="settings-row-text">
                <span className="settings-row-title">להעביר לקבוצה אחרת</span>
              </span>
            </a>
          ) : null}
        </>
      ) : (
        <div className="tg-group-setup">
          <p className="tg-group-lead">קבוצה אחת בטלגרם — אתם, בן או בת הזוג והבוט — ושניכם רואים כל רישום במזומן.</p>
          <ol className="tg-steps">
            <li>פותחים בטלגרם קבוצה עם בן או בת הזוג (או בוחרים קבוצה שכבר יש לכם).</li>
            <li>
              {group.addToGroupUrl ? 'לוחצים על הכפתור ובוחרים את הקבוצה.' : 'שולחים לבוט /group ולוחצים על הכפתור שהוא שולח.'}
            </li>
            <li>זהו! הבוט כותב בקבוצה שהיא מחוברת, ומאז כל רישום מופיע שם.</li>
          </ol>
          {group.addToGroupUrl ? (
            <a className="tg-group-btn" href={group.addToGroupUrl} target="_blank" rel="noopener noreferrer">
              <Plus size={20} bold />
              הוספת הבוט לקבוצה
            </a>
          ) : null}
        </div>
      )}
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
