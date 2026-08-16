import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { listWorkspaces } from "@/lib/api/workspaces.functions";
import {
  listWorkspaceTags,
  createWorkspaceTag,
  updateWorkspaceTag,
  deleteWorkspaceTag,
  type WorkspaceTagDTO,
} from "@/lib/api/workspace-tags.functions";

export const Route = createFileRoute("/_authenticated/workspace/tags")({
  head: () => ({
    meta: [
      { title: "Quản lý nhãn · UNIWORK" },
      {
        name: "description",
        content: "Tạo, sửa, xóa và gán màu cho các nhãn dùng chung trong workspace.",
      },
      { property: "og:title", content: "Quản lý nhãn · UNIWORK" },
      {
        property: "og:description",
        content: "Chuẩn hóa hệ thống nhãn của workspace để phân loại công việc dễ dàng hơn.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceTagsPage,
});

const PRESET_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring";

function WorkspaceTagsPage() {
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [workspaceId, setWorkspaceId] = useState("");

  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<WorkspaceTagDTO | null>(null);

  const workspacesQ = useQuery({ queryKey: ["workspaces", "list"], queryFn: () => listWorkspaces() });
  const workspaces = useMemo(() => workspacesQ.data ?? [], [workspacesQ.data]);

  useEffect(() => {
    if (!workspaceId && workspaces.length) setWorkspaceId(workspaces[0]!.id);
  }, [workspaces, workspaceId]);

  const tagsQ = useQuery({
    queryKey: ["workspace", workspaceId, "tags"],
    queryFn: () => listWorkspaceTags({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });

  const reset = () => {
    setEditing(null);
    setName("");
    setColor(PRESET_COLORS[0]!);
    setDescription("");
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "tags"] });
  };

  const saveM = useMutation({
    mutationFn: async (): Promise<void> => {
      if (editing) {
        await updateWorkspaceTag({
            data: { tagId: editing.id, name: name.trim(), color, description: description.trim() },
        });
        return;
      }
      await createWorkspaceTag({
        data: { workspaceId, name: name.trim(), color, description: description.trim() },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Đã cập nhật nhãn" : "Đã tạo nhãn mới");
      reset();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không lưu được nhãn"),
  });

  const deleteM = useMutation({
    mutationFn: (tagId: string) => deleteWorkspaceTag({ data: { tagId } }),
    onSuccess: () => {
      toast.success("Đã xóa nhãn");
      reset();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không xóa được nhãn"),
  });

  const canSave = Boolean(workspaceId) && name.trim().length >= 1 && !saveM.isPending;
  const tags = tagsQ.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar active="dashboard" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <AppTopbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-none px-4 py-8 sm:px-6 lg:px-8">
          <Link
            to="/workspace"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại danh sách workspace
          </Link>

          <header className="mt-4">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Tags className="h-6 w-6 text-primary" /> Quản lý nhãn
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tạo bộ nhãn dùng chung và gán màu để phân loại công việc trong workspace.
            </p>
          </header>

          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium" htmlFor="tag-ws">
              Chọn workspace
            </label>
            <select
              id="tag-ws"
              className={`${inputCls} mt-2`}
              value={workspaceId}
              onChange={(e) => {
                setWorkspaceId(e.target.value);
                reset();
              }}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
            <section className="h-fit rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">{editing ? "Sửa nhãn" : "Tạo nhãn mới"}</h2>
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canSave) saveM.mutate();
                }}
              >
                <div>
                  <label className="text-sm font-medium" htmlFor="tag-name">
                    Tên nhãn
                  </label>
                  <input
                    id="tag-name"
                    className={`${inputCls} mt-1.5`}
                    value={name}
                    maxLength={40}
                    placeholder="Ví dụ: Ưu tiên khách hàng"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <span className="text-sm font-medium">Màu nhãn</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Chọn màu ${c}`}
                        onClick={() => setColor(c)}
                        style={{ backgroundColor: c }}
                        className={`h-8 w-8 rounded-lg border transition-transform ${
                          color.toLowerCase() === c
                            ? "border-foreground scale-110"
                            : "border-border hover:scale-105"
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Chọn màu tùy chỉnh"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-lg border border-border bg-background"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Mã màu: {color}</p>
                </div>

                <div>
                  <label className="text-sm font-medium" htmlFor="tag-desc">
                    Mô tả (tùy chọn)
                  </label>
                  <input
                    id="tag-desc"
                    className={`${inputCls} mt-1.5`}
                    value={description}
                    maxLength={200}
                    placeholder="Dùng khi nào?"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <span className="text-sm font-medium">Xem trước</span>
                  <div className="mt-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${color}1a`, color, border: `1px solid ${color}55` }}
                    >
                      {name.trim() || "Tên nhãn"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!canSave}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {saveM.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {editing ? "Lưu thay đổi" : "Tạo nhãn"}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                    >
                      <X className="h-4 w-4" /> Hủy
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">
                Nhãn của workspace {tags.length > 0 && <span className="text-muted-foreground">({tags.length})</span>}
              </h2>

              {tagsQ.isLoading ? (
                <div className="mt-4 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
                  ))}
                </div>
              ) : tags.length === 0 ? (
                <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
                  <Tags className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Chưa có nhãn nào</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Tạo nhãn đầu tiên để phân loại công việc theo chủ đề, khách hàng hoặc mức độ.
                  </p>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {tags.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: `${t.color}1a`,
                          color: t.color,
                          border: `1px solid ${t.color}55`,
                        }}
                      >
                        {t.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {t.description || "—"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Sửa nhãn ${t.name}`}
                        onClick={() => {
                          setEditing(t);
                          setName(t.name);
                          setColor(t.color);
                          setDescription(t.description);
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa nhãn ${t.name}`}
                        disabled={deleteM.isPending}
                        onClick={() => {
                          if (window.confirm(`Xóa nhãn "${t.name}"?`)) deleteM.mutate(t.id);
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
