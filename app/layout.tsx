import type { Metadata, Viewport } from 'next';
import { Anton, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { AuthProvider } from '@/components/auth-provider';
import { AppProvider }  from '@/lib/AppContext';
import { SWRegister }          from '@/components/sw-register';
import { ColorSchemeLoader }  from '@/components/color-scheme-loader';
import GlowMount       from '@/components/GlowMount';
import './globals.css';

// ── Type pairing: athletic condensed display + clean geometric sans + technical mono ──
const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Que / Athlete OS',
  description:
    'Training log and calorie tracker — calendar, lifting, cardio & daily calorie budgeting.',
  manifest: '/manifest.json',
  icons: {
    icon:  '/Que_logo.png',
    apple: '/Que_logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Que',
  },
};

export const viewport: Viewport = {
  themeColor: '#07080A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <body className="font-sans antialiased">
        <AuthProvider>
          <AppProvider>
            <GlowMount />
            {children}
          </AppProvider>
        </AuthProvider>

        <ColorSchemeLoader />
        <SWRegister />

        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
