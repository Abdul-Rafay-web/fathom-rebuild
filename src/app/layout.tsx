import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import { MotionProvider } from '@/components/MotionProvider';
import './globals.css';

// Self-hosted (SIL Open Font License): no build-time or runtime dependency on
// Google Fonts, no third-party requests from readers' browsers.
const display = localFont({ src: '../fonts/Gloock.woff2', weight: '400', variable: '--font-disp', display: 'swap' });
const ui = localFont({
  src: [
    { path: '../fonts/HostGrotesk.woff2', weight: '300 800', style: 'normal' },
    { path: '../fonts/HostGrotesk-Italic.woff2', weight: '300 800', style: 'italic' },
  ],
  variable: '--font-ui',
  display: 'swap',
});
const read = localFont({
  src: [
    { path: '../fonts/Newsreader.woff2', weight: '200 800', style: 'normal' },
    { path: '../fonts/Newsreader-Italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-read',
  display: 'swap',
});
const code = localFont({ src: '../fonts/FragmentMono.woff2', weight: '400', variable: '--font-code', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Afterword: meeting notes you can trust', template: '%s · Afterword' },
  description: 'AI meeting notes where every line cites the moment it was said. Search, share and act on your meetings.',
  applicationName: 'Afterword',
};

export const viewport: Viewport = { themeColor: '#22182a' };

// Applies a saved theme before first paint (no flash). Light is the default.
const themeScript = `try{var t=localStorage.getItem('aw-theme');if(t==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${read.variable} ${code.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
