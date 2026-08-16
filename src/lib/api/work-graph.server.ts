// Work Graph Foundation V1 — server-only helpers.
// Batched, permission-aware entity resolution (no N+1).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkEntityType } from "@/domain/work-graph/relationship-types";
import { workEntityHref } from "@/domain/work-graph/route-resolver";

export interface ResolvedWorkEntity {
  type: WorkEntityType;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  updatedAt?: string | null;
}

type Client = SupabaseClient<any, any, any>;

const key = (type: string, id: string) => `${type}:${id}`;

/**
 * Resolve display metadata for graph targets in ONE query per entity type.
 * The caller-scoped client means RLS drops anything the actor cannot see —
 * unresolved entities are simply omitted (no existence leak).
 */
export async function resolveWorkEntities(
  supabase: Client,
  refs: { type: string; id: string }[],
): Promise<Map<string, ResolvedWorkEntity>> {
  const out = new Map<string, ResolvedWorkEntity>();
  const byType = new Map<string, string[]>();
  for (const r of refs) {
    const list = byType.get(r.type) ?? [];
    if (!list.includes(r.id)) list.push(r.id);
    byType.set(r.type, list);
  }

  const jobs: PromiseLike<void>[] = [];

  const add = (type: WorkEntityType, id: string, title: string, subtitle?: string | null, updatedAt?: string | null) => {
    out.set(key(type, id), { type, id, title, subtitle: subtitle ?? null, href: workEntityHref(type, id), updatedAt: updatedAt ?? null });
  };

  for (const [type, ids] of byType) {
    if (!ids.length) continue;
    switch (type as WorkEntityType) {
      case "TASK":
        jobs.push(
          supabase.from("tasks").select("id,title,status,updated_at").in("id", ids).then(({ data }) => {
            (data ?? []).forEach((r: any) => add("TASK", r.id, r.title ?? "Công việc", r.status, r.updated_at));
          }),
        );
        break;
      case "WORKSPACE":
        jobs.push(
          supabase.from("workspaces").select("id,name,updated_at").in("id", ids).then(({ data }) => {
            (data ?? []).forEach((r: any) => add("WORKSPACE", r.id, r.name ?? "Dự án", null, r.updated_at));
          }),
        );
        break;
      case "MEETING":
        jobs.push(
          supabase.from("meetings").select("id,title,starts_at,status").in("id", ids).then(({ data }) => {
            (data ?? []).forEach((r: any) => add("MEETING", r.id, r.title ?? "Cuộc họp", r.status, r.starts_at));
          }),
        );
        break;
      case "DOCUMENT":
        jobs.push(
          supabase.from("documents").select("id,title,folder,updated_at").in("id", ids).then(({ data }) => {
            (data ?? []).forEach((r: any) => add("DOCUMENT", r.id, r.title ?? "Tài liệu", r.folder, r.updated_at));
          }),
        );
        break;
      case "EMAIL":
        jobs.push(
          supabase.from("email_threads").select("id,subject,last_message_at").in("id", ids).then(({ data }) => {
            (data ?? []).forEach((r: any) => add("EMAIL", r.id, r.subject ?? "(Không tiêu đề)", null, r.last_message_at));
          }),
        );
        break;
      case "CHAT_CHANNEL":
        jobs.push(
          supabase.from("chat_channels").select("id,name,last_message_at").in("id", ids).then(({ data }) => {
            (data ?? []).forEach((r: any) => add("CHAT_CHANNEL", r.id, r.name ?? "Kênh", null, r.last_message_at));
          }),
        );
        break;
      case "PERSON":
        jobs.push(
          supabase.from("users").select("id,display_name,primary_email").in("id", ids).then(({ data }) => {
            (data ?? []).forEach((r: any) => add("PERSON", r.id, r.display_name ?? r.primary_email ?? "Thành viên", r.primary_email));
          }),
        );
        break;
      default:
        break;
    }
  }

  await Promise.all(jobs);
  return out;
}

export const entityKey = key;