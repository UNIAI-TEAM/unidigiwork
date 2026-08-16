// Server-only: staged summarization cho cuộc họp dài (map theo chunk → reduce synthesis).
import { streamText } from "ai";
import {
  buildStageSystemPrompt,
  buildStageUserPrompt,
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  buildTranscriptChunks,
  mergeStageResults,
  parseMeetingSummaryOutput,
  renderTranscriptForModel,
  type MeetingActionItem,
  type MeetingDecision,
  type MeetingFollowUp,
  type MeetingOpenQuestion,
  type MeetingRisk,
  type StageResult,
  type SummarySource,
  type TranscriptSegment,
} from "@/domain/meeting-intelligence/contracts";

const STAGE_CONCURRENCY = 3;

export interface StagedSummaryResult {
  parsed: {
    summary: string;
    highlights: string[];
    decisions: MeetingDecision[];
    actionItems: MeetingActionItem[];
    risks: MeetingRisk[];
    openQuestions: MeetingOpenQuestion[];
    followUp: MeetingFollowUp | null;
  };
  sources: SummarySource[];
  truncated: boolean;
  stageCount: number;
  failedStages: number;
  synthesized: boolean;
}

async function callModel(args: {
  provider: { responses: (m: string) => never };
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
}): Promise<string> {
  const result = streamText({
    model: args.provider.responses(args.model),
    system: args.system,
    prompt: args.prompt,
    maxOutputTokens: args.maxOutputTokens,
    temperature: 0.2,
    providerOptions: {
      openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false },
    },
  });
  return await result.text;
}

/** Map: tóm tắt từng chunk. Reduce: tổng hợp cuối. Trích dẫn luôn là sourceId toàn cục. */
export async function runStagedMeetingSummary(args: {
  provider: { responses: (m: string) => never };
  model: string;
  title: string;
  startAt: string;
  segments: TranscriptSegment[];
}): Promise<StagedSummaryResult> {
  const { chunks, sources, truncated } = buildTranscriptChunks(args.segments);
  const validIds = sources.map((s) => s.sourceId);

  const stages: StageResult[] = [];
  let failedStages = 0;

  for (let i = 0; i < chunks.length; i += STAGE_CONCURRENCY) {
    const batch = chunks.slice(i, i + STAGE_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (chunk) => {
        const raw = await callModel({
          provider: args.provider,
          model: args.model,
          system: buildStageSystemPrompt(),
          prompt: buildStageUserPrompt({
            title: args.title,
            chunkIndex: chunk.index,
            chunkCount: chunks.length,
            transcriptBlock: renderTranscriptForModel(chunk.window),
          }),
          maxOutputTokens: 1200,
        });
        // Chỉ chấp nhận trích dẫn thuộc đúng chunk này.
        const chunkIds = chunk.window.map((w) => w.sourceId);
        const p = parseMeetingSummaryOutput(raw, chunkIds);
        return {
          chunkIndex: chunk.index,
          chunkSummary: p.summary,
          highlights: p.highlights,
          decisions: p.decisions,
          actionItems: p.actionItems,
          risks: p.risks,
          openQuestions: p.openQuestions,
        } satisfies StageResult;
      }),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") stages.push(r.value);
      else failedStages++;
    }
  }

  const merged = mergeStageResults(stages);
  if (stages.length === 0) {
    return {
      parsed: { ...merged, followUp: null },
      sources,
      truncated,
      stageCount: chunks.length,
      failedStages,
      synthesized: false,
    };
  }

  try {
    const raw = await callModel({
      provider: args.provider,
      model: args.model,
      system: buildSynthesisSystemPrompt(),
      prompt: buildSynthesisUserPrompt({
        title: args.title,
        startAt: args.startAt,
        stages,
        truncated,
      }),
      maxOutputTokens: 2000,
    });
    const final = parseMeetingSummaryOutput(raw, validIds);
    // Nếu synthesis rỗng bất thường, dùng bản gộp tất định.
    const empty =
      !final.summary &&
      final.decisions.length === 0 &&
      final.actionItems.length === 0 &&
      final.risks.length === 0;
    if (empty) {
      return {
        parsed: { ...merged, followUp: null },
        sources,
        truncated,
        stageCount: chunks.length,
        failedStages,
        synthesized: false,
      };
    }
    return {
      parsed: {
        ...final,
        summary: final.summary || merged.summary,
        highlights: final.highlights.length ? final.highlights : merged.highlights,
      },
      sources,
      truncated,
      stageCount: chunks.length,
      failedStages,
      synthesized: true,
    };
  } catch {
    return {
      parsed: { ...merged, followUp: null },
      sources,
      truncated,
      stageCount: chunks.length,
      failedStages,
      synthesized: false,
    };
  }
}