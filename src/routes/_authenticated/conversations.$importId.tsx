import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, FileText, Sparkles } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import {
  askConversationIntelligence,
  getConversationSource,
  listExtractionProposals,
} from "@/lib/api/conversation-work.functions";

export const Route = createFileRoute("/_authenticated/conversations/$importId")({
  head: () => ({
    meta: [
      { title: "Công việc theo nguồn hội thoại · UNIWORK" },
      {
        name: "description",
        content: "Xem nội dung gốc, tóm tắt AI và các đề xuất đã duyệt từ một hội thoại.",
      },
      { property: "og:title", content: "Công việc theo nguồn hội thoại · UNIWORK" },
      {
        property: "og:description",
        content: "Xem nội dung gốc, tóm tắt AI và các đề xuất đã duyệt từ một hội thoại.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversationWorkDetailPage,
});

function ConversationWorkDetailPage() {
  const { t, lang } = useI18n();
  const { importId } = Route.useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const sourceQuery = useQuery({
    queryKey: ["conversation-source", importId],
    queryFn: () => getConversationSource({ data: { sourceType: "IMPORT", sourceId: importId } }),
  });

  const proposalsQuery = useQuery({
    queryKey: ["extraction-proposals", "IMPORT", importId],
    queryFn: () =>
      listExtractionProposals({ data: { sourceType: "IMPORT", sourceId: importId } }),
  });

  const summaryMutation = useMutation({
    mutationFn: () =>
      askConversationIntelligence({
        data: { sourceType: "IMPORT", sourceId: importId, question: "summary" },
      }),
    onSuccess: (res) => setSummary(res.answer),
  });

  const approved = (proposalsQuery.data ?? []).filter((p) => p.status === "APPROVED");
  const locale = lang === "en" ? "en-US" : "vi-VN";

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          <div className="mb-4">
            <Button variant="ghost" className="h-11 px-2" asChild>
              <Link to="/conversations">
                <ArrowLeft className="h-4 w-4" />
                <span className="ml-2">{t("cwx.back")}</span>
              </Link>
            </Button>
          </div>

          {sourceQuery.data && (
            <header className="mb-5 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {sourceQuery.data.source.title}
              </h1>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {sourceQuery.data.source.channel}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {t("cw.manualBadge")}
              </Badge>
            </header>
          )}

          <div className="grid gap-4">
            {/* Tóm tắt AI */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium">{t("cwx.summary")}</h2>
              </div>
              {summary ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{summary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("cwx.noSummary")}</p>
              )}
              <Button
                variant="outline"
                className="mt-3 h-11"
                disabled={summaryMutation.isPending}
                onClick={() => summaryMutation.mutate()}
              >
                {summaryMutation.isPending ? t("cwx.summarizing") : t("cwx.makeSummary")}
              </Button>
            </section>

            {/* Nội dung gốc */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium">{t("cwx.original")}</h2>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3">
                <ul className="grid gap-2 text-sm">
                  {(sourceQuery.data?.messages ?? []).map((m) => (
                    <li key={m.id}>
                      <span className="font-medium">{m.author}: </span>
                      <span className="text-muted-foreground">{m.body}</span>
                      {m.sentAt && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {new Date(m.sentAt).toLocaleString(locale)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Đề xuất đã duyệt */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium">{t("cwx.approved")}</h2>
              </div>
              {approved.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("cwx.noApproved")}</p>
              )}
              <ul className="grid gap-3">
                {approved.map((p) => (
                  <li key={p.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`cwx.kind.${p.kind}`)}
                      </Badge>
                      <span className="text-sm font-medium">{p.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t("cwx.confidence")}: {Math.round(p.confidence * 100)}%
                      </span>
                    </div>
                    {p.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                    )}
                    {p.evidence && (
                      <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground">
                        {t("cwx.evidence")}: “{p.evidence}”
                      </blockquote>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
