/**
 * More icons in the same hand as icons.tsx: 2px round-joined strokes on a 24
 * viewBox. Kept in their own file so icons.tsx stays a quiet merge. Used by the
 * wallets, accounts and settings screens, the tracker menu, the account
 * filter, search and split.
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

/** `bold` draws the heavier plus of the envelope menu. */
export function Plus({ size = 22, bold = false }: Props & { bold?: boolean }) {
  return (
    <svg {...svgProps(size)} strokeWidth={bold ? 2.4 : 2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** `filled` draws the solid pencil of the envelope menu, as RiseUp does. */
export function Pencil({ size = 22, filled = false }: Props & { filled?: boolean }) {
  if (filled) {
    return (
      <svg {...svgProps(size)}>
        <path d="M4 20l1-4L16 5l3 3L8 19z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...svgProps(size)}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function Scale({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 4v16M7 20h10M5 7h14" />
      <path d="m5 7-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" />
    </svg>
  );
}

export function Star({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

/** `filled` draws the solid bin of the envelope menu, as RiseUp does. */
export function Trash({ size = 22, filled = false }: Props & { filled?: boolean }) {
  if (filled) {
    return (
      <svg {...svgProps(size)}>
        <path d="M4 7h16M9 7V4h6v3" />
        <path d="M6 7h12l-1 13H7z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...svgProps(size)}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function Wallet({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 7l11-3v3" />
      <path d="M16 13.5h.5" />
    </svg>
  );
}

export function Cards({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <rect x="4" y="6" width="11" height="15" rx="2" transform="rotate(-12 9.5 13.5)" />
      <path d="M13 4.5 18.8 6a2 2 0 0 1 1.4 2.4l-2.6 10" />
    </svg>
  );
}

export function Refresh({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M20 11a8 8 0 0 0-14.6-4.4L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.6 4.4L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

export function LogOut({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </svg>
  );
}

export function User({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function Lock({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function Chat({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 3V6a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function CreditCard({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  );
}

/** RiseUp's "חודשים קודמים": three solid bars. */
export function Bars({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)} strokeWidth={3} strokeLinecap="butt">
      <path d="M6 20v-7M12 20V5M18 20v-10" />
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

/** "להזיז כמה ביחד": a stack with a plus. */
export function Stack({ size = 22 }: Props) {
  return (
    <svg {...svgProps(size)}>
      <rect x="8" y="3" width="13" height="13" rx="2" />
      <path d="M16 8v4M14 10h4M5 8v11a2 2 0 0 0 2 2h9" />
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
