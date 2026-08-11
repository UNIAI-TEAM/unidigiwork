// Mẫu email mời workspace theo vai trò: giá trị mặc định + hàm render biến.
export type InviteRole = "tenant_admin" | "manager" | "member" | "guest";

export const INVITE_ROLES: { value: InviteRole; label: string }[] = [
  { value: "tenant_admin", label: "Quản trị tổ chức" },
  { value: "manager", label: "Quản lý" },
  { value: "member", label: "Thành viên" },
  { value: "guest", label: "Khách" },
];

export const INVITE_ROLE_LABEL: Record<string, string> = {
  tenant_owner: "Chủ tổ chức",
  tenant_admin: "Quản trị tổ chức",
  manager: "Quản lý",
  member: "Thành viên",
  guest: "Khách",
};

export interface InviteEmailTemplate {
  role: InviteRole;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  footer: string;
  isActive: boolean;
  isCustom: boolean;
}

export interface InviteEmailVars {
  inviteeEmail: string;
  inviterName: string;
  tenantName: string;
  workspaceName: string;
  roleLabel: string;
  workspaceRoleLabel: string;
  permissions: string;
  expiresAt: string;
  inviteUrl: string;
}

export const INVITE_EMAIL_VARIABLES: { key: keyof InviteEmailVars; hint: string }[] = [
  { key: "inviteeEmail", hint: "Email người được mời" },
  { key: "inviterName", hint: "Người gửi lời mời" },
  { key: "tenantName", hint: "Tên tổ chức" },
  { key: "workspaceName", hint: "Tên không gian làm việc" },
  { key: "roleLabel", hint: "Vai trò trong tổ chức" },
  { key: "workspaceRoleLabel", hint: "Vai trò trong workspace" },
  { key: "permissions", hint: "Danh sách quyền được cấp" },
  { key: "expiresAt", hint: "Thời hạn lời mời" },
  { key: "inviteUrl", hint: "Liên kết chấp nhận (nút token)" },
];

const COMMON_FOOTER =
  "Liên kết này chỉ dùng được một lần và hết hạn vào {{expiresAt}}. Nếu bạn không mong đợi email này, hãy bỏ qua.";

export const DEFAULT_INVITE_TEMPLATES: Record<InviteRole, Omit<InviteEmailTemplate, "role" | "isCustom">> = {
  tenant_admin: {
    subject: "{{inviterName}} mời bạn làm Quản trị tổ chức tại {{tenantName}}",
    heading: "Lời mời quản trị tổ chức {{tenantName}}",
    body:
      "Xin chào {{inviteeEmail}},\n\n{{inviterName}} mời bạn tham gia {{tenantName}} với vai trò {{roleLabel}} và truy cập không gian làm việc {{workspaceName}} ({{workspaceRoleLabel}}).\n\nVới vai trò này bạn có thể quản lý thành viên, phân quyền, cấu hình gói dịch vụ và theo dõi nhật ký hoạt động.\n\nQuyền được cấp sẵn: {{permissions}}",
    ctaLabel: "Nhận quyền quản trị",
    footer: COMMON_FOOTER,
    isActive: true,
  },
  manager: {
    subject: "{{inviterName}} mời bạn quản lý {{workspaceName}}",
    heading: "Tham gia {{workspaceName}} với vai trò Quản lý",
    body:
      "Xin chào {{inviteeEmail}},\n\n{{inviterName}} mời bạn tham gia {{tenantName}} với vai trò {{roleLabel}} tại không gian làm việc {{workspaceName}} ({{workspaceRoleLabel}}).\n\nBạn có thể điều phối công việc, giao nhiệm vụ cho đội ngũ và vận hành quy trình tự động.\n\nQuyền được cấp sẵn: {{permissions}}",
    ctaLabel: "Bắt đầu quản lý",
    footer: COMMON_FOOTER,
    isActive: true,
  },
  member: {
    subject: "{{inviterName}} mời bạn vào không gian làm việc {{workspaceName}}",
    heading: "Bạn được mời vào {{workspaceName}}",
    body:
      "Xin chào {{inviteeEmail}},\n\n{{inviterName}} mời bạn tham gia {{tenantName}} với vai trò {{roleLabel}} tại {{workspaceName}} ({{workspaceRoleLabel}}).\n\nSau khi chấp nhận, bạn có thể cộng tác trên tài liệu, nhiệm vụ và cuộc họp của nhóm.\n\nQuyền được cấp sẵn: {{permissions}}",
    ctaLabel: "Chấp nhận lời mời",
    footer: COMMON_FOOTER,
    isActive: true,
  },
  guest: {
    subject: "{{inviterName}} chia sẻ không gian làm việc {{workspaceName}} với bạn",
    heading: "Truy cập khách vào {{workspaceName}}",
    body:
      "Xin chào {{inviteeEmail}},\n\n{{inviterName}} mời bạn truy cập {{workspaceName}} của {{tenantName}} với vai trò {{roleLabel}} ({{workspaceRoleLabel}}).\n\nTruy cập khách chỉ giới hạn ở những nội dung được chia sẻ trực tiếp với bạn.\n\nQuyền được cấp sẵn: {{permissions}}",
    ctaLabel: "Xem nội dung được chia sẻ",
    footer: COMMON_FOOTER,
    isActive: true,
  },
};

export function defaultTemplate(role: InviteRole): InviteEmailTemplate {
  return { role, isCustom: false, ...DEFAULT_INVITE_TEMPLATES[role] };
}

/** Thay thế {{bien}} bằng giá trị thực; biến không xác định giữ nguyên. */
export function renderInviteText(text: string, vars: Partial<InviteEmailVars>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => {
    const v = (vars as Record<string, string | undefined>)[key];
    return v === undefined || v === "" ? m : v;
  });
}

export function renderInviteEmail(tpl: InviteEmailTemplate, vars: Partial<InviteEmailVars>) {
  return {
    subject: renderInviteText(tpl.subject, vars),
    heading: renderInviteText(tpl.heading, vars),
    body: renderInviteText(tpl.body, vars),
    ctaLabel: renderInviteText(tpl.ctaLabel, vars),
    footer: renderInviteText(tpl.footer, vars),
    inviteUrl: vars.inviteUrl ?? "",
  };
}

export function permissionsSummary(p: { canEdit: boolean; canPublish: boolean; canRun: boolean }): string {
  const list = [
    p.canEdit ? "chỉnh sửa quy trình" : null,
    p.canPublish ? "xuất bản quy trình" : null,
    p.canRun ? "chạy quy trình" : null,
  ].filter(Boolean) as string[];
  return list.length ? list.join(", ") : "chỉ xem";
}

/** Nội dung email dạng văn bản thuần để sao chép/gửi thủ công. */
export function inviteEmailPlainText(tpl: InviteEmailTemplate, vars: Partial<InviteEmailVars>): string {
  const r = renderInviteEmail(tpl, vars);
  return `${r.heading}\n\n${r.body}\n\n${r.ctaLabel}: ${r.inviteUrl}\n\n${r.footer}`;
}