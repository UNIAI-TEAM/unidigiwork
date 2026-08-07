import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Info, ShieldX, Crown, User, Users, Settings2 } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { explainMyWorkflowPermissions } from "@/lib/api/workflows.functions";
import { RequestAccessButton } from "@/components/workflow/request-access-button";
import type { WorkflowAction } from "@/lib/workflow-access";

const ACTION_LABEL: Record<WorkflowAction, string> = {
  edit: "Chỉnh sửa quy trình",
  publish: "Phát hành quy trình",
  run: "Chạy quy trình",
};

const PERM_FIELD: Record<WorkflowAction, string> = {
  edit: "Quyền “Sửa” (can_edit)",
  publish: "Quyền “Phát hành” (can_publish)",
  run: "Quyền “Chạy” (can_run)",
};

const SOURCE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  owner: { label: "Chủ không gian làm việc", icon: Crown },
  user: { label: "Cấp riêng cho cá nhân", icon: User },
  role: { label: "Theo vai trò/nhóm", icon: Users },
  default: { label: "Mặc định hệ thống", icon: Settings2 },
};

const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "Chủ tổ chức",
  tenant_admin: "Quản trị tổ chức",
  manager: "Quản lý",
  member: "Thành viên",
  guest: "Khách",
};

/**
 * Biểu tượng giải thích chi tiết đặt cạnh nút bị vô hiệu hoá vì thiếu quyền:
 * nêu rõ quyền còn thiếu, nguồn quyền hiện tại và nơi cần cấp quyền.
 */
export function PermissionHint({
  workspaceId,
  action,
  workflowId,
  className,
}: {
  workspaceId: string | null;
  action: WorkflowAction;
  workflowId?: string;
  className?: string;
}) {
  const q = useQuery({
    queryKey: ["workflow-effective-perms", workspaceId],
    queryFn: () => explainMyWorkflowPermissions({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const row = q.data?.permissions.find((p) => p.action === action);
  const meta = SOURCE_META[row?.source ?? "default"] ?? SOURCE_META["default"]!;
  const SIcon = meta.icon;

  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={`Vì sao ${ACTION_LABEL[action].toLowerCase()} bị vô hiệu hoá?`}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-warning hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className ?? ""}`}
        >
          <Info className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 border-border bg-card p-3 text-left">
        <div className="flex items-start gap-2">
          <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{ACTION_LABEL[action]} — bị chặn</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bạn đang thiếu <span className="font-medium text-foreground">{PERM_FIELD[action]}</span> trong
              không gian làm việc này.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <SIcon className="h-3 w-3" />
            <span>
              Nguồn quyền hiện tại: <span className="text-foreground">{meta.label}</span>
              {row?.source === "role" && row.detail ? ` (${ROLE_LABEL[row.detail] ?? row.detail})` : ""}
            </span>
          </div>
          <p className="mt-1.5 text-muted-foreground">
            Nơi cấp quyền: <span className="text-foreground">Quy trình → Phân quyền</span> — quản trị không gian
            làm việc bật {PERM_FIELD[action]} cho cá nhân bạn hoặc cho vai trò của bạn.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RequestAccessButton workspaceId={workspaceId} action={action} workflowId={workflowId} />
          {q.data?.can_manage && (
            <Link
              to="/workflows/permissions"
              className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-xs hover:bg-surface-2"
            >
              Mở trang Phân quyền
            </Link>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
