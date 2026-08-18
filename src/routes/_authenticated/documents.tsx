import { useStickySearch } from "@/lib/sticky-search";
import { FilterPageHeader } from "@/components/filter-page-header";
import { isStaleDocument } from "@/lib/metrics";
import { useI18n } from "@/lib/i18n";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  Plus,
  Search,
  Star,
  Share2,
  MessageSquare,
  Clock,
  MoreHorizontal,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Eye,
  Sparkles,
  Globe,
  History as HistoryIcon,
  Send,
  Users,
  LogOut,
  Trash2,
  Upload,
  Loader2,
  Save,
  CheckCircle2,
} from "lucide-react";
import { AppSidebar, AppTopbar, avatar } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  archiveDocument,
  createDocument,
  shareDocument,
  updateDocument,
  uploadDocumentVersion,
} from "@/lib/api/documents.functions";
import { uploadDocumentFile } from "@/lib/documents-storage";
import { notifyComingSoon } from "@/lib/coming-soon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Doc = {
  id: string;
  title: string;
  folder: string;
  content: string;
  updated_at: string;
  workspace_id: string;
};
type Workspace = { id: string; name: string; owner_id: string };
type Member = {
  user_id: string;
  role: string;
  profiles: { email: string; display_name: string | null } | null;
};

type DocumentsSearch = { filter?: "stale"; range?: number; ws?: string };

