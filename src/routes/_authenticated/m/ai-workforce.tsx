import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, ChevronRight } from "lucide-react";
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";

export const Route = createFileRoute("/_authenticated/m/ai-workforce")({
  head: () => ({
    meta: [
      { title: "Nhân sự AI · UNIWORK" },
      { name: "description", content: "Xem hồ sơ đội ngũ nhân sự AI của bạn ngay trên điện thoại." },
      { property: "og:title", content: "Nhân sự AI · UNIWORK" },
      { property: "og:description", content: "Xem hồ sơ đội ngũ nhân sự AI của bạn ngay trên điện thoại." },
    ],
  }),
  component: MobileAiWorkforcePage,
});

function MobileAiWorkforcePage() {
  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-28">
      <header>
        <h1 className="text-lg font-semibold">Nhân sự AI</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Chạm để mở hồ sơ đầy đủ của từng nhân sự AI.
        </p>
      </header>

      <ul className="grid gap-2">
        {AI_WORKER_PROFILES.map((w) => (
          <li key={w.id}>
            <Link
              to="/m/ai-workforce/$id"
              params={{ id: w.id }}
              className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors active:bg-surface-2"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{w.domain}</span>
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Đang hoạt động
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
