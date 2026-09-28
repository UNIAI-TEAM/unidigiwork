// Skill school-meeting-to-action: biên bản → quyết định + công việc, chỉ ghi sau khi người có quyền xác nhận.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapPgError } from "./business.server";

/** Workspace của cuộc họp + đã có biên bản chưa. */
export const getMinutesContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ meetingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: m, error } = await context.supabase
      .from("meetings")
      .select("id, workspace_id, start_at, department")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    const { count } = await context.supabase
      .from("meeting_transcript_segments")
      .select("id", { count: "exact", head: true })
      .eq("meeting_id", data.meetingId);
    return {
      workspaceId: ((m as { workspace_id?: string } | null)?.workspace_id ?? null) as string | null,
      startAt: ((m as { start_at?: string } | null)?.start_at ?? null) as string | null,
      department: ((m as { department?: string | null } | null)?.department ?? null) as string | null,
      segments: Number(count ?? 0),
    };
  });

export type CommitItemResult = { key: string; kind: "decision" | "task"; ok: boolean; id: string | null };

/** Ghi các mục đã duyệt: quyết định được xác nhận, công việc được tạo (idempotent theo itemKey). */
export const commitMinutesActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        meetingId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        decisions: z.array(z.string().min(1).max(300)).max(50),
        tasks: z
          .array(
            z.object({
              itemKey: z.string().min(1).max(200),
              title: z.string().min(1).max(200),
              description: z.string().max(2000).nullish(),
              dueAt: z.string().datetime().nullish(),
              assigneeId: z.string().uuid().nullish(),
            }),
          )
          .max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const results: CommitItemResult[] = [];

    if (data.decisions.length) {
      const { data: row, error } = await context.supabase.rpc("extract_decisions_from_meeting", {
        _meeting_id: data.meetingId,
      });
      if (error) mapPgError(error, "MEETING_NOT_FOUND");
      const r = (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | null;
      const created = Array.isArray(r?.decision_ids) ? (r!.decision_ids as string[]) : [];
      // Gồm cả quyết định đã trích trước đó từ cùng cuộc họp.
      const { data: rows } = await context.supabase
        .from("decisions")
        .select("id, title, status, source_id")
        .or(`source_id.eq.${data.meetingId}${created.length ? `,id.in.(${created.join(",")})` : ""}`);
      const list = (rows ?? []) as Array<{ id: string; title: string; status: string }>;
      const norm = (s: string) => s.trim().toLowerCase();
      for (const title of data.decisions) {
        const hit = list.find((d) => norm(d.title) === norm(title));
        if (!hit) {
          results.push({ key: title, kind: "decision", ok: false, id: null });
          continue;
        }
        if (hit.status === "CONFIRMED") {
          results.push({ key: title, kind: "decision", ok: true, id: hit.id });
          continue;
        }
        const { error: cErr } = await context.supabase.rpc("confirm_decision", {
          _decision_id: hit.id,
          _confirm: true,
        });
        results.push({ key: title, kind: "decision", ok: !cErr, id: hit.id });
      }
    }

    for (const t of data.tasks) {
      const { data: row, error } = await context.supabase.rpc("confirm_meeting_action_item", {
        _meeting_id: data.meetingId,
        _item_key: t.itemKey,
        _workspace_id: data.workspaceId,
        _title: t.title,
        _description: t.description ?? undefined,
        _due_at: t.dueAt ?? undefined,
        _assignee_id: t.assigneeId ?? undefined,
      });
      const taskId = (row as { task_id?: string } | null)?.task_id ?? null;
      results.push({ key: t.itemKey, kind: "task", ok: !error, id: taskId });
    }

    const failed = results.filter((r) => !r.ok).length;
    return { status: failed === 0 ? "completed" : failed === results.length ? "failed" : "partial", results };
  });
