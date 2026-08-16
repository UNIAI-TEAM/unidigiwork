// AI CONTEXT ENGINE V1 — validate citation IDs và bảo đảm deep link đúng ContextSource.href.
// Client-safe, thuần hàm: dùng chung cho server (làm sạch câu trả lời) và UI (render link).
import type { ContextSource } from "./contracts";

/** Token trích dẫn hợp lệ: [S1], [S12], [S1, S2] */
const CITATION_TOKEN = /\[\s*S\d+(?:\s*,\s*S\d+)*\s*\]/gi;

/** href hợp lệ = đường dẫn nội bộ tuyệt đối (chống open-redirect / javascript:) */
export const isSafeInternalHref = (href: string): boolean =>
  typeof href === "string" && /^\/(?!\/)[\w\-./$?=&%#:]*$/.test(href);

export interface AnswerSegment {
  type: "text" | "citation";
  text: string;
  source?: ContextSource;
}

export interface ValidatedAnswer {
  /** Câu trả lời đã loại bỏ citation ID không tồn tại. */
  answer: string;
  /** Các nguồn thực sự được trích dẫn (theo thứ tự xuất hiện). */
  citedSources: ContextSource[];
  /** ID model bịa ra hoặc trỏ tới href không an toàn. */
  invalidIds: string[];
  segments: AnswerSegment[];
}

/** Chỉ giữ source có href nội bộ an toàn — mọi deep link phải dùng đúng ContextSource.href. */
export function usableSources(sources: ContextSource[]): ContextSource[] {
  return sources.filter((s) => Boolean(s.sourceId) && isSafeInternalHref(s.href));
}

/**
 * Validate citation IDs trong câu trả lời:
 * - ID không có trong context pack (hoặc href không an toàn) bị gỡ khỏi text.
 * - ID hợp lệ được tách thành segment kèm ContextSource để UI render deep link.
 */
export function validateAnswerCitations(
  answer: string,
  sources: ContextSource[],
  extraIds: string[] = [],
): ValidatedAnswer {
  const valid = new Map(usableSources(sources).map((s) => [s.sourceId.toUpperCase(), s]));
  const segments: AnswerSegment[] = [];
  const cited = new Map<string, ContextSource>();
  const invalid = new Set<string>();

  let cursor = 0;
  let cleaned = "";
  CITATION_TOKEN.lastIndex = 0;
  for (let m = CITATION_TOKEN.exec(answer); m; m = CITATION_TOKEN.exec(answer)) {
    const before = answer.slice(cursor, m.index);
    if (before) segments.push({ type: "text", text: before });
    cleaned += before;
    cursor = m.index + m[0].length;

    const ids = m[0].replace(/[[\]\s]/g, "").split(",").filter(Boolean);
    let first = true;
    for (const rawId of ids) {
      const id = rawId.toUpperCase();
      const source = valid.get(id);
      if (!source) {
        invalid.add(id);
        continue;
      }
      cited.set(id, source);
      const text = `[${source.sourceId}]`;
      if (!first) segments.push({ type: "text", text: " " });
      segments.push({ type: "citation", text, source });
      cleaned += (first ? "" : " ") + text;
      first = false;
    }
  }
  const tail = answer.slice(cursor);
  if (tail) segments.push({ type: "text", text: tail });
  cleaned += tail;

  for (const rawId of extraIds) {
    const id = rawId?.toUpperCase?.();
    if (!id) continue;
    const source = valid.get(id);
    if (source) cited.set(id, source);
    else invalid.add(id);
  }

  return {
    answer: cleaned.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim(),
    citedSources: Array.from(cited.values()),
    invalidIds: Array.from(invalid),
    segments,
  };
}
