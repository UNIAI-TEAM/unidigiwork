// Trang xem bản đồ công việc bằng liên kết công khai — chỉ đọc, không cần đăng nhập.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type PublicGraph = {
  ok: boolean;
  label?: string;
  tenantName?: string | null;
  expiresAt?: string;
  nodes?: Array<{ id: string; type: string; title: string }>;
  edges?: Array<{ source: string; target: string; type: string }>;
  error?: string;
};

const TYPE_LABEL: Record<string, string> = {
  WORKSPACE: "Không gian",
  TASK: "Công việc",
  MEETING: "Cuộc họp",
  MEETING_ARTIFACT: "Biên bản / Quyết định",
  DOCUMENT: "Tài liệu",
  WORK_PRODUCT: "Kết quả công việc",
};

export const Route = createFileRoute("/share/work-graph/$token")({
  component: SharedWorkGraph,
  head: () => ({
    meta: [
      { title: "Bản đồ công việc được chia sẻ | UNIWORK" },
      {
        name: "description",
        content:
          "Xem bản đồ công việc được chia sẻ: công việc, cuộc họp và tài liệu cùng cách chúng liên kết.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Bản đồ công việc được chia sẻ | UNIWORK" },
      {
        property: "og:description",
        content: "Liên kết xem chỉ đọc bản đồ công việc của tổ chức trên UNIWORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SharedWorkGraph() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["public-work-graph", token],
    queryFn: async (): Promise<PublicGraph> => {
      const res = await fetch(`/api/public/work-graph/${token}`);
      return (await res.json()) as PublicGraph;
    },
  });

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Đang tải bản đồ công việc…</p>;
  }

  if (!data?.ok) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Liên kết không còn hiệu lực</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Liên kết này đã hết hạn hoặc đã bị thu hồi. Hãy liên hệ người chia sẻ để nhận liên kết
          mới.
        </p>
      </main>
    );
  }

  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const grouped = nodes.reduce<Record<string, typeof nodes>>((acc, n) => {
    (acc[n.type] ??= []).push(n);
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{data.label}</h1>
        <p className="text-sm text-muted-foreground">
          {data.tenantName ? `${data.tenantName} · ` : ""}
          {nodes.length} mục · {edges.length} liên kết
          {data.expiresAt
            ? ` · hết hạn ${new Date(data.expiresAt).toLocaleDateString("vi-VN")}`
            : ""}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(grouped).map(([type, items]) => (
          <Card key={type} className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{TYPE_LABEL[type] ?? type}</h2>
              <Badge variant="secondary" className="text-[10px]">
                {items.length}
              </Badge>
            </div>
            <ul className="space-y-1 text-sm">
              {items.slice(0, 50).map((n) => (
                <li key={n.id} className="truncate text-muted-foreground">
                  {n.title}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {edges.length > 0 && (
        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-medium">Quan hệ giữa các mục</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {edges.slice(0, 100).map((e, i) => (
              <li key={`${e.source}-${e.target}-${i}`} className="truncate">
                {byId.get(e.source)?.title} → {byId.get(e.target)?.title}{" "}
                <span className="opacity-70">({e.type})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Đây là chế độ chỉ xem. Nội dung chi tiết của tài liệu không được chia sẻ.
      </p>
    </main>
  );
}
