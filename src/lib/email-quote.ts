/** Tạo phần trích dẫn nội dung email gốc khi trả lời / chuyển tiếp. */
export type QuoteSource = {
  from?: string | null;
  fromEmail?: string | null;
  to?: string | null;
  cc?: string | null;
  subject?: string | null;
  date?: string | null;
  body?: string | null;
};

const clean = (s?: string | null) => (s ?? "").trim();

export function stripPrefix(subject?: string | null) {
  return clean(subject).replace(/^((re|fwd|fw):\s*)+/i, "");
}

function quoteBody(body?: string | null) {
  const text = clean(body);
  if (!text) return "> (không có nội dung)";
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function buildReplyBody(src: QuoteSource) {
  const who = [clean(src.from), src.fromEmail ? `<${clean(src.fromEmail)}>` : ""]
    .filter(Boolean)
    .join(" ");
  const when = clean(src.date);
  const header = `Vào ${when || "lúc trước"}, ${who || "người gửi"} đã viết:`;
  return `\n\n${header}\n${quoteBody(src.body)}\n`;
}

export function buildForwardBody(src: QuoteSource) {
  const lines = [
    "---------- Thư đã chuyển tiếp ----------",
    `Từ: ${[clean(src.from), src.fromEmail ? `<${clean(src.fromEmail)}>` : ""].filter(Boolean).join(" ") || "—"}`,
    `Ngày: ${clean(src.date) || "—"}`,
    `Tiêu đề: ${clean(src.subject) || "(không có tiêu đề)"}`,
  ];
  if (clean(src.to)) lines.push(`Đến: ${clean(src.to)}`);
  if (clean(src.cc)) lines.push(`Cc: ${clean(src.cc)}`);
  return `\n\n${lines.join("\n")}\n\n${clean(src.body) || "(không có nội dung)"}\n`;
}

/** Gộp nhiều tin nhắn trong một thread thành nội dung chuyển tiếp. */
export function buildThreadForwardBody(subject: string | null | undefined, messages: QuoteSource[]) {
  return messages.map((m) => buildForwardBody({ ...m, subject: m.subject ?? subject })).join("\n");
}
