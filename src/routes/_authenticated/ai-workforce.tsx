import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Plus, Sparkles, Users, ShieldCheck, Clock, Gauge, MessageSquare } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AI_SKILL_KIND_LABELS, AI_SKILL_MAP } from "@/domain/workflow-agents/skills";
import { AI_ACTION_TOOLS } from "@/domain/ai-actions/contracts";
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
  const profileSkills = useMemo(
    () => (profile?.skills ?? []).map((id) => AI_SKILL_MAP[id]).filter(Boolean),
    [profile],
  );
  const profileActions = useMemo(() => {
    const set = new Set<string>();
    profileSkills.forEach((s) => s!.actionTypes.forEach((a) => set.add(a)));
    return Array.from(set);
  }, [profileSkills]);

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
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Thuê nhân sự AI
            </button>
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
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-7 w-7" />
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{profile.name}</SheetTitle>
                    <SheetDescription>{profile.domain}</SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> Đang hoạt động
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Cần người xác nhận
                  </Badge>
                </div>
              </SheetHeader>

              <div className="mt-4 space-y-5 pb-6 text-sm">
                <section>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Nhiệm vụ</h3>
                  <p className="text-muted-foreground">{profile.mission}</p>
                </section>

                <Separator />

                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> Kỹ năng AI
                  </h3>
                  <ul className="space-y-2">
                    {profileSkills.map((s) => (
                      <li key={s!.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{s!.name}</span>
                          <Badge variant="outline" className="text-[11px]">{AI_SKILL_KIND_LABELS[s!.kind]}</Badge>
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
                    {profileActions.length === 0 ? (
                      <Badge variant="outline">Chỉ đọc</Badge>
                    ) : (
                      profileActions.map((a) => (
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
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Phạm vi công việc</h3>
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
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" /> Giao việc qua agent
                  </Link>
                  <Link
                    to="/ai"
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium transition-colors hover:bg-surface-2"
                  >
                    <MessageSquare className="h-4 w-4" /> Trò chuyện
                  </Link>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
