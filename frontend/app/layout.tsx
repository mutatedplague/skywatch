import type { Metadata, Viewport } from 'next';
import { bootScript } from '@/lib/themes';
import './globals.css';

export const metadata: Metadata = {
  title: 'SKYWATCH',
  description: 'ADS-B radar console for the airspace over your house.',
};

export const viewport: Viewport = {
  // The dark default; applyTheme keeps it in step with the chosen mode.
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The pre-paint script writes the stored look onto <html> before React
    // runs, so its attributes are expected not to match the server's.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
