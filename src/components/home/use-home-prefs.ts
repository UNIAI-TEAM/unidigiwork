// Hook đọc/ghi tuỳ biến Home (dùng chung server fn với Dashboard).
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getDashboardPrefs,
  saveDashboardPrefs,
} from "@/lib/api/dashboard-prefs.functions";
import {
  DEFAULT_HOME_PREFS,
  readHomePrefs,
  writeHomePrefs,
  type HomePrefs,
} from "@/lib/home-prefs";

const KEY = ["dashboard-prefs"] as const;

export function useHomePrefs() {
  const qc = useQueryClient();
  const load = useServerFn(getDashboardPrefs);
  const save = useServerFn(saveDashboardPrefs);

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
    staleTime: 5 * 60_000,
  });

  const prefs = useMemo(
    () =>
      query.data
        ? readHomePrefs(query.data.sections ?? null, query.data.order ?? null)
        : DEFAULT_HOME_PREFS,
    [query.data],
  );

  const mutation = useMutation({
    mutationFn: async (next: HomePrefs) => {
      const payload = writeHomePrefs(
        next,
        query.data?.sections ?? null,
        query.data?.order ?? null,
      );
      await save({ data: payload });
      return payload;
    },
    onMutate: async (next: HomePrefs) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<{
        sections: Record<string, boolean> | null;
        order: string[] | null;
      }>(KEY);
      const optimistic = writeHomePrefs(
        next,
        previous?.sections ?? null,
        previous?.order ?? null,
      );
      qc.setQueryData(KEY, { sections: optimistic.sections, order: optimistic.order });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
  });

  const update = useCallback((next: HomePrefs) => mutation.mutate(next), [mutation]);
  const reset = useCallback(() => mutation.mutate(DEFAULT_HOME_PREFS), [mutation]);

  return {
    prefs,
    loading: query.isLoading,
    saving: mutation.isPending,
    update,
    reset,
  };
}
