// AI CONTEXT ENGINE V1 — hiểu câu hỏi bằng luật deterministic (KHÔNG gọi LLM).
import type { AiContextEntityType } from "./contracts";

export interface QueryIntent {
  entityHints: AiContextEntityType[];
  timeRange: { from: string; to: string; label: string } | null;
  wantsBlockers: boolean;
  wantsCommunication: boolean;
  wantsCounts: boolean;
  wantsLatestMeeting: boolean;
}

const ENTITY_TERMS: Array<[RegExp, AiContextEntityType]> = [
  [/\b(dự án|du an|project|workspace)\b/i, "WORKSPACE"],
  [/\b(task|công việc|cong viec|việc|đầu việc)\b/i, "TASK"],
  [/\b(cuộc họp|cuoc hop|họp|meeting)\b/i, "MEETING"],
  [/\b(email|thư|mail)\b/i, "EMAIL"],
  [/\b(tài liệu|tai lieu|document|file)\b/i, "DOCUMENT"],
  [/\b(chat|tin nhắn|tin nhan|kênh|channel)\b/i, "CHAT_CHANNEL"],
  [/\b(người|nhân sự|thành viên|people|member)\b/i, "PERSON"],
];

/** Ngày local của user (timezone truyền vào, không dùng UTC naive). */
function startOfLocalDay(now: Date, timeZone: string, offsetDays = 0): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + offsetDays));
  // Bù chênh lệch giữa UTC midnight và midnight theo timezone.
  const probe = new Date(local.toISOString());
  const tzOffsetMs = probe.getTime() - new Date(probe.toLocaleString("en-US", { timeZone })).getTime();
  return new Date(local.getTime() + tzOffsetMs);
}

export function parseQueryIntent(
  query: string,
  timeZone = "Asia/Ho_Chi_Minh",
  now: Date = new Date(),
): QueryIntent {
  const q = query.toLowerCase();
  const entityHints = ENTITY_TERMS.filter(([re]) => re.test(q)).map(([, t]) => t);

  const range = (offsetDays: number, days: number, label: string) => {
    const from = startOfLocalDay(now, timeZone, offsetDays);
    const to = new Date(from.getTime() + days * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString(), label };
  };
  const dow = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
      .format(now)
      .replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, (d) => String(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d))),
  );
  const mondayOffset = -((dow + 6) % 7);

  let timeRange: QueryIntent["timeRange"] = null;
  if (/\b(hôm nay|hom nay|today)\b/.test(q)) timeRange = range(0, 1, "hôm nay");
  else if (/\b(hôm qua|hom qua|yesterday)\b/.test(q)) timeRange = range(-1, 1, "hôm qua");
  else if (/\b(tuần này|tuan nay|this week)\b/.test(q)) timeRange = range(mondayOffset, 7, "tuần này");
  else if (/\b(tuần trước|tuan truoc|last week)\b/.test(q)) timeRange = range(mondayOffset - 7, 7, "tuần trước");
  else if (/\b(7 ngày|7 ngay|last 7 days)\b/.test(q)) timeRange = range(-7, 8, "7 ngày qua");
  else if (/\b(30 ngày|30 ngay|last 30 days|tháng qua)\b/.test(q)) timeRange = range(-30, 31, "30 ngày qua");

  return {
    entityHints,
    timeRange,
    wantsBlockers: /\b(vướng|vuong|chặn|chan|blocker|blocked|quá hạn|qua han|overdue|trễ|tre|rủi ro)\b/.test(q),
    wantsCommunication: /\b(trao đổi|trao doi|thảo luận|thao luan|communication|liên hệ|phản hồi|bàn)\b/.test(q),
    wantsCounts: /\b(bao nhiêu|bao nhieu|how many|số lượng|đếm)\b/.test(q),
    wantsLatestMeeting: /\b(gần nhất|gan nhat|mới nhất|latest|recent)\b/.test(q) && /\b(họp|meeting)\b/.test(q),
  };
}