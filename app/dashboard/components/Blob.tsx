/** The floating daily-brief button: a rotated green blob with a counter. */
export function DailyBriefBlob({ count }: { count: number }) {
  return (
    <a className="blob" href="/daily">
      <span>
        לרייזאפ
        <br />
        היומי שלי
        <br />←
      </span>
      {count > 0 ? <span className="blob-count">{count}</span> : null}
    </a>
  );
}
