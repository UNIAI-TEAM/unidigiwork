import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Trash2, Eye, EyeOff, Archive, ExternalLink, Search } from "lucide-react";
import {
  listKnowledgeArticles,
  saveKnowledgeArticle,
  setKnowledgeArticleStatus,
  deleteKnowledgeArticle,
  slugify,
  type KnowledgeArticleDTO,
  type KnowledgeStatus,
} from "@/lib/api/knowledge.functions";

export const Route = createFileRoute("/_authenticated/admin/knowledge")({
  head: () => ({
    meta: [
      { title: "Quản trị Knowledge — UNIWORK" },
      { name: "description", content: "Tạo, chỉnh sửa và xuất bản bài viết tri thức nội bộ." },
    ],
  }),
  component: AdminKnowledgePage,
});

const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
  archived: "Lưu trữ",
};

const STATUS_CLASS: Record<KnowledgeStatus, string> = {
  draft: "bg-surface-2 text-muted-foreground",
  published: "bg-primary/15 text-primary",
  archived: "bg-destructive/10 text-destructive",
};

const CATEGORIES = ["guide", "sop", "faq", "policy", "playbook", "technical"];

type FormState = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  category: string;
  tags: string;
  status: KnowledgeStatus;
};

const EMPTY: FormState = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  category: "guide",
  tags: "",
  status: "draft",
};

function AdminKnowledgePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<KnowledgeStatus | "all">("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "knowledge"],
    queryFn: () => listKnowledgeArticles({ data: {} }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "knowledge"] });
    void qc.invalidateQueries({ queryKey: ["knowledge"] });
  };

  const saveMut = useMutation({
    mutationFn: (input: FormState) =>
      saveKnowledgeArticle({
        data: {
          ...(input.id ? { id: input.id } : {}),
          title: input.title.trim(),
          slug: input.slug.trim() || slugify(input.title),
          summary: input.summary,
          content: input.content,
          category: input.category,
          tags: input.tags.split(",").map((t) => t.trim()).filter(Boolean),
          status: input.status,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu bài viết");
      setForm(null);
      invalidate();
    },
    onError: () => toast.error("Không lưu được bài viết. Kiểm tra quyền hoặc đường dẫn trùng."),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: KnowledgeStatus }) => setKnowledgeArticleStatus({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "published" ? "Đã xuất bản" : "Đã cập nhật trạng thái");
      invalidate();
    },
    onError: () => toast.error("Không đổi được trạng thái"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteKnowledgeArticle({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xóa bài viết");
      setConfirmId(null);
      invalidate();
    },
    onError: () => toast.error("Không xóa được bài viết"),
  });

  const articles = q.data?.articles ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return articles.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!s) return true;
      return (
        a.title.toLowerCase().includes(s) ||
        a.summary.toLowerCase().includes(s) ||
        a.tags.some((t) => t.toLowerCase().includes(s))
      );
    });
  }, [articles, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm bài viết theo tiêu đề, tóm tắt hoặc nhãn…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
          {(["all", "published", "draft", "archived"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {s === "all" ? "Tất cả" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setForm({ ...EMPTY })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Bài viết mới
        </button>
      </div>

      {q.isLoading ? (
        <PanelMessage text="Đang tải danh sách bài viết…" />
      ) : !q.data?.tenantId ? (
        <PanelMessage text="Chưa có tổ chức hoạt động cho tài khoản này." />
      ) : filtered.length === 0 ? (
        <PanelMessage text="Chưa có bài viết nào phù hợp. Tạo bài viết đầu tiên để bắt đầu." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Tiêu đề</th>
                <th className="px-4 py-3 text-left font-medium">Chuyên mục</th>
                <th className="px-4 py-3 text-left font-medium">Trạng thái</th>
                <th className="px-4 py-3 text-left font-medium">Lượt xem</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <ArticleRow
                  key={a.id}
                  article={a}
                  onEdit={() =>
                    setForm({
                      id: a.id,
                      title: a.title,
                      slug: a.slug,
                      summary: a.summary,
                      content: a.content,
                      category: a.category,
                      tags: a.tags.join(", "),
                      status: a.status,
                    })
                  }
                  onStatus={(status) => statusMut.mutate({ id: a.id, status })}
                  onDelete={() => setConfirmId(a.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ArticleDialog
          form={form}
          setForm={setForm}
          saving={saveMut.isPending}
          onClose={() => setForm(null)}
          onSubmit={() => saveMut.mutate(form)}
        />
      )}

      {confirmId && (
        <ConfirmDialog
          onCancel={() => setConfirmId(null)}
          onConfirm={() => deleteMut.mutate(confirmId)}
          pending={deleteMut.isPending}
        />
      )}
    </div>
  );
}

function PanelMessage({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ArticleRow({
  article,
  onEdit,
  onStatus,
  onDelete,
}: {
  article: KnowledgeArticleDTO;
  onEdit: () => void;
  onStatus: (s: KnowledgeStatus) => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium">{article.title}</div>
            <div className="truncate text-xs text-muted-foreground">/knowledge/{article.slug}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{article.category}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[article.status]}`}>
          {STATUS_LABEL[article.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{article.viewCount}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Link
            to="/knowledge/$slug"
            params={{ slug: article.slug }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            title="Xem bài viết"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
          {article.status === "published" ? (
            <IconBtn label="Gỡ xuất bản" onClick={() => onStatus("draft")} icon={EyeOff} disabled={!article.canEdit} />
          ) : (
            <IconBtn label="Xuất bản" onClick={() => onStatus("published")} icon={Eye} disabled={!article.canEdit} />
          )}
          <IconBtn
            label="Lưu trữ"
            onClick={() => onStatus("archived")}
            icon={Archive}
            disabled={!article.canEdit || article.status === "archived"}
          />
          <IconBtn label="Sửa" onClick={onEdit} icon={Pencil} disabled={!article.canEdit} />
          <IconBtn label="Xóa" onClick={onDelete} icon={Trash2} disabled={!article.canEdit} danger />
        </div>
      </td>
    </tr>
  );
}

function IconBtn({
  label,
  onClick,
  icon: Icon,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Eye;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ArticleDialog({
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });
  const field = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">
          {form.id ? "Chỉnh sửa bài viết" : "Tạo bài viết tri thức"}
        </h2>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Tiêu đề</span>
            <input
              className={field}
              value={form.title}
              onChange={(e) =>
                setForm({
                  ...form,
                  title: e.target.value,
                  slug: form.id ? form.slug : slugify(e.target.value),
                })
              }
              placeholder="Quy trình onboarding nhân sự mới"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Đường dẫn (slug)</span>
            <input className={field} value={form.slug} onChange={(e) => set("slug", e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Chuyên mục</span>
              <select className={field} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Trạng thái</span>
              <select
                className={field}
                value={form.status}
                onChange={(e) => set("status", e.target.value as KnowledgeStatus)}
              >
                {(["draft", "published", "archived"] as const).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Nhãn (phân cách bởi dấu phẩy)</span>
            <input className={field} value={form.tags} onChange={(e) => set("tags", e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Tóm tắt</span>
            <textarea
              className={`${field} min-h-[70px]`}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Nội dung</span>
            <textarea
              className={`${field} min-h-[200px] font-mono text-xs`}
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2"
          >
            Hủy
          </button>
          <button
            onClick={onSubmit}
            disabled={saving || form.title.trim().length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu bài viết"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  onCancel,
  onConfirm,
  pending,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-base font-semibold">Xóa bài viết?</h3>
        <p className="mt-1 text-sm text-muted-foreground">Hành động này không thể hoàn tác.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {pending ? "Đang xóa…" : "Xóa"}
          </button>
        </div>
      </div>
    </div>
  );
}
