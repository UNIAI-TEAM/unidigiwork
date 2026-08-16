// HOME V2 — AI Brief: chỉ tóm tắt trên dữ liệu thật của chính user (grounding).
// Không có AI backend hoặc không có dữ liệu => trả về unavailable, KHÔNG sinh nội dung giả.
import { streamText } from "ai";
import { loadHomeSummary } from "./home.server";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

const MODEL = "openai/gpt-5.6-sol";

export type HomeAiBrief = {
  available: boolean;
  source: "ai" | "none";
  bullets: string[];
  facts: string[];
  reason: "OK" | "NO_AI_BACKEND" | "NO_DATA" | "AI_ERROR";
  message: string | null;
  generatedAt: string;
};

function buildFacts(s: Awaited<ReturnType<typeof loadHomeSummary>>): string[] {
  const f: string[] = [];
  const c = s.counts;
  if (c.overdue) f.push(`Việc quá hạn: ${c.overdue}`);
  if (c.dueToday) f.push(`Việc đến hạn hôm nay: ${c.dueToday}`);
  if (c.meetings) f.push(`Cuộc họp hôm nay: ${c.meetings}`);
  if (c.approvals) f.push(`Yêu cầu chờ duyệt: ${c.approvals}`);
  if (c.mentions) f.push(`Lượt nhắc tên chưa xử lý: ${c.mentions}`);
  if (c.unreadEmail) f.push(`Email chưa đọc: ${c.unreadEmail}`);
  if (c.unreadChat) f.push(`Tin nhắn chưa đọc: ${c.unreadChat}`);
  for (const t of s.myWork.slice(0, 5)) {
    f.push(
      `Task: "${t.title}" · ưu tiên ${t.priority} · trạng thái ${t.status}` +
        (t.overdue_days ? ` · quá hạn ${t.overdue_days} ngày` : "") +
        (t.due_at ? ` · hạn ${new Date(t.due_at).toLocaleString("vi-VN")}` : ""),
    );
  }
  for (const u of s.upcoming.slice(0, 3)) {
    f.push(
      `${u.kind === "meeting" ? "Họp" : "Deadline"}: "${u.title}" lúc ${new Date(u.start_at).toLocaleString("vi-VN")}`,
    );
  }
  for (const i of s.inbox.filter((x) => !x.read).slice(0, 4)) {
    f.push(`Hộp việc (${i.type}): "${i.title}"${i.actor ? ` từ ${i.actor}` : ""}`);
  }
  return f;
}

function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 4);
}

export async function loadHomeAiBrief(supabase: Db, userId: string): Promise<HomeAiBrief> {
  const now = new Date().toISOString();
  const summary = await loadHomeSummary(supabase, userId);
  const facts = buildFacts(summary);
  const base = { facts, generatedAt: now, bullets: [] as string[], source: "none" as const };

  if (facts.length === 0)
    return {
      ...base,
      available: false,
      reason: "NO_DATA",
      message: "Không có dữ liệu công việc nào để tóm tắt.",
    };

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey)
    return {
      ...base,
      available: false,
      reason: "NO_AI_BACKEND",
      message: "Chưa cấu hình AI backend nên không hiển thị tóm tắt AI.",
    };

  try {
    const { createLovableResponsesProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableResponsesProvider(apiKey);
    const result = streamText({
      model: provider.responses(MODEL),
      system:
        "Bạn là trợ lý điều hành công việc của UNIWORK. " +
        "CHỈ được dùng dữ liệu trong phần DỮ LIỆU THẬT bên dưới. " +
        "Tuyệt đối không bịa số liệu, tên người, tên việc hay sự kiện không có trong dữ liệu. " +
        "Trả về tối đa 3 gạch đầu dòng tiếng Việt, mỗi dòng 1 câu ngắn: việc cần ưu tiên xử lý ngay và lý do dựa trên dữ liệu. " +
        "Không mở đầu, không kết luận, không markdown ngoài dấu '-'.",
      messages: [
        {
          role: "user" as const,
          content: `DỮ LIỆU THẬT (thời điểm ${new Date().toLocaleString("vi-VN")}):\n${facts.map((f) => `- ${f}`).join("\n")}`,
        },
      ],
      providerOptions: { openai: { store: false } },
    });
    const text = await result.text;
    const bullets = parseBullets(text ?? "");
    if (!bullets.length)
      return {
        ...base,
        available: false,
        reason: "AI_ERROR",
        message: "AI không trả về nội dung.",
      };
    return {
      facts,
      generatedAt: now,
      bullets,
      source: "ai",
      available: true,
      reason: "OK",
      message: null,
    };
  } catch (e) {
    return {
      ...base,
      available: false,
      reason: "AI_ERROR",
      message: e instanceof Error ? e.message : "Không gọi được AI backend.",
    };
  }
}
