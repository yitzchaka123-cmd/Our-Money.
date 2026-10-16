/**
 * Drawings for the insight cards: a small flat scene in each card's top band,
 * and the coin faces of the "זה עזר לך?" answer.
 */

import { TipArtwork } from '@/app/dashboard/components/TipArt';
import type { InsightArt } from '@/lib/dashboard/insights';

/** The top band of an insight card. */
export function InsightArtwork({ art }: { art: InsightArt }) {
  if (art.startsWith('tip-')) return <TipArtwork art={art as Extract<InsightArt, `tip-${string}`>} />;
  switch (art) {
    case 'income':
      // RiseUp's own: one green coin rolling ahead of fading white ones.
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          {[4, 3, 2, 1].map((i) => (
            <circle key={i} cx={78 + i * 26} cy="40" r="26" fill="#ffffff" opacity={1 - i * 0.2} />
          ))}
          <circle cx="70" cy="40" r="30" fill="#2ec05c" />
        </svg>
      );
    case 'coins':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="150" cy="20" r="14" fill="#ffffff" opacity="0.7" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x="70" y={56 - i * 12} width="60" height="12" rx="6" fill={i === 3 ? '#ffc800' : '#ffd84d'} />
            </g>
          ))}
          <circle cx="120" cy="62" r="16" fill="#ff7a30" />
        </svg>
      );
    case 'bars':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="40" cy="22" r="12" fill="#ffffff" opacity="0.7" />
          {[18, 30, 26, 52].map((h, i) => (
            <rect key={i} x={66 + i * 20} y={72 - h} width="14" height={h} rx="7" fill={i === 3 ? '#ff6b4a' : '#5d7afc'} />
          ))}
          <path d="M60 36 H150" stroke="#14452f" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      );
    case 'wallet':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="160" cy="20" r="12" fill="#ffffff" opacity="0.7" />
          <rect x="66" y="22" width="70" height="46" rx="10" fill="#5d7afc" />
          <rect x="108" y="36" width="30" height="18" rx="9" fill="#dce8f6" />
          <circle cx="118" cy="45" r="4" fill="#5d7afc" />
          <rect x="74" y="12" width="40" height="16" rx="4" fill="#12b76a" transform="rotate(-8 94 20)" />
        </svg>
      );
    case 'chart-up':
    case 'chart-down': {
      const up = art === 'chart-up';
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="44" cy="22" r="13" fill="#ffffff" opacity="0.7" />
          <circle cx="160" cy="58" r="18" fill="#ffffff" opacity="0.5" />
          <path
            d={up ? 'M62 62 L92 44 L112 52 L142 22' : 'M62 22 L92 40 L112 32 L142 62'}
            fill="none"
            stroke={up ? '#12b76a' : '#ff6b4a'}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="142" cy={up ? 22 : 62} r="8" fill={up ? '#12b76a' : '#ff6b4a'} />
        </svg>
      );
    }
  }
}

/** A coin with a face, for the yes / no answer. */
export function CoinFace({ happy }: { happy: boolean }) {
  return (
    <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true" fill="none" stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="20" cy="21" r="15" fill="#ffffff" />
      <circle cx="15" cy="18" r="1.4" fill="#1a1a1a" stroke="none" />
      <circle cx="25" cy="18" r="1.4" fill="#1a1a1a" stroke="none" />
      {happy ? <path d="M13.5 24 q6.5 6 13 0" /> : <path d="M14 27 q6 -4 12 0" />}
      {happy ? <path d="M30 6 l2 -3 M34 9 l3 -1 M8 8 l-2 -3" /> : <path d="M31 7 l3 -2" />}
    </svg>
  );
}
