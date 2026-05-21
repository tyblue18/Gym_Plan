import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { AuthProvider } from '@/components/auth-provider';
import './globals.css';

// Fonts are referenced by name in globals.css (@theme inline).
// The underscore prefix silences the "unused variable" lint warning while
// still registering the font with Next.js for preload link injection.
const _geist     = Geist({ subsets: ['latin'] });
const _geistMono = Geist_Mono({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Que',
  description:
    'Training log and calorie tracker — calendar, lifting, cardio & daily calorie budgeting.',
  icons: {
    icon: '/Que_logo.png',
    apple: '/Que_logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {/*
         * AuthProvider (Client Component) wraps the entire tree so that
         * useSession() is available in any descendant client component
         * — including the AuthHeader rendered inside app/page.tsx —
         * without requiring each component to fetch the session independently.
         *
         * SessionProvider does NOT break SSR: server-rendered children still
         * render synchronously; the session is hydrated on the client side.
         */}
        <AuthProvider>
          {children}
        </AuthProvider>

        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
