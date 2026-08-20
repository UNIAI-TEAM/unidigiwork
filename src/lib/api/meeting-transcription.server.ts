// Server-only: phiên âm file ghi âm cuộc họp qua Lovable AI (speech-to-text)
// và cắt văn bản thành các đoạn transcript có mốc thời gian ước lượng.
const STT_MODEL = "openai/gpt-4o-transcribe";
const STT_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

export interface DraftSegment {
  content: string;
  speakerName?: string | null;
  offsetSeconds: number;
}

/** Cắt văn bản thành đoạn ~320 ký tự theo ranh giới câu, rải mốc thời gian đều. */
export function splitTranscriptText(text: string, durationSeconds?: number | null): DraftSegment[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];

  // Hỗ trợ định dạng "Người nói: nội dung" theo từng dòng.
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  const labelled = lines.filter((l) => /^[\p{L}\p{N} ._-]{2,40}:\s+\S/u.test(l)).length;
  const useLabels = lines.length > 1 && labelled >= Math.ceil(lines.length * 0.6);

  const chunks: { speaker: string | null; content: string }[] = [];
  if (useLabels) {
    for (const line of lines) {
      const m = line.match(/^([\p{L}\p{N} ._-]{2,40}):\s+(.*)$/u);
      if (m) chunks.push({ speaker: m[1]!.trim(), content: m[2]!.trim() });
      else if (chunks.length) chunks[chunks.length - 1]!.content += ` ${line}`;
      else chunks.push({ speaker: null, content: line });
    }
  } else {
    const sentences = clean.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    let buf = "";
    for (const s of sentences) {
      if ((buf + " " + s).trim().length > 320 && buf) {
        chunks.push({ speaker: null, content: buf.trim() });
        buf = s;
      } else {
        buf = `${buf} ${s}`.trim();
      }
    }
    if (buf.trim()) chunks.push({ speaker: null, content: buf.trim() });
  }

  const totalChars = chunks.reduce((n, c) => n + c.content.length, 0) || 1;
  // Không biết thời lượng: ước lượng ~14 ký tự/giây khi nói.
  const total = Math.max(1, Math.round(durationSeconds && durationSeconds > 0 ? durationSeconds : totalChars / 14));
  let acc = 0;
  return chunks.slice(0, 400).map((c) => {
    const offset = Math.min(86_400, Math.round((acc / totalChars) * total));
    acc += c.content.length;
    return { content: c.content.slice(0, 4000), speakerName: c.speaker ?? null, offsetSeconds: offset };
  });
}

/** Gọi Lovable AI speech-to-text; trả về văn bản đầy đủ. Ném lỗi kèm status khi thất bại. */
export async function transcribeAudio(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  form.append("model", STT_MODEL);
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mimeType || "audio/wav" }), fileName);

  const res = await fetch(STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`STT_FAILED ${res.status}: ${body.slice(0, 400)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as { text?: string };
  return String(json.text ?? "").trim();
}
