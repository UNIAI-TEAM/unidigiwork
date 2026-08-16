import type { WorkEntityType } from "./relationship-types";

/** Single source of truth for deep links from a graph entity. */
export function workEntityHref(type: string, id: string, mobile = false): string {
  switch (type as WorkEntityType) {
    case "TASK":
      return mobile ? `/m/tasks` : `/tasks/${id}`;
    case "WORKSPACE":
      return `/workspace/${id}`;
    case "MEETING":
      return mobile ? `/m/meet` : `/meeting/${id}`;
    case "DOCUMENT":
      return `/documents/${id}`;
    case "EMAIL":
      return mobile ? `/m/email` : `/email/${id}`;
    case "CHAT_CHANNEL":
      return mobile ? `/m/chat` : `/chat/${id}`;
    case "PERSON":
      return `/people/${id}`;
    default:
      return "/home";
  }
}