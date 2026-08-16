import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const MINUTE = 60_000;

/**
 * Các list gần như tĩnh (đổi vài lần/ngày). Cache dài để giảm số request
 * client → API gateway/PostgREST khi tải cao.
 */
const LONG_LIVED_KEYS: Array<[readonly unknown[], number]> = [
  [["plans"], 15 * MINUTE],
  [["plan-features"], 15 * MINUTE],
  [["features"], 15 * MINUTE],
  [["pricing"], 15 * MINUTE],
  [["blog"], 10 * MINUTE],
  [["knowledge"], 10 * MINUTE],
  [["workflow-step-types"], 30 * MINUTE],
  [["workspaces"], 5 * MINUTE],
  [["workspace-members"], 5 * MINUTE],
  [["tenant-members"], 5 * MINUTE],
  [["saved-views"], 10 * MINUTE],
  [["workspace-tags"], 10 * MINUTE],
  [["notification-preferences"], 10 * MINUTE],
];

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Mặc định: coi dữ liệu còn tươi trong 60s, giữ cache 10 phút,
        // không refetch mỗi lần focus cửa sổ → ít request lặp lại.
        staleTime: MINUTE,
        gcTime: 10 * MINUTE,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  for (const [key, staleTime] of LONG_LIVED_KEYS) {
    queryClient.setQueryDefaults(key, { staleTime, gcTime: Math.max(staleTime, 15 * MINUTE) });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
