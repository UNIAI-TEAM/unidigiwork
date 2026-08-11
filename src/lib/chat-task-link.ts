// Liên kết công việc <-> tin nhắn chat nguồn (mã hoá trong mô tả công việc).
const TAG_RE = /\[chat-source:([0-9a-fA-F-]{36}):([0-9a-fA-F-]{36})\]/;

export function buildChatSourceTag(channelId: string, messageId: string) {
  return `[chat-source:${channelId}:${messageId}]`;
}

export function parseChatSource(description?: string | null) {
  if (!description) return null;
  const m = description.match(TAG_RE);
  if (!m) return null;
  return { channelId: m[1], messageId: m[2] };
}

export function stripChatSource(description?: string | null) {
  if (!description) return "";
  return description.replace(TAG_RE, "").trimEnd();
}
