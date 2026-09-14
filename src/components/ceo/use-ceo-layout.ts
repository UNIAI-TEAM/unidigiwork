// Hook đọc/ghi bố cục CEO Command Center (dùng chung server fn với Dashboard/Home).
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardPrefs, saveDashboardPrefs } from "@/lib/api/dashboard-prefs.functions";
import { saveLayoutSnapshot } from "@/lib/api/layout-history.functions";
import {
  DEFAULT_CEO_PREFS,
  readCeoPrefs,
  writeCeoPrefs,
  type CeoLayoutPrefs,
} from "@/lib/ceo-layout-prefs";

const KEY = ["dashboard-prefs"] as const;
export const CEO_HISTORY_KEY = ["layout-history", "ceo"] as const;

export function useCeoLayout() {
  const qc = useQueryClient();
  const load = useServerFn(getDashboardPrefs);
  const save = useServerFn(saveDashboardPrefs);
  const snapshot = useServerFn(saveLayoutSnapshot);

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
    staleTime: 5 * 60_000,
  });

  const prefs = useMemo(
    () =>
      query.data
        ? readCeoPrefs(query.data.sections ?? null, query.data.order ?? null)
        : DEFAULT_CEO_PREFS,
    [query.data],
  );

  const mutation = useMutation({
    mutationFn: async (next: CeoLayoutPrefs) => {
      const payload = writeCeoPrefs(
        next,
        query.data?.sections ?? null,
        query.data?.order ?? null,
      );
      await save({ data: payload });
      try {
        await snapshot({ data: { scope: "ceo" as const, prefs: JSON.stringify(next) } });
      } catch {
        /* lịch sử không chặn việc lưu bố cục */
      }
      return payload;
    },
    onMutate: async (next: CeoLayoutPrefs) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<{
        sections: Record<string, boolean> | null;
        order: string[] | null;
      }>(KEY);
      const optimistic = writeCeoPrefs(next, previous?.sections ?? null, previous?.order ?? null);
      qc.setQueryData(KEY, { sections: optimistic.sections, order: optimistic.order });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CEO_HISTORY_KEY });
    },
  });

  const update = useCallback((next: CeoLayoutPrefs) => mutation.mutate(next), [mutation]);
  const reset = useCallback(() => mutation.mutate(DEFAULT_CEO_PREFS), [mutation]);

  return { prefs, saving: mutation.isPending, update, reset };
}
