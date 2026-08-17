// Hồ sơ ứng viên AI trên mobile — toàn màn hình, cuộn dọc.
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AiMarketProfile } from "@/components/ai/ai-market-profile";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";

export const Route = createFileRoute("/_authenticated/m/ai-market/$id")({
  head: () => ({
    meta: [
      { title: "Hồ sơ ứng viên AI · UNIWORK" },
      { name: "description", content: "Xem hồ sơ, kỹ năng và phỏng vấn ứng viên AI trên điện thoại." },
      { property: "og:title", content: "Hồ sơ ứng viên AI · UNIWORK" },
      { property: "og:description", content: "Phỏng vấn và tuyển dụng nhân sự AI trên điện thoại." },
    ],
  }),
  component: MobileAiMarketDetail,
});

function MobileAiMarketDetail() {
  const { id } = Route.useParams();
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWorkspaceId = workspaceId ?? workspaces?.[0]?.id ?? "";

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-28">
      <Link to="/m/ai-market" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Chợ nhân sự AI
      </Link>
      {activeWorkspaceId ? (
        <AiMarketProfile workspaceId={activeWorkspaceId} marketAgentId={id} />
      ) : (
        <p className="text-sm text-muted-foreground">Hãy chọn một không gian làm việc.</p>
      )}
    </div>
  );
}
