// AI BRAIN — read-only overview cho màn hình tổng quan AI.
// Không ghi dữ liệu. Mọi truy vấn đi qua RLS của người dùng hiện tại.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ApiError } from "@/contracts/errors";

const fail = (code: string, message: string) => new ApiError({ code: code as never, message });

const Input = z.object({ workspaceId: z.string().uuid().nullable().optional() });

export type AiBrainLogEntry = {
  id: string;
  title: string;
  description: string | null;
  actionType: string;
  status: string;
  risk: string;
  source: string;
  aiWorkerId: string | null;
  createdAt: string;
};

export type AiBrainOverview = {
  metrics: {
    pending: number;
    approvedThisWeek: number;
    rejectedThisWeek: number;
    acceptanceRate: number;
    tokensThisWeek: number;
  };
  /** Kỹ năng đang tắt nhưng có khai báo hành động — AI sẽ không đề xuất các hành động này. */
  disabledSkills: { id: string; name: string; actionTypes: string[] }[];
  log: AiBrainLogEntry[];
};

const PENDING = ["PROPOSED", "PREVIEWED"];
const REJECTED = ["CANCELLED", "FAILED", "EXPIRED"];

export const getAiBrainOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<AiBrainOverview> => {
    let tenantId: string | null = null;
    if (data.workspaceId) {
      const { data: ws, error: wsErr } = await context.supabase
        .from("workspaces")
        .select("id, tenant_id")
        .eq("id", data.workspaceId)
        .maybeSingle();
      if (wsErr || !ws) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");
      tenantId = ws.tenant_id as string;
    } else {
      // "Tất cả không gian làm việc": lấy tổ chức đang hoạt động của người dùng (RLS bảo vệ).
      const { data: rows } = await context.supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", context.userId)
        .eq("status", "active")
        .limit(2);
      if ((rows ?? []).length === 1) tenantId = (rows as { tenant_id: string }[])[0].tenant_id;
    }
    if (!tenantId) throw fail("WORKSPACE_NOT_FOUND", "Không tìm thấy không gian làm việc.");

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [pendingRes, approvedRes, rejectedRes, logRes, usageRes] = await Promise.all([
      context.supabase
        .from("ai_action_proposals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", PENDING),
      context.supabase
        .from("ai_action_proposals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "SUCCEEDED")
        .gte("created_at", weekAgo),
      context.supabase
        .from("ai_action_proposals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", REJECTED)
        .gte("created_at", weekAgo),
      context.supabase
        .from("ai_action_proposals")
        .select(
          "id, title, description, action_type, status, risk, source, ai_worker_id, created_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("ai_usage_events")
        .select("total_tokens")
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo)
        .limit(1000),
    ]);

    const { data: skillRows } = await context.supabase
      .from("ai_skills")
      .select("id, name, enabled, action_types")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("enabled", false);
    const disabledSkills = (skillRows ?? [])
      .filter((r) => ((r.action_types as string[] | null) ?? []).length > 0)
      .map((r) => ({
        id: r.id as string,
        name: (r.name as string) ?? "",
        actionTypes: ((r.action_types as string[] | null) ?? []) as string[],
      }));

    const approved = approvedRes.count ?? 0;
    const rejected = rejectedRes.count ?? 0;
    const decided = approved + rejected;
    const tokensThisWeek = (usageRes.data ?? []).reduce(
      (sum, r: { total_tokens: number | null }) => sum + (r.total_tokens ?? 0),
      0,
    );

    return {
      metrics: {
        pending: pendingRes.count ?? 0,
        approvedThisWeek: approved,
        rejectedThisWeek: rejected,
        acceptanceRate: decided === 0 ? 0 : Math.round((approved / decided) * 100),
        tokensThisWeek,
      },
      disabledSkills,
      log: (logRes.data ?? []).map((r) => ({
        id: r.id as string,
        title: (r.title as string) ?? "",
        description: (r.description as string | null) ?? null,
        actionType: (r.action_type as string) ?? "",
        status: (r.status as string) ?? "",
        risk: (r.risk as string) ?? "LOW",
        source: (r.source as string) ?? "",
        aiWorkerId: (r.ai_worker_id as string | null) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });
