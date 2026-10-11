/**
 * More icons in the same style as icons.tsx (2px round strokes, 24 viewBox),
 * for the tracker menu, the account filter, search and split.
 */

type Props = { size?: number };

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

/** RiseUp's "חודשים קודמים": three solid bars. */
export function Bars({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={3} strokeLinecap="butt">
      <path d="M6 20v-7M12 20V5M18 20v-10" />
    </svg>
  );
}

export function Pencil({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 20l1-4L16 5l3 3L8 19z" fill="currentColor" />
    </svg>
  );
}

/** "עריכת שם": a big and a small T. */
export function TextSize({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.4}>
      <path d="M3 6h10M8 6v13M14 11h7M17.5 11v8" />
    </svg>
  );
}

export function Trash({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 7h16M9 7V4h6v3" />
      <path d="M6 7h12l-1 13H7z" fill="currentColor" />
    </svg>
  );
}

/** "להזיז כמה ביחד": a stack with a plus. */
export function Stack({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <rect x="8" y="3" width="13" height="13" rx="2" />
      <path d="M16 8v4M14 10h4M5 8v11a2 2 0 0 0 2 2h9" />
    </svg>
  );
}

export function Plus({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Check({ size = 16 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={2.8}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Back, as RTL reads it: an arrow pointing right. */
export function ArrowBack({ size = 24 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Info({ size = 20 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  );
}

export function ChevronUpDown({ size = 20, open = false }: Props & { open?: boolean }) {
  return (
    <svg {...svgProps(size)} style={{ transform: open ? 'rotate(180deg)' : undefined }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SmallChevronLeft({ size = 20 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function Spinner({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)} className="spin">
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}
