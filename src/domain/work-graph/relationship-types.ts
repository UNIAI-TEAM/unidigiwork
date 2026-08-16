// Work Graph Foundation V1 — controlled vocabulary.
// Mirrors public.work_relationship_types (DB is the enforcement authority).

export const WORK_ENTITY_TYPES = [
  "TENANT",
  "WORKSPACE",
  "TASK",
  "PERSON",
  "MEETING",
  "CHAT_CHANNEL",
  "DOCUMENT",
  "EMAIL",
] as const;
export type WorkEntityType = (typeof WORK_ENTITY_TYPES)[number];

export const WORK_RELATIONSHIP_CODES = [
  "BELONGS_TO",
  "ASSIGNED_TO",
  "PARTICIPATED_IN",
  "DISCUSSES",
  "GENERATES",
  "ATTACHED_TO",
  "REFERENCES",
  "BLOCKS",
  "DEPENDS_ON",
  "FOLLOWS_UP",
  "RELATED_TO",
  "SHARED_IN",
] as const;
export type WorkRelationshipCode = (typeof WORK_RELATIONSHIP_CODES)[number];

export type EdgeOrigin = "SYSTEM" | "USER" | "AI_SUGGESTED";
export type EdgeDirection = "IN" | "OUT";

export interface RelationshipRule {
  code: WorkRelationshipCode;
  source: WorkEntityType;
  target: WorkEntityType;
  userCreatable: boolean;
}

export const RELATIONSHIP_RULES: readonly RelationshipRule[] = [
  { code: "BELONGS_TO", source: "TASK", target: "WORKSPACE", userCreatable: false },
  { code: "BELONGS_TO", source: "TASK", target: "TASK", userCreatable: false },
  { code: "BELONGS_TO", source: "MEETING", target: "WORKSPACE", userCreatable: false },
  { code: "BELONGS_TO", source: "DOCUMENT", target: "WORKSPACE", userCreatable: false },
  { code: "BELONGS_TO", source: "EMAIL", target: "WORKSPACE", userCreatable: false },
  { code: "BELONGS_TO", source: "CHAT_CHANNEL", target: "WORKSPACE", userCreatable: false },
  { code: "ASSIGNED_TO", source: "TASK", target: "PERSON", userCreatable: false },
  { code: "PARTICIPATED_IN", source: "PERSON", target: "MEETING", userCreatable: false },
  { code: "DISCUSSES", source: "MEETING", target: "WORKSPACE", userCreatable: true },
  { code: "DISCUSSES", source: "MEETING", target: "TASK", userCreatable: true },
  { code: "GENERATES", source: "MEETING", target: "TASK", userCreatable: false },
  { code: "GENERATES", source: "MEETING", target: "DOCUMENT", userCreatable: false },
  { code: "GENERATES", source: "EMAIL", target: "TASK", userCreatable: false },
  { code: "ATTACHED_TO", source: "DOCUMENT", target: "WORKSPACE", userCreatable: true },
  { code: "ATTACHED_TO", source: "DOCUMENT", target: "TASK", userCreatable: true },
  { code: "ATTACHED_TO", source: "DOCUMENT", target: "MEETING", userCreatable: true },
  { code: "REFERENCES", source: "EMAIL", target: "WORKSPACE", userCreatable: true },
  { code: "REFERENCES", source: "EMAIL", target: "TASK", userCreatable: true },
  { code: "REFERENCES", source: "EMAIL", target: "MEETING", userCreatable: true },
  { code: "REFERENCES", source: "EMAIL", target: "DOCUMENT", userCreatable: true },
  { code: "REFERENCES", source: "TASK", target: "DOCUMENT", userCreatable: true },
  { code: "REFERENCES", source: "TASK", target: "EMAIL", userCreatable: true },
  { code: "REFERENCES", source: "TASK", target: "MEETING", userCreatable: true },
  { code: "BLOCKS", source: "TASK", target: "TASK", userCreatable: true },
  { code: "DEPENDS_ON", source: "TASK", target: "TASK", userCreatable: true },
  { code: "FOLLOWS_UP", source: "TASK", target: "MEETING", userCreatable: true },
  { code: "RELATED_TO", source: "TASK", target: "TASK", userCreatable: true },
  { code: "RELATED_TO", source: "TASK", target: "WORKSPACE", userCreatable: true },
  { code: "RELATED_TO", source: "TASK", target: "CHAT_CHANNEL", userCreatable: true },
  { code: "RELATED_TO", source: "WORKSPACE", target: "CHAT_CHANNEL", userCreatable: true },
  { code: "RELATED_TO", source: "WORKSPACE", target: "DOCUMENT", userCreatable: true },
  { code: "RELATED_TO", source: "WORKSPACE", target: "MEETING", userCreatable: true },
  { code: "RELATED_TO", source: "MEETING", target: "DOCUMENT", userCreatable: true },
  { code: "RELATED_TO", source: "DOCUMENT", target: "DOCUMENT", userCreatable: true },
  { code: "SHARED_IN", source: "DOCUMENT", target: "CHAT_CHANNEL", userCreatable: true },
];

