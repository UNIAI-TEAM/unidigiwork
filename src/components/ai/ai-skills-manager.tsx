// Quản lý danh mục kỹ năng AI (bảng public.ai_skills) theo tenant + workspace.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { AI_SKILL_KINDS, AI_SKILL_KIND_LABELS, AI_SKILL_KIND_HINTS, type AiSkillKind } from "@/domain/workflow-agents/skills";
import { AI_ACTION_TOOLS, AI_ACTION_TYPES, AI_ACTION_SOURCES, type AiActionType, type AiActionSource } from "@/domain/ai-actions/contracts";
import { AI_ACTION_SOURCE_LABELS } from "@/domain/workflow-agents/contracts";
import {
  listAiSkills,
  saveAiSkill,
  setAiSkillEnabled,
  deleteAiSkill,
} from "@/lib/api/ai-skills.functions";

interface SkillRow {
  id: string;
  workspace_id: string | null;
  code: string;
  name: string;
  kind: AiSkillKind;
  description: string;
  example: string;
  action_types: string[];
  sources: string[];
  enabled: boolean;
  is_system: boolean;
}

const emptyForm = {
  id: null as string | null,
  code: "",
  name: "",
  kind: "RETRIEVAL" as AiSkillKind,
  description: "",
  example: "",
  actionTypes: [] as AiActionType[],
  sources: [] as AiActionSource[],
  enabled: true,
  scoped: false,
  isSystem: false,
};

export function AiSkillsManager() {
  const { workspaceId } = useActiveWorkspace();
  const qc = useQueryClient();
  const list = useServerFn(listAiSkills);
  const save = useServerFn(saveAiSkill);
  const toggle = useServerFn(setAiSkillEnabled);
  const remove = useServerFn(deleteAiSkill);

  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-skills", workspaceId],
    queryFn: () => list({ data: { workspaceId: workspaceId! } }) as Promise<SkillRow[]>,
    enabled: !!workspaceId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-skills", workspaceId] });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          workspaceId: workspaceId!,
          scopeWorkspaceId: form.scoped ? workspaceId! : null,
          code: form.code.trim().toUpperCase(),
          name: form.name,
          kind: form.kind,
          description: form.description,
          example: form.example,
          actionTypes: form.actionTypes,
          sources: form.sources,
          enabled: form.enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu kỹ năng AI");
      setOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không lưu được kỹ năng"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { skillId: string; enabled: boolean }) => toggle({ data: v }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Không cập nhật được"),
  });

  const deleteMut = useMutation({
    mutationFn: (skillId: string) => remove({ data: { skillId } }),
    onSuccess: () => {
      toast.success("Đã xóa kỹ năng");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không xóa được kỹ năng"),
  });

  const grouped = useMemo(() => {
    const rows = data ?? [];
    return AI_SKILL_KINDS.map((kind) => ({ kind, items: rows.filter((r) => r.kind === kind) })).filter(
      (g) => g.items.length > 0,
    );
  }, [data]);

  const openCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: SkillRow) => {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      description: row.description ?? "",
      example: row.example ?? "",
      actionTypes: (row.action_types ?? []) as AiActionType[],
      sources: ((row.sources ?? []) as AiActionSource[]).filter((s) => s !== "WORKFLOW_AGENT"),
      enabled: row.enabled,
      scoped: !!row.workspace_id,
      isSystem: row.is_system,
    });
    setOpen(true);
  };

  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  if (!workspaceId) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-sm text-muted-foreground">
        Chọn một không gian làm việc để quản lý kỹ năng AI.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Danh mục kỹ năng dùng chung toàn tổ chức và kỹ năng riêng của không gian làm việc này.
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Thêm kỹ năng
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải kỹ năng…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-sm text-muted-foreground">
          Chưa có kỹ năng nào.
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.kind}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> {AI_SKILL_KIND_LABELS[group.kind]}
              <span className="font-normal normal-case tracking-normal">— {AI_SKILL_KIND_HINTS[group.kind]}</span>
            </h2>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {group.items.map((row) => (
                <li key={row.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{row.name}</span>
                        <Badge variant="outline" className="text-[11px]">{row.code}</Badge>
                        {row.is_system && <Badge variant="secondary" className="text-[11px]">Hệ thống</Badge>}
                        {row.workspace_id ? (
                          <Badge variant="outline" className="text-[11px]">Riêng workspace</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px]">Toàn tổ chức</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                      {row.example && (
                        <p className="mt-0.5 text-xs italic text-muted-foreground">Ví dụ: {row.example}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(row.action_types ?? []).length === 0 ? (
                          <Badge variant="outline" className="text-[11px]">Chỉ đọc</Badge>
                        ) : (
                          row.action_types.map((a) => (
                            <Badge key={a} variant="secondary" className="text-[11px]">
                              {AI_ACTION_TOOLS[a as keyof typeof AI_ACTION_TOOLS]?.label ?? a}
                            </Badge>
                          ))
                        )}
                        {(row.sources ?? [])
                          .filter((s) => s !== "WORKFLOW_AGENT")
                          .map((s) => (
                            <Badge key={s} variant="outline" className="text-[11px]">
                              {AI_ACTION_SOURCE_LABELS[s as AiActionSource] ?? s}
                            </Badge>
                          ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Switch
                        checked={row.enabled}
                        onCheckedChange={(v) => toggleMut.mutate({ skillId: row.id, enabled: v })}
                        aria-label="Bật/tắt kỹ năng"
                      />
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Sửa kỹ năng">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!row.is_system && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMut.mutate(row.id)}
                            aria-label="Xóa kỹ năng"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Sửa kỹ năng AI" : "Thêm kỹ năng AI"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="skill-code">Mã kỹ năng</Label>
                <Input
                  id="skill-code"
                  value={form.code}
                  disabled={form.isSystem}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="VD: SUMMARIZE_WORK"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-name">Tên hiển thị</Label>
                <Input
                  id="skill-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Loại kỹ năng</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as AiSkillKind }))}>
                <SelectTrigger>
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
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-example">Ví dụ sử dụng</Label>
              <Input
                id="skill-example"
                value={form.example}
                onChange={(e) => setForm((f) => ({ ...f, example: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Hành động được phép đề xuất</Label>
              <div className="flex flex-wrap gap-1.5">
                {AI_ACTION_TYPES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, actionTypes: toggleIn(f.actionTypes, a) }))}
                    className={
                      form.actionTypes.includes(a)
                        ? "rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                        : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                    }
                  >
                    {AI_ACTION_TOOLS[a]?.label ?? a}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Bỏ trống = kỹ năng chỉ đọc. Mọi hành động vẫn cần người xác nhận.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Nguồn dữ liệu được đọc</Label>
              <div className="flex flex-wrap gap-1.5">
                {AI_ACTION_SOURCES.filter((s) => s !== "WORKFLOW_AGENT").map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, sources: toggleIn(f.sources, s) }))}
                    className={
                      form.sources.includes(s)
                        ? "rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                        : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                    }
                  >
                    {AI_ACTION_SOURCE_LABELS[s] ?? s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Chỉ dùng cho không gian làm việc này</p>
                <p className="text-xs text-muted-foreground">Tắt = dùng chung cho toàn tổ chức.</p>
              </div>
              <Switch checked={form.scoped} onCheckedChange={(v) => setForm((f) => ({ ...f, scoped: v }))} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Kích hoạt kỹ năng</p>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.code || !form.name}>
              {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
