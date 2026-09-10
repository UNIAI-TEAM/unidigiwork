// AI BRAIN — bật/tắt kỹ năng AI. Ghi thẳng vào danh mục kỹ năng hiện có, không tạo bảng quyền mới.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useI18n } from "@/lib/i18n";
import { getMyIsAdmin } from "@/lib/api/admin.functions";
import { listAiSkills, setAiSkillEnabled } from "@/lib/api/ai-skills.functions";
import {
  AI_SKILL_KINDS,
  AI_SKILL_KIND_HINTS,
  AI_SKILL_KIND_LABELS,
  type AiSkillKind,
} from "@/domain/workflow-agents/skills";

export const Route = createFileRoute("/_authenticated/ai-brain_/skills")({
  head: () => ({
    meta: [
      { title: "Kỹ năng AI — UNIWORK" },
      {
        name: "description",
        content:
          "Bật hoặc tắt từng kỹ năng AI của tổ chức; kỹ năng rủi ro cao luôn cần người duyệt.",
      },
      { property: "og:title", content: "Kỹ năng AI — UNIWORK" },
      {
        property: "og:description",
        content:
          "Bật hoặc tắt từng kỹ năng AI của tổ chức; kỹ năng rủi ro cao luôn cần người duyệt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiBrainSkillsPage,
});

type SkillRow = {
  id: string;
  code: string;
  name: string;
  kind: AiSkillKind;
  description: string | null;
  action_types: string[] | null;
  enabled: boolean;
  is_system: boolean;
};

/** Kỹ năng có thể thay đổi dữ liệu luôn bắt buộc người duyệt. */
function requiresApproval(skill: SkillRow) {
  return skill.kind === "ACTION" || (skill.action_types?.length ?? 0) > 0;
}

function AiBrainSkillsPage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const { workspaceId } = useActiveWorkspace();
  const qc = useQueryClient();

  const listFn = useServerFn(listAiSkills);
  const toggleFn = useServerFn(setAiSkillEnabled);

  const admin = useQuery({
    queryKey: ["admin", "isAdmin"],
    queryFn: () => getMyIsAdmin(),
    staleTime: 60_000,
  });
  const canEdit = admin.data?.isAdmin === true;

  const skills = useQuery({
    queryKey: ["ai-brain", "skills", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId as string } }),
    enabled: !!workspaceId,
  });

  const toggle = useMutation({
    mutationFn: (v: { skillId: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      toast.success("Đã cập nhật kỹ năng.");
      void qc.invalidateQueries({ queryKey: ["ai-brain", "skills"] });
    },
    onError: (e: Error) => toast.error(e.message || "Không thể cập nhật kỹ năng."),
  });

  const grouped = useMemo(() => {
    const rows = (skills.data ?? []) as unknown as SkillRow[];
    return AI_SKILL_KINDS.map((kind) => ({
      kind,
      rows: rows.filter((r) => r.kind === kind),
    })).filter((g) => g.rows.length > 0);
  }, [skills.data]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-brain" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          <Link
            to="/ai-brain"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("nav.aiBrain")}
          </Link>
          <Link
            to="/workflows/agents"
            search={{ profile: undefined }}
            className="ml-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("aiBrain.openAgents")}
          </Link>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {t("aiBrain.skills.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiBrain.skills.subtitle")}</p>

          {!canEdit && (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {t("aiBrain.skills.readonly")}
            </p>
          )}

          {skills.isLoading && (
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          )}

          {!skills.isLoading && grouped.length === 0 && (
            <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("aiBrain.skills.empty")}
            </p>
          )}

          <div className="mt-5 space-y-6">
            {grouped.map((g) => (
              <section key={g.kind}>
                <h2 className="text-sm font-semibold">{AI_SKILL_KIND_LABELS[g.kind]}</h2>
                <p className="text-xs text-muted-foreground">{AI_SKILL_KIND_HINTS[g.kind]}</p>
                <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {g.rows.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{s.name}</p>
                          {s.is_system ? <Badge variant="outline">Hệ thống</Badge> : null}
                          {requiresApproval(s) ? (
                            <Badge variant="destructive" className="gap-1">
                              <ShieldAlert className="h-3 w-3" />{" "}
                              {t("aiBrain.skills.approvalRequired")}
                            </Badge>
                          ) : null}
                        </div>
                        {s.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                        ) : null}
                      </div>
                      <Switch
                        checked={s.enabled}
                        disabled={!canEdit || toggle.isPending}
                        onCheckedChange={(v) => toggle.mutate({ skillId: s.id, enabled: v })}
                        aria-label={s.name}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
