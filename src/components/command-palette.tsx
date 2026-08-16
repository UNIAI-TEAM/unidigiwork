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
import { universalSearch } from "@/lib/api/search-universal.functions";
import type { SearchKind } from "@/lib/api/search-universal.server";

/**
 * Global event the topbar (and any button) can dispatch to open the palette
 * without needing a shared React context.
 */
export const OPEN_CMDK_EVENT = "uniwork:open-cmdk";
export function openCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CMDK_EVENT));
}

type CmdGroup = "Kết quả" | "Điều hướng" | "Hành động" | "Tìm kiếm";

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  project: Briefcase,
  task: ListChecks,
  meeting: Video,
  document: FileText,
  email: Mail,
  chat: MessageSquare,
  person: Users,
};

const KIND_LABEL: Record<SearchKind, string> = {
  project: "Dự án",
  task: "Công việc",
  meeting: "Cuộc họp",
  document: "Tài liệu",
  email: "Email",
  chat: "Kênh chat",
  person: "Nhân sự",
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

// Nhãn nhóm khớp Information Architecture V2 (xem src/config/navigation.ts).
const NAV_ITEMS: Omit<CmdItem, "run">[] = [
  { id: "tasks", group: "Điều hướng", label: "Công việc của tôi", hint: "Trang chủ", icon: ListChecks, keywords: "task cong viec my work to do" },
  { id: "notifications", group: "Điều hướng", label: "Hộp việc", hint: "Trang chủ", icon: Bell, keywords: "inbox notification thong bao" },
  { id: "workspace", group: "Điều hướng", label: "Không gian làm việc", hint: "Công việc", icon: LayoutGrid, keywords: "workspace project du an" },
  { id: "calendar", group: "Điều hướng", label: "Lịch", hint: "Công việc", icon: Calendar, keywords: "lich calendar deadline" },
  { id: "people", group: "Điều hướng", label: "Nhân sự", hint: "Công việc", icon: Users, keywords: "people nhan su team" },
  { id: "chat", group: "Điều hướng", label: "Chat", hint: "Trao đổi", icon: MessageSquare, keywords: "tin nhan message" },
  { id: "meeting", group: "Điều hướng", label: "Phòng họp", hint: "Trao đổi", icon: Video, keywords: "meeting hop video" },
  { id: "email", group: "Điều hướng", label: "Email Hub", hint: "Trao đổi", icon: Mail, keywords: "mail thu" },
  { id: "documents", group: "Điều hướng", label: "Tài liệu", hint: "Tri thức", icon: FileText, keywords: "document file docs" },
  { id: "knowledge", group: "Điều hướng", label: "Kho tri thức", hint: "Tri thức", icon: BookOpen, keywords: "knowledge wiki tri thuc" },
  { id: "workflows", group: "Điều hướng", label: "Quy trình", hint: "Tự động hoá", icon: Workflow, keywords: "workflow automation quy trinh" },
  { id: "ai", group: "Điều hướng", label: "AI Assistant", hint: "Tự động hoá", icon: Bot, keywords: "ai tro ly assistant agent" },
  { id: "dashboard", group: "Điều hướng", label: "Dashboard", hint: "Phân tích", icon: LayoutDashboard, keywords: "trang chu home tong quan" },
  { id: "reports", group: "Điều hướng", label: "Báo cáo", hint: "Phân tích", icon: BarChart3, keywords: "report bao cao analytics workload" },
  { id: "admin", group: "Điều hướng", label: "Quản trị hệ thống", hint: "Quản trị", icon: ShieldCheck, keywords: "admin quan tri console" },
  { id: "billing", group: "Điều hướng", label: "Gói & Thanh toán", hint: "Quản trị", icon: CreditCard, keywords: "billing goi thanh toan invoice" },
  { id: "settings", group: "Điều hướng", label: "Cài đặt", hint: "Quản trị", icon: Settings, keywords: "settings cai dat" },
  { id: "help", group: "Điều hướng", label: "Trợ giúp", icon: HelpCircle, keywords: "help support tro giup" },
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

const ACTION_ITEMS: Omit<CmdItem, "run">[] = [
  { id: "new-meeting", group: "Hành động", label: "Tạo cuộc họp mới", icon: Video, keywords: "new meeting tao hop" },
  { id: "new-task", group: "Hành động", label: "Tạo nhiệm vụ", icon: ListChecks, keywords: "new task tao cong viec" },
  { id: "new-doc", group: "Hành động", label: "Tạo tài liệu", icon: FileText, keywords: "new document tao tai lieu" },
  { id: "compose-email", group: "Hành động", label: "Soạn email", icon: Mail, keywords: "compose email soan thu" },
  { id: "ask-ai", group: "Hành động", label: "Hỏi AI Assistant", icon: Sparkles, keywords: "ai hoi assistant" },
];

const ACTION_TO: Record<string, string> = {
  "new-meeting": "/meeting",
  "new-task": "/tasks",
  "new-doc": "/documents",
  "compose-email": "/email/compose",
  "ask-ai": "/ai",
};

// crude diacritics-insensitive normalize
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildItems(navigate: ReturnType<typeof useNavigate>): CmdItem[] {
  const nav = NAV_ITEMS.map<CmdItem>((i) => ({
    ...i,
    run: () => navigate({ to: NAV_TO[i.id] as never }),
  }));
  const act = ACTION_ITEMS.map<CmdItem>((i) => ({
    ...i,
    run: () => navigate({ to: ACTION_TO[i.id] as never }),
  }));
  return [...nav, ...act];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const all = useMemo(() => buildItems(navigate), [navigate]);

  const results = useMemo<CmdItem[]>(() => {
    const needle = norm(q.trim());
    const base = needle
      ? all.filter((i) => {
          const hay = norm(i.label + " " + (i.keywords ?? ""));
          return hay.includes(needle);
        })
      : all;
    if (needle) {
      // Always offer a "search this query" affordance at the bottom.
      const searchItem: CmdItem = {
        id: "search-query",
        group: "Tìm kiếm",
        label: `Tìm "${q.trim()}" trong toàn workspace`,
        icon: Search,
        hint: "Mở /search",
        run: ({ navigate, query }) =>
          navigate({ to: "/search", search: { q: query } }),
      };
      return [...base, searchItem];
    }
    return base;
  }, [all, q]);

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
        <DialogTitle className="sr-only">Bảng lệnh</DialogTitle>
        <DialogDescription className="sr-only">
          Tìm trang, hành động hoặc tìm kiếm trong toàn workspace.
        </DialogDescription>

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
            placeholder="Đi tới trang, chạy lệnh hoặc tìm kiếm…"
            className="h-12 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Tìm lệnh"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto py-2"
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Không tìm thấy kết quả nào
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group}
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
            <span>Bảng lệnh</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 sm:flex">
              <kbd className="rounded border border-border bg-surface px-1 font-mono">↑↓</kbd>
              di chuyển
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-surface px-1 font-mono">
                <CornerDownLeft className="inline h-2.5 w-2.5" />
              </kbd>
              chọn
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}