import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'Our Money',
  description: 'Cash ledger that sits alongside RiseUp',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
