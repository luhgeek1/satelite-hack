'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys, scenariosApi } from '@/shared/api';


export function useSiteProfiles() {
  return useQuery({
    queryKey: queryKeys.siteProfiles,
    queryFn: () => scenariosApi.siteProfiles(),
    staleTime: Infinity,
  });
}
