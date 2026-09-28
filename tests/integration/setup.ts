import { vi } from 'vitest';

// Server actions read the session cookie through next/headers and refresh
// pages through next/cache; outside a Next request both need stand-ins.
vi.mock('next/headers', async () => {
  const { cookieJar } = await import('./helpers');
  return {
    cookies: async () => ({
      get: (name: string) => (cookieJar.value ? { name, value: cookieJar.value } : undefined),
    }),
    headers: async () => new Headers(),
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
