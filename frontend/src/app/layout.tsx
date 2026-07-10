import type { Metadata } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['italic', 'normal'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vantage Dry Run — Stylus Arm Simulator',
  description:
    'Browser-based 6-DOF stylus-arm simulation & control suite. URDF viewer, live dashboard, and 6-key test panel.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
