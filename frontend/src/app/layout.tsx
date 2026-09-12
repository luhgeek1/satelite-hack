import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, isLanguage } from '@/shared/i18n/language';
import { en, ru } from '@/shared/i18n/dictionary';
import { Providers } from './providers';
import './globals.css';

/** Undefined when the visitor has not chosen yet, so the client can migrate a
 *  choice it may still hold from before the cookie existed. */
const readLanguage = async () => {
  const store = await cookies();
  const value = store.get(LANGUAGE_COOKIE)?.value;
  return isLanguage(value) ? value : undefined;
};

export async function generateMetadata(): Promise<Metadata> {
  const table = (await readLanguage()) === 'en' ? en : ru;
  return { title: table['meta.title'], description: table['meta.description'] };
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The document arrives in the chosen language: the server knows it from the
  // cookie, so nothing is painted in one language and swapped to the other.
  const language = await readLanguage();

  return (
    <html lang={language ?? DEFAULT_LANGUAGE}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers language={language}>{children}</Providers>
      </body>
    </html>
  );
}
