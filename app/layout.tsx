import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import NavWrapper from '../components/NavWrapper';
import NetworkBanner from '../components/NetworkBanner';
import SplashWrapper from '../components/SplashWrapper';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'FitStreak — Habit Tracker',
  description: 'Daily fitness habit tracker. Build discipline, one day at a time.',
  manifest: '/manifest.json',
  icons: {
    icon:     '/discipline-icon.png',
    shortcut: '/discipline-icon.png',
    apple:    '/discipline-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="/discipline-icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/discipline-icon.png" />
      </head>
      <body className={`min-h-screen bg-[#0f172a] antialiased ${inter.variable} font-sans`}>
        {/* Offline indicator + sync status — rendered globally, zero flicker */}
        <NetworkBanner />

        {/* Page content */}
        {children}

        {/* Bottom navigation (hidden during onboarding) */}
        <NavWrapper />

        {/* Launch splash — shown once per session, lazy-loaded */}
        <SplashWrapper />
      </body>
    </html>
  );
}
