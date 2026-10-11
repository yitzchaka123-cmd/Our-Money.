/**
 * Icons for the top bar's sync button, the assistant and the setup checklist,
 * drawn the same way as icons.tsx: 2px round-joined strokes on a 24 viewBox.
 * Kept apart from icons.tsx so parallel work on that file merges cleanly.
 */

type Props = { size?: number; className?: string };

function svgProps(size: number, className?: string) {
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
    className,
  };
}

/** Two arrows chasing round a circle: "pull from RiseUp now". */
export function Sync({ size = 24, className }: Props) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M20 11.5A8 8 0 0 0 6.1 6.6L4 8.7" />
      <path d="M4 4v4.7h4.7" />
      <path d="M4 12.5a8 8 0 0 0 13.9 4.9l2.1-2.1" />
      <path d="M20 20v-4.7h-4.7" />
    </svg>
  );
}

/** A clock with an arrow running back round it: past chats. */
export function History({ size = 24, className }: Props) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3 3.5V8h4.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** A speech bubble with a plus: a new chat. */
export function NewChat({ size = 26, className }: Props) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 3a9 9 0 1 1-7.6 13.8L3 21l4.3-1.3A9 9 0 0 1 12 3z" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

export function Plus({ size = 22, className }: Props) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** The send arrow: points left, the way the text runs. */
export function SendArrow({ size = 20, className }: Props) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={2.4}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

/** Small "go" arrow on suggestion chips. */
export function ArrowLeft({ size = 18, className }: Props) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function Check({ size = 16, className }: Props) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={3}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The four-pointed sparkle beside the assistant's title. */
export function Sparkle({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M12 1.5c.6 4.9 2.6 7.5 7.5 8.9.9.3.9 1.5 0 1.8-4.9 1.4-6.9 3.9-7.5 8.9-.1 1-1.4 1-1.6 0-.6-5-2.6-7.5-7.5-8.9-.9-.3-.9-1.5 0-1.8 4.9-1.4 6.9-4 7.5-8.9.2-1 1.5-1 1.6 0z"
      />
    </svg>
  );
}
