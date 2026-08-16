// MEETING INTELLIGENCE — Grounding validation & prompt-injection defense (thuần, client-safe).
// Nguyên tắc: quyết định / rủi ro / action item chỉ được chấp nhận khi trích dẫn
// tới đoạn transcript CÓ THẬT trong cửa sổ đã gửi cho model.

import type {
  MeetingActionItem,
  MeetingDecision,
  MeetingFollowUp,
  MeetingOpenQuestion,
  MeetingRisk,
  SummarySource,
} from "./contracts";

export type GroundedItemKind = "DECISION" | "ACTION_ITEM" | "RISK" | "OPEN_QUESTION";

export type GroundingRejectReason =
  | "NO_SOURCE" // không có sourceIds
  | "UNKNOWN_SOURCE" // trích dẫn tới sourceId không tồn tại
  | "EMPTY_TITLE"
  | "INJECTION_ECHO"; // nội dung lặp lại chỉ thị tiêm vào transcript

export interface GroundingRejection {
  kind: GroundedItemKind;
  title: string;
  reason: GroundingRejectReason;
}

export interface GroundingWarning {
  kind: GroundedItemKind;
  title: string;
  reason: "NO_LEXICAL_OVERLAP";
}

export interface GroundingReport {
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  risks: MeetingRisk[];
  openQuestions: MeetingOpenQuestion[];
  followUp: MeetingFollowUp | null;
  rejections: GroundingRejection[];
  warnings: GroundingWarning[];
  /** Tỉ lệ mục được chấp nhận trên tổng số mục model đề xuất (0..1). */
  groundingRate: number;
}

/* ------------------------- Prompt injection detection ------------------------- */

/** Các mẫu chỉ thị thường gặp khi kẻ tấn công chèn vào transcript/phụ đề. */
const INJECTION_PATTERNS: RegExp[] = [
  /bỏ qua (mọi |tất cả |các )?(hướng dẫn|chỉ thị|quy tắc)/i,
  /ignore (all |any |the )?(previous|prior|above) (instructions|prompts|rules)/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /you are now|from now on you (are|must)/i,
  /bạn (giờ|bây giờ) là|kể từ giờ bạn phải/i,
  /system prompt|system:\s|<\|im_start\|>/i,
  /\[\s*(system|assistant|developer)\s*\]/i,
  /(in ra|tiết lộ|reveal|print).{0,20}(prompt|api key|token|secret)/i,
  /(hãy|please)?\s*(thêm|add|insert).{0,30}(quyết định|decision|action item)/i,
  /trả về|output|respond with.{0,30}(json|toàn bộ).{0,30}(bất kể|regardless)/i,
  /không cần trích dẫn|no citations? (needed|required)/i,
];

export interface InjectionHit {
  segmentId: string;
  pattern: string;
  excerpt: string;
}

/** Quét transcript để phát hiện nỗ lực tiêm chỉ thị. Không chặn tóm tắt — chỉ cảnh báo & audit. */
export function detectPromptInjection(
  segments: { id: string; content: string }[],
): InjectionHit[] {
  const hits: InjectionHit[] = [];
  for (const s of segments ?? []) {
    const content = s.content ?? "";
    for (const re of INJECTION_PATTERNS) {
      const m = re.exec(content);
      if (m) {
        hits.push({
          segmentId: s.id,
          pattern: re.source,
          excerpt: content.slice(Math.max(0, m.index - 20), m.index + 120),
        });
        break;
      }
    }
  }
  return hits;
}

/** Bọc transcript như DỮ LIỆU, vô hiệu hoá các dấu hiệu điều khiển hội thoại. */
export function neutralizeTranscriptContent(content: string): string {
  return (content ?? "")
    .replace(/<\|[^|]*\|>/g, "")
    .replace(/```/g, "'''")
    .replace(/^\s*(system|assistant|developer)\s*:/gim, "người nói:")
    .replace(/\[\s*(system|assistant|developer)\s*\]/gi, "[người nói]");
}

/* ------------------------------ Grounding checks ------------------------------ */

const STOP = new Set([
  "được","trong","những","người","chúng","phải","cần","làm","cho","với","này","một","các","khi","đã","sẽ","về","the","and","that","with","this","from","will",
]);

const tokens = (s: string): string[] =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOP.has(t));

const hasLexicalOverlap = (text: string, excerpts: string[]): boolean => {
  const a = new Set(tokens(text));
  if (a.size === 0) return true;
  const b = new Set(excerpts.flatMap(tokens));
  for (const t of a) if (b.has(t)) return true;
  return false;
};

const echoesInjection = (text: string): boolean =>
  INJECTION_PATTERNS.some((re) => re.test(text ?? ""));

/**
 * Chấp nhận một mục chỉ khi: có tiêu đề, có ít nhất 1 sourceId, mọi sourceId tồn tại thật,
 * và nội dung không lặp lại chỉ thị tiêm vào transcript.
 */
export function validateGroundedSummary(
  parsed: {
    decisions: MeetingDecision[];
    actionItems: MeetingActionItem[];
    risks: MeetingRisk[];
    openQuestions: MeetingOpenQuestion[];
    followUp: MeetingFollowUp | null;
  },
  sources: SummarySource[],
): GroundingReport {
  const byId = new Map(sources.map((s) => [s.sourceId, s] as const));
  const rejections: GroundingRejection[] = [];
  const warnings: GroundingWarning[] = [];
  let proposed = 0;

  const check = (
    kind: GroundedItemKind,
    title: string,
    body: string,
    sourceIds: string[],
  ): boolean => {
    proposed++;
    const push = (reason: GroundingRejectReason) => {
      rejections.push({ kind, title, reason });
      return false;
    };
    if (!title.trim()) return push("EMPTY_TITLE");
    if (echoesInjection(`${title}\n${body}`)) return push("INJECTION_ECHO");
    if (!sourceIds || sourceIds.length === 0) return push("NO_SOURCE");
    if (!sourceIds.every((id) => byId.has(id))) return push("UNKNOWN_SOURCE");
    const excerpts = sourceIds.map((id) => byId.get(id)!.excerpt);
    if (!hasLexicalOverlap(title, excerpts)) warnings.push({ kind, title, reason: "NO_LEXICAL_OVERLAP" });
    return true;
  };

  const decisions = (parsed.decisions ?? []).filter((d) =>
    check("DECISION", d.title, d.detail ?? "", d.sourceIds),
  );
  const actionItems = (parsed.actionItems ?? []).filter((a) =>
    check("ACTION_ITEM", a.title, `${a.owner ?? ""} ${a.dueHint ?? ""}`, a.sourceIds),
  );
  const risks = (parsed.risks ?? []).filter((r) => check("RISK", r.title, "", r.sourceIds));
  const openQuestions = (parsed.openQuestions ?? []).filter((q) =>
    check("OPEN_QUESTION", q.question, "", q.sourceIds),
  );

  const followUp =
    parsed.followUp && echoesInjection(`${parsed.followUp.subject}\n${parsed.followUp.body}`)
      ? null
      : parsed.followUp;

  const accepted = decisions.length + actionItems.length + risks.length + openQuestions.length;
  return {
    decisions,
    actionItems,
    risks,
    openQuestions,
    followUp,
    rejections,
    warnings,
    groundingRate: proposed === 0 ? 1 : accepted / proposed,
  };
}