export const Route = createFileRoute("/_authenticated/documents")({
  validateSearch: (search: Record<string, unknown>): DocumentsSearch => ({
    filter: search['filter'] === "stale" ? ("stale" as const) : undefined,
    range: [7, 30, 90].includes(Number(search['range'])) ? Number(search['range']) : undefined,
    ws: typeof search['ws'] === "string" ? (search['ws'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Documents — UNIWORK" },
      { name: "description", content: "Tài liệu dự án trên nền tảng UNIWORK." },
    ],
  }),
  component: DocumentsPage,
});

function ToolbarBtn({
  icon: Icon,
  onClick,
  title,
}: {
  icon: LucideIcon;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
      disabled={!onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function DocumentsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { filter: docFilter } = Route.useSearch();
  const docsSearch = Route.useSearch();
  useStickySearch("documents", docsSearch, (saved) =>
    navigate({ to: "/documents", search: () => saved, replace: true }),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWs, setCurrentWs] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [showNew, setShowNew] = useState(false);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showNewWs, setShowNewWs] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareUserId, setShareUserId] = useState("");
  const [shareLevel, setShareLevel] = useState<"view" | "comment" | "edit" | "manage">("view");
  const [sharing, setSharing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFolder, setNewFolder] = useState("My Documents");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [rightTab, setRightTab] = useState<"ai" | "comments" | "members">("ai");
  const [aiAsk, setAiAsk] = useState("");
  const [comments, setComments] = useState<{ id: string; text: string; user: string; time: string }[]>([]);
  const [newComment, setNewComment] = useState("");
  const [history, setHistory] = useState<{ id: string; action: string; user: string; time: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isOwner = useMemo(
    () => !!currentWs && !!userId && currentWs.owner_id === userId,
    [currentWs, userId],
  );

  // load user + workspaces
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        navigate({ to: "/auth" });
        return;
      }
      setUserId(u.user.id);
      const { data: ws, error } = await supabase.from("workspaces").select("*").order("created_at");
      if (error) {
        toast.error(t("doc.1"));
        return;
      }
      setWorkspaces(ws as Workspace[]);
      if (ws && ws.length > 0) {
        // Ưu tiên workspace do dashboard truyền sang (?ws=) để số liệu khớp thẻ thống kê.
        const wanted = new URLSearchParams(window.location.search).get("ws");
        const picked = (wanted && ws.find((w) => (w as Workspace).id === wanted)) || ws[0];
        setCurrentWs(picked as Workspace);
      }
    })();
  }, [navigate]);

  // Đồng bộ lại dữ liệu từ DB (không dựa vào state cục bộ sau khi mutate).
  const reloadDocs = async (keepSelectedId?: string | null) => {
    if (!currentWs) return [] as Doc[];
    const { data: d, error } = await supabase
      .from("documents")
      .select("*")
      .eq("workspace_id", currentWs.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error(t("doc.2"));
      return [] as Doc[];
    }
    const list = (d ?? []) as Doc[];
    setDocs(list);
    setSelected((prev) => {
      const wantId = keepSelectedId !== undefined ? keepSelectedId : prev?.id;
      if (!wantId) return null;
      return list.find((x) => x.id === wantId) ?? null;
    });
    return list;
  };

  const reloadMembers = async () => {
    if (!currentWs) return;
    const { data: m } = await supabase
      .from("workspace_members")
      .select("user_id, role, profiles(email, display_name)")
      .eq("workspace_id", currentWs.id);
    setMembers((m ?? []) as unknown as Member[]);
  };

  const reloadWorkspaces = async (selectId?: string) => {
    const { data: ws, error } = await supabase.from("workspaces").select("*").order("created_at");
    if (error) {
      toast.error(t("doc.3"));
      return;
    }
    const list = (ws ?? []) as Workspace[];
    setWorkspaces(list);
    if (selectId) {
      const found = list.find((w) => w.id === selectId);
      if (found) setCurrentWs(found);
    }
  };

  // load docs + members when workspace changes
  useEffect(() => {
    if (!currentWs) {
      setDocs([]);
      setMembers([]);
      setSelected(null);
      return;
    }
    (async () => {
      const { data: d } = await supabase
        .from("documents")
        .select("*")
        .eq("workspace_id", currentWs.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      setDocs((d ?? []) as Doc[]);
      setSelected(null);
      const { data: m } = await supabase
        .from("workspace_members")
        .select("user_id, role, profiles(email, display_name)")
        .eq("workspace_id", currentWs.id);
      setMembers((m ?? []) as unknown as Member[]);
    })();
  }, [currentWs]);

  // Chia sẻ tài liệu cho thành viên workspace qua server function shareDocument
  const submitShare = async () => {
    if (!selected || !shareUserId) {
      toast.error(t("doc.4"));
      return;
    }
    setSharing(true);
    try {
      await shareDocument({
        data: {
          documentId: selected.id,
          principalType: "user",
          principalId: shareUserId,
          level: shareLevel,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      toast.success(t("doc.5"));
      await reloadDocs(selected.id);
      setShowShare(false);
      setShareUserId("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSharing(false);
    }
  };

  const createWorkspace = async () => {
    if (!newWsName.trim() || !userId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name: newWsName.trim(), owner_id: userId } as never)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(t("doc.6") + error.message);
      return;
    }
    toast.success(t("doc.7"));
    await reloadWorkspaces((data as Workspace).id);
    setShowNewWs(false);
    setNewWsName("");
  };

  const createDoc = async () => {
    if (!newTitle.trim() || !currentWs) {
      toast.error(t("doc.8"));
      return;
    }
    setSaving(true);
    try {
      const created = (await createDocument({
        data: {
          workspaceId: currentWs.id,
          title: newTitle.trim(),
          folder: newFolder.trim() || "My Documents",
          tags: [],
          sizeBytes: 0,
          idempotencyKey: crypto.randomUUID(),
        },
      })) as unknown as Doc;
      toast.success(t("doc.9"));
      await reloadDocs(created?.id ?? null);
      setShowNew(false);
      setNewTitle("");
      setNewFolder("My Documents");
    } catch (e) {
      toast.error(t("doc.10") + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateSelected = async (patch: Partial<Pick<Doc, "title" | "content">>) => {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSelected(next);
    setDocs((d) => d.map((x) => (x.id === next.id ? next : x)));
    setSaveState("saving");
    try {
      await updateDocument({
        data: {
          documentId: selected.id,
          title: patch.title,
          content: patch.content,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      await reloadDocs(selected.id);
      setHistory((prev) => [
        { id: crypto.randomUUID(), action: patch.title ? t("doc.11") : t("doc.12"), user: t("doc.13"), time: new Date().toLocaleString("vi-VN") },
        ...prev.slice(0, 49),
      ]);
      setSaveState("saved");
    } catch (e) {
      toast.error(t("doc.10") + (e as Error).message);
      setSaveState("dirty");
      await reloadDocs(selected.id);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm(t("doc.14"))) return;
    try {
      await archiveDocument({ data: { documentId: id, idempotencyKey: crypto.randomUUID() } });
      await reloadDocs(selected?.id === id ? null : selected?.id ?? null);
      toast.success(t("doc.15"));
    } catch (e) {
      toast.error(t("doc.16") + (e as Error).message);
    }
  };

  // Tải tệp thật lên storage rồi tạo tài liệu qua server function (có RLS + quota).
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!currentWs) {
      toast.error(t("doc.17"));
      return;
    }
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        // Trùng tên trong workspace ⇒ tạo phiên bản mới thay vì tài liệu mới.
        const existing = docs.find(
          (d) => d.title.trim().toLowerCase() === file.name.trim().toLowerCase(),
        );
        const up = await uploadDocumentFile({
          workspaceId: currentWs.id,
          documentKey: existing?.id,
          file,
        });
        if (existing) {
          await uploadDocumentVersion({
            data: {
              documentId: existing.id,
              storageRef: up.storageRef,
              mimeType: up.mimeType,
              sizeBytes: up.sizeBytes,
              comment: file.name,
              idempotencyKey: crypto.randomUUID(),
            },
          });
          toast.success(`${file.name}: ${t("doc.121")}`);
        } else {
          await createDocument({
            data: {
              workspaceId: currentWs.id,
              title: file.name,
              folder: newFolder.trim() || "My Documents",
              tags: [],
              storageRef: up.storageRef,
              mimeType: up.mimeType,
              sizeBytes: up.sizeBytes,
              idempotencyKey: crypto.randomUUID(),
            },
          });
        }
        ok += 1;
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    await reloadDocs();
    setUploading(false);
    if (ok > 0) toast.success(`${t("doc.122")} ${ok} ${t("doc.123")}`);
  };

  const addMember = async () => {
    // (giữ nguyên)
    if (!currentWs || !inviteEmail.trim()) return;
    const { data: p, error: pe } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", inviteEmail.trim().toLowerCase())
      .maybeSingle();
    if (pe) {
      toast.error(pe.message);
      return;
    }
    if (!p) {
      toast.error(t("doc.18"));
      return;
    }
    const { error } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: currentWs.id, user_id: p.id, role: "member" });
    if (error) {
      toast.error(t("doc.19") + error.message);
      return;
    }
    toast.success(t("doc.20"));
    setInviteEmail("");
    await reloadMembers();
  };

  const removeMember = async (uid: string) => {
    if (!currentWs) return;
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", currentWs.id)
      .eq("user_id", uid);
    if (error) {
      toast.error(error.message);
      return;
    }
    await reloadMembers();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const insertAtCursor = (before: string, after = "") => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value;
    const selectedText = value.slice(start, end);
    const replacement = `${before}${selectedText}${after}`;
    const nextValue = value.slice(0, start) + replacement + value.slice(end);
    if (selected) {
      const next = { ...selected, content: nextValue };
      setSelected(next);
      setDocs((d) => d.map((x) => (x.id === next.id ? next : x)));
    }
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + replacement.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const insertMarkdown = {
    bold: () => insertAtCursor("**", "**"),
    italic: () => insertAtCursor("_", "_"),
    underline: () => insertAtCursor("<u>", "</u>"),
    strikethrough: () => insertAtCursor("~~", "~~"),
    code: () => insertAtCursor("`", "`"),
    codeBlock: () => insertAtCursor("```\n", "\n```"),
    bullet: () => insertAtCursor("- "),
    ordered: () => insertAtCursor("1. "),
    heading: (level = 1) => insertAtCursor("#".repeat(level) + " "),
    blockquote: () => insertAtCursor("> "),
    link: () => insertAtCursor("[", "](https://)"),
    image: () => insertAtCursor("![alt](", ")"),
    table: () => insertAtCursor(`| ${t("doc.124")} 1 | ${t("doc.124")} 2 |\n| --- | --- |\n| `, " | |"),
    hr: () => insertAtCursor("\n---\n"),
  };

  const submitAiAsk = () => {
    if (!aiAsk.trim()) return;
    if (selected) {
      toast.info(t("doc.21"));
    }
    navigate({ to: "/ai", search: { q: aiAsk.trim() } });
    setAiAsk("");
  };

  const submitComment = () => {
    if (!newComment.trim() || !selected) return;
    const c = {
      id: crypto.randomUUID(),
      text: newComment.trim(),
      user: t("doc.13"),
      time: new Date().toLocaleString(),
    };
    setComments((prev) => [...prev, c]);
    setNewComment("");
    toast.success(t("doc.22"));
  };

  const exportDocument = () => {
    if (!selected) return;
    const blob = new Blob([`# ${selected.title}\n\n${selected.content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.title || "document"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printDocument = () => window.print();

  const { range: rangeDays } = Route.useSearch();
  const visibleDocs = (
    docFilter === "stale" ? docs.filter((d) => isStaleDocument(d)) : docs
  ).filter(
    (d) => !rangeDays || Date.now() - new Date(d.updated_at).getTime() <= rangeDays * 86400_000,
  );
  const userFolders = Array.from(new Set(visibleDocs.map((d) => d.folder)));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="documents" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          variant="documents"
          onOpenSidebar={() => setSidebarOpen(true)}
          onNew={() => (currentWs ? setShowNew(true) : toast.error(t("doc.23")))}
        />

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Document tree */}
          <aside className="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-64 lg:border-b-0 lg:border-r xl:w-72">
            <div className="relative flex items-center justify-between gap-2 border-b border-border px-3 py-3">
              <button
                onClick={() => setShowWsMenu((v) => !v)}
                className="flex flex-1 items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm font-medium"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[11px] font-semibold text-white">
                  {currentWs?.name?.[0]?.toUpperCase() ?? "—"}
                </span>
                <span className="truncate">{currentWs?.name ?? t("doc.24")}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setShowMembers(true)}
                title={t("doc.25")}
                className="rounded p-1.5 hover:bg-surface-2"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={signOut}
                title={t("doc.26")}
                className="rounded p-1.5 hover:bg-surface-2"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </button>
              {showWsMenu && (
                <div className="absolute left-3 right-3 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                  {workspaces.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setCurrentWs(w);
                        setShowWsMenu(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 ${currentWs?.id === w.id ? "bg-surface-2" : ""}`}
                    >
                      <Folder className="h-4 w-4 text-primary" />{" "}
                      <span className="truncate">{w.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setShowNewWs(true);
                      setShowWsMenu(false);
                    }}
                    className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm text-primary hover:bg-surface-2"
                  >
                    <Plus className="h-4 w-4" /> {t("doc.125")}
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Quick find"
                  className="w-full rounded-md bg-surface-2 py-1.5 pl-8 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <button
                onClick={() => currentWs && setShowNew(true)}
                title={t("doc.27")}
                className="rounded-md bg-surface-2 p-1.5 hover:bg-surface-2/70"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <label
                title={t("doc.28")}
                className={`flex cursor-pointer items-center rounded-md bg-surface-2 p-1.5 hover:bg-surface-2/70 ${!currentWs || uploading ? "pointer-events-none opacity-50" : ""}`}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  aria-label={t("doc.28")}
                  disabled={!currentWs || uploading}
                  onChange={(e) => {
                    void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {docFilter === "stale" && (
                <button
                  onClick={() =>
                    navigate({
                      to: "/documents",
                      search: (p) => ({ range: p.range, ws: p.ws, filter: undefined }),
                    })
                  }
                  className="mx-2 mb-2 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg bg-warning/15 px-2.5 py-1.5 text-xs text-warning hover:bg-warning/25"
                >
                  <span>{t("doc.29")}</span>
                  <span>{t("doc.30")}</span>
                </button>
              )}
              {rangeDays ? (
                <button
                  onClick={() =>
                    navigate({
                      to: "/documents",
                      search: (p) => ({ filter: p.filter === "stale" ? ("stale" as const) : undefined, ws: p.ws, range: undefined }),
                    })
                  }
                  className="mx-2 mb-2 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/25"
                >
                  <span>{rangeDays} {t("doc.126")}</span>
                  <span>{t("doc.30")}</span>
                </button>
              ) : null}
              {visibleDocs.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {docFilter === "stale"
                    ? t("doc.31")
                    : currentWs
                      ? t("doc.32")
                      : t("doc.33")}
                </div>
              ) : (
                userFolders.map((f) => (
                  <div key={f}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Folder className="h-3.5 w-3.5 text-primary" /> {f}
                    </div>
                    {visibleDocs
                      .filter((d) => d.folder === f)
                      .map((d) => (
                        <div
                          key={d.id}
                          className={`group flex items-center gap-1 rounded ${selected?.id === d.id ? "bg-primary/15" : "hover:bg-surface-2"}`}
                        >
                          <button
                            onClick={() => setSelected(d)}
                            className={`flex flex-1 items-center gap-1.5 px-2 py-1.5 pl-7 text-left text-sm ${selected?.id === d.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            <FileText className="h-4 w-4" />
                            <span className="truncate">{d.title}</span>
                          </button>
                          <button
                            onClick={() => deleteDoc(d.id)}
                            title={t("doc.34")}
                            className="opacity-0 group-hover:opacity-100 mr-1 rounded p-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border p-3 text-xs">
              <div className="mb-1.5 font-medium">Storage</div>
              <div className="mb-1 text-muted-foreground">342.6 GB of 1 TB used</div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-[34%] rounded-full bg-primary" />
                </div>
                <span className="text-muted-foreground">34%</span>
              </div>
            </div>
          </aside>

          {/* Document content */}
          <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="border-b border-border px-4 py-3 sm:px-8">
              <FilterPageHeader
                crumbs={[
                  { label: t("doc.35"), to: "/tasks" },
                  { label: t("doc.36"), to: "/documents" },
                  {
                    label:
                      docFilter === "stale"
                        ? t("doc.37")
                        : rangeDays
                          ? `${rangeDays} ngày qua`
                          : t("doc.38"),
                  },
                ]}
                title={
                  docFilter === "stale"
                    ? t("doc.39")
                    : rangeDays
                      ? `${t("doc.127")} ${rangeDays} ${t("doc.126")}`
                      : t("doc.40")
                }
                description={
                  docFilter === "stale"
                    ? t("doc.41")
                    : rangeDays
                      ? `${t("doc.128")} ${rangeDays} ${t("doc.129")}`
                      : undefined
                }
                chips={[
                  ...(docFilter === "stale"
                    ? [
                        {
                          label: t("doc.42"),
                          onClear: () =>
                            navigate({
                              to: "/documents",
                              search: (p) => ({ range: p.range, ws: p.ws, filter: undefined }),
                            }),
                        },
                      ]
                    : []),
                  ...(rangeDays
                    ? [
                        {
                          label: `${rangeDays} ${t("doc.126")}`,
                          onClear: () =>
                            navigate({
                              to: "/documents",
                              search: (p) => ({ filter: p.filter === "stale" ? ("stale" as const) : undefined, ws: p.ws, range: undefined }),
                            }),
                        },
                      ]
                    : []),
                ]}
              />
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <span>{currentWs?.name ?? "Workspace"}</span>
                  <span>/</span>
                  <span>{selected?.folder ?? "—"}</span>
                  <span>/</span>
                  <span className="font-medium text-foreground">
                    {selected?.title ?? t("doc.43")}
                  </span>
                  {selected && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!selected) { toast.error(t("doc.44")); return; }
                      setShowShare(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface-3 disabled:opacity-50"
                  >
                    <Share2 className="h-4 w-4" /> {t("doc.5s")}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface-3">
                        {previewMode ? t("doc.45") : t("doc.46")} <ChevronDown className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-surface border-border">
                      <DropdownMenuItem onClick={() => setPreviewMode(false)} className="cursor-pointer focus:bg-surface-2">{t("doc.46")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPreviewMode(true)} className="cursor-pointer focus:bg-surface-2">{t("doc.45")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-lg bg-surface-2 p-2 hover:bg-surface-3">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-surface border-border">
                      <DropdownMenuItem onClick={exportDocument} className="cursor-pointer focus:bg-surface-2">{t("doc.47")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={printDocument} className="cursor-pointer focus:bg-surface-2">{t("doc.48")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setHistoryOpen(true)} className="cursor-pointer focus:bg-surface-2">{t("doc.49")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {selected ? (
                    <input
                      value={selected.title}
                      onChange={(e) => {
                        setSelected({ ...selected, title: e.target.value });
                        setSaveState("dirty");
                      }}
                      onBlur={(e) => updateSelected({ title: e.target.value })}
                      className="w-full bg-transparent text-2xl font-bold focus:outline-none sm:text-3xl"
                    />
                  ) : (
                    <h1 className="text-2xl font-bold sm:text-3xl">{t("doc.50")}</h1>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {selected
                        ? `${t("doc.130")} ${new Date(selected.updated_at).toLocaleString()}`
                        : "—"}
                    </span>
                    {selected && (
                      <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                        Current
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <button
                    onClick={() => setRightTab("comments")}
                    className={`rounded p-1.5 hover:bg-surface-2 ${rightTab === "comments" ? "text-primary" : ""}`}
                    title={t("doc.51")}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setHistoryOpen(true)}
                    className="rounded p-1.5 hover:bg-surface-2"
                    title={t("doc.49")}
                  >
                    <HistoryIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {members.length} {t("doc.131")}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {docs.length} {t("doc.132")}
                </span>
                <div className="ml-auto flex -space-x-1.5">
                  {members.slice(0, 5).map((m) => (
                    <img
                      key={m.user_id}
                      src={avatar(m.user_id)}
                      className="h-6 w-6 rounded-full border-2 border-surface"
                      alt=""
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-8">
              <ToolbarBtn icon={ChevronDown} onClick={() => insertMarkdown.hr()} title={t("doc.52")} />
              <ToolbarBtn icon={ChevronRight} onClick={() => insertMarkdown.blockquote()} title={t("doc.53")} />
              <select
                onChange={(e) => insertMarkdown.heading(Number(e.target.value))}
                className="mx-1 rounded bg-surface-2 px-2 py-1 text-xs text-foreground focus:outline-none"
                title={t("doc.54")}
                value=""
              >
                <option value="" disabled>Heading</option>
                <option value="1">H1</option>
                <option value="2">H2</option>
                <option value="3">H3</option>
                <option value="4">H4</option>
              </select>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={Bold} onClick={() => insertMarkdown.bold()} title={t("doc.55")} />
              <ToolbarBtn icon={Italic} onClick={() => insertMarkdown.italic()} title={t("doc.56")} />
              <ToolbarBtn icon={Underline} onClick={() => insertMarkdown.underline()} title={t("doc.57")} />
              <ToolbarBtn icon={Strikethrough} onClick={() => insertMarkdown.strikethrough()} title={t("doc.58")} />
              <ToolbarBtn icon={Code} onClick={() => insertMarkdown.code()} title="Code" />
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={List} onClick={() => insertMarkdown.bullet()} title={t("doc.59")} />
              <ToolbarBtn icon={ListOrdered} onClick={() => insertMarkdown.ordered()} title={t("doc.60")} />
              <ToolbarBtn icon={AlignLeft} onClick={() => insertMarkdown.blockquote()} title={t("doc.61")} />
              <ToolbarBtn icon={AlignCenter} onClick={() => insertAtCursor("<center>", "</center>")} title={t("doc.62")} />
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={LinkIcon} onClick={() => insertMarkdown.link()} title={t("doc.63")} />
              <ToolbarBtn icon={ImageIcon} onClick={() => insertMarkdown.image()} title={t("doc.64")} />
              <ToolbarBtn icon={TableIcon} onClick={() => insertMarkdown.table()} title={t("doc.65")} />
              <ToolbarBtn icon={MoreHorizontal} onClick={() => insertMarkdown.codeBlock()} title={t("doc.66")} />
            </div>

            <article className="flex-1 px-4 py-6 sm:px-8">
              {selected ? (
                previewMode ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {selected.content || t("doc.67")}
                  </div>
                ) : (
                  <textarea
                    ref={contentRef}
                    value={selected.content}
                    onChange={(e) => {
                      setSelected({ ...selected, content: e.target.value });
                      setSaveState("dirty");
                    }}
                    onBlur={(e) => updateSelected({ content: e.target.value })}
                    placeholder={t("doc.68")}
                    className="min-h-[400px] w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                )
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t("doc.133")}{" "}
                    <span className="font-medium text-foreground">{currentWs?.name ?? "—"}</span>.
                  </p>
                  <button
                    onClick={() =>
                      currentWs ? setShowNew(true) : toast.error(t("doc.23"))
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    disabled={!currentWs}
                  >
                    <Plus className="h-4 w-4" /> {t("doc.134")}
                  </button>
                </div>
              )}
            </article>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-8">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" /> Vietnamese
                </span>
              </div>
              <div className="flex items-center gap-4">
                {selected &&
                  (saveState === "saving" ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t("doc.135")}
                    </span>
                  ) : saveState === "dirty" ? (
                    <button
                      type="button"
                      onClick={() => updateSelected({ content: selected.content, title: selected.title })}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-warning hover:bg-surface-2"
                      title={t("doc.69")}
                      aria-label={t("doc.69")}
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden /> {t("doc.136")}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-success" title={t("doc.70")}>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t("doc.137")}
                    </span>
                  ))}
              </div>
            </footer>
          </section>

          {/* Right panel */}
          <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface xl:w-80 xl:border-l xl:border-t-0 2xl:w-96">
            <div className="flex gap-5 overflow-x-auto border-b border-border px-5 pt-4 text-sm">
              <button
                onClick={() => setRightTab("ai")}
                className={`pb-3 ${rightTab === "ai" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground"}`}
              >
                AI Copilot
              </button>
              <button
                onClick={() => setRightTab("comments")}
                className={`pb-3 ${rightTab === "comments" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground"}`}
              >
                Comments
              </button>
              <button
                onClick={() => setShowMembers(true)}
                className={`pb-3 ${rightTab === "members" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground"}`}
              >
                Members
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {rightTab === "ai" && (
                <>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4 text-primary" /> AI Summary
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selected
                        ? t("doc.71")
                        : t("doc.72")}
                    </p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4 text-primary" /> Ask AI
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                      <input
                        value={aiAsk}
                        onChange={(e) => setAiAsk(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitAiAsk()}
                        placeholder="Ask anything…"
                        className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none"
                      />
                      <button
                        onClick={submitAiAsk}
                        disabled={!aiAsk.trim()}
                        className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-40"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
              {rightTab === "comments" && (
                <div className="flex h-full flex-col gap-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <MessageSquare className="h-4 w-4 text-primary" /> {t("doc.138")}
                  </div>
                  <div className="flex-1 space-y-3">
                    {comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("doc.73")}</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="rounded-lg border border-border bg-surface-2 p-3">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium">{c.user}</span>
                            <span className="text-muted-foreground">{c.time}</span>
                          </div>
                          <p className="text-xs text-foreground">{c.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitComment()}
                      placeholder={t("doc.74")}
                      disabled={!selected}
                      className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none"
                    />
                    <button
                      onClick={submitComment}
                      disabled={!selected || !newComment.trim()}
                      className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-40"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {rightTab === "members" && (
                <div className="space-y-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-primary" /> {t("doc.139")}
                  </div>
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-2 rounded-lg bg-surface-2 p-2">
                        <img src={avatar(m.user_id)} className="h-7 w-7 rounded-full" alt="" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">
                            {m.profiles?.display_name || m.profiles?.email || m.user_id}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{m.role}</div>
                        </div>
                      </div>
                    ))}
                    {members.length === 0 && <p className="text-xs text-muted-foreground">{t("doc.75")}</p>}
                  </div>
                  <button
                    onClick={() => setShowMembers(true)}
                    className="w-full rounded-lg border border-border bg-surface-2 py-1.5 text-xs hover:bg-surface-3"
                  >
                    {t("doc.140")}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {showNew && (
        <Modal onClose={() => !saving && setShowNew(false)}>
          <h2 className="mb-1 text-lg font-semibold">{t("doc.76")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("doc.141")} «{currentWs?.name}».
          </p>
          <Field label={t("doc.54")}>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDoc()}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Field>
          <Field label={t("doc.77")}>
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Field>
          <Actions>
            <button
              onClick={() => setShowNew(false)}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
            >
              {t("doc.142")}
            </button>
            <button
              onClick={createDoc}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? t("doc.78") : t("doc.79")}
            </button>
          </Actions>
        </Modal>
      )}

      {showNewWs && (
        <Modal onClose={() => !saving && setShowNewWs(false)}>
          <h2 className="mb-1 text-lg font-semibold">{t("doc.80")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t("doc.81")}</p>
          <Field label={t("doc.82")}>
            <input
              autoFocus
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Field>
          <Actions>
            <button
              onClick={() => setShowNewWs(false)}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
            >
              {t("doc.142")}
            </button>
            <button
              onClick={createWorkspace}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {t("doc.143")}
            </button>
          </Actions>
        </Modal>
      )}

      {showShare && selected && (
        <Modal onClose={() => !sharing && setShowShare(false)}>
          <h2 className="mb-1 text-lg font-semibold">{t("doc.83")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">«{selected.title}»</p>
          <Field label={t("doc.25")}>
            <select
              value={shareUserId}
              onChange={(e) => setShareUserId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">{t("doc.84")}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profiles?.display_name || m.profiles?.email || m.user_id}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("doc.85")}>
            <select
              value={shareLevel}
              onChange={(e) => setShareLevel(e.target.value as typeof shareLevel)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="view">{t("doc.86")}</option>
              <option value="comment">{t("doc.51")}</option>
              <option value="edit">{t("doc.46")}</option>
              <option value="manage">{t("doc.87")}</option>
            </select>
          </Field>
          <Actions>
            <button onClick={() => setShowShare(false)} disabled={sharing} className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2">{t("doc.88")}</button>
            <button onClick={submitShare} disabled={sharing || !shareUserId} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {sharing ? t("doc.89") : t("doc.90")}
            </button>
          </Actions>
        </Modal>
      )}

      {showMembers && currentWs && (
        <Modal onClose={() => setShowMembers(false)}>
          <h2 className="mb-1 text-lg font-semibold">{t("doc.91")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            «{currentWs.name}» · {isOwner ? t("doc.92") : t("doc.93")}
          </p>
          <div className="mb-4 max-h-60 space-y-1 overflow-y-auto">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-2 text-sm"
              >
                <img src={avatar(m.user_id)} className="h-7 w-7 rounded-full" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {m.profiles?.display_name ?? m.profiles?.email ?? m.user_id}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {m.profiles?.email}
                  </div>
                </div>
                <span className="rounded bg-surface px-2 py-0.5 text-[11px] capitalize">
                  {m.role}
                </span>
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => removeMember(m.user_id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isOwner && (
            <>
              <Field label={t("doc.94")}>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMember()}
                  placeholder="email@example.com"
                  type="email"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </Field>
              <p className="mb-3 text-[11px] text-muted-foreground">
                {t("doc.144")}
              </p>
              <Actions>
                <button
                  onClick={() => setShowMembers(false)}
                  className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                >
                  {t("doc.145")}
                </button>
                <button
                  onClick={addMember}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("doc.146")}
                </button>
              </Actions>
            </>
          )}
        </Modal>
      )}

      {historyOpen && selected && (
        <Modal onClose={() => setHistoryOpen(false)}>
          <h2 className="mb-1 text-lg font-semibold">{t("doc.95")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">«{selected.title}»</p>
          <div className="mb-4 max-h-60 space-y-2 overflow-y-auto text-sm">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("doc.96")}</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="rounded-lg bg-surface-2/50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{h.user}</span>
                    <span className="text-muted-foreground">{h.time}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{h.action}</div>
                </div>
              ))
            )}
          </div>
          <Actions>
            <button
              onClick={() => setHistoryOpen(false)}
              className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
            >
              {t("doc.145")}
            </button>
          </Actions>
        </Modal>
      )}

      {historyOpen && !selected && (
        <Modal onClose={() => setHistoryOpen(false)}>
          <h2 className="mb-1 text-lg font-semibold">{t("doc.49")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("doc.97")}</p>
          <Actions>
            <button onClick={() => setHistoryOpen(false)} className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2">{t("doc.98")}</button>
          </Actions>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 flex justify-end gap-2">{children}</div>;
}
