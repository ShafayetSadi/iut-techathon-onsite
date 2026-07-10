import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vantage Dry Run — Stylus Arm Simulator',
  description:
    'Browser-based 6-DOF stylus-arm simulation & control suite. URDF viewer, live dashboard, and 6-key test panel.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
