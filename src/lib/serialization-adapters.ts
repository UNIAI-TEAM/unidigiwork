// Giữ mã lỗi ổn định (Blueprint §12) khi lỗi đi từ server function về client.
//
// TanStack Start serialize mọi Error bằng ShallowErrorPlugin — plugin này chỉ
// giữ lại `message` và dựng lại thành `new Error(...)`. Hậu quả: `code`,
// `correlationId`, `details` của ApiError bị mất và `e instanceof ApiError` luôn
// false ở client, nên UI rơi về "INTERNAL_ERROR" cho mọi lỗi.
//
// Adapter dưới đây được đăng ký trong `src/start.ts` và được xếp TRƯỚC các
// plugin mặc định, nên ApiError được khôi phục nguyên vẹn ở phía client.
import { createSerializationAdapter } from "@tanstack/router-core";
import { ApiError, STABLE_ERROR_CODES, type StableErrorCode } from "@/contracts/errors";

interface SerializedApiError {
  code: string;
  message: string;
  correlationId?: string;
  details?: string;
}

const isStableErrorCode = (value: string): value is StableErrorCode =>
  (STABLE_ERROR_CODES as readonly string[]).includes(value);

export const apiErrorSerializationAdapter = createSerializationAdapter({
  key: "uniwork/ApiError",
  test: (value): value is ApiError => value instanceof ApiError,
  toSerializable: (error): SerializedApiError => ({
    code: error.code,
    message: error.message,
    ...(error.correlationId ? { correlationId: error.correlationId } : {}),
    // `details` do server tạo nên luôn là JSON thuần; stringify để không phụ
    // thuộc vào việc seroval có serialize được từng giá trị bên trong hay không.
    ...(error.details ? { details: JSON.stringify(error.details) } : {}),
  }),
  fromSerializable: (value) =>
    new ApiError({
      code: isStableErrorCode(value.code) ? value.code : "INTERNAL_ERROR",
      message: value.message,
      correlationId: value.correlationId,
      details: value.details ? (JSON.parse(value.details) as Record<string, unknown>) : undefined,
    }),
});

export const serializationAdapters = [apiErrorSerializationAdapter] as const;
