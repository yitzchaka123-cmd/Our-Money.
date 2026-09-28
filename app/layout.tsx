import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { RegisterServiceWorker } from '@/app/RegisterServiceWorker';

import './globals.css';

export const metadata: Metadata = {
  title: 'המזומן שלנו',
  description: 'יומן המזומן שרץ לצד RiseUp',
  applicationName: 'המזומן שלנו',
  appleWebApp: {
    capable: true,
    title: 'המזומן שלנו',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
