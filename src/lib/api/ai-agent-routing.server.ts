// Tự động gán agent theo lĩnh vực công việc khi người dùng xác nhận đề xuất task.
// Chỉ gán agent đã bật, thuộc đúng workspace, và có kỹ năng cho phép loại hành động tương ứng.
import { inferWorkerProfileForTask } from "@/domain/ai-workforce/routing";
import { skillsForWorkerProfile } from "@/domain/ai-workforce/profiles";
import { normalizeAllowedActionTypes } from "@/domain/workflow-agents/contracts";

export interface AutoAssignedAgent {
  agentId: string;
  agentName: string;
  workerProfile: string | null;
  profileName: string | null;
  reason: string;
}

/** Chọn agent phù hợp nhất và ghi nhận vòng đời vào workflow_agent_runs. Lỗi phụ trợ không chặn hành động chính. */
export async function autoAssignAgentForTask(args: {
  supabase: any;
  userId: string;
  tenantId: string;
  workspaceId: string;
  proposalId: string;
  actionType: string;
  task: { title?: string | null; description?: string | null; tags?: readonly string[] | null };
}): Promise<AutoAssignedAgent | null> {
  const { supabase, tenantId, workspaceId, proposalId, actionType, task, userId } = args;
  try {
    const { data: agents } = await supabase
      .from("workflow_agents")
      .select("id, name, worker_profile, skills, allowed_action_types, enabled")
      .eq("workspace_id", workspaceId)
      .eq("enabled", true)
      .is("deleted_at", null);
    const pool = (agents ?? []).filter((a: any) =>
      normalizeAllowedActionTypes(a.allowed_action_types).includes(actionType as never),
    );
    if (!pool.length) return null;

    const match = inferWorkerProfileForTask(task);
    let chosen: any = null;
    let reason = "";

    if (match) {
      chosen = pool.find((a: any) => a.worker_profile === match.profileId) ?? null;
      if (chosen) reason = `Khớp lĩnh vực "${match.profileName}" theo nội dung công việc`;
      if (!chosen) {
        // Không có agent gắn đúng hồ sơ → chọn agent có kỹ năng trùng nhiều nhất với hồ sơ đó.
        const wanted = new Set(skillsForWorkerProfile(match.profileId));
        const ranked = pool
          .map((a: any) => ({
            agent: a,
            overlap: (Array.isArray(a.skills) ? a.skills : []).filter((s: string) => wanted.has(s)).length,
          }))
          .sort((x: { overlap: number }, y: { overlap: number }) => y.overlap - x.overlap);
        if (ranked[0]?.overlap) {
          chosen = ranked[0].agent;
          reason = `Kỹ năng gần nhất với lĩnh vực "${match.profileName}"`;
        }
      }
    }
    if (!chosen) {
      chosen = pool[0];
      reason = "Agent mặc định của không gian làm việc (không nhận diện được lĩnh vực)";
    }

    await supabase.from("workflow_agent_runs").insert({
      tenant_id: tenantId,
      agent_id: chosen.id,
      workspace_id: workspaceId,
      status: "APPROVED",
      matched_count: 1,
      proposal_id: proposalId,
      matches: [{ id: proposalId, title: task.title ?? "", facts: { reason } }] as never,
      created_by: userId,
    });

    return {
      agentId: chosen.id as string,
      agentName: (chosen.name as string) ?? "Agent",
      workerProfile: (chosen.worker_profile as string) ?? null,
      profileName: match?.profileName ?? null,
      reason,
    };
  } catch {
    return null;
  }
}
