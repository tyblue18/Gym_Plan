import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { AuthProvider } from '@/components/auth-provider';
import { AppProvider }  from '@/lib/AppContext';
import { SWRegister }  from '@/components/sw-register';
import GlowMount       from '@/components/GlowMount';
import './globals.css';

const _geist     = Geist({ subsets: ['latin'] });
const _geistMono = Geist_Mono({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Que',
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
  themeColor: '#04050f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <AppProvider>
            {/* Ambient status glow — client-only via GlowMount */}
            <GlowMount />
            {children}
          </AppProvider>
        </AuthProvider>

        {/* Service worker — registered after page load, production + dev */}
        <SWRegister />

        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
