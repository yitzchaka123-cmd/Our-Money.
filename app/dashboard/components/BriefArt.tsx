/**
 * Drawings for the daily brief, in the spirit of RiseUp's own: flat shapes in
 * the envelope hues on the intro card, and a sunburst on the end card.
 */

/** The intro card's title art: three flat shapes over a lime hexagon. */
export function BriefIntroArt() {
  return (
    <div className="brief-intro-art" aria-hidden="true">
      <span className="brief-shape brief-shape--flower" />
      <span className="brief-shape brief-shape--peach" />
      <span className="brief-shape brief-shape--tulip" />
      <div className="brief-hex">
        <span className="brief-hex-top">הסיכום</span>
        <span className="brief-hex-bottom">היומי</span>
      </div>
    </div>
  );
}

/** The end card's background: yellow rays from behind the title. */
export function Sunburst() {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className="brief-sunburst" viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {rays.map((angle) => (
        <path key={angle} d="M0 0 L-9 -150 Q0 -158 9 -150 Z" transform={`rotate(${angle})`} fill="#ffc800" />
      ))}
      <circle r="58" fill="#fdf0c4" />
    </svg>
  );
}

/** A stack of coins with a few sparkles: the job is done. */
export function CoinStack() {
  const coins = [0, 1, 2, 3, 4];
  return (
    <svg className="brief-coins" viewBox="0 0 120 90" aria-hidden="true" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round">
      {coins.map((i) => {
        const y = 74 - i * 10;
        return (
          <g key={i}>
            <path d={`M28 ${y} v6 a32 7 0 0 0 64 0 v-6`} fill="#fdf0c4" />
            <ellipse cx="60" cy={y} rx="32" ry="7" fill="#ffffff" />
          </g>
        );
      })}
      <path d="M20 22 l3 -8 l3 8 l-3 8 z M14 22 h18" strokeWidth="1.6" />
      <path d="M96 14 l2 -6 l2 6 l-2 6 z M92 14 h12" strokeWidth="1.6" />
      <path d="M104 40 l1.5 -4 l1.5 4 l-1.5 4 z" strokeWidth="1.4" />
      <path d="M8 84 h104" strokeDasharray="1 4" />
    </svg>
  );
}
