import { toast } from "sonner";

export type WorkflowAction = "edit" | "publish" | "run";

export interface WorkflowPerms {
  workspace_id: string;
  is_owner: boolean;
  can_edit: boolean;
  can_publish: boolean;
  can_run: boolean;
}

export const DEFAULT_WORKFLOW_PERMS: WorkflowPerms = {
  workspace_id: "",
  is_owner: false,
  can_edit: false,
  can_publish: false,
  can_run: false,
};

/** Thông báo tiếng Việt cho các lỗi bị từ chối quyền. */
const DENIAL_MESSAGES: Record<string, string> = {
  WORKFLOW_EDIT_DENIED:
    "Bạn không có quyền chỉnh sửa quy trình trong không gian làm việc này.",
  WORKFLOW_PUBLISH_DENIED:
    "Bạn không có quyền phát hành quy trình trong không gian làm việc này.",
  WORKFLOW_RUN_DENIED:
    "Bạn không có quyền chạy quy trình trong không gian làm việc này.",
  WORKSPACE_ACCESS_DENIED: "Bạn không thuộc không gian làm việc này.",
  TENANT_ACCESS_DENIED: "Bạn không thuộc tổ chức này.",
  AUTHENTICATION_REQUIRED: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
};

const DESCRIPTION =
  "Liên hệ chủ sở hữu không gian làm việc để được cấp quyền tại mục Quy trình → Phân quyền.";

export function workflowDenialCode(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return Object.keys(DENIAL_MESSAGES).find((c) => raw.includes(c)) ?? null;
}

/** Hiển thị toast lỗi rõ ràng; ưu tiên thông điệp quyền. */
export function toastWorkflowError(err: unknown, fallback = "Thao tác không thành công") {
  const code = workflowDenialCode(err);
  if (code) {
    toast.error(DENIAL_MESSAGES[code]!, {
      description: code.endsWith("_DENIED") ? DESCRIPTION : undefined,
    });
    return;
  }
  const raw = err instanceof Error ? err.message : "";
  toast.error(raw || fallback);
}

/** Lý do hiển thị khi nút bị vô hiệu do thiếu quyền. */
export function denialReason(action: WorkflowAction): string {
  const label = action === "edit" ? "chỉnh sửa" : action === "publish" ? "phát hành" : "chạy";
  return `Bạn không có quyền ${label} quy trình. ${DESCRIPTION}`;
}

/** Chặn thao tác ở client và báo lý do trước khi gọi server. */
export function guardWorkflowAction(
  perms: WorkflowPerms | null | undefined,
  action: WorkflowAction,
): boolean {
  const allowed =
    action === "edit" ? perms?.can_edit : action === "publish" ? perms?.can_publish : perms?.can_run;
  if (allowed) return true;
  toast.error(
    action === "edit"
      ? DENIAL_MESSAGES.WORKFLOW_EDIT_DENIED!
      : action === "publish"
        ? DENIAL_MESSAGES.WORKFLOW_PUBLISH_DENIED!
        : DENIAL_MESSAGES.WORKFLOW_RUN_DENIED!,
    { description: DESCRIPTION },
  );
  return false;
}
