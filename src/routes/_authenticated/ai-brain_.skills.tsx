// SKILL HUB — thư viện kỹ năng AI của tổ chức: xem, bật/tắt, chỉnh sửa, thêm mới (thủ công hoặc do AI soạn).
// Ghi thẳng vào danh mục kỹ năng hiện có (public.ai_skills), không tạo bảng quyền mới.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Sparkles, Trash2, Upload, Zap } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useI18n } from "@/lib/i18n";
import {
  deleteAiSkill,
  draftAiSkillWithAi,
  getAiSkillsPermission,
  listAiSkills,
  saveAiSkill,
  seedDefaultAiSkills,
  setAiSkillEnabled,
} from "@/lib/api/ai-skills.functions";
import { AI_ACTION_TYPES, type AiActionType } from "@/domain/ai-actions/contracts";
import {
  AI_SKILL_KINDS,
  AI_SKILL_KIND_HINTS,
  AI_SKILL_KIND_LABELS,
  type AiSkillKind,
} from "@/domain/workflow-agents/skills";

export const Route = createFileRoute("/_authenticated/ai-brain_/skills")({
  head: () => ({
    meta: [
      { title: "Skill Hub — UNIWORK" },
      {
        name: "description",
        content:
          "Thư viện kỹ năng AI của tổ chức: bật, tắt, chỉnh sửa và để AI soạn kỹ năng mới; kỹ năng rủi ro cao luôn cần người duyệt.",
      },
      { property: "og:title", content: "Skill Hub — UNIWORK" },
      {
        property: "og:description",
        content: "Thư viện kỹ năng AI của tổ chức: bật, tắt, chỉnh sửa và để AI soạn kỹ năng mới.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SkillHubPage,
});

type SkillRow = {
  id: string;
  workspace_id: string | null;
  code: string;
  name: string;
  kind: AiSkillKind;
  description: string | null;
  example: string | null;
  action_types: string[] | null;
  sources: string[] | null;
  enabled: boolean;
  is_system: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Kỹ năng có thể thay đổi dữ liệu luôn bắt buộc người duyệt. */
function requiresApproval(skill: { kind: AiSkillKind; action_types: string[] | null }) {
  return skill.kind === "ACTION" || (skill.action_types?.length ?? 0) > 0;
}

const KIND_TONE: Record<AiSkillKind, string> = {
  RETRIEVAL: "bg-primary/10 text-primary",
  ANALYSIS: "bg-muted text-foreground",
  GENERATION: "bg-primary/10 text-primary",
  ACTION: "bg-destructive/10 text-destructive",
};

const emptyForm = {
  id: null as string | null,
  code: "",
  name: "",
  kind: "RETRIEVAL" as AiSkillKind,
  description: "",
  example: "",
  actionTypes: [] as AiActionType[],
  enabled: true,
  isSystem: false,
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function SkillIcon({ kind }: { kind: AiSkillKind }) {
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-semibold",
        KIND_TONE[kind],
      )}
      aria-hidden
    >
      <Zap className="h-4 w-4" />
    </span>
  );
}

function SkillHubPage() {
  const { t } = useI18n();
  const [open, setOpen] = useSidebarState();
  const { workspaceId } = useActiveWorkspace();
  const qc = useQueryClient();

  const listFn = useServerFn(listAiSkills);
  const toggleFn = useServerFn(setAiSkillEnabled);
  const saveFn = useServerFn(saveAiSkill);
  const deleteFn = useServerFn(deleteAiSkill);
  const permFn = useServerFn(getAiSkillsPermission);
  const seedFn = useServerFn(seedDefaultAiSkills);
  const draftFn = useServerFn(draftAiSkillWithAi);

  const perm = useQuery({
    queryKey: ["ai-brain", "skills-permission", workspaceId],
    queryFn: () => permFn({ data: { workspaceId: workspaceId ?? null } }),
    staleTime: 60_000,
  });
  const canEdit = perm.data?.canEdit === true;

  const skills = useQuery({
    queryKey: ["ai-brain", "skills", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId ?? null } }),
  });

  const rows = useMemo(() => (skills.data ?? []) as unknown as SkillRow[], [skills.data]);

  const groups = useMemo(
    () => [
      { key: "mine", label: "Kỹ năng của tổ chức", rows: rows.filter((r) => !r.is_system) },
      {
        key: "system",
        label: "Kỹ năng do UNIWORK cung cấp",
        rows: rows.filter((r) => r.is_system),
      },
    ],
    [rows],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((r) => r.id === selectedId)) setSelectedId(rows[0]!.id);
  }, [rows, selectedId]);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ai-brain"] });
    void qc.invalidateQueries({ queryKey: ["ai-skills"] });
  };

  const toggle = useMutation({
    mutationFn: (v: { skillId: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      toast.success("Đã cập nhật kỹ năng.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không thể cập nhật kỹ năng."),
  });

  const [form, setForm] = useState(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: form.id,
          workspaceId: workspaceId ?? null,
          scopeWorkspaceId: null,
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          kind: form.kind,
          description: form.description,
          example: form.example,
          actionTypes: form.actionTypes,
          sources: [],
          enabled: form.enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu kỹ năng.");
      setEditorOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không lưu được kỹ năng."),
  });

  const draft = useMutation({
    mutationFn: () =>
      draftFn({ data: { prompt: aiPrompt.trim(), workspaceId: workspaceId ?? null } }),
    onSuccess: (d) => {
      setForm({
        ...emptyForm,
        code: d.code,
        name: d.name,
        kind: d.kind as AiSkillKind,
        description: d.description,
        example: d.example,
        actionTypes: d.actionTypes as AiActionType[],
      });
      setAiOpen(false);
      setEditorOpen(true);
      toast.success("AI đã soạn bản nháp. Hãy xem lại rồi lưu.");
    },
    onError: (e: Error) => toast.error(e.message || "AI chưa soạn được kỹ năng."),
  });

  const seed = useMutation({
    mutationFn: () => seedFn({ data: { workspaceId: workspaceId ?? null } }),
    onSuccess: (r: { inserted: number }) => {
      toast.success(`Đã nạp ${r.inserted} kỹ năng mặc định.`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không nạp được kỹ năng mặc định."),
  });

  const remove = useMutation({
    mutationFn: (skillId: string) => deleteFn({ data: { skillId } }),
    onSuccess: () => {
      toast.success("Đã xoá kỹ năng.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không xoá được kỹ năng."),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditorOpen(true);
  };

  const openEdit = (row: SkillRow) => {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      description: row.description ?? "",
      example: row.example ?? "",
      actionTypes: ((row.action_types ?? []) as AiActionType[]).filter((a) =>
        (AI_ACTION_TYPES as readonly string[]).includes(a),
      ),
      enabled: row.enabled,
      isSystem: row.is_system,
    });
    setEditorOpen(true);
  };

  const disabledWithActions = useMemo(
    () => rows.filter((r) => !r.enabled && (r.action_types?.length ?? 0) > 0),
    [rows],
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-brain" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/ai-brain"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("nav.aiBrain")}
            </Link>
            <Link
              to="/workflows/agents"
              search={{ profile: undefined }}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {t("aiBrain.openAgents")}
            </Link>
          </div>

          {/* Header kiểu Skill hub: tiêu đề trái, hành động phải */}
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <Zap className="h-6 w-6 text-primary" aria-hidden />
                {t("aiBrain.skills.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("aiBrain.skills.subtitle")}</p>
            </div>
            {canEdit && (
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() => {
                    setAiPrompt("");
                    setAiOpen(true);
                  }}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> AI soạn kỹ năng
                </Button>
                <Button className="min-h-11 flex-1 sm:flex-none" onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" /> Tạo kỹ năng
                </Button>
              </div>
            )}
          </div>

          {!canEdit && (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {t("aiBrain.skills.readonly")}
            </p>
          )}

          {disabledWithActions.length > 0 && (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Đang tắt {disabledWithActions.length} kỹ năng có quyền đề xuất. AI sẽ không tạo đề
              xuất mới cho:{" "}
              {Array.from(new Set(disabledWithActions.flatMap((s) => s.action_types ?? []))).join(
                ", ",
              )}
              .
            </p>
          )}

          {skills.isLoading && (
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          )}

          {!skills.isLoading && rows.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              <p>{t("aiBrain.skills.empty")}</p>
              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    onClick={() => seed.mutate()}
                    disabled={seed.isPending}
                  >
                    <Upload className="mr-1.5 h-4 w-4" /> Nạp kỹ năng mặc định
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    onClick={() => {
                      setAiPrompt("");
                      setAiOpen(true);
                    }}
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" /> AI soạn kỹ năng
                  </Button>
                </div>
              )}
            </div>
          )}

          {!skills.isLoading && rows.length > 0 && (
            <div className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              {/* Cột trái: danh mục kỹ năng theo nhóm */}
              <aside
                className={cn(
                  "rounded-xl border border-border bg-card p-2",
                  selected && "hidden lg:block",
                )}
              >
                {groups
                  .filter((g) => g.rows.length > 0)
                  .map((g) => (
                    <div key={g.key} className="mb-2 last:mb-0">
                      <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {g.label}
                      </p>
                      <ul>
                        {g.rows.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(r.id)}
                              className={cn(
                                "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted",
                                selectedId === r.id && "bg-muted font-medium",
                              )}
                            >
                              <SkillIcon kind={r.kind} />
                              <span className="min-w-0 flex-1 truncate">{r.name}</span>
                              {!r.enabled && (
                                <span className="shrink-0 text-xs text-muted-foreground">Tắt</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </aside>

              {/* Cột phải: chi tiết kỹ năng */}
              {selected && (
                <section className="min-w-0 space-y-4">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground lg:hidden"
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" /> Danh sách kỹ năng
                  </button>

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <SkillIcon kind={selected.kind} />
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold tracking-tight">
                          {selected.name}
                        </h2>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="secondary">{AI_SKILL_KIND_LABELS[selected.kind]}</Badge>
                          {requiresApproval(selected) && (
                            <Badge variant="outline">{t("aiBrain.skills.approvalRequired")}</Badge>
                          )}
                          {selected.is_system && <Badge variant="outline">UNIWORK</Badge>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="inline-flex min-h-11 min-w-11 items-center justify-center">
                        <Switch
                          checked={selected.enabled}
                          disabled={!canEdit || toggle.isPending}
                          onCheckedChange={(v) =>
                            toggle.mutate({ skillId: selected.id, enabled: v })
                          }
                          aria-label={`Bật/tắt ${selected.name}`}
                        />
                      </span>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11"
                          aria-label="Chỉnh sửa kỹ năng"
                          onClick={() => openEdit(selected)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canEdit && !selected.is_system && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11 text-destructive"
                          aria-label="Xoá kỹ năng"
                          onClick={() => remove.mutate(selected.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 md:p-6">
                    <h3 className="text-sm font-semibold">Thông tin</h3>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Nguồn</dt>
                        <dd>{selected.is_system ? "UNIWORK" : "Tổ chức của bạn"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Mã</dt>
                        <dd className="font-mono text-xs">{selected.code}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Tạo lúc</dt>
                        <dd>{fmtDate(selected.created_at)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Cập nhật</dt>
                        <dd>{fmtDate(selected.updated_at)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 md:p-6">
                    <h3 className="text-sm font-semibold">Kỹ năng</h3>

                    <h4 className="mt-4 text-base font-semibold">Mô tả</h4>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {selected.description || "Chưa có mô tả."}
                    </p>

                    <h4 className="mt-4 text-base font-semibold">Khi nào dùng</h4>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {AI_SKILL_KIND_HINTS[selected.kind]}
                    </p>
                    {selected.example && (
                      <p className="mt-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                        Ví dụ: {selected.example}
                      </p>
                    )}

                    <h4 className="mt-4 text-base font-semibold">Hành động được đề xuất</h4>
                    {(selected.action_types?.length ?? 0) === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Kỹ năng này không thay đổi dữ liệu.
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {(selected.action_types ?? []).map((a) => (
                          <li key={a}>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {a}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* AI soạn kỹ năng */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI soạn kỹ năng</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ai-skill-prompt">Mô tả việc bạn muốn AI làm thường xuyên</Label>
            <Textarea
              id="ai-skill-prompt"
              rows={5}
              value={aiPrompt}
              placeholder="Ví dụ: Mỗi thứ Hai tổng hợp rủi ro và việc trễ hạn của dự án rồi đề xuất việc cần xử lý."
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              AI chỉ tạo bản nháp. Bạn xem lại và bấm lưu thì kỹ năng mới được thêm.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setAiOpen(false)}
              disabled={draft.isPending}
            >
              Huỷ
            </Button>
            <Button
              className="min-h-11"
              onClick={() => draft.mutate()}
              disabled={draft.isPending || aiPrompt.trim().length < 5}
            >
              {draft.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Soạn bản nháp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trình soạn kỹ năng */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Chỉnh sửa kỹ năng" : "Kỹ năng mới"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="skill-name">Tên kỹ năng</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-code">Mã kỹ năng</Label>
              <Input
                id="skill-code"
                value={form.code}
                disabled={form.isSystem}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
              <p className="text-xs text-muted-foreground">Chỉ gồm A-Z, 0-9 và dấu gạch dưới.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-kind">Loại kỹ năng</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as AiSkillKind }))}
              >
                <SelectTrigger id="skill-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_SKILL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {AI_SKILL_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{AI_SKILL_KIND_HINTS[form.kind]}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-desc">Mô tả</Label>
              <Textarea
                id="skill-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-example">Ví dụ yêu cầu</Label>
              <Input
                id="skill-example"
                value={form.example}
                onChange={(e) => setForm((f) => ({ ...f, example: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Hành động được đề xuất</Label>
              <div className="flex flex-wrap gap-1.5">
                {AI_ACTION_TYPES.map((a) => {
                  const on = form.actionTypes.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          actionTypes: on
                            ? f.actionTypes.filter((x) => x !== a)
                            : [...f.actionTypes, a],
                        }))
                      }
                      className={cn(
                        "min-h-9 rounded-lg border px-2.5 text-xs transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Kỹ năng có hành động luôn cần người duyệt trước khi thực thi.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label htmlFor="skill-enabled" className="text-sm">
                Bật kỹ năng
              </Label>
              <Switch
                id="skill-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setEditorOpen(false)}>
              Huỷ
            </Button>
            <Button
              className="min-h-11"
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.name.trim() || !form.code.trim()}
            >
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
