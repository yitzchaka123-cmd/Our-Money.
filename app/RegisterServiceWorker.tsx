'use client';

import { useEffect } from 'react';

/** Registers public/sw.js in production builds; development stays cache-free. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  }, []);
  return null;
}
