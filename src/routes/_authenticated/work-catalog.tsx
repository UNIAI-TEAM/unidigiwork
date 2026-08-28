import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, FileText, Gauge, ShieldCheck, Timer } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listWorkProducts } from "@/lib/api/work-products.functions";
import {
  WORK_PRODUCT_STATUS_LABEL,
  type WorkProductContract,
} from "@/domain/work-products/contracts";
import { formatDurationMs } from "@/domain/work-economics/contracts";

export const Route = createFileRoute("/_authenticated/work-catalog")({
  head: () => ({
    meta: [
      { title: "Danh mục sản phẩm công việc — UNIWORK" },
      {
        name: "description",
        content: "Hợp đồng sản phẩm công việc: đầu vào, ngữ cảnh, hành động, chất lượng, SLA và kết quả nghiệm thu.",
      },
      { property: "og:title", content: "Danh mục sản phẩm công việc — UNIWORK" },
      {
        property: "og:description",
        content: "Xem hợp đồng từng sản phẩm công việc mà nhân sự AI của bạn được phép thực hiện.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkCatalogPage,
});

function StatusBadge({ status }: { status: WorkProductContract["status"] }) {
  const tone =
    status === "ACTIVE"
      ? "bg-primary/10 text-primary"
      : status === "PAUSED"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return <Badge className={`${tone} border-0`}>{WORK_PRODUCT_STATUS_LABEL[status] ?? status}</Badge>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function WorkCatalogPage() {
  const [open, setOpen] = useSidebarState();
  const fetchProducts = useServerFn(listWorkProducts);
  const { data, isLoading } = useQuery({
    queryKey: ["work-products"],
    queryFn: () => fetchProducts(),
  });
  const [selected, setSelected] = useState<WorkProductContract | null>(null);

  const products = useMemo(() => data ?? [], [data]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Danh mục sản phẩm công việc</h1>
            <p className="text-sm text-muted-foreground">
              Mỗi sản phẩm là một hợp đồng có phiên bản: đầu vào, ngữ cảnh, hành động được phép, ngưỡng chất lượng, SLA
              và kết quả nghiệm thu. Hợp đồng đã dùng cho lượt chạy được nghiệm thu là bất biến.
            </p>
          </header>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải danh mục…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có sản phẩm công việc nào được công bố.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((p) => (
                <Card
                  key={`${p.code}@${p.version}`}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setSelected(p)}
                >

                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{p.label}</CardTitle>
                      <StatusBadge status={p.status} />
                    </div>
                    <CardDescription className="line-clamp-2">{p.objective}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> {p.deliverableType}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5" /> Ngưỡng {p.quality.minimumQualityScore}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" /> {formatDurationMs(p.sla.machineDurationMs)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" /> {p.action.maxAutonomy}
                    </span>
                    <span className="col-span-2 font-mono text-[11px]">
                      {p.code} · v{p.version}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.label}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {selected.code} · v{selected.version}
                  {selected.contractHash ? ` · ${selected.contractHash.slice(0, 12)}` : ""}
                </SheetDescription>
              </SheetHeader>
              <Link
                to="/work-products_/$code"
                params={{ code: selected.code }}
                className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Xem bằng chứng & khởi chạy
              </Link>

              <div className="mt-6 space-y-5">
                <Section title="Mục tiêu nghiệp vụ">{selected.objective}</Section>
                <Section title="Đầu vào">
                  {Object.keys(selected.input.properties).length === 0 ? (
                    "Không yêu cầu đầu vào riêng."
                  ) : (
                    <ul className="space-y-1">
                      {Object.entries(selected.input.properties).map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2">
                          <code className="text-xs">{k}</code>
                          <span className="text-xs text-muted-foreground">
                            {v.type}
                            {selected.input.required.includes(k) ? " · bắt buộc" : " · tuỳ chọn"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section title="Ngữ cảnh được phép">
                  {selected.context.allowedEntityTypes.join(", ") || "—"}
                  {selected.context.maxSources ? ` · tối đa ${selected.context.maxSources} nguồn` : ""}
                </Section>
                <Section title="Nhân sự AI đủ điều kiện">
                  {[
                    selected.executor.requiredRole ? `Vai trò: ${selected.executor.requiredRole}` : null,
                    selected.executor.requiredSkills.length
                      ? `Kỹ năng: ${selected.executor.requiredSkills.join(", ")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Mọi nhân sự AI đang hoạt động."}
                </Section>
                <Section title="Hành động được phép">
                  {selected.action.allowedActions.length
                    ? `${selected.action.allowedActions.join(", ")} · ${selected.action.maxAutonomy}`
                    : "Không có hành động ghi dữ liệu — chỉ soạn bản bàn giao."}
                </Section>
                <Section title="Tiêu chí nghiệm thu bắt buộc">
                  <ul className="list-disc space-y-1 pl-4">
                    {selected.acceptance.mandatoryCriteria.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Section>
                <Section title="Chất lượng & duyệt">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <ClipboardCheck className="h-3 w-3" /> Tối thiểu {selected.quality.minimumQualityScore}/100
                    </Badge>
                    <Badge variant="secondary">
                      {selected.review.policy}
                    </Badge>
                  </div>
                </Section>
                <Section title="Kết quả nghiệm thu">{selected.outcomeType}</Section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
