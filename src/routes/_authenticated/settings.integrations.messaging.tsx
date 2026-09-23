import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { AppSidebar, AppTopbar } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { listMessagingConnections } from "@/lib/api/conversation-work.functions";

const PROVIDERS = [
  { id: "zalo", label: "Zalo OA" },
  { id: "whatsapp", label: "WhatsApp Business" },
  { id: "telegram", label: "Telegram Bot" },
  { id: "viber", label: "Viber Bot" },
] as const;

export const Route = createFileRoute("/_authenticated/settings/integrations/messaging")({
  head: () => ({
    meta: [
      { title: "Kênh nhắn tin · UNIWORK" },
      {
        name: "description",
        content:
          "Quản lý kênh nhắn tin bên ngoài của tổ chức: Zalo, WhatsApp, Telegram, Viber và khả năng thực tế của từng kênh.",
      },
      { property: "og:title", content: "Kênh nhắn tin · UNIWORK" },
      {
        property: "og:description",
        content: "Trạng thái kết nối và khả năng đã xác minh của từng kênh nhắn tin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagingIntegrationsPage,
});

function Capability({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        on ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {on ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {label}
    </span>
  );
}

function MessagingIntegrationsPage() {
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const connectionsQuery = useQuery({
    queryKey: ["messaging-connections"],
    queryFn: () => listMessagingConnections(),
  });

  const byProvider = new Map((connectionsQuery.data ?? []).map((c) => [c.provider, c]));

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
          <header className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight">{t("cw.integrations")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("cw.integrationsDesc")}</p>
          </header>

          <ul className="grid gap-3">
            {PROVIDERS.map((p) => {
              const conn = byProvider.get(p.id);
              const caps = conn?.capabilities ?? {
                manualImport: true,
                receive: false,
                reply: false,
                groupSupport: false,
              };
              return (
                <li key={p.id} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{p.label}</span>
                    <Badge variant={conn?.status === "CONNECTED" ? "default" : "secondary"}>
                      {conn?.status === "CONNECTED" ? t("cw.available") : t("cw.notConnected")}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Capability on={caps.manualImport} label={t("cw.capManual")} />
                    <Capability on={caps.receive} label={t("cw.capReceive")} />
                    <Capability on={caps.reply} label={t("cw.capReply")} />
                    <Capability on={caps.groupSupport} label={t("cw.capGroup")} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{t("cw.connectHint")}</p>
                  <div className="mt-3">
                    <Button variant="outline" className="h-11" disabled>
                      {t("cw.comingLater")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </main>
      </div>
    </div>
  );
}
