import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Home Media & File Hub',
  description: 'Stream movies and download files across your home Wi-Fi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

