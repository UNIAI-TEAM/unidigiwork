import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  LayoutDashboard,
  MessageSquare,
  Video,
  ListChecks,
  FileText,
  BookOpen,
  Workflow,
  Users,
  BarChart3,
  Bot,
  Calendar,
  Bell,
  Settings,
  HelpCircle,
  Mail,
  Plus,
  Sparkles,
  ArrowRight,
  CornerDownLeft,
  Command as CommandIcon,
  LayoutGrid,
  ShieldCheck,
  CreditCard,
  Briefcase,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { openUniCopilot } from "@/components/ai/uni-copilot";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { readSearchScope, writeSearchScope } from "@/lib/search-scope";
import { universalSearch } from "@/lib/api/search-universal.functions";
import type { SearchKind } from "@/lib/api/search-universal.server";
import { useI18n, type Key } from "@/lib/i18n";

/**
 * Global event the topbar (and any button) can dispatch to open the palette
 * without needing a shared React context.
 */
export const OPEN_CMDK_EVENT = "uniwork:open-cmdk";
export function openCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CMDK_EVENT));
}

type CmdGroup = "result" | "nav" | "action" | "search";

const GROUP_KEY: Record<CmdGroup, Key> = {
  result: "cmd.group.result",
  nav: "cmd.group.nav",
  action: "cmd.group.action",
  search: "cmd.group.search",
};

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  project: Briefcase,
  task: ListChecks,
  meeting: Video,
  artifact: Sparkles,
  workproduct: FileText,
  document: FileText,
  email: Mail,
  chat: MessageSquare,
  person: Users,
};

const KIND_LABEL_KEY: Record<SearchKind, Key> = {
  project: "cmd.kind.project",
  task: "cmd.kind.task",
  meeting: "cmd.kind.meeting",
  artifact: "cmd.kind.artifact",
  workproduct: "cmd.kind.workproduct",
  document: "cmd.kind.document",
  email: "cmd.kind.email",
  chat: "cmd.kind.chat",
  person: "cmd.kind.person",
};

type CmdItem = {
  id: string;
  group: CmdGroup;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: (ctx: { navigate: ReturnType<typeof useNavigate>; query: string }) => void;
};

type CmdSpec = {
  id: string;
  group: CmdGroup;
  labelKey: Key;
  hintKey?: Key;
  icon: LucideIcon;
  keywords?: string;
};

// Nhãn nhóm khớp Information Architecture V2 (xem src/config/navigation.ts).
const NAV_ITEMS: CmdSpec[] = [
  { id: "tasks", group: "nav", labelKey: "nav.mywork", hintKey: "nav.group.home", icon: ListChecks, keywords: "task cong viec my work to do" },
  { id: "notifications", group: "nav", labelKey: "nav.inbox", hintKey: "nav.group.home", icon: Bell, keywords: "inbox notification thong bao" },
  { id: "workspace", group: "nav", labelKey: "nav.projects", hintKey: "nav.group.work", icon: LayoutGrid, keywords: "workspace project du an" },
  { id: "calendar", group: "nav", labelKey: "nav.calendar", hintKey: "nav.group.work", icon: Calendar, keywords: "lich calendar deadline" },
  { id: "people", group: "nav", labelKey: "nav.people", hintKey: "nav.group.work", icon: Users, keywords: "people nhan su team" },
  { id: "chat", group: "nav", labelKey: "nav.chat", hintKey: "nav.group.communication", icon: MessageSquare, keywords: "tin nhan message chat" },
  { id: "meeting", group: "nav", labelKey: "nav.meetings", hintKey: "nav.group.communication", icon: Video, keywords: "meeting hop video" },
  { id: "email", group: "nav", labelKey: "nav.email", hintKey: "nav.group.communication", icon: Mail, keywords: "mail thu" },
  { id: "documents", group: "nav", labelKey: "nav.documents", hintKey: "nav.group.knowledge", icon: FileText, keywords: "document file docs tai lieu" },
  { id: "knowledge", group: "nav", labelKey: "nav.knowledge", hintKey: "nav.group.knowledge", icon: BookOpen, keywords: "knowledge wiki tri thuc" },
  { id: "workflows", group: "nav", labelKey: "nav.workflows", hintKey: "nav.group.automation", icon: Workflow, keywords: "workflow automation quy trinh" },
  { id: "ai", group: "nav", labelKey: "nav.ai", hintKey: "nav.group.automation", icon: Bot, keywords: "ai tro ly assistant agent" },
  { id: "dashboard", group: "nav", labelKey: "nav.dashboard", hintKey: "nav.group.insights", icon: LayoutDashboard, keywords: "dashboard trang chu home tong quan" },
  { id: "reports", group: "nav", labelKey: "nav.reports", hintKey: "nav.group.insights", icon: BarChart3, keywords: "report bao cao analytics workload" },
  { id: "admin", group: "nav", labelKey: "nav.admin", hintKey: "nav.group.admin", icon: ShieldCheck, keywords: "admin quan tri console" },
  { id: "billing", group: "nav", labelKey: "nav.billing", hintKey: "nav.group.admin", icon: CreditCard, keywords: "billing goi thanh toan invoice" },
  { id: "settings", group: "nav", labelKey: "nav.settings", hintKey: "nav.group.admin", icon: Settings, keywords: "settings cai dat" },
  { id: "help", group: "nav", labelKey: "nav.help", icon: HelpCircle, keywords: "help support tro giup" },
];

