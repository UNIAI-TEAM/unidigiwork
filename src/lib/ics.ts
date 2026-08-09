// Xuất lịch theo chuẩn iCalendar (RFC 5545) từ dữ liệu sự kiện của Calendar.
export type IcsEvent = {
  id: string;
  title: string;
  kind: "meeting" | "task" | "deadline";
  at: string; // ISO
  endAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  /** Trạng thái sự kiện (map sang STATUS của RFC 5545) */
  status?: "confirmed" | "tentative" | "cancelled" | null;
  /** Link tham gia / xem chi tiết */
  url?: string | null;
  /** Danh sách người tham dự (tên hiển thị) */
  attendees?: string[];
  /** Nhãn phân loại thêm */
  categories?: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");

function toUtcStamp(iso: string) {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
function toDateStamp(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

export function buildIcs(events: IcsEvent[], calendarName = "UNIWORK"): string {
  const now = toUtcStamp(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UNIWORK//Calendar//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const e of events) {
    const uid = `${e.id.replace(/[^\w:.-]/g, "-")}@uniwork`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    if (e.allDay) {
      const start = toDateStamp(e.at);
      const endDate = new Date(e.endAt ?? e.at);
      endDate.setDate(endDate.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${toDateStamp(endDate.toISOString())}`);
    } else {
      lines.push(`DTSTART:${toUtcStamp(e.at)}`);
      const end = e.endAt ?? new Date(new Date(e.at).getTime() + 60 * 60 * 1000).toISOString();
      lines.push(`DTEND:${toUtcStamp(end)}`);
    }
    const prefix = e.kind === "meeting" ? "[Họp] " : e.kind === "deadline" ? "[Hạn chót] " : "[Công việc] ";
    lines.push(`SUMMARY:${escapeText(prefix + e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${escapeText(e.url)}`);
    if (e.status) lines.push(`STATUS:${e.status.toUpperCase()}`);
    const categories = [
      e.kind === "meeting" ? "Họp" : e.kind === "deadline" ? "Hạn chót" : "Công việc",
      ...(e.categories ?? []),
    ];
    lines.push(`CATEGORIES:${categories.map(escapeText).join(",")}`);
    for (const a of e.attendees ?? []) {
      lines.push(`ATTENDEE;CN=${escapeText(a)};ROLE=REQ-PARTICIPANT:invalid:nomail`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
