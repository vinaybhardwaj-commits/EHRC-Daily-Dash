import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EHRC Daily Dashboard',
  description: 'Even Hospital Race Course Road — Daily Morning Meeting Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
