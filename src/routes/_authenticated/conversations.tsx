import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageSquarePlus, Plug } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { SaveToUniworkDialog } from "@/components/conversation/save-to-uniwork-dialog";
import {
  listConversationImports,
  type ConversationImportDTO,
} from "@/lib/api/conversation-work.functions";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({
    meta: [
      { title: "Hội thoại thành công việc · UNIWORK" },
      {
        name: "description",
        content:
          "Đưa nội dung trao đổi từ Zalo, WhatsApp, Telegram hay Viber vào UNIWORK và biến thành công việc, quyết định, cam kết và tri thức.",
      },
      { property: "og:title", content: "Hội thoại thành công việc · UNIWORK" },
      {
        property: "og:description",
        content: "Biến nội dung hội thoại thành công việc có chủ sở hữu và nguồn truy vết.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversationWorkPage,
});

function ConversationWorkPage() {
  const { t, lang } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const importsQuery = useQuery({
    queryKey: ["conversation-imports"],
    queryFn: () => listConversationImports({ data: { limit: 20 } }),
  });

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <header className="mb-5 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">{t("cw.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("cw.subtitle")}</p>
            </div>
            <Button variant="outline" className="h-11" asChild>
              <Link to="/settings/integrations/messaging">
                <Plug className="h-4 w-4" />
                <span className="ml-2">{t("cw.integrations")}</span>
              </Link>
            </Button>
            <Button className="h-11" onClick={() => setSaveOpen(true)}>
              <MessageSquarePlus className="h-4 w-4" />
              <span className="ml-2">{t("cw.save")}</span>
            </Button>
          </header>

          <div className="grid gap-4">
            <aside className="grid content-start gap-2 rounded-2xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">{t("cw.imports")}</p>
              {(importsQuery.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("cw.noImports")}</p>
              )}
              {(importsQuery.data ?? []).map((imp: ConversationImportDTO) => (
                <Link
                  key={imp.id}
                  to="/conversations/$importId"
                  params={{ importId: imp.id }}
                  className="block min-h-11 rounded-xl border border-border px-3 py-2 text-left text-sm transition hover:bg-muted/50"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {imp.channel}
                    </Badge>
                    <span className="truncate font-medium">{imp.groupName}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {imp.messageCount} {t("cw.messages")} ·{" "}
                    {new Date(imp.createdAt).toLocaleString(lang === "en" ? "en-US" : "vi-VN")}
                  </span>
                </Link>
              ))}
            </aside>
          </div>
        </main>
      </div>

      <SaveToUniworkDialog open={saveOpen} onOpenChange={setSaveOpen} />
    </div>
  );
}
