import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Network, Search } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({ task: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/m/work-graph")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Work Graph mobile — UNIWORK" },
      { name: "description", content: "Công việc và kết quả liên kết trên điện thoại." },
      { property: "og:title", content: "Work Graph mobile — UNIWORK" },
      { property: "og:description", content: "Công việc và kết quả liên kết trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileWorkGraphPage,
});

function MobileWorkGraphPage() {
  const navigate = useNavigate();
  const { task } = Route.useSearch();
  if (task) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-4 p-6 text-center">
        <Network className="h-8 w-8 text-primary" />
        <h1 className="text-xl font-semibold">Công việc trong Work Graph</h1>
        <p className="text-sm text-muted-foreground">
          Mở công việc để xem lịch sử chat, liên kết và tiến độ.
        </p>
        <Button
          className="min-h-11 w-full max-w-sm"
          onClick={() => void navigate({ to: "/m/tasks/$id", params: { id: task } })}
        >
          Mở công việc
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">Work Graph</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Công việc đang chạy, đã nghiệm thu và kết quả công việc.
        </p>
      </header>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9" placeholder="Tìm trong Work Graph…" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="min-h-14 justify-start"
          onClick={() => void navigate({ to: "/m/tasks" })}
        >
          Công việc
        </Button>
        <Button
          variant="outline"
          className="min-h-14 justify-start"
          onClick={() => void navigate({ to: "/m/work-products" })}
        >
          Kết quả công việc
        </Button>
      </div>
    </div>
  );
}
