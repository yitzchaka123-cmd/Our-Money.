/**
 * The floating daily-brief button: a rotated green blob with a counter. It
 * only exists while there is something new — DailyBrief decides that.
 */
export function DailyBriefBlob({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button className="blob" type="button" onClick={onOpen} aria-label={`הסיכום היומי שלי: ${count} עדכונים חדשים`}>
      <span>
        לסיכום
        <br />
        היומי שלי
        <br />←
      </span>
      <span className="blob-count">{count}</span>
    </button>
  );
}
