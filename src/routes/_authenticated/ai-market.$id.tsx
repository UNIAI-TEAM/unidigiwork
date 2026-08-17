// Hồ sơ ứng viên AI trên chợ tuyển dụng (desktop).
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { AiMarketProfile } from "@/components/ai/ai-market-profile";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";

export const Route = createFileRoute("/_authenticated/ai-market/$id")({
  head: () => ({
    meta: [
      { title: "Hồ sơ ứng viên AI · UNIWORK" },
      { name: "description", content: "Xem hồ sơ, kỹ năng, kinh nghiệm và phỏng vấn ứng viên AI trước khi tuyển dụng." },
      { property: "og:title", content: "Hồ sơ ứng viên AI · UNIWORK" },
      { property: "og:description", content: "Phỏng vấn, đàm phán lương và tuyển dụng nhân sự AI trên UNIWORK." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiMarketDetailPage,
});

function AiMarketDetailPage() {
  const [open, setOpen] = useSidebarState();
  const { id } = Route.useParams();
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="ai-market" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          <Link
            to="/ai-market"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Về chợ nhân sự AI
          </Link>
          {activeWorkspaceId ? (
            <AiMarketProfile workspaceId={activeWorkspaceId} marketAgentId={id} />
          ) : (
            <p className="text-sm text-muted-foreground">Hãy chọn một không gian làm việc.</p>
          )}
        </div>
      </main>
    </div>
  );
}
