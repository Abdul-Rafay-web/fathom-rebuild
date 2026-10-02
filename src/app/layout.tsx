import type { Metadata, Viewport } from 'next';
import { Fragment_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import './globals.css';

const read = Newsreader({ subsets: ['latin'], variable: '--font-read', axes: ['opsz'], style: ['normal', 'italic'] });
const ui = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-ui' });
const code = Fragment_Mono({ subsets: ['latin'], weight: '400', variable: '--font-code' });

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
