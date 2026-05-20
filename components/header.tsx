'use client';

/**
 * AuthHeader
 *
 * A single sticky top-bar that renders one of three states driven by
 * next-auth's useSession():
 *
 *  1. loading  → animated skeleton pill (prevents layout shift)
 *  2. unauthenticated → gradient "Sign in with GitHub" button
 *  3. authenticated   → avatar · name · sign-out link
 *
 * Design tokens mirror the premium dark system in public/index.html:
 *   Base:      #070910
 *   Surface:   rgba(7,9,16,0.88) + backdrop-blur
 *   Accent:    #4f8ef7 → #8b6cf7 gradient
 *   Border:    rgba(42,42,56,0.55)
 * All visual rules live in the .auth-* classes appended to app/globals.css.
 */

import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';

/* ── GitHub SVG mark (inline, no external dependency) ─────────────────── */
function GitHubMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}


/* ── Loading skeleton ─────────────────────────────────────────────────── */
function AuthSkeleton() {
  return (
    <div
      className="auth-skeleton"
      role="status"
      aria-label="Loading authentication state"
    />
  );
}

/* ── Unauthenticated state ────────────────────────────────────────────── */
function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('github')}
      className="auth-signin-btn"
      aria-label="Sign in with GitHub OAuth"
    >
      <GitHubMark />
      Sign in with GitHub
    </button>
  );
}

/* ── Authenticated state ──────────────────────────────────────────────── */
interface UserPillProps {
  image: string | null | undefined;
  name:  string | null | undefined;
  email: string | null | undefined;
}

function UserPill({ image, name, email }: UserPillProps) {
  const displayName = name ?? email ?? 'Athlete';

  return (
    <div className="auth-user-pill" role="group" aria-label="User account controls">
      {image && (
        <Image
          src={image}
          alt={`${displayName} profile picture`}
          width={26}
          height={26}
          className="auth-avatar"
          priority
        />
      )}

      <span className="auth-user-name" title={email ?? undefined}>
        {displayName}
      </span>

      <span className="auth-divider" aria-hidden="true" />

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/' })}
        className="auth-signout-btn"
        aria-label="Sign out of your account"
      >
        Sign out
      </button>
    </div>
  );
}

/* ── Main exported component ─────────────────────────────────────────── */
export function AuthHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="auth-header" role="banner">
      <div className="auth-header-inner">

        {/* Left: wordmark */}
        <span className="auth-wordmark" aria-label="Que">
          QUE
        </span>

        {/* Right: session-driven controls */}
        <div className="auth-controls" aria-live="polite" aria-atomic="true">
          {status === 'loading' && <AuthSkeleton />}

          {status === 'unauthenticated' && <SignInButton />}

          {status === 'authenticated' && session?.user && (
            <UserPill
              image={session.user.image}
              name={session.user.name}
              email={session.user.email}
            />
          )}
        </div>

      </div>
    </header>
  );
}
