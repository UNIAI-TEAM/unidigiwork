import { useStickySearch } from "@/lib/sticky-search";
import { FilterPageHeader } from "@/components/filter-page-header";
import { isStaleDocument } from "@/lib/metrics";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  History,
  Send,
  Users,
  LogOut,
  Trash2,
  Upload,
  Loader2,
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

function ToolbarBtn({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <button className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
    </button>
  );
}

function DocumentsPage() {
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
        toast.error("Không tải được workspace");
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

  const createWorkspace = async () => {
    // (chia sẻ tài liệu bên dưới)
    if (!newWsName.trim() || !userId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name: newWsName.trim(), owner_id: userId } as never)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error("Tạo workspace thất bại: " + error.message);
      return;
    }
    toast.success("Đã tạo workspace");
    setWorkspaces((w) => [...w, data as Workspace]);
    setCurrentWs(data as Workspace);
    setShowNewWs(false);
    setNewWsName("");
  };

  const createDoc = async () => {
    if (!newTitle.trim() || !currentWs) {
      toast.error("Vui lòng nhập tiêu đề");
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
      toast.success("Đã tạo tài liệu");
      setDocs((d) => [created, ...d]);
      setSelected(created);
      setShowNew(false);
      setNewTitle("");
      setNewFolder("My Documents");
    } catch (e) {
      toast.error("Lưu thất bại: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateSelected = async (patch: Partial<Pick<Doc, "title" | "content">>) => {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSelected(next);
    setDocs((d) => d.map((x) => (x.id === next.id ? next : x)));
    try {
      await updateDocument({
        data: {
          documentId: selected.id,
          title: patch.title,
          content: patch.content,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    } catch (e) {
      toast.error("Lưu thất bại: " + (e as Error).message);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm("Xoá tài liệu này?")) return;
    try {
      await archiveDocument({ data: { documentId: id, idempotencyKey: crypto.randomUUID() } });
      setDocs((d) => d.filter((x) => x.id !== id));
      if (selected?.id === id) setSelected(null);
      toast.success("Đã xoá");
    } catch (e) {
      toast.error("Xoá thất bại: " + (e as Error).message);
    }
  };

  // Tải tệp thật lên storage rồi tạo tài liệu qua server function (có RLS + quota).
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!currentWs) {
      toast.error("Chọn workspace trước khi tải tệp");
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
          toast.success(`${file.name}: đã tạo phiên bản mới`);
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
    const { data: refreshed } = await supabase
      .from("documents")
      .select("*")
      .eq("workspace_id", currentWs.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (refreshed) setDocs(refreshed as Doc[]);
    setUploading(false);
    if (ok > 0) toast.success(`Đã tải lên ${ok} tệp`);
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
      toast.error("Không tìm thấy người dùng. Họ cần đăng ký trước.");
      return;
    }
    const { error } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: currentWs.id, user_id: p.id, role: "member" });
    if (error) {
      toast.error("Thêm thất bại: " + error.message);
      return;
    }
    toast.success("Đã thêm thành viên");
    setInviteEmail("");
    const { data: m } = await supabase
      .from("workspace_members")
      .select("user_id, role, profiles(email, display_name)")
      .eq("workspace_id", currentWs.id);
    setMembers((m ?? []) as unknown as Member[]);
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
    setMembers((m) => m.filter((x) => x.user_id !== uid));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

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
          onNew={() => (currentWs ? setShowNew(true) : toast.error("Tạo workspace trước"))}
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
                <span className="truncate">{currentWs?.name ?? "Chưa có workspace"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setShowMembers(true)}
                title="Thành viên"
                className="rounded p-1.5 hover:bg-surface-2"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={signOut}
                title="Đăng xuất"
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
                    <Plus className="h-4 w-4" /> Tạo workspace mới
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
                title="Tài liệu mới"
                className="rounded-md bg-surface-2 p-1.5 hover:bg-surface-2/70"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <label
                title="Tải tệp lên"
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
                  aria-label="Tải tệp lên"
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
                  <span>Tài liệu cần cập nhật (&gt;30 ngày)</span>
                  <span>Bỏ lọc ✕</span>
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
                  <span>{rangeDays} ngày qua</span>
                  <span>Bỏ lọc ✕</span>
                </button>
              ) : null}
              {visibleDocs.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {docFilter === "stale"
                    ? "Không có tài liệu nào quá 30 ngày chưa cập nhật"
                    : currentWs
                      ? "Chưa có tài liệu nào. Bấm + để tạo mới"
                      : "Tạo workspace đầu tiên để bắt đầu"}
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
                            title="Xoá"
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
                  { label: "Dashboard", to: "/dashboard" },
                  { label: "Tài liệu", to: "/documents" },
                  {
                    label:
                      docFilter === "stale"
                        ? "Cần cập nhật"
                        : rangeDays
                          ? `${rangeDays} ngày qua`
                          : "Tất cả",
                  },
                ]}
                title={
                  docFilter === "stale"
                    ? "Tài liệu cần cập nhật"
                    : rangeDays
                      ? `Tài liệu ${rangeDays} ngày qua`
                      : "Tất cả tài liệu"
                }
                description={
                  docFilter === "stale"
                    ? "Chưa được cập nhật trong hơn 30 ngày"
                    : rangeDays
                      ? `Được cập nhật trong ${rangeDays} ngày gần nhất`
                      : undefined
                }
                chips={[
                  ...(docFilter === "stale"
                    ? [
                        {
                          label: "Quá 30 ngày",
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
                          label: `${rangeDays} ngày qua`,
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
                    {selected?.title ?? "Chưa chọn tài liệu"}
                  </span>
                  {selected && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                  <button className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                    Editing <ChevronDown className="h-4 w-4" />
                  </button>
                  <button className="rounded-lg bg-surface-2 p-2">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {selected ? (
                    <input
                      value={selected.title}
                      onChange={(e) => setSelected({ ...selected, title: e.target.value })}
                      onBlur={(e) => updateSelected({ title: e.target.value })}
                      className="w-full bg-transparent text-2xl font-bold focus:outline-none sm:text-3xl"
                    />
                  ) : (
                    <h1 className="text-2xl font-bold sm:text-3xl">Chọn hoặc tạo tài liệu</h1>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {selected
                        ? `Cập nhật ${new Date(selected.updated_at).toLocaleString()}`
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
                  <button className="rounded p-1.5 hover:bg-surface-2">
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1.5 hover:bg-surface-2">
                    <History className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {members.length} thành viên
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {docs.length} tài liệu
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
              <ToolbarBtn icon={ChevronDown} />
              <ToolbarBtn icon={ChevronRight} />
              <button className="mx-1 flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-xs">
                Heading 1 <ChevronDown className="h-3 w-3" />
              </button>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={Bold} />
              <ToolbarBtn icon={Italic} />
              <ToolbarBtn icon={Underline} />
              <ToolbarBtn icon={Strikethrough} />
              <ToolbarBtn icon={Code} />
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={List} />
              <ToolbarBtn icon={ListOrdered} />
              <ToolbarBtn icon={AlignLeft} />
              <ToolbarBtn icon={AlignCenter} />
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarBtn icon={LinkIcon} />
              <ToolbarBtn icon={ImageIcon} />
              <ToolbarBtn icon={TableIcon} />
              <ToolbarBtn icon={MoreHorizontal} />
            </div>

            <article className="flex-1 px-4 py-6 sm:px-8">
              {selected ? (
                <textarea
                  value={selected.content}
                  onChange={(e) => setSelected({ ...selected, content: e.target.value })}
                  onBlur={(e) => updateSelected({ content: e.target.value })}
                  placeholder="Bắt đầu viết tài liệu của bạn…"
                  className="min-h-[400px] w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-muted-foreground">
                    Chọn một tài liệu từ thanh bên trái, hoặc tạo mới trong workspace{" "}
                    <span className="font-medium text-foreground">{currentWs?.name ?? "—"}</span>.
                  </p>
                  <button
                    onClick={() =>
                      currentWs ? setShowNew(true) : toast.error("Tạo workspace trước")
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    disabled={!currentWs}
                  >
                    <Plus className="h-4 w-4" /> Tạo tài liệu mới
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
                {selected && <span className="flex items-center gap-1 text-success">● Đã lưu</span>}
              </div>
            </footer>
          </section>

          {/* Right AI panel */}
          <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface xl:w-80 xl:border-l xl:border-t-0 2xl:w-96">
            <div className="flex gap-5 overflow-x-auto border-b border-border px-5 pt-4 text-sm">
              <button className="border-b-2 border-primary pb-3 font-medium">AI Copilot</button>
              <button className="pb-3 text-muted-foreground">Comments</button>
              <button onClick={() => setShowMembers(true)} className="pb-3 text-muted-foreground">
                Members
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Summary
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {selected
                    ? "Tóm tắt sẽ xuất hiện ở đây sau khi bạn viết nội dung tài liệu."
                    : "Chọn một tài liệu để xem tóm tắt AI."}
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> Ask AI
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <input
                    placeholder="Ask anything…"
                    className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button className="rounded-md bg-primary p-1.5 text-primary-foreground">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {showNew && (
        <Modal onClose={() => !saving && setShowNew(false)}>
          <h2 className="mb-1 text-lg font-semibold">Tạo tài liệu mới</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Lưu vào workspace «{currentWs?.name}».
          </p>
          <Field label="Tiêu đề">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDoc()}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Field>
          <Field label="Thư mục">
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
              Huỷ
            </button>
            <button
              onClick={createDoc}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Tạo"}
            </button>
          </Actions>
        </Modal>
      )}

      {showNewWs && (
        <Modal onClose={() => !saving && setShowNewWs(false)}>
          <h2 className="mb-1 text-lg font-semibold">Tạo workspace mới</h2>
          <p className="mb-4 text-xs text-muted-foreground">Bạn sẽ là chủ sở hữu.</p>
          <Field label="Tên workspace">
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
              Huỷ
            </button>
            <button
              onClick={createWorkspace}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Tạo
            </button>
          </Actions>
        </Modal>
      )}

      {showMembers && currentWs && (
        <Modal onClose={() => setShowMembers(false)}>
          <h2 className="mb-1 text-lg font-semibold">Thành viên workspace</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            «{currentWs.name}» · {isOwner ? "Bạn là chủ" : "Bạn là thành viên"}
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
              <Field label="Mời thành viên qua email">
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
                Người dùng cần đã đăng ký tài khoản.
              </p>
              <Actions>
                <button
                  onClick={() => setShowMembers(false)}
                  className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                >
                  Đóng
                </button>
                <button
                  onClick={addMember}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Thêm
                </button>
              </Actions>
            </>
          )}
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
