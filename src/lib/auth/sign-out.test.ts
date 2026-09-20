// Đăng xuất phải luôn xoá được phiên, kể cả khi máy chủ từ chối.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const signOut = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: (...args: unknown[]) => signOut(...args) } },
}));

const { performSignOut } = await import("./sign-out");

describe("performSignOut", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("xoá phiên Supabase và dọn cache truy vấn", async () => {
    signOut.mockResolvedValue({ error: null });
    const clear = vi.fn();
    await performSignOut({ clear } as never);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("rơi về đăng xuất cục bộ khi máy chủ trả lỗi", async () => {
    signOut
      .mockResolvedValueOnce({ error: { message: "boom", status: 500 } })
      .mockResolvedValueOnce({ error: null });
    const clear = vi.fn();
    await performSignOut({ clear } as never);
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("không ném lỗi khi mất mạng, vẫn dọn cache", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    const clear = vi.fn();
    await expect(performSignOut({ clear } as never)).resolves.toBeUndefined();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe("nút Đăng xuất trên AppTopbar", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("gọi thật hàm đăng xuất chứ không chỉ đóng menu", () => {
    const src = read("src/components/app-shell.tsx");
    const idx = src.indexOf("{/* Logout */}");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/onClick=\{handleSignOut\}/);
    expect(src).toMatch(/performSignOut/);
  });
});
