import { useCallback, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

const STORAGE_KEY = "uniwork:ai-panel-collapse";
const CHANGE_EVENT = "uniwork:ai-panel-collapse-change";

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

function dispatchChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
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
    const read = () => {
      const stored = readStore()[storageKey];
      setCollapsedState(stored ?? defaultCollapsed);
    };
    read();
    window.addEventListener(CHANGE_EVENT, read);
    return () => window.removeEventListener(CHANGE_EVENT, read);
  }, [storageKey, defaultCollapsed]);

  const setCollapsed = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setCollapsedState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        writeStore({ ...readStore(), [storageKey]: next });
        dispatchChange();
        return next;
      });
    },
    [storageKey],
  );

  return [collapsed, setCollapsed] as const;
}

/**
 * Batch controls for all AI panels on the current route. Expanding/collapsing
 * writes to localStorage and broadcasts the change so every `usePanelCollapse`
 * instance on the same page re-renders immediately.
 */
export function usePanelCollapseControls(panelIds: string[]) {
  const routeId = useRouterState({ select: (s) => s.matches.at(-1)?.routeId ?? "/" });

  const setAll = useCallback(
    (collapsed: boolean) => {
      const store = readStore();
      for (const panelId of panelIds) {
        store[`${routeId}::${panelId}`] = collapsed;
      }
      writeStore(store);
      dispatchChange();
    },
    [routeId, panelIds],
  );

  return {
    expandAll: useCallback(() => setAll(false), [setAll]),
    collapseAll: useCallback(() => setAll(true), [setAll]),
  };
}
