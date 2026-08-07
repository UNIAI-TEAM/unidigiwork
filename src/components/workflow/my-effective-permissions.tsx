import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, ShieldX, Crown, User, Users, Settings2, Loader2 } from "lucide-react";
import { explainMyWorkflowPermissions } from "@/lib/api/workflows.functions";
import { RequestAccessButton } from "@/components/workflow/request-access-button";

const ACTION_LABEL: Record<string, string> = {
  edit: "Chỉnh sửa quy trình",
  publish: "Phát hành quy trình",
  run: "Chạy quy trình",
};

const SOURCE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  owner: { label: "Chủ không gian làm việc", icon: Crown, cls: "bg-warning/15 text-warning border-warning/30" },
  user: { label: "Cấp riêng cho cá nhân", icon: User, cls: "bg-primary/15 text-primary border-primary/30" },
  role: { label: "Theo vai trò/nhóm", icon: Users, cls: "bg-accent/15 text-accent-foreground border-border" },
  default: { label: "Mặc định hệ thống", icon: Settings2, cls: "bg-surface-2 text-muted-foreground border-border" },
};

const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "Chủ tổ chức",
  tenant_admin: "Quản trị tổ chức",
  manager: "Quản lý",
  member: "Thành viên",
  guest: "Khách",
};

export function MyEffectivePermissions({
  workspaceId,
  workflowId,
  className,
}: {
  workspaceId: string | null;
  workflowId?: string;
  className?: string;
}) {
  const q = useQuery({
    queryKey: ["workflow-effective-perms", workspaceId],
    queryFn: () => explainMyWorkflowPermissions({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const data = q.data;

  return (
    <section className={`rounded-xl border border-border bg-card p-4 md:p-6 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Quyền hiệu lực của tôi</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Những gì bạn được phép làm với quy trình trong không gian làm việc này và nguồn cấp quyền.
          </p>
        </div>
        {data?.can_manage && (
          <Link
            to="/workflows/permissions"
            className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
          >
            Quản lý phân quyền
          </Link>
        )}
      </div>

      {q.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải quyền…
        </div>
      ) : !data ? (
        <p className="mt-4 text-xs text-muted-foreground">Không đọc được thông tin quyền.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {data.workspace_name && (
              <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5">{data.workspace_name}</span>
            )}
            {data.is_owner && (
              <span className="rounded-md border border-warning/30 bg-warning/15 px-2 py-0.5 text-warning">
                Chủ không gian làm việc
              </span>
            )}
            {data.tenant_role && (
              <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5">
                Vai trò: {ROLE_LABEL[data.tenant_role] ?? data.tenant_role}
              </span>
            )}
          </div>

          <ul className="mt-4 space-y-2">
            {data.permissions.map((p) => {
              const meta = SOURCE_META[p.source] ?? SOURCE_META["default"]!;
              const SIcon = meta.icon;
              return (
                <li
                  key={p.action}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {p.allowed ? (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <ShieldX className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{ACTION_LABEL[p.action] ?? p.action}</div>
                      <div className={`text-[11px] ${p.allowed ? "text-success" : "text-destructive"}`}>
                        {p.allowed ? "Được phép" : "Không được phép"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${meta.cls}`}
                      title="Nguồn quyền"
                    >
                      <SIcon className="h-3 w-3" />
                      {meta.label}
                      {p.source === "role" && p.detail ? `: ${ROLE_LABEL[p.detail] ?? p.detail}` : ""}
                    </span>
                    {!p.allowed && (
                      <RequestAccessButton
                        workspaceId={data.workspace_id}
                        action={p.action}
                        workflowId={workflowId}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
