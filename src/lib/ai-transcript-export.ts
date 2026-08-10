import type { AiConversationDTO, AiMessageDTO } from "@/lib/api/ai-chat.functions";

type Conv = Pick<
  AiConversationDTO,
  "id" | "title" | "model" | "workspaceName" | "createdAt" | "lastMessageAt"
> & { totalInputTokens?: number; totalOutputTokens?: number };

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "hoi-thoai";

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });

const roleLabel = (r: AiMessageDTO["role"]) =>
  r === "assistant" ? "Trợ lý AI" : r === "system" ? "Hệ thống" : "Bạn";

export function exportTranscriptJson(conv: Conv, messages: AiMessageDTO[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    source: "UNIWORK AI Workspace",
    conversation: {
      id: conv.id,
      title: conv.title,
      model: conv.model,
      workspace: conv.workspaceName,
      createdAt: conv.createdAt,
      lastMessageAt: conv.lastMessageAt,
      totalInputTokens: conv.totalInputTokens ?? null,
      totalOutputTokens: conv.totalOutputTokens ?? null,
      messageCount: messages.length,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
    })),
  };
  download(
    `uniwork-transcript_${slug(conv.title)}_${stamp()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
  return true;
}

export function exportTranscriptPdf(conv: Conv, messages: AiMessageDTO[]) {
  const rows = messages
    .map(
      (m) => `<article class="msg ${m.role}">
  <header><span class="who">${esc(roleLabel(m.role))}</span><span class="at">${esc(fmt(m.createdAt))}</span></header>
  <div class="body">${esc(m.content).replace(/\n/g, "<br/>")}</div>
</article>`,
    )
    .join("");

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(conv.title)} · UNIWORK</title>
<style>
 *{box-sizing:border-box}
 body{font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:28px;font-size:12px;line-height:1.55}
 h1{font-size:20px;margin:0 0 6px}
 .meta{color:#6b7280;font-size:11px;margin:0 0 4px}
 .msg{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-top:10px;page-break-inside:avoid}
 .msg.assistant{background:#f9fafb}
 .msg header{display:flex;justify-content:space-between;margin-bottom:6px}
 .who{font-weight:600} .at{color:#6b7280;font-size:10px}
 .body{white-space:normal;word-break:break-word}
 @page{size:A4;margin:14mm}
</style></head><body>
<h1>${esc(conv.title)}</h1>
<p class="meta">Nguồn: UNIWORK AI Workspace · Model: ${esc(conv.model || "—")}${
    conv.workspaceName ? ` · Workspace: ${esc(conv.workspaceName)}` : ""
  }</p>
<p class="meta">Tạo lúc: ${esc(fmt(conv.createdAt))} · Cập nhật: ${esc(fmt(conv.lastMessageAt))} · ${messages.length} tin nhắn</p>
${rows || '<p class="meta">Hội thoại chưa có tin nhắn.</p>'}
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}
