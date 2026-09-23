import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SKYWATCH',
  description: 'ADS-B radar console for the airspace over your house.',
};

export const viewport: Viewport = {
  themeColor: '#04080a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Spline+Sans+Mono:wght@300..700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