const NAV_TO: Record<string, string> = {
  dashboard: "/dashboard",
  chat: "/chat",
  meeting: "/meeting",
  calendar: "/calendar",
  tasks: "/tasks",
  documents: "/documents",
  knowledge: "/knowledge",
  workflows: "/workflows",
  people: "/people",
  email: "/email",
  reports: "/reports",
  ai: "/ai",
  notifications: "/notifications",
  settings: "/settings",
  help: "/help",
  workspace: "/workspace",
  admin: "/admin",
  billing: "/billing",
};

const ACTION_ITEMS: CmdSpec[] = [
  { id: "new-meeting", group: "action", labelKey: "cmd.act.newMeeting", icon: Video, keywords: "new meeting tao hop" },
  { id: "new-task", group: "action", labelKey: "cmd.act.newTask", icon: ListChecks, keywords: "new task tao cong viec" },
  { id: "new-doc", group: "action", labelKey: "cmd.act.newDoc", icon: FileText, keywords: "new document tao tai lieu" },
  { id: "compose-email", group: "action", labelKey: "cmd.act.composeEmail", icon: Mail, keywords: "compose email soan thu" },
  { id: "ask-uni", group: "action", labelKey: "cmd.act.askUni", icon: Sparkles, keywords: "ai uni copilot hoi assistant" },
];

const ACTION_TO: Record<string, string> = {
  "new-meeting": "/meeting",
  "new-task": "/tasks",
  "new-doc": "/documents",
  "compose-email": "/email/compose",
};

