/**
 * Drawings for the money tips (lib/dashboard/tips.ts), in the flat style of
 * the insight cards: a few soft shapes on the card's light-blue band, like
 * RiseUp's own tip art (leaves and a cloud).
 */

import type { TipArt } from '@/lib/dashboard/insights';

const BLUE = '#5d7afc';
const NAVY = '#2c3d9e';
const SKY = '#aac0f5';
const GREEN = '#12b76a';
const YELLOW = '#ffc800';
const ORANGE = '#ff7a30';
const PINK = '#f49ab8';

export function TipArtwork({ art }: { art: TipArt }) {
  switch (art) {
    case 'tip-plant':
      // Leaves in front of a soft cloud, as RiseUp draws its tips.
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <rect x="96" y="30" width="62" height="50" rx="24" fill={SKY} />
          <circle cx="150" cy="22" r="10" fill="#ffffff" opacity="0.7" />
          <path d="M86 80 C70 62 74 40 92 30 C100 48 98 66 86 80 Z" fill={BLUE} />
          <path d="M90 80 C96 56 114 46 130 50 C124 66 108 78 90 80 Z" fill={NAVY} />
          <path d="M84 80 C70 70 60 72 54 80 Z" fill={NAVY} />
        </svg>
      );
    case 'tip-cup':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="50" cy="24" r="12" fill="#ffffff" opacity="0.7" />
          <path d="M78 34 H130 L124 74 Q123 80 116 80 H92 Q85 80 84 74 Z" fill={BLUE} />
          <path d="M130 42 Q146 42 144 54 Q142 64 126 62" fill="none" stroke={BLUE} strokeWidth="6" strokeLinecap="round" />
          <path d="M94 26 Q90 18 96 10 M106 26 Q102 18 108 10 M118 26 Q114 18 120 10" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
          <circle cx="160" cy="62" r="14" fill={ORANGE} />
        </svg>
      );
    case 'tip-cart':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="156" cy="20" r="12" fill="#ffffff" opacity="0.7" />
          <path d="M58 18 H72 L82 58 H134 L144 28 H78" fill="none" stroke={NAVY} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="90" cy="70" r="7" fill={NAVY} />
          <circle cx="126" cy="70" r="7" fill={NAVY} />
          <circle cx="98" cy="30" r="12" fill={YELLOW} />
          <rect x="112" y="16" width="20" height="28" rx="6" fill={GREEN} />
        </svg>
      );
    case 'tip-calendar':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="46" cy="58" r="14" fill="#ffffff" opacity="0.6" />
          <rect x="72" y="14" width="64" height="62" rx="10" fill="#ffffff" />
          <rect x="72" y="14" width="64" height="18" rx="9" fill={BLUE} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect key={`${r}-${c}`} x={80 + c * 18} y={38 + r * 12} width="12" height="8" rx="3" fill={r === 1 && c === 1 ? ORANGE : SKY} />
            )),
          )}
          <circle cx="156" cy="24" r="10" fill={YELLOW} />
        </svg>
      );
    case 'tip-card':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="160" cy="20" r="12" fill="#ffffff" opacity="0.7" />
          <rect x="76" y="20" width="76" height="48" rx="8" fill={NAVY} transform="rotate(-10 114 44)" />
          <rect x="62" y="28" width="76" height="48" rx="8" fill={BLUE} />
          <rect x="62" y="38" width="76" height="9" fill={NAVY} opacity="0.55" />
          <rect x="72" y="56" width="22" height="12" rx="3" fill={YELLOW} />
        </svg>
      );
    case 'tip-jar':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="48" cy="22" r="12" fill="#ffffff" opacity="0.7" />
          <rect x="86" y="14" width="36" height="10" rx="4" fill={NAVY} />
          <path d="M82 28 Q82 22 90 22 H118 Q126 22 126 28 V72 Q126 80 118 80 H90 Q82 80 82 72 Z" fill="#ffffff" opacity="0.85" />
          <circle cx="96" cy="66" r="9" fill={YELLOW} />
          <circle cx="112" cy="62" r="9" fill={GREEN} />
          <circle cx="104" cy="48" r="9" fill={YELLOW} />
          <circle cx="152" cy="58" r="12" fill={PINK} />
        </svg>
      );
    case 'tip-bulb':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="150" cy="56" r="16" fill="#ffffff" opacity="0.55" />
          <circle cx="100" cy="36" r="22" fill={YELLOW} />
          <rect x="90" y="56" width="20" height="16" rx="4" fill={NAVY} />
          <path d="M62 36 H70 M130 36 H138 M76 12 L82 18 M124 12 L118 18" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    case 'tip-receipt':
      return (
        <svg viewBox="0 0 200 80" className="ins-art-svg" aria-hidden="true">
          <circle cx="50" cy="56" r="14" fill="#ffffff" opacity="0.6" />
          <path d="M80 10 H128 V80 L120 74 L112 80 L104 74 L96 80 L88 74 L80 80 Z" fill="#ffffff" />
          <rect x="88" y="22" width="32" height="5" rx="2.5" fill={SKY} />
          <rect x="88" y="34" width="24" height="5" rx="2.5" fill={SKY} />
          <rect x="88" y="46" width="28" height="5" rx="2.5" fill={SKY} />
          <rect x="88" y="58" width="16" height="6" rx="3" fill={BLUE} />
          <circle cx="146" cy="28" r="12" fill={GREEN} />
        </svg>
      );
  }
}
