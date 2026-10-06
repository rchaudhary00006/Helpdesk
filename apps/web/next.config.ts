import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @helpdesk/shared ships TypeScript source.
  transpilePackages: ['@helpdesk/shared'],
  // Proxy the API through the Next origin: same-origin cookies, no CORS preflights.
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