// crude diacritics-insensitive normalize
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildItems(
  navigate: ReturnType<typeof useNavigate>,
  t: (k: Key) => string,
): CmdItem[] {
  const nav = NAV_ITEMS.map<CmdItem>((i) => ({
    id: i.id,
    group: i.group,
    icon: i.icon,
    keywords: i.keywords,
    label: t(i.labelKey),
    hint: i.hintKey ? t(i.hintKey) : undefined,
    run: () => navigate({ to: NAV_TO[i.id] as never }),
  }));
  const act = ACTION_ITEMS.map<CmdItem>((i) => ({
    id: i.id,
    group: i.group,
    icon: i.icon,
    keywords: i.keywords,
    label: t(i.labelKey),
    run: () =>
      i.id === "ask-uni" ? openUniCopilot() : navigate({ to: ACTION_TO[i.id] as never }),
  }));
  return [...nav, ...act];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { workspaceId: activeWorkspaceId, workspaceName } = useActiveWorkspace();
  // Giới hạn kết quả trong workspace đang làm việc (nếu có).
  const [scoped, setScoped] = useState(true);
  const scopeId = scoped && activeWorkspaceId ? activeWorkspaceId : undefined;

  // Khôi phục lựa chọn phạm vi đã lưu.
  useEffect(() => {
    const saved = readSearchScope();
    if (saved !== undefined) setScoped(saved !== null);
  }, []);

  const chooseScope = (next: boolean) => {
    setScoped(next);
    writeSearchScope(next ? (activeWorkspaceId ?? null) : null);
  };

  // Global open: ⌘K / Ctrl+K, or custom event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_CMDK_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_CMDK_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      // focus after dialog mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const all = useMemo(() => buildItems(navigate, t), [navigate, t]);

  // Debounced live search (permission-aware, Universal Search V2).
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const runSearch = useServerFn(universalSearch);
  const { data: live, isFetching } = useQuery({
    queryKey: ["cmdk-search", debounced, scopeId ?? "all"],
    queryFn: () =>
      runSearch({
        data: { q: debounced, workspaceId: scopeId, limit: 8, offset: 0 },
      }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const results = useMemo<CmdItem[]>(() => {
    const needle = norm(q.trim());
    const base = needle
      ? all.filter((i) => {
          const hay = norm(i.label + " " + (i.keywords ?? ""));
          return hay.includes(needle);
        })
      : all;
    if (needle) {
      const hits: CmdItem[] = (live?.items ?? []).map((r) => ({
        id: `hit-${r.kind}-${r.id}`,
        group: "result" as const,
        label: r.title,
        hint: t(KIND_LABEL_KEY[r.kind]),
        icon: KIND_ICON[r.kind] ?? FileText,
        run: ({ navigate }) => navigate({ href: r.href } as never),
      }));
      // Always offer a "search this query" affordance at the bottom.
      const searchItem: CmdItem = {
        id: "search-query",
        group: "search",
        label: `${t("cmd.searchAll")}: "${q.trim()}"`,
        icon: Search,
        hint: t("cmd.openSearch"),
        run: ({ navigate, query }) =>
          navigate({
            to: "/search",
            search: scopeId ? { q: query, project: scopeId } : { q: query },
          }),
      };
      return [...hits, ...base, searchItem];
    }
    return base;
  }, [all, q, live, scopeId, t]);

  // Clamp active when results change
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Group for rendering
  const grouped = useMemo(() => {
    const map = new Map<CmdGroup, CmdItem[]>();
    results.forEach((r) => {
      const arr = map.get(r.group) ?? [];
      arr.push(r);
      map.set(r.group, arr);
    });
    return Array.from(map.entries());
  }, [results]);

  const indexOf = (item: CmdItem) => results.findIndex((r) => r.id === item.id);

  const runItem = (item: CmdItem) => {
    setOpen(false);
    item.run({ navigate, query: q.trim() });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) runItem(item);
    }
  };

  // Keep active item in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t("cmd.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("cmd.desc")}</DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("cmd.placeholder")}
            className="h-12 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label={t("cmd.aria")}
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
          {isFetching && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>

        {activeWorkspaceId && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <span className="text-[11px] text-muted-foreground">{t("cmd.scope")}</span>
            <button
              type="button"
              onClick={() => chooseScope(true)}
              aria-pressed={scoped}
              className={cn(
                "max-w-[45%] truncate rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                scoped
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              {workspaceName ?? t("cmd.scope.current")}
            </button>
            <button
              type="button"
              onClick={() => chooseScope(false)}
              aria-pressed={!scoped}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                !scoped
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              {t("cmd.scope.all")}
            </button>
          </div>
        )}

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto py-2"
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {t("cmd.empty")}
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t(GROUP_KEY[group])}
                </div>
                <div>
                  {items.map((item) => {
                    const idx = indexOf(item);
                    const isActive = idx === active;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-cmd-index={idx}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => runItem(item)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : "text-foreground/90 hover:bg-surface-2",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {item.hint}
                          </span>
                        )}
                        {isActive && (
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CommandIcon className="h-3 w-3" />
            <span>{t("cmd.title")}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 sm:flex">
              <kbd className="rounded border border-border bg-surface px-1 font-mono">↑↓</kbd>
              {t("cmd.move")}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-surface px-1 font-mono">
                <CornerDownLeft className="inline h-2.5 w-2.5" />
              </kbd>
              {t("cmd.select")}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}