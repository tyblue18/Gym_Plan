/** @type {import('next').NextConfig} */
const nextConfig = {
  // REMOVED: output: 'export'
  //    NextAuth API routes require a Node.js server runtime.
  //    Static export (output: 'export') compiles to plain HTML/JS and
  //    cannot run /api/auth/[...nextauth] at request time.
  //
  // REMOVED: basePath: '/Gym_Plan'
  //    The registered GitHub OAuth callback is:
  //     http://localhost:3000/api/auth/callback/github
  //    With basePath active the route would resolve to:
  //     http://localhost:3000/Gym_Plan/api/auth/callback/github   ← mismatch

  images: {
    // Whitelist external CDNs to serve user avatars safely
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/u/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },

  async headers() {
    // Never let the CDN/browser serve a stale service worker script — the SW
    // update check must always see fresh bytes, otherwise new deploys are never
    // detected and the "New version" prompt won't appear.
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;