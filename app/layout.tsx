import type { ReactNode } from 'react';

export const metadata = {
  title: 'Our Money',
  description: 'Cash ledger that sits alongside RiseUp',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
