import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, BriefcaseBusiness, Plus, Sparkles, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listAiEmployments } from "@/lib/api/ai-market.functions";
import { AI_EMPLOYMENT_STATUS_LABELS, formatMoney } from "@/domain/ai-market/contracts";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { Badge } from "@/components/ui/badge";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AiWorkerProfileBadges,
  AiWorkerProfileBody,
  AiWorkerProfileHeader,
} from "@/components/ai/ai-worker-profile";
import { AiSkillsManager } from "@/components/ai/ai-skills-manager";
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";

export const Route = createFileRoute("/_authenticated/ai-workforce")({
  head: () => ({
    meta: [
      { title: "AI Workforce — UNIWORK" },
      {
        name: "description",
        content: "Xây dựng, quản lý và cộng tác cùng đội ngũ nhân sự AI của bạn trên UNIWORK.",
      },
      { property: "og:title", content: "AI Workforce — UNIWORK" },
      {
        property: "og:description",
        content: "Xây dựng, quản lý và cộng tác cùng đội ngũ nhân sự AI của bạn trên UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiWorkforcePage,
});

const TABS = [
  { id: "workers", label: "Nhân sự AI", icon: Bot },
  { id: "contracts", label: "Hợp đồng AI", icon: BriefcaseBusiness },
  { id: "skills", label: "Kỹ năng AI", icon: Sparkles },
  { id: "workspaces", label: "Không gian làm việc", icon: Users },
] as const;

function AiWorkforcePage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("workers");
  const workers = useMemo(() => AI_WORKER_PROFILES, []);
  const [profileId, setProfileId] = useState<string | null>(null);
  const profile = useMemo(() => workers.find((w) => w.id === profileId) ?? null, [workers, profileId]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-workforce" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("nav.aiWorkforce")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Xây dựng, quản lý và làm việc cùng đội ngũ AI của bạn.
              </p>
            </div>
            <Link
              to="/ai-market"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Tuyển nhân sự AI
            </Link>
          </div>

          <nav className="mt-5 flex gap-1 border-b border-border text-sm">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 transition-colors",
                  tab === item.id
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </button>
            ))}
          </nav>

          {tab === "workers" ? (
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workers.map((w) => (
                <li
                  key={w.id}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-5 text-center shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="grid h-20 w-20 place-items-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-8 w-8" />
                  </span>
                  <span className="mt-1 text-sm font-semibold">{w.name}</span>
                  <span className="text-xs text-muted-foreground">{w.domain}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Đang hoạt động
                  </span>
                  <button
                    type="button"
                    onClick={() => setProfileId(w.id)}
                    className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-2"
                  >
                    Xem hồ sơ
                  </button>
                </li>
              ))}
            </ul>
          ) : tab === "contracts" ? (
            <AiContractsTab />
          ) : tab === "skills" ? (
            <AiSkillsManager />
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-sm text-muted-foreground">
              Nội dung đang được chuẩn bị.
            </div>
          )}
        </div>
      </main>

      <Sheet open={!!profile} onOpenChange={(o) => !o && setProfileId(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          {profile && (
            <>
              <SheetHeader className="space-y-3 text-left">
                <SheetTitle className="sr-only">{profile.name}</SheetTitle>
                <SheetDescription className="sr-only">{profile.domain}</SheetDescription>
                <AiWorkerProfileHeader profile={profile} />
                <AiWorkerProfileBadges />
              </SheetHeader>
              <div className="mt-4 pb-6">
                <AiWorkerProfileBody profile={profile} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AiContractsTab() {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";
  const { data, isLoading } = useQuery({
    queryKey: ["ai-employments", activeWorkspaceId],
    queryFn: () => listAiEmployments({ data: { workspaceId: activeWorkspaceId } }),
    enabled: !!activeWorkspaceId,
  });

  if (isLoading) return <p className="mt-6 text-sm text-muted-foreground">Đang tải hợp đồng…</p>;
  if (!data?.length) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-sm text-muted-foreground">
        Chưa có nhân sự AI nào được tuyển.{" "}
        <Link to="/ai-market" className="font-medium text-primary hover:underline">
          Tới chợ nhân sự AI
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-6 grid gap-3">
      {data.map((e: any) => (
        <li key={e.id} className="rounded-xl border border-border bg-surface p-4">
          <Link to="/ai-market/$id" params={{ id: e.market_agent_id }} className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{e.agent?.name ?? "Nhân sự AI"}</span>
              <span className="block truncate text-xs text-muted-foreground">{e.agent?.title}</span>
            </span>
            <Badge variant="secondary">{AI_EMPLOYMENT_STATUS_LABELS[e.status] ?? e.status}</Badge>
            <span className="text-sm font-medium">
              {formatMoney(Number(e.salary_amount ?? 0), e.currency)}/tháng
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
