import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Secrets are read at request time in route handlers; nothing here should
  // ever be inlined into a client bundle.
  serverExternalPackages: ['@anthropic-ai/sdk'],
};

export default nextConfig;
