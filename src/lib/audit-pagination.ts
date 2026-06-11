import { useState, useCallback } from "react";

/**
 * Pure reducer-style helpers for the audit dialog pagination state.
 * Centralised so the invariant "page resets to 1 whenever the keyword
 * changes" is enforced in one place and can be unit-tested in isolation
 * from the (large) workspace route component.
 */
export type AuditPaginationState = {
  keyword: string;
  page: number;
};

export const initialAuditPaginationState: AuditPaginationState = {
  keyword: "",
  page: 1,
};

/** Apply a new keyword value. Always resets page to 1. */
export function applyKeywordChange(
  state: AuditPaginationState,
  value: string,
): AuditPaginationState {
  return { ...state, keyword: value, page: 1 };
}

/** Clear the keyword. Always resets page to 1. */
export function applyClearKeyword(
  state: AuditPaginationState,
): AuditPaginationState {
  return { ...state, keyword: "", page: 1 };
}

/** Change the current page without touching the keyword. */
export function applyPageChange(
  state: AuditPaginationState,
  page: number,
): AuditPaginationState {
  return { ...state, page: Math.max(1, page) };
}

/**
 * React hook wrapper used by the audit dialog. Exposes the same surface
 * (`updateKeyword`, `clearKeyword`, `setPage`) the component already uses
 * so the keyword/page invariant can never drift between callers.
 */
export function useAuditPagination(
  initial: AuditPaginationState = initialAuditPaginationState,
) {
  const [state, setState] = useState<AuditPaginationState>(initial);

  const updateKeyword = useCallback((value: string) => {
    setState((prev) => applyKeywordChange(prev, value));
  }, []);

  const clearKeyword = useCallback(() => {
    setState((prev) => applyClearKeyword(prev));
  }, []);

  const setPage = useCallback((page: number) => {
    setState((prev) => applyPageChange(prev, page));
  }, []);

  return {
    keyword: state.keyword,
    page: state.page,
    updateKeyword,
    clearKeyword,
    setPage,
  };
}