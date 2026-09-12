'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys, scenariosApi } from '@/shared/api';

/** Named surroundings profiles. Static on the server, so cached for the session. */
export function useSiteProfiles() {
  return useQuery({
    queryKey: queryKeys.siteProfiles,
    queryFn: () => scenariosApi.siteProfiles(),
    staleTime: Infinity,
  });
}
