/**
 * Icons traced to match RiseUp's set: 2px round-joined strokes on a 24 viewBox.
 */

type Props = { size?: number; className?: string };

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function SparkleBubble({ size = 26 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M21 11.5a8.5 8.5 0 1 1-3.6-6.9" />
      <path d="M3.8 18.2 3 21l2.9-.8" />
      <path d="M12 7.5 13.1 10l2.4 1.1-2.4 1.1L12 14.7l-1.1-2.5L8.5 11l2.4-1.1z" />
    </svg>
  );
}

export function Search({ size = 24 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

export function Filter({ size = 24 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </svg>
  );
}

export function Menu({ size = 24 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function ChevronRight({ size = 26 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.6}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function ChevronLeft({ size = 26 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.6}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function ChevronDown({ size = 20 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.6}>
      <path d="m5 9 7 7 7-7" />
    </svg>
  );
}

export function Close({ size = 20 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function Note({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

export function Tag({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 12V4h8l9 9-8 8z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}

export function Move({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M20 6H8M20 12H8M20 18h-6" />
      <path d="M6 15 3 18l3 3" />
    </svg>
  );
}

export function Scissors({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5 20 18M8 16.5 20 6" />
    </svg>
  );
}

export function Calendar({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function Coins({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 11v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
    </svg>
  );
}

export function Chart({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 20V10M12 20V4M19 20v-6" />
    </svg>
  );
}

export function Bank({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v9M10 10v9M14 10v9M19 10v9M3 20h18" />
    </svg>
  );
}

export function Gear({ size = 24 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.9 14H3.7a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.9V3.7a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1.3z" />
    </svg>
  );
}

export function Heart({ size = 20 }: Props) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.5-7 9-7 9z" />
    </svg>
  );
}

export function Alert({ size = 18 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </svg>
  );
}

export function Mic({ size = 14 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
