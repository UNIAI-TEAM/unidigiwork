import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  applyClearKeyword,
  applyKeywordChange,
  applyPageChange,
  initialAuditPaginationState,
  useAuditPagination,
} from "./audit-pagination";

describe("audit pagination reducer", () => {
  it("resets page to 1 when the keyword changes from a deep page", () => {
    const state = { keyword: "", page: 7 };
    const next = applyKeywordChange(state, "milestone-1");
    expect(next).toEqual({ keyword: "milestone-1", page: 1 });
  });

  it("resets page to 1 when the keyword is updated again on a non-first page", () => {
    let state = applyKeywordChange({ keyword: "", page: 1 }, "foo");
    state = applyPageChange(state, 5);
    expect(state.page).toBe(5);
    state = applyKeywordChange(state, "bar");
    expect(state).toEqual({ keyword: "bar", page: 1 });
  });

  it("resets page to 1 when the keyword is cleared from a deep page", () => {
    const state = { keyword: "doc-xyz", page: 12 };
    const next = applyClearKeyword(state);
    expect(next).toEqual({ keyword: "", page: 1 });
  });

  it("clamps page changes to a minimum of 1", () => {
    expect(applyPageChange({ keyword: "", page: 1 }, 0).page).toBe(1);
    expect(applyPageChange({ keyword: "", page: 1 }, -3).page).toBe(1);
    expect(applyPageChange({ keyword: "", page: 1 }, 4).page).toBe(4);
  });

  it("does not mutate the previous state", () => {
    const state = { keyword: "a", page: 3 };
    applyKeywordChange(state, "b");
    applyClearKeyword(state);
    applyPageChange(state, 9);
    expect(state).toEqual({ keyword: "a", page: 3 });
  });
});

describe("useAuditPagination hook (integration)", () => {
  it("starts from the initial state", () => {
    const { result } = renderHook(() => useAuditPagination());
    expect(result.current.keyword).toBe(initialAuditPaginationState.keyword);
    expect(result.current.page).toBe(initialAuditPaginationState.page);
  });

  it("resets page to 1 when updateKeyword is called from a deep page", () => {
    const { result } = renderHook(() => useAuditPagination());
    act(() => result.current.setPage(8));
    expect(result.current.page).toBe(8);
    act(() => result.current.updateKeyword("alpha"));
    expect(result.current.keyword).toBe("alpha");
    expect(result.current.page).toBe(1);
  });

  it("resets page to 1 when keyword is cleared while on a non-first page", () => {
    const { result } = renderHook(() => useAuditPagination());
    act(() => result.current.updateKeyword("doc"));
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);
    act(() => result.current.clearKeyword());
    expect(result.current.keyword).toBe("");
    expect(result.current.page).toBe(1);
  });

  it("resets page on every successive keyword change", () => {
    const { result } = renderHook(() => useAuditPagination());
    for (const [kw, jumpTo] of [
      ["a", 3],
      ["ab", 6],
      ["abc", 9],
    ] as const) {
      act(() => result.current.updateKeyword(kw));
      expect(result.current.page).toBe(1);
      act(() => result.current.setPage(jumpTo));
      expect(result.current.page).toBe(jumpTo);
    }
    act(() => result.current.clearKeyword());
    expect(result.current.page).toBe(1);
    expect(result.current.keyword).toBe("");
  });
});