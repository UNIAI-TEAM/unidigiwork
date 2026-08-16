// HOME V2 — các khối nhỏ của Trang chủ (My Work · Upcoming · Work Inbox · Brief).
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTaskKind, TASK_KIND_META } from "@/lib/home-task-kind";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Empty state đầy đủ: icon + thông điệp + điều hướng gợi ý (không để ô trống). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  actions?: Array<{ label: string; to: string }>;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">
        <Icon className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      {actions?.length ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <Link
              key={a.to + a.label}
              to={a.to}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-surface-2"
            >
              {a.label} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Cảnh báo nguồn dữ liệu lỗi một phần, kèm nút thử lại. */
export function PartialNotice({
  label,
  onRetry,
  retrying,
}: {
  label: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-3.5 w-3.5 text-destructive" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">{label}</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3 w-3", retrying && "animate-spin")} strokeWidth={1.75} /> Thử lại
      </button>
    </div>
  );
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
  selected,
  checked,
  onCheckedChange,
}: {
  task: HomeTask;
  onComplete: (t: HomeTask) => void;
  completing: boolean;
  selected?: boolean;
  checked?: boolean;
  onCheckedChange?: (t: HomeTask, next: boolean) => void;
}) {
  const kind = getTaskKind(task);
  const meta = TASK_KIND_META[kind];
  const done = task.status === "done";
  const KindIcon =
    kind === "email" ? Mail : kind === "meeting" ? Video : kind === "chat" ? MessageSquare : kind === "document" ? FileText : ListChecks;
  return (
    <div
      data-mywork-row={selected ? "selected" : undefined}
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 transition-opacity hover:bg-surface-2",
        (done || completing) && "opacity-60",
        selected && "bg-surface-2 ring-1 ring-inset ring-ring",
      )}
      aria-busy={completing}
      aria-selected={selected}
    >
      {onCheckedChange ? (
        <input
          type="checkbox"
          checked={!!checked}
          disabled={done}
          onChange={(e) => onCheckedChange(task, e.target.checked)}
          aria-label={`Chọn: ${task.title}`}
          className="h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:opacity-40"
        />
      ) : null}
      <button
        type="button"
        onClick={() => onComplete(task)}
        disabled={completing || done}
        aria-label={`Hoàn thành: ${task.title}`}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:text-success focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
          done ? "text-success" : "text-muted-foreground",
        )}
      >
        {completing ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={1.75} />
        ) : (
          <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
        )}
      </button>
      <Link to="/tasks/$id" params={{ id: task.id }} className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {task.workspace_name && <span className="truncate">{task.workspace_name}</span>}
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5">
            <KindIcon className="h-3 w-3" strokeWidth={1.75} /> {meta.label}
          </span>
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
          disabled={completing || done}
          aria-label={`Hoàn thành: ${task.title}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-success/40 hover:bg-success/10 hover:text-success focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          {completing ? (
            <Loader2 className="h-[14px] w-[14px] animate-spin" strokeWidth={1.75} />
          ) : (
            <CheckCircle2 className="h-[14px] w-[14px]" strokeWidth={1.75} />
          )}
          <span className="hidden sm:inline">{done ? "Đã xong" : "Hoàn thành"}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Thao tác nhanh: ${task.title}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <ExternalLink className="h-[14px] w-[14px]" strokeWidth={1.75} />
            <span className="hidden sm:inline">Mở</span>
            <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/tasks/$id" params={{ id: task.id }}>
                <ListChecks className="h-4 w-4" strokeWidth={1.75} /> Mở chi tiết công việc
              </Link>
            </DropdownMenuItem>
            {kind !== "task" ? (
              <DropdownMenuItem asChild>
                <Link to={meta.to}>
                  <KindIcon className="h-4 w-4" strokeWidth={1.75} /> {meta.openLabel}
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/calendar">
                <CalendarClock className="h-4 w-4" strokeWidth={1.75} /> Xem trên lịch
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={completing || done} onSelect={() => onComplete(task)}>
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} /> Hoàn thành công việc
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  onOpen,
}: {
  item: WorkInboxItem;
  onMarkRead?: (item: WorkInboxItem) => void;
  onOpen?: (item: WorkInboxItem) => void;
}) {
  const Icon = INBOX_ICON[item.type];
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface-2">
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <a
        href={item.href}
        onClick={(e) => {
          if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onOpen(item);
        }}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-2">
          {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
          <span className="block truncate text-sm font-medium">{item.title}</span>
        </span>
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

export function AiBrief({
  aiBullets,
  factBrief,
  loading,
  unavailableMessage,
  onRefresh,
  generatedAt,
}: {
  aiBullets: string[];
  factBrief: string[];
  loading: boolean;
  unavailableMessage: string | null;
  onRefresh: () => void;
  generatedAt: string | null;
}) {
  const isAi = aiBullets.length > 0;
  const items = isAi ? aiBullets : factBrief;
  if (!loading && !items.length && !unavailableMessage) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Sparkles className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} /> Tóm tắt hôm nay
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
              isAi ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {isAi ? "AI · dữ liệu thật" : "Từ dữ liệu thật"}
          </span>
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
          Làm mới
        </button>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
        </div>
      ) : items.length ? (
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
          {items.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-xs font-semibold text-primary">{i + 1}.</span>
              <span>{b}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {!loading && unavailableMessage ? (
        <p className="mt-3 text-xs text-muted-foreground">{unavailableMessage}</p>
      ) : null}
      {!loading && isAi && generatedAt ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Tạo lúc {new Date(generatedAt).toLocaleTimeString("vi-VN")} · chỉ dựa trên dữ liệu công
          việc của bạn.
        </p>
      ) : null}
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
