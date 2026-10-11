'use client';

import { useEffect, type ReactNode } from 'react';

import { Close } from '@/app/dashboard/components/icons';

/**
 * RiseUp's centred popup — the history chart, "עריכת סכום", "הוספת קטגוריה
 * למעקב": a white rounded card over the dimmed page, an × in its top corner,
 * and optionally a coloured header band (blue, or the envelope's colour).
 */
export function Popup({
  onClose,
  labelledBy,
  title,
  tone,
  children,
  footer,
}: {
  onClose: () => void;
  labelledBy: string;
  title: ReactNode;
  /** A coloured header band behind the title; plain white when absent. */
  tone?: 'primary' | 'income' | 'variable' | 'tracking';
  children: ReactNode;
  /** Pinned under the scrolling body, e.g. "הבנתי, תודה". */
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="popup" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="popup-head" data-tone={tone}>
          <button className="popup-close" type="button" aria-label="סגירה" onClick={onClose}>
            <Close size={22} />
          </button>
          <h2 className="popup-title" id={labelledBy}>
            {title}
          </h2>
        </div>
        <div className="popup-body">{children}</div>
        {footer ? <div className="popup-foot">{footer}</div> : null}
      </div>
    </>
  );
}
