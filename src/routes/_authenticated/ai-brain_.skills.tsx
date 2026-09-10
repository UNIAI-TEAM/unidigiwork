// AI BRAIN — hồ sơ kỹ năng AI: bật/tắt, chỉnh sửa, thêm mới, xoá.
// Ghi thẳng vào danh mục kỹ năng hiện có (public.ai_skills), không tạo bảng quyền mới.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
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
import { useActiveWorkspace } from "@/lib/active-workspace";
import { useI18n } from "@/lib/i18n";
import {
  deleteAiSkill,
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
      { title: "Kỹ năng AI — UNIWORK" },
      {
        name: "description",
        content:
          "Bật, tắt và chỉnh sửa từng kỹ năng AI của tổ chức; kỹ năng rủi ro cao luôn cần người duyệt.",
      },
      { property: "og:title", content: "Kỹ năng AI — UNIWORK" },
      {
        property: "og:description",
        content:
          "Bật, tắt và chỉnh sửa từng kỹ năng AI của tổ chức; kỹ năng rủi ro cao luôn cần người duyệt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiBrainSkillsPage,
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
};

/** Kỹ năng có thể thay đổi dữ liệu luôn bắt buộc người duyệt. */
function requiresApproval(skill: { kind: AiSkillKind; action_types: string[] | null }) {
  return skill.kind === "ACTION" || (skill.action_types?.length ?? 0) > 0;
}

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

function AiBrainSkillsPage() {
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

  const grouped = useMemo(() => {
    const rows = (skills.data ?? []) as unknown as SkillRow[];
    return AI_SKILL_KINDS.map((kind) => ({
      kind,
      rows: rows.filter((r) => r.kind === kind),
    })).filter((g) => g.rows.length > 0);
  }, [skills.data]);

  const disabledWithActions = useMemo(
    () =>
      ((skills.data ?? []) as unknown as SkillRow[]).filter(
        (r) => !r.enabled && (r.action_types?.length ?? 0) > 0,
      ),
    [skills.data],
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-brain" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
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

          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{t("aiBrain.skills.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("aiBrain.skills.subtitle")}</p>
            </div>
            {canEdit && (
              <Button className="min-h-11 w-full sm:w-auto" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" /> Thêm kỹ năng
              </Button>
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

          {!skills.isLoading && grouped.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              <p>{t("aiBrain.skills.empty")}</p>
              {canEdit && (
                <Button
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  disabled={seed.isPending}
                  onClick={() => seed.mutate()}
                >
                  {seed.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Nạp kỹ năng mặc định
                </Button>
              )}
            </div>
          )}

          <div className="mt-5 space-y-6">
            {grouped.map((g) => (
              <section key={g.kind}>
                <h2 className="text-sm font-semibold">{AI_SKILL_KIND_LABELS[g.kind]}</h2>
                <p className="text-xs text-muted-foreground">{AI_SKILL_KIND_HINTS[g.kind]}</p>
                <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {g.rows.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{s.name}</p>
                          {s.is_system ? <Badge variant="outline">Hệ thống</Badge> : null}
                          {requiresApproval(s) ? (
                            <Badge variant="destructive" className="gap-1">
                              <ShieldAlert className="h-3 w-3" />{" "}
                              {t("aiBrain.skills.approvalRequired")}
                            </Badge>
                          ) : null}
                        </div>
                        {s.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                        ) : null}
                        {(s.action_types?.length ?? 0) > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Được đề xuất: {(s.action_types ?? []).join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            aria-label={`Chỉnh sửa ${s.name}`}
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canEdit && !s.is_system && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-destructive"
                            aria-label={`Xoá ${s.name}`}
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(s.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Switch
                          checked={s.enabled}
                          disabled={!canEdit || toggle.isPending}
                          onCheckedChange={(v) => toggle.mutate({ skillId: s.id, enabled: v })}
                          aria-label={s.name}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Chỉnh sửa kỹ năng" : "Thêm kỹ năng"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="skill-name">Tên kỹ năng</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="skill-code">Mã kỹ năng</Label>
              <Input
                id="skill-code"
                value={form.code}
                disabled={form.isSystem}
                placeholder="VD: SUMMARIZE_WORK"
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <Label>Loại kỹ năng</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as AiSkillKind }))}
              >
                <SelectTrigger className="min-h-11">
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
            </div>
            <div>
              <Label htmlFor="skill-desc">Mô tả</Label>
              <Textarea
                id="skill-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="skill-example">Ví dụ yêu cầu</Label>
              <Input
                id="skill-example"
                value={form.example}
                onChange={(e) => setForm((f) => ({ ...f, example: e.target.value }))}
              />
            </div>
            <div>
              <Label>Hành động AI được phép đề xuất</Label>
              <p className="text-xs text-muted-foreground">
                Bỏ chọn tất cả = kỹ năng chỉ đọc. Mọi hành động vẫn cần người duyệt.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
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
                      className={`min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Bật kỹ năng</p>
                <p className="text-xs text-muted-foreground">
                  Tắt thì AI không dùng kỹ năng này để đề xuất.
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                aria-label="Bật kỹ năng"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => setEditorOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={save.isPending || !form.name.trim() || !form.code.trim()}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Lưu kỹ năng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
