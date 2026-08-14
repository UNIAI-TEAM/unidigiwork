import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { MobileFAB } from "@/components/mobile/mobile-fab";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X, Mail, Inbox, Send, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type Thread = Database["public"]["Tables"]["email_threads"]["Row"];
type Message = Database["public"]["Tables"]["email_messages"]["Row"];

const folderIcons: Record<string, React.ReactNode> = {
  inbox: <Inbox className="h-4 w-4" />,
  sent: <Send className="h-4 w-4" />,
  drafts: <FileText className="h-4 w-4" />,
};

export const Route = createFileRoute("/_authenticated/m/email")({
  head: () => ({
    meta: [
      { title: "Email · UNIWORK" },
      { name: "description", content: "Hộp thư di động trên UNIWORK." },
      { property: "og:title", content: "Email · UNIWORK" },
      { property: "og:description", content: "Hộp thư di động trên UNIWORK." },
    ],
  }),
  component: MobileEmailPage,
});

function MobileEmailPage() {
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("inbox");

  const { data: threads } = useSuspenseQuery({
    queryKey: ["mobile-email", workspaceId, folder],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data: user } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("email_threads")
        .select(
          `id, subject, last_message_at, email_messages!inner(id, subject, sent_at, is_draft, from_user_id, email_states!inner(user_id, is_read, folder))`,
        )
        .eq("workspace_id", workspaceId)
        .eq("email_messages.email_states.user_id", user.user?.id ?? "")
        .eq("email_messages.email_states.folder", folder)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false });
      return (data ?? []) as unknown as Thread[];
    },
  });

  const filtered = (threads ?? []).filter((t) =>
    t.subject.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex min-h-full flex-col gap-3 p-4 pb-24">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm email..."
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label="Xóa"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["inbox", "sent", "drafts"].map((f) => (
          <button
            key={f}
            onClick={() => setFolder(f)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              folder === f
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface text-muted-foreground"
            }`}
          >
            {folderIcons[f] ?? <Mail className="h-4 w-4" />}
            {f === "inbox" ? "Hộp thư" : f === "sent" ? "Đã gửi" : "Nháp"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          {search ? "Không tìm thấy email." : "Chưa có email nào."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => (
            <MobileListItem
              key={t.id}
              title={t.subject}
              subtitle={t.last_message_at ? formatDistanceToNow(new Date(t.last_message_at), { locale: vi, addSuffix: true }) : "Không rõ"}
              icon={
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                  <Mail className="h-4 w-4" />
                </span>
              }
              badge={folder === "drafts" ? <Badge variant="outline">Nháp</Badge> : null}
              onClick={() => navigate({ to: "/m/email/$id", params: { id: t.id } })}
            />
          ))}
        </div>
      )}

      <MobileFAB label="Soạn email" to="/m/compose" />
    </div>
  );
}
