import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AI_WORKER_PROFILES } from "@/domain/ai-workforce/profiles";
import {
  AiWorkerProfileBadges,
  AiWorkerProfileBody,
  AiWorkerProfileHeader,
} from "@/components/ai/ai-worker-profile";
import { AiWorkerKpiSection } from "@/components/ai/ai-worker-kpi";

export const Route = createFileRoute("/_authenticated/m/ai-workforce/$id")({
  head: () => ({
    meta: [
      { title: "Hồ sơ nhân sự AI · UNIWORK" },
      { name: "description", content: "Nhiệm vụ, kỹ năng và phạm vi hành động của nhân sự AI." },
      { property: "og:title", content: "Hồ sơ nhân sự AI · UNIWORK" },
      { property: "og:description", content: "Nhiệm vụ, kỹ năng và phạm vi hành động của nhân sự AI." },
    ],
  }),
  component: MobileAiWorkerProfilePage,
});

function MobileAiWorkerProfilePage() {
  const { id } = useParams({ from: "/_authenticated/m/ai-workforce/$id" });
  const profile = AI_WORKER_PROFILES.find((w) => w.id === id) ?? null;

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-28">
      <Link
        to="/m/ai-workforce"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Nhân sự AI
      </Link>

      {!profile ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Không tìm thấy hồ sơ nhân sự AI này.
        </div>
      ) : (
        <>
          <AiWorkerProfileHeader profile={profile} />
          <AiWorkerProfileBadges />
          <AiWorkerKpiSection name={profile.name} domain={profile.domain} />
          <AiWorkerProfileBody profile={profile} />
        </>
      )}
    </div>
  );
}
