'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/shared/api';
import { SessionProvider } from '@/entities/session';
import { TourProvider } from '@/features/guided-tour';
import { LanguageProvider, type Language } from '@/shared/i18n';

export function Providers({
  language,
  children,
}: {
  language: Language | undefined;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider language={language}>
        <SessionProvider>
          <TourProvider>{children}</TourProvider>
        </SessionProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
