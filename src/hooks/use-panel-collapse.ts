import { useCallback, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

const STORAGE_KEY = "uniwork:ai-panel-collapse";

type Store = Record<string, boolean>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Persist a panel's collapsed state per page (route id) so the layout
 * is restored on the next visit. SSR-safe: starts from `defaultCollapsed`
 * and hydrates the stored value in an effect.
 */
export function usePanelCollapse(panelId: string, defaultCollapsed = false) {
  const routeId = useRouterState({ select: (s) => s.matches.at(-1)?.routeId ?? "/" });
  const storageKey = `${routeId}::${panelId}`;
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);

  useEffect(() => {
    const stored = readStore()[storageKey];
    setCollapsedState(stored ?? defaultCollapsed);
  }, [storageKey, defaultCollapsed]);

  const setCollapsed = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setCollapsedState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        writeStore({ ...readStore(), [storageKey]: next });
        return next;
      });
    },
    [storageKey],
  );

  return [collapsed, setCollapsed] as const;
}
