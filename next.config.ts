import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Absolute (not relative) so pages served via a cross-origin rewrite from
  // another zone (e.g. diggajrealty.com/list-property proxying to this app)
  // still pull their JS/CSS from here instead of 404ing against the parent's
  // own /_next namespace.
  assetPrefix: process.env.VERCEL_ENV === 'production' ? 'https://resale-admin.diggajrealty.com' : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: '150mb',
    },
  },
};

export default nextConfig;
