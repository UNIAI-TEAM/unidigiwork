import { describe, it, expect } from "vitest";
import { makeSerovalPlugin, defaultSerovalPlugins } from "@tanstack/router-core";
import { toJSONAsync, fromJSON } from "seroval";
import { ApiError } from "@/contracts/errors";
import { serializationAdapters } from "./serialization-adapters";

// Cùng thứ tự plugin mà TanStack Start dùng cho server function RPC:
// adapter tuỳ biến đứng trước ShallowErrorPlugin (plugin này cắt Error chỉ còn `message`).
const plugins = [...serializationAdapters.map(makeSerovalPlugin), ...defaultSerovalPlugins];

async function roundTrip(value: unknown): Promise<unknown> {
  const json = await toJSONAsync(value, { plugins });
  return fromJSON(JSON.parse(JSON.stringify(json)), { plugins });
}

describe("serializationAdapters", () => {
  it("giữ nguyên mã lỗi ổn định khi ApiError đi qua ranh giới server function", async () => {
    const restored = await roundTrip(
      new ApiError({
        code: "CONFERENCE_PROVIDER_UNAVAILABLE",
        message: "LiveKit is not configured",
        correlationId: "corr-1",
        details: { hint: "LIVEKIT_URL" },
      }),
    );

    expect(restored).toBeInstanceOf(ApiError);
    const err = restored as ApiError;
    expect(err.code).toBe("CONFERENCE_PROVIDER_UNAVAILABLE");
    expect(err.message).toBe("LiveKit is not configured");
    expect(err.correlationId).toBe("corr-1");
    expect(err.details).toEqual({ hint: "LIVEKIT_URL" });
  });

  it("không đụng tới Error thường", async () => {
    const restored = await roundTrip(new Error("boom"));
    expect(restored).toBeInstanceOf(Error);
    expect(restored).not.toBeInstanceOf(ApiError);
    expect((restored as Error).message).toBe("boom");
  });
});
