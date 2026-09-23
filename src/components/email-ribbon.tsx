import type { LucideIcon } from "lucide-react";
import {
  Archive,
  CalendarDays,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  MailPlus,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Settings2,
  Trash2,
  Video,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

/* ---------- Ribbon ---------- */

function RibbonButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] leading-tight transition-colors disabled:opacity-40 ${
        active
          ? "bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="max-w-[72px] truncate">{label}</span>
    </button>
  );
}

function RibbonGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-stretch gap-1 border-r border-border/70 px-2 last:border-r-0">
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1">{children}</div>
        <span className="pt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {title}
        </span>
      </div>
    </div>
  );
}

export type EmailRibbonProps = {
  hasSelection: boolean;
  view: "mail" | "calendar";
  onView: (v: "mail" | "calendar") => void;
  onCompose: () => void;
  onNewMeeting: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onLabels: () => void;
  onAdvanced: () => void;
  onSync: () => void;
  onExternal: () => void;
  syncing?: boolean;
};

export function EmailRibbon(p: EmailRibbonProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5">
      <RibbonGroup title={t("emx.new")}>
        <RibbonButton icon={MailPlus} label={t("emx.newMail")} onClick={p.onCompose} />
        <RibbonButton icon={Video} label={t("emx.newMeeting")} onClick={p.onNewMeeting} />
      </RibbonGroup>

      <RibbonGroup title={t("emx.delete")}>
        <RibbonButton
          icon={Archive}
          label={t("em.mb.archive")}
          onClick={p.onArchive}
          disabled={!p.hasSelection}
        />
        <RibbonButton
          icon={Trash2}
          label={t("emx.delete")}
          onClick={p.onDelete}
          disabled={!p.hasSelection}
        />
      </RibbonGroup>

      <RibbonGroup title={t("emx.respond")}>
        <RibbonButton
          icon={Reply}
          label={t("em.51")}
          onClick={p.onReply}
          disabled={!p.hasSelection}
        />
        <RibbonButton
          icon={ReplyAll}
          label={t("em.52")}
          onClick={p.onReplyAll}
          disabled={!p.hasSelection}
        />
        <RibbonButton
          icon={Forward}
          label={t("em.53")}
          onClick={p.onForward}
          disabled={!p.hasSelection}
        />
      </RibbonGroup>

      <RibbonGroup title={t("emx.tags")}>
        <RibbonButton icon={MailOpen} label={t("emx.markRead")} onClick={p.onMarkRead} />
        <RibbonButton icon={Mail} label={t("emx.markUnread")} onClick={p.onMarkUnread} />
        <RibbonButton icon={Settings2} label={t("em.32")} onClick={p.onLabels} />
      </RibbonGroup>

      <RibbonGroup title={t("emx.find")}>
        <RibbonButton icon={Search} label={t("em.38")} onClick={p.onAdvanced} />
        <RibbonButton icon={RefreshCw} label={t("emx.sync")} onClick={p.onSync} />
      </RibbonGroup>

      <RibbonGroup title={t("emx.viewMail")}>
        <RibbonButton
          icon={Inbox}
          label={t("emx.viewMail")}
          active={p.view === "mail"}
          onClick={() => p.onView("mail")}
        />
        <RibbonButton
          icon={CalendarDays}
          label={t("emx.viewCalendar")}
          active={p.view === "calendar"}
          onClick={() => p.onView("calendar")}
        />
        <RibbonButton icon={Mail} label={t("emx.external")} onClick={p.onExternal} />
      </RibbonGroup>
    </div>
  );
}

/* ---------- External mailbox dialog ---------- */

const PROVIDERS = [
  { id: "microsoft_outlook", name: "Outlook / Microsoft 365" },
  { id: "google_mail", name: "Gmail / Google Workspace" },
];

export function ExternalMailboxDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("emx.externalTitle")}</DialogTitle>
          <DialogDescription>{t("emx.externalDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {PROVIDERS.map((pv) => (
            <div
              key={pv.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{pv.name}</div>
                <div className="text-[11px] text-muted-foreground">{t("emx.externalPending")}</div>
              </div>
              <button
                type="button"
                disabled
                className="min-h-[36px] shrink-0 rounded-lg border border-border px-3 text-xs text-muted-foreground opacity-60"
              >
                {t("emx.connect")}
              </button>
            </div>
          ))}
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("emx.externalNote")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Calendar / history panel ---------- */

export type HistoryItem = {
  id: string;
  subject: string;
  from: string;
  time: string;
  day: string;
  unread?: boolean;
};

export function EmailHistoryPanel({
  items,
  onOpen,
}: {
  items: HistoryItem[];
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const days = new Map<string, HistoryItem[]>();
  items.forEach((it) => {
    const list = days.get(it.day) ?? [];
    list.push(it);
    days.set(it.day, list);
  });

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="h-4 w-4 text-primary" />
        {t("emx.calendarTitle")}
      </div>
      {days.size === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("emx.calendarEmpty")}
        </div>
      ) : (
        <div className="space-y-4">
          {[...days.entries()].map(([day, list]) => (
            <section key={day} className="rounded-xl border border-border bg-surface">
              <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-medium">{day}</span>
                <span className="text-[11px] text-muted-foreground">
                  {list.length} {t("emx.messages")}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {list.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(it.id)}
                      className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
                    >
                      <span className="w-14 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {it.time}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm ${it.unread ? "font-semibold" : ""}`}
                        >
                          {it.subject}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {it.from}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
