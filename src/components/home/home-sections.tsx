// HOME V2 — các khối nhỏ của Trang chủ (My Work · Upcoming · Work Inbox · Brief).
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  Bell,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeSummary, HomeTask, HomeUpcoming, WorkInboxItem } from "@/lib/api/home.functions";

const timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function EmptyRow({ label }: { label: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{label}</p>;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

export function TodaySummary({
  counts,
}: {
  counts: HomeSummary["counts"] | undefined;
}) {
  const items = [
    { key: "today", label: "Hôm nay", value: counts?.dueToday ?? 0, icon: ListChecks, to: "/tasks" },
    {
      key: "overdue",
      label: "Quá hạn",
      value: counts?.overdue ?? 0,
      icon: AlertTriangle,
      to: "/tasks",
      warn: true,
    },
    { key: "mention", label: "Nhắc đến bạn", value: counts?.mentions ?? 0, icon: AtSign, to: "/notifications" },
    { key: "approval", label: "Chờ duyệt", value: counts?.approvals ?? 0, icon: ShieldCheck, to: "/notifications" },
    { key: "meeting", label: "Cuộc họp", value: counts?.meetings ?? 0, icon: Video, to: "/meeting" },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <Link
          key={it.key}
          to={it.to}
          className={cn(
            "flex min-h-[64px] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2",
            "warn" in it && it.warn && it.value > 0 && "border-destructive/40",
          )}
        >
          <it.icon
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              "warn" in it && it.warn && it.value > 0 ? "text-destructive" : "text-muted-foreground",
            )}
            strokeWidth={1.75}
          />
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-none">{it.value}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">{it.label}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Khẩn cấp",
  high: "Cao",
  normal: "Bình thường",
  low: "Thấp",
};

export function MyWorkRow({
  task,
  onComplete,
  completing,
}: {
  task: HomeTask;
  onComplete: (t: HomeTask) => void;
  completing: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface-2">
      <button
        type="button"
        onClick={() => onComplete(task)}
        disabled={completing}
        aria-label={`Hoàn thành: ${task.title}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-success focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
      >
        <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
      <Link to="/tasks/$id" params={{ id: task.id }} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {task.workspace_name && <span className="truncate">{task.workspace_name}</span>}
          {task.overdue_days ? (
            <span className="text-destructive">Quá hạn {task.overdue_days} ngày</span>
          ) : task.due_at ? (
            <span>Hạn {new Date(task.due_at).toLocaleDateString("vi-VN")}</span>
          ) : null}
          <span>{PRIORITY_LABEL[task.priority] ?? task.priority}</span>
        </span>
      </Link>
      {/* Quick actions: hoàn thành qua command transitionTask, hoặc mở đúng trang task. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onComplete(task)}
          disabled={completing}
          aria-label={`Hoàn thành: ${task.title}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-success/40 hover:bg-success/10 hover:text-success focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          {completing ? (
            <Loader2 className="h-[14px] w-[14px] animate-spin" strokeWidth={1.75} />
          ) : (
            <CheckCircle2 className="h-[14px] w-[14px]" strokeWidth={1.75} />
          )}
          <span className="hidden sm:inline">Hoàn thành</span>
        </button>
        <Link
          to="/tasks/$id"
          params={{ id: task.id }}
          aria-label={`Mở: ${task.title}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ExternalLink className="h-[14px] w-[14px]" strokeWidth={1.75} />
          <span className="hidden sm:inline">Mở</span>
        </Link>
      </div>
    </div>
  );
}

export function UpcomingRow({ item }: { item: HomeUpcoming }) {
  const Icon = item.kind === "meeting" ? Video : CalendarClock;
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="text-xs text-muted-foreground">
          {timeFmt.format(new Date(item.start_at))}
          {item.kind === "meeting" && item.participants > 0
            ? ` · ${item.participants} người`
            : " · Hạn công việc"}
        </span>
      </div>
      <a
        href={item.href}
        className={cn(
          "inline-flex min-h-[36px] shrink-0 items-center rounded-lg px-3 text-xs font-medium",
          item.kind === "meeting" && item.joinable
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        {item.kind === "meeting" && item.joinable ? "Vào họp" : "Mở"}
      </a>
    </div>
  );
}

const INBOX_ICON: Record<WorkInboxItem["type"], typeof Bell> = {
  TASK: ListChecks,
  MENTION: AtSign,
  APPROVAL: ShieldCheck,
  CHAT: MessageSquare,
  EMAIL: Mail,
  MEETING: Video,
  NOTIFICATION: Bell,
};

export function InboxRow({
  item,
  onMarkRead,
}: {
  item: WorkInboxItem;
  onMarkRead?: (item: WorkInboxItem) => void;
}) {
  const Icon = INBOX_ICON[item.type];
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface-2">
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <a href={item.href} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {item.summary && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.summary}</span>
        )}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {new Date(item.timestamp).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
          })}
        </span>
      </a>
      {onMarkRead && item.source === "notification" && (
        <button
          type="button"
          onClick={() => onMarkRead(item)}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          Đã đọc
        </button>
      )}
    </div>
  );
}

export function AiBrief({ brief }: { brief: string[] }) {
  if (!brief.length) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Sparkles className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} /> Tóm tắt hôm nay
      </h2>
      <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
        {brief.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-xs font-semibold text-primary">{i + 1}.</span>
            <span>{b}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ViewAll({ to, label = "Xem tất cả" }: { to: string; label?: string }) {
  return (
    <a
      href={to}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {label} <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}
