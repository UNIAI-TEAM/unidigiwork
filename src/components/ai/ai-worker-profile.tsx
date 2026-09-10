import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, Clock, Gauge, MessageSquare, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AI_SKILL_KIND_LABELS, AI_SKILL_MAP } from "@/domain/workflow-agents/skills";
import { AI_ACTION_TOOLS } from "@/domain/ai-actions/contracts";
import type { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";

export type AiWorkerProfile = (typeof AI_WORKER_PROFILES)[number];

export function AiWorkerProfileHeader({ profile }: { profile: AiWorkerProfile }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={profile.avatarUrl}
        alt={`Ảnh đại diện ${profile.name}`}
        className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-primary/15"
      />
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{profile.name}</p>
        <p className="truncate text-sm font-medium text-primary">{profile.title}</p>
        <p className="text-sm text-muted-foreground">{profile.domain}</p>
      </div>
    </div>
  );
}

export function AiWorkerProfileBadges() {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary" className="gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-success" /> Đang hoạt động
      </Badge>
      <Badge variant="outline" className="gap-1">
        <ShieldCheck className="h-3 w-3" /> Cần người xác nhận
      </Badge>
    </div>
  );
}

export function AiWorkerProfileBody({ profile }: { profile: AiWorkerProfile }) {
  const skills = useMemo(
    () => (profile.skills ?? []).map((id) => AI_SKILL_MAP[id]).filter(Boolean),
    [profile],
  );
  const actions = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => s!.actionTypes.forEach((a) => set.add(a)));
    return Array.from(set);
  }, [skills]);

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Nhiệm vụ
        </h3>
        <p className="text-muted-foreground">{profile.mission}</p>
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Kỹ năng AI
        </h3>
        <ul className="space-y-2">
          {skills.map((s) => (
            <li key={s!.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{s!.name}</span>
                <Badge variant="outline" className="text-[11px]">
                  {AI_SKILL_KIND_LABELS[s!.kind]}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{s!.description}</p>
              <p className="mt-0.5 text-xs italic text-muted-foreground">Ví dụ: {s!.example}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" /> Hành động được phép đề xuất
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {actions.length === 0 ? (
            <Badge variant="outline">Chỉ đọc</Badge>
          ) : (
            actions.map((a) => (
              <Badge key={a} variant="secondary">
                {AI_ACTION_TOOLS[a as keyof typeof AI_ACTION_TOOLS]?.label ?? a}
              </Badge>
            ))
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Mọi hành động chỉ được tạo dưới dạng đề xuất và cần bạn xác nhận trước khi thực thi.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Phạm vi công việc
        </h3>
        <ul className="space-y-1 text-muted-foreground">
          {profile.responsibilities.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0" /> {profile.availability}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          to="/workflows/agents"
          search={{ profile: profile.id }}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Giao việc qua agent
        </Link>
        <Link
          to="/ai"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium transition-colors hover:bg-surface-2"
        >
          <MessageSquare className="h-4 w-4" /> Trò chuyện
        </Link>
      </div>
    </div>
  );
}
