// Đường vào của khách ngoài: đổi link chia sẻ lấy vé LiveKit, không cần tài
// khoản nền tảng. Xem docs/superpowers/specs/2026-09-20-meeting-guest-link-design.md.
//
// Đây là những server fn DUY NHẤT của hệ thống cố ý KHÔNG có
// `requireSupabaseAuth`. Chúng chạy dưới role `anon` và mọi kiểm tra thẩm quyền
// nằm trong hai RPC SECURITY DEFINER. Không thêm truy vấn bảng nào vào file này.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ApiError } from "@/contracts/errors";
import { mapPgError } from "./business.server";
import { GUEST_NAME_MAX, normalizeGuestName, type GuestRedeemStatus } from "@/lib/meeting-guest";
import { callPendingRpc } from "./pending-rpc.server";

/** Token link mời và token phiên khách đều là 64 ký tự hex (hai uuid nối lại). */
const opaqueTokenSchema = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/, "token: allowed chars A-Za-z0-9._-");

type RedeemResult = {
  status: GuestRedeemStatus;
  guest_id?: string;
  session_token?: string;
  meeting_id?: string;
  title?: string;
  display_name?: string;
};

/**
 * Bước 1 — tốn một lượt `used_count` của link. Trả về phiên khách; KHÔNG trả vé
 * LiveKit, vì vé chỉ sống 15 phút còn cuộc họp thì dài hơn thế.
 */
export const joinMeetingAsGuest = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        token: opaqueTokenSchema,
        displayName: z
          .string()
          .min(1)
          .max(GUEST_NAME_MAX * 2),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAnon } = await import("./supabase-anon.server");
    const res = await callPendingRpc<RedeemResult>(supabaseAnon(), "redeem_meeting_guest_link", {
      _token: data.token,
      _display_name: normalizeGuestName(data.displayName),
    });
    if (res.error) mapPgError(res.error, "MEETING_ACCESS_DENIED");
    return res.data ?? ({ status: "invalid" } as RedeemResult);
  });

type GuestTicket = {
  serverUrl: string;
  token: string;
  roomName: string;
  participantIdentity: string;
  displayName: string;
  expiresAt: string;
  meetingId: string;
  title: string;
};

/**
 * Bước 2 — KHÔNG tốn lượt. Khách gọi lại mỗi lần vé hết hạn hoặc rớt mạng, nên
 * nếu bước này cũng tiêu `used_count` thì một link "1 lượt" chỉ trụ được 15 phút.
 */
export const refreshGuestJoinToken = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ sessionToken: opaqueTokenSchema }).parse(i))
  .handler(async ({ data }): Promise<GuestTicket> => {
    const { readLiveKitConfig, signJoinToken, fingerprint } = await import("./livekit.server");
    const config = readLiveKitConfig();
    if (!config)
      throw new ApiError({
        code: "CONFERENCE_PROVIDER_UNAVAILABLE",
        message: "LiveKit is not configured",
      });

    const ttlSeconds = 900;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const { supabaseAnon } = await import("./supabase-anon.server");
    const anon = supabaseAnon();

    // Vân tay điền sau khi ký, giống đường nội bộ: gate phải ghi vết trong cùng
    // transaction với lúc quyết định cho vào, trước khi có token để băm.
    const gate = await callPendingRpc<{
      status: string;
      guest_id?: string;
      meeting_id?: string;
      display_name?: string;
      room_name?: string;
      title?: string;
    }>(anon, "issue_meeting_guest_token", {
      _session_token: data.sessionToken,
      _token_fingerprint: "pending",
      _expires_at: expiresAt.toISOString(),
    });
    if (gate.error) mapPgError(gate.error, "MEETING_ACCESS_DENIED");

    const info = gate.data ?? { status: "invalid" };
    if (info.status !== "ok" || !info.guest_id || !info.room_name)
      throw new ApiError({
        code: "MEETING_ACCESS_DENIED",
        message: info.status.toUpperCase(),
      });

    // Danh tính do server đặt, không lấy từ client — cùng luật với đường nội bộ.
    const identity = `guest:${info.guest_id}`;
    let signed: { token: string; expiresAt: Date };
    try {
      signed = await signJoinToken({
        config,
        identity,
        // Nhãn "(khách)" ký thẳng vào vé nên người trong phòng luôn phân biệt
        // được ai là người ngoài, kể cả khi khách tự đặt tên trùng người thật.
        name: `${info.display_name ?? "Khách"} (khách)`,
        room: info.room_name,
        role: "participant",
        ttlSeconds,
      });
    } catch {
      throw new ApiError({ code: "MEETING_TOKEN_ISSUE_FAILED", message: "Failed to sign token" });
    }

    try {
      await callPendingRpc<null>(anon, "record_meeting_guest_token_fingerprint", {
        _session_token: data.sessionToken,
        _token_fingerprint: await fingerprint(signed.token),
      });
    } catch (err) {
      // Vết audit đã ghi ở gate; hỏng ở bước hoàn thiện vân tay không được chặn
      // khách vào phòng.
      console.error("[meetings] record_meeting_guest_token_fingerprint failed", err);
    }

    return {
      serverUrl: config.url,
      token: signed.token,
      roomName: info.room_name,
      participantIdentity: identity,
      displayName: info.display_name ?? "",
      expiresAt: signed.expiresAt.toISOString(),
      meetingId: info.meeting_id ?? "",
      title: info.title ?? "",
    };
  });
