'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, variantsApi, type Variant, type VariantCreate } from '@/shared/api';

export function useVariants() {
  return useQuery({
    queryKey: queryKeys.variants,
    queryFn: () => variantsApi.list(),
    staleTime: 30_000,
  });
}

const pendingVariant = (input: VariantCreate): Variant => ({
  id: `pending_${input.name}`,
  name: input.name,
  note: input.note ?? null,
  scenario_id: input.scenario_id ?? null,
  scenario_title: input.scenario_id ?? '',
  config: input.config ?? {},
  strategy: input.strategy ?? 'min_hops',
  created_at: new Date().toISOString(),
  worst_availability: 0,
  mean_availability: 0,
  meets_target: false,
  max_bounded_outage_s: 0,
  availability_by_client: {},
  environment_modified: false,
});

export function useSaveVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: VariantCreate) => variantsApi.create(input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.variants });
      const previous = queryClient.getQueryData<Variant[]>(queryKeys.variants);

      queryClient.setQueryData<Variant[]>(queryKeys.variants, (current = []) => [
        pendingVariant(input),
        ...current,
      ]);

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.variants, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.variants });
    },
  });
}

export function useDeleteVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variantId: string) => variantsApi.remove(variantId),

    onMutate: async (variantId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.variants });
      const previous = queryClient.getQueryData<Variant[]>(queryKeys.variants);

      queryClient.setQueryData<Variant[]>(queryKeys.variants, (current = []) =>
        current.filter((variant) => variant.id !== variantId),
      );

      return { previous };
    },

    onError: (_error, _variantId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.variants, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.variants });
    },
  });
}

export function useComparison(variantIds: string[]) {
  return useQuery({
    queryKey: queryKeys.comparison(variantIds),
    queryFn: () => variantsApi.compare(variantIds),
    enabled: variantIds.length >= 2,
    staleTime: 60_000,
  });
}
