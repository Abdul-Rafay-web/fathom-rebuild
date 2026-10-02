import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import './globals.css';

// Self-hosted (SIL Open Font License): no build-time or runtime dependency on
// Google Fonts, no third-party requests from readers' browsers.
const read = localFont({
  src: [
    { path: '../fonts/Newsreader.woff2', weight: '200 800', style: 'normal' },
    { path: '../fonts/Newsreader-Italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-read',
  display: 'swap',
});
const ui = localFont({ src: '../fonts/SchibstedGrotesk.woff2', weight: '400 900', variable: '--font-ui', display: 'swap' });
const code = localFont({ src: '../fonts/FragmentMono.woff2', weight: '400', variable: '--font-code', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Afterword', template: '%s · Afterword' },
  description: 'Meeting notes you can verify, search and share. Every line cites the moment it came from.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3efe6' },
    { media: '(prefers-color-scheme: dark)', color: '#121411' },
  ],
};

// Applies a saved theme before first paint (no flash of the wrong theme).
const themeScript = `try{var t=localStorage.getItem('aw-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${read.variable} ${ui.variable} ${code.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
        {children}
      </body>
    </html>
  );
}
