// Điểm vào UNI Copilot cho mobile: nút trên topbar + entry ngữ cảnh gọn trên detail page.
import { useCallback, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { openUniCopilot } from "@/components/ai/uni-copilot";
import type { CopilotRoot } from "@/domain/ai-copilot/contracts";

/** Suy ra ngữ cảnh gốc từ URL mobile hiện tại (email/chat/task/meeting/document). */
export function useMobileCopilotRoot(): CopilotRoot {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;

  const emailId = pathname.match(/^\/m\/email\/([^/]+)/)?.[1];
  if (emailId) return { type: "EMAIL", id: emailId };

  const meetId = pathname.match(/^\/m\/meet\/([^/]+)/)?.[1];
  if (meetId) return { type: "MEETING", id: meetId };

  const docId = pathname.match(/^\/m\/documents?\/([^/]+)/)?.[1];
  if (docId) return { type: "DOCUMENT", id: docId };

  if (pathname.startsWith("/m/chat")) {
    const channelId = typeof search.channel === "string" ? search.channel : null;
    if (channelId) return { type: "CHAT_CHANNEL", id: channelId };
  }
  if (pathname.startsWith("/m/tasks")) {
    const taskId = typeof search.task === "string" ? search.task : null;
    if (taskId) return { type: "TASK", id: taskId };
  }
  return null;
}

/**
 * Nút UNI trên topbar mobile.
 * Chạm: mở với ngữ cảnh trang hiện tại. Giữ ~500ms: mở ở ngữ cảnh toàn workspace.
 */
export function MobileUniCopilotButton({ workspaceId }: { workspaceId?: string | null }) {
  const root = useMobileCopilotRoot();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  return (
    <button
      type="button"
      aria-label={root ? "Hỏi UNI về nội dung đang xem" : "Hỏi UNI"}
      title="Chạm: hỏi theo ngữ cảnh · Giữ: hỏi toàn workspace"
      className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg text-primary transition-colors hover:bg-surface-2 active:bg-surface-2"
      onPointerDown={() => {
        longRef.current = false;
        timerRef.current = setTimeout(() => {
          longRef.current = true;
          openUniCopilot({ root: null, workspaceId: workspaceId ?? null });
        }, 500);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={() => {
        clear();
        if (longRef.current) return;
        openUniCopilot({ root, workspaceId: workspaceId ?? null });
      }}
    >
      <Sparkles className="h-4 w-4" />
      {root && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
    </button>
  );
}

/** Entry ngữ cảnh gọn, dùng trong header của các trang chi tiết mobile. */
export function MobileAskUniChip({
  root,
  workspaceId,
  label = "Hỏi UNI",
}: {
  root: CopilotRoot;
  workspaceId?: string | null;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openUniCopilot({ root, workspaceId: workspaceId ?? null })}
      aria-label={label}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-2 active:bg-surface-2"
    >
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      {label}
    </button>
  );
}