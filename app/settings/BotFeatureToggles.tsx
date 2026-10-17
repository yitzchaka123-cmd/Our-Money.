'use client';

import { useState, useTransition } from 'react';

import { BOT_FEATURES, type BotFeature, type BotFeatures } from '@/lib/telegram/bot-features';
import { setBotFeature } from '@/lib/telegram/bot-features-actions';

/**
 * Settings → טלגרם, for the whole household (C24, C26): the Sunday summary
 * and the "מה קניתם כאן?" question. Each is one switch, on by default.
 */
export function BotFeatureToggles({ features }: { features: BotFeatures }) {
  return (
    <div className="tg-household">
      <p className="tg-member-name">לכל הבית</p>
      {BOT_FEATURES.map((f) => (
        <FeatureSwitch key={f.key} feature={f.key} label={f.label} hint={f.hint} initial={features[f.key]} />
      ))}
    </div>
  );
}

function FeatureSwitch({ feature, label, hint, initial }: { feature: BotFeature; label: string; hint: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const labelId = `tg-feature-${feature}`;

  const flip = () => {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const result = await setBotFeature(feature, next);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
      }
    });
  };

  return (
    <>
      <div className="tg-switch-row">
        <span className="tg-switch-text">
          <span className="tg-switch-title" id={labelId}>
            {label}
          </span>
          <span className="tg-hint">{hint}</span>
        </span>
        <button
          type="button"
          role="switch"
          className="brief-switch"
          aria-checked={on}
          aria-labelledby={labelId}
          disabled={pending}
          onClick={flip}
        >
          <span className="brief-switch-knob" />
        </button>
      </div>
      {error ? <p className="tg-error">{error}</p> : null}
    </>
  );
}
