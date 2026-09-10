// Giao việc thật cho từng nhân sự AI — trình bày, logic nằm ở ai-workforce.functions.ts.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  assignTasksToWorkerProfile,
  listAssignableTasks,
  listWorkforceAssignments,
} from "@/lib/api/ai-workforce.functions";
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AiWorkforceAssignments() {
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const wsId = workspaceId ?? workspaces?.[0]?.id ?? "";
  const qc = useQueryClient();

  const [profileId, setProfileId] = useState<string>(AI_WORKER_PROFILES[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const profile = useMemo(
    () => AI_WORKER_PROFILES.find((p) => p.id === profileId) ?? null,
    [profileId],
  );

  const assignments = useQuery({
    queryKey: ["workforce-assignments", wsId],
    queryFn: () => listWorkforceAssignments({ data: { workspaceId: wsId } }),
    enabled: !!wsId,
  });

  const tasks = useQuery({
    queryKey: ["workforce-assignable", wsId, search],
    queryFn: () =>
      listAssignableTasks({ data: { workspaceId: wsId, search: search || undefined } }),
    enabled: !!wsId,
  });

  const assign = useMutation({
    mutationFn: () =>
      assignTasksToWorkerProfile({
        data: { workspaceId: wsId, profileId, taskIds: selected },
      }),
    onSuccess: (r) => {
      toast.success(`Đã giao ${r.assigned} công việc cho ${profile?.name ?? "nhân sự AI"}.`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["workforce-assignments"] });
      qc.invalidateQueries({ queryKey: ["workforce-assignable"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không giao được công việc."),
  });

  const current = assignments.data?.find((a) => a.profileId === profileId);

  if (!wsId) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">Hãy chọn một không gian làm việc.</p>
    );
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Chọn nhân sự AI
        </p>
        <ul className="grid gap-1">
          {AI_WORKER_PROFILES.map((p) => {
            const count = assignments.data?.find((a) => a.profileId === p.id)?.tasks.length ?? 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setProfileId(p.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors",
                    p.id === profileId ? "bg-primary/10 text-primary" : "hover:bg-surface-2",
                  )}
                >
                  <img
                    src={p.avatarUrl}
                    alt=""
                    loading="lazy"
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.title}</span>
                  </span>
                  {count > 0 && <Badge variant="secondary">{count}</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-4">
        {profile && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">
              Việc đang giao cho {profile.name} · {profile.domain}
            </h2>
            {assignments.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Đang tải…</p>
            ) : !current?.tasks.length ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Chưa có công việc nào. Hãy chọn bên dưới để giao.
              </p>
            ) : (
              <ul className="mt-2 grid gap-1.5">
                {current.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <Badge variant="outline">{t.status}</Badge>
                    {t.due_at && (
                      <span className="text-xs text-muted-foreground">
                        hạn {t.due_at.slice(0, 10)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Chọn công việc để giao</h2>
            <label className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên công việc"
                className="min-h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          {tasks.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Đang tải công việc…</p>
          ) : !tasks.data?.length ? (
            <p className="mt-3 text-sm text-muted-foreground">Không có công việc phù hợp.</p>
          ) : (
            <ul className="mt-3 grid max-h-96 gap-1.5 overflow-y-auto">
              {tasks.data.map((t) => {
                const checked = selected.includes(t.id);
                return (
                  <li key={t.id}>
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((prev) =>
                            prev.includes(t.id)
                              ? prev.filter((x) => x !== t.id)
                              : prev.length >= 20
                                ? prev
                                : [...prev, t.id],
                          )
                        }
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <Badge variant="outline">{t.status}</Badge>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Đã chọn {selected.length} việc</span>
            <button
              type="button"
              disabled={!selected.length || assign.isPending}
              onClick={() => assign.mutate()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
            >
              {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Giao cho {profile?.name ?? "nhân sự AI"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
