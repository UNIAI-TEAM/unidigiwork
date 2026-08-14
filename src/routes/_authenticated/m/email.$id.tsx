import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Reply, Trash2, Archive } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";

type Message = Database["public"]["Tables"]["email_messages"]["Row"];

export const Route = createFileRoute("/_authenticated/m/email/$id")({
  head: () => ({
    meta: [
      { title: "Email · UNIWORK" },
      { name: "description", content: "Xem nội dung email trên UNIWORK mobile." },
      { property: "og:title", content: "Email · UNIWORK" },
      { property: "og:description", content: "Xem nội dung email trên UNIWORK mobile." },
    ],
  }),
  component: MobileEmailDetailPage,
});

function MobileEmailDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [replyBody, setReplyBody] = useState("");

  const { data: messages } = useSuspenseQuery({
    queryKey: ["mobile-email-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("email_messages")
        .select("id, subject, body, sent_at, from_user_id, to_user_ids, is_draft")
        .eq("thread_id", id)
        .is("deleted_at", null)
        .order("sent_at", { ascending: true });
      return data ?? [];
    },
  });

  if (!messages?.length) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">Không tìm thấy email.</p>
        <Button variant="ghost" onClick={() => navigate({ to: "/m/email" })} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Quay lại hộp thư
        </Button>
      </div>
    );
  }

  const first = messages[0];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/m/email" })}
            aria-label="Quay lại"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{first.subject}</h1>
        </div>
      </header>

      <div className="flex-1 space-y-4 p-4">
        {messages.map((msg) => (
          <article
            key={msg.id}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{msg.from_user_id}</span>
              <span className="text-xs text-muted-foreground">
                {msg.sent_at ? format(new Date(msg.sent_at), "dd/MM HH:mm", { locale: vi }) : "Nháp"}
              </span>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: msg.body }}
            />
          </article>
        ))}
      </div>

      <div className="border-t border-border bg-background p-4 pb-24">
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Trả lời nhanh..."
          className="min-h-[80px] w-full rounded-lg border border-border bg-surface p-3 text-sm"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/m/email" })}
          >
            Hủy
          </Button>
          <Button size="sm" onClick={() => {}} disabled={!replyBody.trim()}>
            <Reply className="mr-2 h-4 w-4" />
            Gửi
          </Button>
        </div>
      </div>
    </div>
  );
}
