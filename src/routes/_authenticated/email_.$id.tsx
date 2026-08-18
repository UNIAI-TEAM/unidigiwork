import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Reply, ReplyAll, Forward, Archive, Trash2,
  MailOpen, RefreshCw, AlertCircle, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar, AppTopbar, useSidebarState, avatar } from "@/components/app-shell";
import { getEmailThread, moveEmailMessages, setEmailMessagesRead } from "@/lib/api/emails.functions";
import { RelatedWorkPanel } from "@/components/work-graph/related-work-panel";
import { AskUniPanel } from "@/components/ai/ask-uni-panel";
import { buildReplyBody, buildThreadForwardBody } from "@/lib/email-quote";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/email_/$id")({
  head: () => ({ meta: [{ title: "Chi tiết email · UNIWORK" }] }),
  component: EmailDetailPage,
});

function EmailDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const fetchThread = useServerFn(getEmailThread);
  const nav = useNavigate();
  const qc = useQueryClient();
  const doMove = useServerFn(moveEmailMessages);
  const doSetRead = useServerFn(setEmailMessagesRead);
  const isUuid = UUID_RE.test(id);
  const q = useQuery({
    queryKey: ["email-thread", id],
    queryFn: () => fetchThread({ data: { id } }),
    enabled: isUuid,
  });

  const thread = q.data;
  const messages = (thread?.messages ?? []) as unknown as ThreadMessage[];
  const messageIds = messages.map((m) => m.id);
  const lastMessage = messages[messages.length - 1];
  const replyTo = lastMessage?.sender?.email ?? "";
  const allParticipants = Array.from(
    new Set(messages.map((m) => m.sender?.email).filter(Boolean) as string[]),
  ).join(", ");
  const baseSubject = (thread?.subject ?? "").replace(/^((re|fwd):\s*)+/i, "");
  const replyBody = lastMessage
    ? buildReplyBody({
        from: lastMessage.sender?.display_name ?? lastMessage.sender?.email,
        fromEmail: lastMessage.sender?.email,
        subject: lastMessage.subject ?? thread?.subject,
        date: new Date(lastMessage.sent_at ?? lastMessage.created_at).toLocaleString("vi-VN"),
        body: lastMessage.body,
      })
    : "";
  const forwardBody = buildThreadForwardBody(
    thread?.subject,
    messages.map((m) => ({
      from: m.sender?.display_name ?? m.sender?.email,
      fromEmail: m.sender?.email,
      subject: m.subject,
      date: new Date(m.sent_at ?? m.created_at).toLocaleString("vi-VN"),
      body: m.body,
    })),
  );

  const moveMut = useMutation({
    mutationFn: (folder: "archive" | "trash") =>
      doMove({ data: { message_ids: messageIds, folder } }),
    onSuccess: (_r, folder) => {
      toast.success(folder === "archive" ? "Đã lưu trữ cuộc hội thoại" : "Đã chuyển vào thùng rác");
      qc.invalidateQueries({ queryKey: ["emails"] });
      nav({ to: "/email" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unreadMut = useMutation({
    mutationFn: () => doSetRead({ data: { message_ids: messageIds, is_read: false } }),
    onSuccess: () => {
      toast.success("Đã đánh dấu chưa đọc");
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mở chi tiết = đánh dấu đã đọc thật trong DB, đồng bộ với Email Hub.
  const autoReadRef = useRef<string | null>(null);
  const idsKey = messageIds.join(",");
  useEffect(() => {
    if (!messageIds.length || unreadMut.isPending) return;
    if (autoReadRef.current === idsKey) return;
    autoReadRef.current = idsKey;
    void doSetRead({ data: { message_ids: messageIds, is_read: true } })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["emails"] });
        qc.invalidateQueries({ queryKey: ["unread-counts"] });
      })
      .catch(() => {
        autoReadRef.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  const busy = moveMut.isPending || unreadMut.isPending || messageIds.length === 0;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="email" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            <div className="mb-4 flex items-center justify-between">
              <Link
                to="/email"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Quay lại hộp thư
              </Link>
              <div className="flex items-center gap-1">
                {isUuid ? (
                  <AskUniPanel
                    rootEntity={{ type: "EMAIL", id }}
                    label="Hỏi UNI về email này"
                    suggestions={[
                      "Tóm tắt nội dung trao đổi",
                      "Cần trả lời những gì?",
                      "Liên quan công việc nào?",
                    ]}
                  />
                ) : null}
                <IconBtn icon={Archive} label="Lưu trữ" disabled={busy} onClick={() => moveMut.mutate("archive")} />
                <IconBtn icon={Trash2} label="Chuyển vào thùng rác" disabled={busy} onClick={() => moveMut.mutate("trash")} />
                <IconBtn icon={MailOpen} label="Đánh dấu chưa đọc" disabled={busy} onClick={() => unreadMut.mutate()} />
              </div>
            </div>

            {!isUuid ? (
              <EmptyState
                icon={AlertCircle}
                title="ID không hợp lệ"
                desc="Đường dẫn email này không đúng định dạng."
              />
            ) : q.isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-16 text-sm text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin opacity-60" />
                <span>Đang tải cuộc hội thoại…</span>
              </div>
            ) : q.error ? (
              <EmptyState
                icon={AlertCircle}
                title="Không tải được email"
                desc={(q.error as Error).message}
              />
            ) : !thread ? (
              <EmptyState
                icon={Inbox}
                title="Không tìm thấy cuộc hội thoại"
                desc="Email có thể đã bị xóa hoặc bạn không có quyền truy cập."
              />
            ) : (
              <>
                <div className="mb-4">
                  <h1 className="text-2xl font-bold">{thread.subject || "(không có tiêu đề)"}</h1>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {thread.messages.length} tin nhắn ·{" "}
                    {thread.last_message_at
                      ? new Date(thread.last_message_at).toLocaleString("vi-VN")
                      : "chưa gửi"}
                  </div>
                </div>

                <div className="space-y-3">
                  {(thread.messages as unknown as ThreadMessage[]).map((m) => (
                    <MessageCard key={m.id} m={m} />
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/email/compose"
                    search={{ thread: id, to: replyTo, subject: `Re: ${baseSubject}`, body: replyBody }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Reply className="h-4 w-4" /> Trả lời
                  </Link>
                  <Link
                    to="/email/compose"
                    search={{
                      thread: id,
                      to: allParticipants,
                      subject: `Re: ${baseSubject}`,
                      body: replyBody,
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
                  >
                    <ReplyAll className="h-4 w-4" /> Trả lời tất cả
                  </Link>
                  <Link
                    to="/email/compose"
                    search={{ subject: `Fwd: ${baseSubject}`, body: forwardBody }}
                    className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
                  >
                    <Forward className="h-4 w-4" /> Chuyển tiếp
                  </Link>
                </div>
                <RelatedWorkPanel
                  entityType="EMAIL"
                  entityId={id}
                  className="mt-6 rounded-2xl border border-border bg-surface p-5"
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

type ThreadMessage = {
  id: string;
  from_user_id: string;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  created_at: string;
  is_draft: boolean;
  sender: { display_name: string | null; email: string } | null;
};

function MessageCard({ m }: { m: ThreadMessage }) {
  const name = m.sender?.display_name || m.sender?.email || "Người dùng";
  const when = m.sent_at ?? m.created_at;
  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3 border-b border-border pb-4">
        <img src={avatar(m.from_user_id)} className="h-10 w-10 rounded-full" alt="" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm truncate">
              <span className="font-medium">{name}</span>
              {m.sender?.email && (
                <span className="ml-1 text-muted-foreground">&lt;{m.sender.email}&gt;</span>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(when).toLocaleString("vi-VN")}
            </span>
          </div>
          {m.is_draft && (
            <span className="mt-1 inline-block rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
              Bản nháp
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {m.body || <span className="text-muted-foreground italic">(không có nội dung)</span>}
      </div>
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-16 text-center">
      <Icon className="h-8 w-8 text-muted-foreground opacity-60" />
      <div className="text-sm font-medium">{title}</div>
      <div className="max-w-md text-xs text-muted-foreground">{desc}</div>
      <Link
        to="/email"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <ArrowLeft className="h-4 w-4" /> Về hộp thư
      </Link>
    </div>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}