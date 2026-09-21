import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Search, Trash2, UserCog, Users } from "lucide-react";
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
import { useI18n } from "@/lib/i18n";
import {
  listHumanAgents,
  removeHumanAgent,
  saveHumanAgent,
  type HumanAgentDTO,
} from "@/lib/api/human-agents.functions";

export const Route = createFileRoute("/_authenticated/human-agents")({
  head: () => ({
    meta: [
      { title: "Quản lý Human Agent — UNIWORK" },
      {
        name: "description",
        content:
          "Đăng ký người thật tham gia điều phối công việc: bật nhận việc, lĩnh vực phụ trách, email nhận việc và quyền tổ chức.",
      },
      { property: "og:title", content: "Quản lý Human Agent — UNIWORK" },
      {
        property: "og:description",
        content: "Danh sách người thật mà orchestration có thể giao việc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HumanAgentsPage,
});

const ROLES = ["tenant_owner", "tenant_admin", "tenant_member", "tenant_guest"];

type Draft = {
  userId: string;
  enabled: boolean;
  workEmail: string;
  domains: string;
  maxOpenTasks: string;
  note: string;
  role: string;
  assignRole: AssignRole;
};

function HumanAgentsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "all">("active");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const list = useQuery({ queryKey: ["human-agents"], queryFn: () => listHumanAgents() });
  const canManage = list.data?.canManage ?? false;
  const agents = useMemo(() => list.data?.agents ?? [], [list.data]);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveHumanAgent({
        data: {
          userId: d.userId,
          enabled: d.enabled,
          workEmail: d.workEmail.trim(),
          domains: d.domains
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          maxOpenTasks: Math.max(1, Math.min(200, Number(d.maxOpenTasks) || 10)),
          note: d.note.trim(),
          role: d.role,
        },
      }),
    onSuccess: () => {
      toast.success(t("ha.saved"));
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["human-agents"] });
    },
    onError: () => toast.error(t("ha.error")),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeHumanAgent({ data: { userId } }),
    onSuccess: () => {
      toast.success(t("ha.removed"));
      void qc.invalidateQueries({ queryKey: ["human-agents"] });
    },
    onError: () => toast.error(t("ha.error")),
  });

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = tab === "active" ? agents.filter((a) => a.registered && a.enabled) : agents;
    if (term) {
      rows = rows.filter(
        (a) =>
          a.name.toLowerCase().includes(term) ||
          a.accountEmail.toLowerCase().includes(term) ||
          a.workEmail.toLowerCase().includes(term),
      );
    }
    return rows;
  }, [agents, tab, q]);

  const openEditor = (a: HumanAgentDTO) =>
    setDraft({
      userId: a.userId,
      enabled: a.registered ? a.enabled : true,
      workEmail: a.workEmail,
      domains: a.domains.join(", "),
      maxOpenTasks: String(a.maxOpenTasks),
      note: a.note,
      role: a.role,
    });

  const editing = draft ? agents.find((a) => a.userId === draft.userId) : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("ha.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("ha.subtitle")}</p>
        </div>
        {!canManage && list.data?.tenantId && <Badge variant="secondary">{t("ha.readonly")}</Badge>}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { id: "active" as const, label: t("ha.tabActive"), icon: UserCog },
              { id: "all" as const, label: t("ha.tabAll"), icon: Users },
            ] satisfies Array<{ id: "active" | "all"; label: string; icon: typeof Users }>
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className="text-xs text-muted-foreground">
                {id === "active"
                  ? agents.filter((a) => a.registered && a.enabled).length
                  : agents.length}
              </span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("ha.search")}
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-card">
        {list.isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !list.data?.tenantId ? (
          <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t("ha.noTenant")}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t("ha.empty")}
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((a) => (
              <li key={a.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {a.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{a.name}</span>
                    <Badge variant={a.registered && a.enabled ? "default" : "secondary"}>
                      {!a.registered
                        ? t("ha.unregistered")
                        : a.enabled
                          ? t("ha.enabled")
                          : t("ha.disabled")}
                    </Badge>
                    <Badge variant="outline">{a.role}</Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {a.workEmail || a.accountEmail || "—"} · {a.openTasks}/{a.maxOpenTasks}{" "}
                    {t("ha.openTasks")}
                    {a.domains.length > 0 && ` · ${a.domains.join(", ")}`}
                  </span>
                </span>
                {canManage && (
                  <span className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={a.registered ? "outline" : "default"}
                      className="h-8"
                      onClick={() => openEditor(a)}
                    >
                      {a.registered ? (
                        t("ha.edit")
                      ) : (
                        <>
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {t("ha.add")}
                        </>
                      )}
                    </Button>
                    {a.registered && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        aria-label={t("ha.remove")}
                        onClick={() => {
                          if (window.confirm(t("ha.confirmRemove"))) remove.mutate(a.userId);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.name ?? t("ha.add")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label htmlFor="ha-enabled" className="text-sm">
                  {t("ha.enabled")}
                </Label>
                <Switch
                  id="ha-enabled"
                  checked={draft.enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ha-email">{t("ha.workEmail")}</Label>
                <Input
                  id="ha-email"
                  type="email"
                  value={draft.workEmail}
                  placeholder={editing?.accountEmail}
                  onChange={(e) => setDraft({ ...draft, workEmail: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("ha.workEmailHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ha-domains">{t("ha.domains")}</Label>
                <Input
                  id="ha-domains"
                  value={draft.domains}
                  onChange={(e) => setDraft({ ...draft, domains: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("ha.domainsHint")}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ha-max">{t("ha.maxOpenTasks")}</Label>
                  <Input
                    id="ha-max"
                    type="number"
                    min={1}
                    max={200}
                    value={draft.maxOpenTasks}
                    onChange={(e) => setDraft({ ...draft, maxOpenTasks: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ha-role">{t("ha.role")}</Label>
                  <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}>
                    <SelectTrigger id="ha-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ha-note">{t("ha.note")}</Label>
                <Textarea
                  id="ha-note"
                  rows={3}
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t("ha.cancel")}
            </Button>
            <Button disabled={save.isPending || !draft} onClick={() => draft && save.mutate(draft)}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("ha.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