export function isRelationshipAllowed(
  code: string,
  source: string,
  target: string,
  requireUserCreatable = false,
): boolean {
  return RELATIONSHIP_RULES.some(
    (r) =>
      r.code === code &&
      r.source === source &&
      r.target === target &&
      (!requireUserCreatable || r.userCreatable),
  );
}

/** Relationship codes the actor may create manually from a given source type. */
export function userCreatableFrom(source: WorkEntityType): RelationshipRule[] {
  return RELATIONSHIP_RULES.filter((r) => r.source === source && r.userCreatable);
}

/** Target entity types a user can manually link from a given source type. */
export function linkableTargetTypes(source: WorkEntityType): WorkEntityType[] {
  return Array.from(new Set(userCreatableFrom(source).map((r) => r.target)));
}

/** Human labels — never expose graph jargon to end users. */
const LABELS_OUT: Record<WorkRelationshipCode, { vi: string; en: string }> = {
  BELONGS_TO: { vi: "Thuộc về", en: "Belongs to" },
  ASSIGNED_TO: { vi: "Giao cho", en: "Assigned to" },
  PARTICIPATED_IN: { vi: "Tham dự", en: "Participated in" },
  DISCUSSES: { vi: "Thảo luận về", en: "Discusses" },
  GENERATES: { vi: "Tạo ra", en: "Generates" },
  ATTACHED_TO: { vi: "Đính kèm vào", en: "Attached to" },
  REFERENCES: { vi: "Liên quan tới", en: "References" },
  BLOCKS: { vi: "Đang chặn", en: "Blocks" },
  DEPENDS_ON: { vi: "Phụ thuộc vào", en: "Depends on" },
  FOLLOWS_UP: { vi: "Theo dõi tiếp từ", en: "Follows up" },
  RELATED_TO: { vi: "Liên quan", en: "Related to" },
  SHARED_IN: { vi: "Chia sẻ trong", en: "Shared in" },
};

const LABELS_IN: Record<WorkRelationshipCode, { vi: string; en: string }> = {
  BELONGS_TO: { vi: "Bao gồm", en: "Contains" },
  ASSIGNED_TO: { vi: "Được giao việc", en: "Assignee of" },
  PARTICIPATED_IN: { vi: "Có người tham dự", en: "Has participant" },
  DISCUSSES: { vi: "Được thảo luận trong", en: "Discussed in" },
  GENERATES: { vi: "Được tạo từ", en: "Generated from" },
  ATTACHED_TO: { vi: "Có tài liệu đính kèm", en: "Has attachment" },
  REFERENCES: { vi: "Được nhắc tới trong", en: "Referenced by" },
  BLOCKS: { vi: "Đang bị chặn bởi", en: "Blocked by" },
  DEPENDS_ON: { vi: "Là điều kiện của", en: "Required by" },
  FOLLOWS_UP: { vi: "Có việc theo dõi", en: "Followed up by" },
  RELATED_TO: { vi: "Liên quan", en: "Related to" },
  SHARED_IN: { vi: "Có chia sẻ", en: "Shares" },
};

export function relationshipLabel(
  code: string,
  direction: EdgeDirection = "OUT",
  lang: "vi" | "en" = "vi",
): string {
  const table = direction === "OUT" ? LABELS_OUT : LABELS_IN;
  const entry = table[code as WorkRelationshipCode];
  return entry ? entry[lang] : code;
}

const ENTITY_LABELS: Record<WorkEntityType, { vi: string; en: string }> = {
  TENANT: { vi: "Tổ chức", en: "Tenant" },
  WORKSPACE: { vi: "Dự án", en: "Project" },
  TASK: { vi: "Công việc", en: "Task" },
  PERSON: { vi: "Thành viên", en: "Person" },
  MEETING: { vi: "Cuộc họp", en: "Meeting" },
  CHAT_CHANNEL: { vi: "Kênh chat", en: "Channel" },
  DOCUMENT: { vi: "Tài liệu", en: "Document" },
  EMAIL: { vi: "Email", en: "Email" },
};

export function entityTypeLabel(type: string, lang: "vi" | "en" = "vi"): string {
  const entry = ENTITY_LABELS[type as WorkEntityType];
  return entry ? entry[lang] : type;
}