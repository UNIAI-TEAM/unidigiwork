import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Search } from "lucide-react";
import { useActiveWorkspace } from "@/lib/active-workspace";
import { listDocuments } from "@/lib/api/documents.functions";
import { Input } from "@/components/ui/input";
import { MobileListItem } from "@/components/mobile/mobile-list-item";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/m/documents")({
  head: () => ({
    meta: [
      { title: "Tài liệu mobile — UNIWORK" },
      { name: "description", content: "Danh sách tài liệu UNIWORK trên điện thoại." },
      { property: "og:title", content: "Tài liệu mobile — UNIWORK" },
      { property: "og:description", content: "Danh sách tài liệu UNIWORK trên điện thoại." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileDocumentsPage,
});

function MobileDocumentsPage() {
  const navigate = useNavigate();
  const { workspaceId, workspaces } = useActiveWorkspace();
  const activeId = workspaceId ?? workspaces[0]?.id;
  const [search, setSearch] = useState("");
  const documents = useQuery({
    queryKey: ["m-documents", activeId],
    enabled: Boolean(activeId),
    queryFn: () => listDocuments({ data: { workspaceId: activeId as string, limit: 100 } }),
  });
  const term = search.trim().toLowerCase();
  const items = (documents.data ?? []).filter(
    (item) => !term || item.title.toLowerCase().includes(term),
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 overflow-x-hidden p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">Tài liệu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tài liệu trong không gian làm việc của bạn.
        </p>
      </header>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm tài liệu…"
          className="h-11 pl-9"
        />
      </div>
      {documents.isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <MobileListItem
              key={item.id}
              title={item.title}
              subtitle={item.folder}
              meta={new Date(item.updated_at).toLocaleDateString("vi-VN")}
              icon={<FileText className="h-5 w-5 text-primary" />}
              onClick={() => void navigate({ to: "/m/documents/$id", params: { id: item.id } })}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Chưa có tài liệu phù hợp.
        </p>
      )}
    </div>
  );
}
