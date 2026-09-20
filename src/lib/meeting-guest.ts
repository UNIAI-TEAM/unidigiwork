// Khách ngoài vào họp bằng link chia sẻ — phần logic thuần.
//
// Dùng chung giữa route khách và server fn, nên không import gì của React hay
// Supabase. Server là nơi quyết định cuối cùng; những hàm ở đây chỉ để client
// báo lỗi ngay tại chỗ và để dịch mã trạng thái do RPC trả về thành thông điệp.

export const GUEST_NAME_MIN = 2;
export const GUEST_NAME_MAX = 80;

/** Trạng thái `redeem_meeting_guest_link` trả về. Giữ khớp với RPC. */
export type GuestRedeemStatus =
  | "joined"
  | "invalid"
  | "invalid_name"
  | "guests_not_allowed"
  | "revoked"
  | "expired"
  | "exhausted"
  | "not_joinable";

/** Trạng thái `issue_meeting_guest_token` trả về. */
export type GuestTicketStatus = "ok" | "invalid" | "revoked" | "expired" | "not_joinable";

export type GuestNameError = "too_short" | "too_long";

/**
 * Gộp khoảng trắng và cắt hai đầu. Tên khách hiện thẳng trên tile video của
 * mọi người trong phòng, nên "  Nguyễn   Văn  A  " phải thành "Nguyễn Văn A".
 */
export function normalizeGuestName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** null = hợp lệ. Cùng luật với `redeem_meeting_guest_link`. */
export function guestNameError(raw: string): GuestNameError | null {
  const name = normalizeGuestName(raw);
  if (name.length < GUEST_NAME_MIN) return "too_short";
  if (name.length > GUEST_NAME_MAX) return "too_long";
  return null;
}

/**
 * Link nội bộ phải im lặng như thể không tồn tại với người ngoài: gộp
 * `guests_not_allowed` chung một thông điệp với `invalid` để người dò link
 * không phân biệt được "link có thật nhưng không cho khách" với "link bịa".
 */
export function isGuestLinkUsable(status: GuestRedeemStatus): boolean {
  return status === "joined";
}

/** Mã thông điệp cho người dùng, đã gộp các trạng thái không được lộ ra. */
export type GuestRedeemMessage =
  | "invalid"
  | "invalid_name"
  | "revoked"
  | "expired"
  | "exhausted"
  | "not_joinable";

export function guestRedeemMessage(status: GuestRedeemStatus): GuestRedeemMessage | null {
  if (status === "joined") return null;
  if (status === "guests_not_allowed") return "invalid";
  return status;
}

/**
 * Khoá sessionStorage giữ phiên khách. Theo từng cuộc họp: mở hai phòng ở hai
 * tab thì mỗi tab phải giữ phiên riêng của nó.
 */
export function guestSessionKey(meetingId: string): string {
  return `uniwork.guest.session.${meetingId}`;
}

/** LiveKit identity của khách. Tiền tố để phân biệt với uuid người nội bộ. */
export function guestIdentity(guestId: string): string {
  return `guest:${guestId}`;
}

export function isGuestIdentity(identity: string): boolean {
  return identity.startsWith("guest:");
}
