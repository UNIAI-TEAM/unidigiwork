// Avatar chữ cái đầu, tạo tại chỗ — không gửi định danh người dùng ra dịch vụ bên ngoài.
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}

export function ParticipantAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary/12 font-semibold text-primary",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
