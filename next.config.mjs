/** @type {import('next').NextConfig} */
const nextConfig = {
  // REMOVED: output: 'export'
  //   NextAuth API routes require a Node.js server runtime.
  //   Static export (output: 'export') compiles to plain HTML/JS and
  //   cannot run /api/auth/[...nextauth] at request time.
  //
  // REMOVED: basePath: '/Gym_Plan'
  //   The registered GitHub OAuth callback is:
  //     http://localhost:3000/api/auth/callback/github
  //   With basePath active the route would resolve to:
  //     http://localhost:3000/Gym_Plan/api/auth/callback/github   ← mismatch
  //   If you re-add basePath for a sub-path production deployment,
  //   update the GitHub OAuth App callback URL to match.

  images: {
    // GitHub CDN serves user avatars from this hostname.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/u/**',
      },
    ],
  },
};

export default nextConfig;
