'use client';

/**
 * components/error-bootstrap.tsx
 *
 * Mounts the global error + unhandledrejection listeners exactly once. Lives
 * in the root layout so we catch anything that escapes a React boundary.
 *
 * Returns null — it's a side-effect-only component, no UI.
 */

import { useEffect } from 'react';
import { installGlobalErrorHandlers } from '@/lib/errorReporter';

export function ErrorBootstrap() {
  useEffect(() => { installGlobalErrorHandlers(); }, []);
  return null;
}
