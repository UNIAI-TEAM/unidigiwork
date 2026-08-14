import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/m/compose")({
  head: () => ({
    meta: [
      { title: "Soạn email · UNIWORK" },
      { name: "description", content: "Soạn email mới trên UNIWORK mobile." },
      { property: "og:title", content: "Soạn email · UNIWORK" },
      { property: "og:description", content: "Soạn email mới trên UNIWORK mobile." },
    ],
  }),
  component: MobileComposePage,
});

function MobileComposePage() {
  const navigate = useNavigate();
  const { workspaceId } = useActiveWorkspace();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast.error("Vui lòng điền đầy đủ thông tin.");
      return;
    }
    if (!workspaceId) {
      toast.error("Không tìm thấy workspace.");
      return;
    }
    setIsSending(true);
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("email_threads").insert({
      workspace_id: workspaceId,
      tenant_id: user.user?.user_metadata?.tenant_id ?? "",
      subject,
    });
    if (error) {
      toast.error("Gửi thất bại: " + error.message);
    } else {
      toast.success("Đã gửi email.");
      navigate({ to: "/m/email" });
    }
    setIsSending(false);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/m/email" })}
            aria-label="Quay lại"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold">Soạn email</h1>
        </div>
        <Button size="sm" onClick={handleSend} disabled={isSending}>
          <Send className="mr-2 h-4 w-4" />
          Gửi
        </Button>
      </header>

      <div className="flex flex-col gap-4 p-4 pb-24">
        <div className="space-y-1.5">
          <Label htmlFor="to">Người nhận</Label>
          <Input
            id="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subject">Tiêu đề</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Tiêu đề email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body">Nội dung</Label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nội dung email..."
            className="min-h-[200px] w-full rounded-lg border border-border bg-surface p-3 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
