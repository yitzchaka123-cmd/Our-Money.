'use client';

import { useEffect, useState } from 'react';

import { NameForm } from '@/app/dashboard/components/NameForm';
import { Sheet } from '@/app/dashboard/components/Sheet';
import { ChevronLeft, Clover } from '@/app/dashboard/components/icons';
import { Check } from '@/app/dashboard/components/topbar-icons';
import { useRiseupSync } from '@/app/dashboard/components/useRiseupSync';
import { stepsBannerText, type SetupStep } from '@/lib/dashboard/steps';

/**
 * RiseUp's purple "השלמת N צעדים" banner, made real: it counts the setup
 * steps still missing, opens a checklist that fixes each one, and is gone
 * once nothing is missing.
 */
export function SetupStepsBanner({
  steps,
  preferredName,
}: {
  steps: SetupStep[];
  preferredName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const text = stepsBannerText(steps);
  if (!text) return null;

  return (
    <>
      <button className="steps-banner" type="button" onClick={() => setOpen(true)}>
        <Clover />
        <span>
          {text.lead} <strong>{text.strong}</strong> {text.tail}
        </span>
        <span style={{ marginInlineStart: 'auto' }}>
          <ChevronLeft size={20} />
        </span>
      </button>
      <SetupStepsSheet
        open={open}
        steps={steps}
        preferredName={preferredName}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function SetupStepsSheet({
  open,
  steps,
  preferredName,
  onClose,
  initialOpenStep = null,
}: {
  open: boolean;
  steps: SetupStep[];
  preferredName: string | null;
  onClose: () => void;
  /** Preview only: a step whose form starts open. */
  initialOpenStep?: SetupStep['id'] | null;
}) {
  // A step fixed here shows as done at once; the page catches up on refresh.
  const [fixed, setFixed] = useState<Set<SetupStep['id']>>(new Set());
  const [name, setName] = useState(preferredName);
  const [editing, setEditing] = useState<SetupStep['id'] | null>(initialOpenStep);

  const list = steps.map((s) =>
    fixed.has(s.id) && !s.done
      ? { ...s, done: true, hint: s.id === 'name' && name ? `נגיד "היי ${name}".` : 'בוצע.' }
      : s,
  );
  const doneCount = list.filter((s) => s.done).length;

  const markFixed = (id: SetupStep['id']) =>
    setFixed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  return (
    <Sheet open={open} onClose={onClose} labelledBy="steps-title">
      <div className="sheet-body steps-sheet">
        <h2 className="sheet-title" id="steps-title">
          עוד כמה צעדים קטנים
        </h2>
        <p className="steps-count">
          השלמת {doneCount} מתוך {list.length}
        </p>
        <div className="steps-progress" aria-hidden="true">
          <span style={{ width: `${(doneCount / list.length) * 100}%` }} />
        </div>

        <ol className="steps-list">
          {list.map((step, index) => (
            <li key={step.id} className="step-row" data-done={step.done}>
              <span className="step-mark" aria-hidden="true">
                {step.done ? <Check /> : index + 1}
              </span>
              <div className="step-text">
                <p className="step-title">
                  {step.title}
                  {step.done ? <span className="visually-hidden"> — בוצע</span> : null}
                </p>
                <p className="step-hint">{step.hint}</p>
                <StepAction
                  step={step}
                  name={name}
                  editing={editing === step.id}
                  onEdit={() => setEditing(step.id)}
                  onNameSaved={(saved) => {
                    setName(saved);
                    setEditing(null);
                    if (saved) markFixed('name');
                  }}
                  onSynced={() => markFixed('riseup')}
                  onClose={onClose}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}

function StepAction({
  step,
  name,
  editing,
  onEdit,
  onNameSaved,
  onSynced,
  onClose,
}: {
  step: SetupStep;
  name: string | null;
  editing: boolean;
  onEdit: () => void;
  onNameSaved: (name: string | null) => void;
  onSynced: () => void;
  onClose: () => void;
}) {
  switch (step.id) {
    case 'riseup':
      return step.done ? null : <SyncStep onSynced={onSynced} />;
    case 'telegram':
      return step.done ? null : (
        <a className="step-link" href="/setup">
          לבדיקת ההגדרות והקישור לבוט
        </a>
      );
    case 'name':
      if (editing || !step.done) {
        return <NameForm initial={name} onSaved={onNameSaved} />;
      }
      return (
        <button className="step-link" type="button" onClick={onEdit}>
          לשנות את השם
        </button>
      );
    case 'wallet':
      return step.done ? null : (
        <button
          className="step-link"
          type="button"
          onClick={() => {
            onClose();
            // The wallet card's ⋮ is where a wallet's amount is set.
            document.querySelector('.card.wallet')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        >
          לכרטיס הארנק
        </button>
      );
  }
}

function SyncStep({ onSynced }: { onSynced: () => void }) {
  const { pending, feedback, run } = useRiseupSync();
  const synced = feedback?.tone === 'ok';
  useEffect(() => {
    if (synced) onSynced();
  }, [synced, onSynced]);

  return (
    <div className="step-actions">
      <button className="btn-inline" type="button" disabled={pending} onClick={run}>
        {pending ? 'מסנכרן…' : 'לסנכרן עכשיו'}
      </button>
      <a className="step-link" href="/setup">
        לבדיקת ההגדרות
      </a>
      {feedback?.tone === 'error' ? <p className="form-error">{feedback.text}</p> : null}
    </div>
  );
}
