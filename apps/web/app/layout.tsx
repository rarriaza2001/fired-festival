import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css';
import { PageShell } from '@/components/layout/page-shell';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: "Don't Go Blind",
  description:
    'Bounded skeptical review of a resource-intensive decision before you commit.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
