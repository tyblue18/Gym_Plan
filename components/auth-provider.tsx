'use client';

/**
 * AuthProvider
 *
 * Thin client-side wrapper around next-auth's SessionProvider.
 * Placed here so app/layout.tsx (a Server Component) can import it without
 * triggering the "you cannot use client hooks in a server component" error —
 * the boundary is defined by the 'use client' directive on THIS file.
 *
 * The optional `session` prop lets you pre-seed the session from a Server
 * Component via getServerSession(), eliminating the client-side loading flash
 * when the initial HTML is already authenticated.
 */

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

interface AuthProviderProps {
  children: React.ReactNode;
  /** Pre-seeded session from getServerSession()*/
  session?: Session | null;
}

export function AuthProvider({ children, session }: AuthProviderProps) {
  return (
    <SessionProvider
      session={session}
      // Disable background polling — next-auth v4 + Next.js 15 produce
      // CLIENT_FETCH_ERROR noise from periodic /api/auth/session fetches.
      // The session is still checked on initial load and sign-in/sign-out.
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      {children}
    </SessionProvider>
  );
}
