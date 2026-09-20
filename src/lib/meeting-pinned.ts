// Ghim cuộc họp vừa tạo lên đầu danh sách ở trang /meeting.
//
// Danh sách phòng họp sắp xếp theo giờ bắt đầu (mặc định "Sớm nhất trước") và
// phân trang 20 dòng, nên cuộc họp vừa lên lịch — thường bắt đầu muộn hơn mọi
// cuộc họp đang có — rơi xuống cuối, thậm chí sang trang sau, làm người dùng
// tưởng tạo hỏng. Phần ghim chỉ đổi cách hiển thị: dữ liệu vẫn lấy từ server,
// chỉ nhấc lên đầu trang 1 và bỏ bản trùng trong danh sách.
//
// Tách khỏi component để kiểm thử được: quyết định "có ghim không" là hàm thuần.

export type PinnableMeeting = {
  id: string;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  workspace_id: string;
  deleted_at?: string | null;
};

export type RoomFilterState = "all" | "live" | "upcoming" | "ended";

export type RoomFilters = {
  workspaceId?: string | undefined;
  search: string;
  state: RoomFilterState;
  /** Khoảng ngày yyyy-mm-dd đang lọc, nếu có. */
  from?: string | undefined;
  to?: string | undefined;
  page: number;
};

/**
 * Cuộc họp được ghim chỉ hiện khi nó vốn đã thuộc kết quả của bộ lọc đang bật —
 * nếu không, người dùng đang tìm "sprint" lại thấy một cuộc họp không khớp nằm
 * chình ình ở đầu. Điều kiện ở đây phải khớp với truy vấn server trong
 * `listMyMeetingRooms` / `listMeetings`.
 */
export function matchesRoomFilters(
  m: PinnableMeeting,
  f: RoomFilters,
  now: number = Date.now(),
): boolean {
  if (m.deleted_at) return false;
  if (f.workspaceId && m.workspace_id !== f.workspaceId) return false;
  if (f.search && !m.title?.toLowerCase().includes(f.search.toLowerCase())) return false;

  const startedAt = new Date(m.start_at).getTime();
  if (f.from && startedAt < new Date(`${f.from}T00:00:00`).getTime()) return false;
  if (f.to && startedAt > new Date(`${f.to}T23:59:59.999`).getTime()) return false;

  if (f.state === "live") return m.status === "live";
  if (f.state === "upcoming") return m.status === "scheduled" && startedAt > now;
  if (f.state === "ended") return m.status === "ended" || m.status === "canceled";
  return m.status === "scheduled" || m.status === "live";
}

/**
 * Danh sách ghim để hiển thị: chỉ ở trang 1 (trang sau mà vẫn ghim thì thứ tự
 * phân trang không còn nghĩa lý gì), bỏ bản chưa tải xong và bỏ id trùng.
 */
export function pinnedRoomsForView(
  candidates: ReadonlyArray<PinnableMeeting | undefined | null>,
  f: RoomFilters,
  now: number = Date.now(),
): PinnableMeeting[] {
  if (f.page !== 1) return [];
  const seen = new Set<string>();
  const out: PinnableMeeting[] = [];
  for (const m of candidates) {
    if (!m || seen.has(m.id)) continue;
    if (!matchesRoomFilters(m, f, now)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** Bỏ khỏi danh sách server những dòng đã được ghim lên đầu, tránh hiện hai lần. */
export function withoutPinned<T extends { id: string }>(
  rows: ReadonlyArray<T>,
  pinned: ReadonlyArray<{ id: string }>,
): T[] {
  if (pinned.length === 0) return rows as T[];
  const pinnedIds = new Set(pinned.map((m) => m.id));
  return rows.filter((r) => !pinnedIds.has(r.id));
}
