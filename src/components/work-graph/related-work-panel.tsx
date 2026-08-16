// Work Graph V1 — "Công việc liên quan" (Related Work).
// UX copy never mentions graph/node/edge.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Link2, Plus, X, Search, Loader2, CheckSquare, FolderKanban,
  Video, FileText, Mail, MessageSquare, User, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  getWorkContext, linkWorkEntities, unlinkWorkEntities, searchLinkableEntities,
} from "@/lib/api/work-graph.functions";
import {
  entityTypeLabel, relationshipLabel, userCreatableFrom, linkableTargetTypes,
  type WorkEntityType,
} from "@/domain/work-graph/relationship-types";

const ICONS: Record<string, typeof CheckSquare> = {
  TASK: CheckSquare,
  WORKSPACE: FolderKanban,
  MEETING: Video,
  DOCUMENT: FileText,
  EMAIL: Mail,
  CHAT_CHANNEL: MessageSquare,
  PERSON: User,
};

function EntityIcon({ type }: { type: string }) {
  const Icon = ICONS[type] ?? Link2;
  return <Icon size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />;
}

export interface RelatedWorkPanelProps {
  entityType: WorkEntityType;
  entityId: string;
  /** Ẩn nút liên kết khi người dùng không có quyền chỉnh sửa đối tượng gốc. */
  canLink?: boolean;
  className?: string;
  /** Mobile: hiển thị dạng mục có thể thu gọn. */
  collapsible?: boolean;
}

export function RelatedWorkPanel({
  entityType, entityId, canLink = true, className, collapsible = false,
}: RelatedWorkPanelProps) {
  const qc = useQueryClient();
  const fetchContext = useServerFn(getWorkContext);
  const link = useServerFn(linkWorkEntities);
  const unlink = useServerFn(unlinkWorkEntities);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);

  const queryKey = ["workGraph", entityType, entityId] as const;

  const ctx = useQuery({
    queryKey,
    queryFn: () => fetchContext({ data: { entityType, entityId, limit: 50 } }),
    enabled: Boolean(entityId),
    retry: false,
    staleTime: 60_000,
  });

  const removeLink = useMutation({
    mutationFn: (edgeId: string) => unlink({ data: { edgeId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Đã gỡ liên kết");
    },
    onError: () => toast.error("Không thể gỡ liên kết này"),
  });

  const items = ctx.data?.relationships ?? [];
  const grouped = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const list = m.get(it.entity.type) ?? [];
      list.push(it);
      m.set(it.entity.type, list);
    }
    return Array.from(m.entries());
  }, [items]);

  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => collapsible && setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Link2 size={16} strokeWidth={1.75} className="text-muted-foreground" />
          Công việc liên quan
          {items.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {items.length}
            </span>
          )}
        </button>
        {canLink && (
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="h-8 gap-1.5">
            <Plus size={14} strokeWidth={2} />
            Liên kết
          </Button>
        )}
      </div>

      {expanded && (
        <>
          {ctx.isLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Đang tải nội dung liên quan…
            </div>
          )}

          {!ctx.isLoading && ctx.isError && (
            <p className="py-3 text-sm text-muted-foreground">Chưa thể tải nội dung liên quan.</p>
          )}

          {!ctx.isLoading && !ctx.isError && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">Chưa có nội dung liên quan.</p>
              {canLink && (
                <Button variant="ghost" size="sm" className="mt-2 gap-1.5" onClick={() => setPickerOpen(true)}>
                  <Plus size={14} /> Liên kết công việc
                </Button>
              )}
            </div>
          )}

          <div className="space-y-4">
            {grouped.map(([type, list]) => (
              <div key={type}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {entityTypeLabel(type)}
                </p>
                <ul className="space-y-1.5">
                  {list.map((it) => (
                    <li
                      key={it.edgeId}
                      className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                    >
                      <EntityIcon type={it.entity.type} />
                      <Link {...({ to: it.entity.href } as any)} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{it.entity.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {relationshipLabel(it.relationship, it.direction)}
                          {it.entity.subtitle ? ` · ${it.entity.subtitle}` : ""}
                        </p>
                      </Link>
                      {it.canUnlink ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Gỡ liên kết"
                          disabled={removeLink.isPending}
                          onClick={() => removeLink.mutate(it.edgeId)}
                        >
                          <X size={14} />
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Lock size={10} /> Tự động
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      <LinkPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        sourceType={entityType}
        onPick={async (target, relationship) => {
          try {
            await link({
              data: {
                sourceType: entityType,
                sourceId: entityId,
                targetType: target.type as WorkEntityType,
                targetId: target.id,
                relationship: relationship as any,
              },
            });
            qc.invalidateQueries({ queryKey });
            setPickerOpen(false);
            toast.success("Đã liên kết");
          } catch {
            toast.error("Không thể tạo liên kết này");
          }
        }}
      />
    </section>
  );
}

interface PickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceType: WorkEntityType;
  onPick: (target: { type: string; id: string; title: string }, relationship: string) => void;
}

function LinkPicker({ open, onOpenChange, sourceType, onPick }: PickerProps) {
  const search = useServerFn(searchLinkableEntities);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const types = useMemo(() => linkableTargetTypes(sourceType).filter((t) => t !== "PERSON"), [sourceType]);
  const rules = useMemo(() => userCreatableFrom(sourceType), [sourceType]);

  // debounce 300ms, tối thiểu 2 ký tự
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const results = useQuery({
    queryKey: ["workGraph", "search", sourceType, debounced],
    queryFn: () => search({ data: { query: debounced, types, limit: 10 } }),
    enabled: open && debounced.length >= 2 && types.length > 0,
    retry: false,
  });

  const relationFor = (targetType: string) =>
    rules.find((r) => r.target === targetType)?.code ?? "RELATED_TO";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Liên kết công việc</DialogTitle>
          <DialogDescription>Tìm công việc, dự án, cuộc họp, tài liệu hoặc email liên quan.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Nhập ít nhất 2 ký tự…"
            className="pl-9"
            aria-label="Tìm công việc liên quan"
          />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {results.isFetching && (
            <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Đang tìm…
            </p>
          )}
          {!results.isFetching && debounced.length >= 2 && (results.data?.length ?? 0) === 0 && (
            <p className="px-1 py-3 text-sm text-muted-foreground">Không tìm thấy kết quả phù hợp.</p>
          )}
          {(results.data ?? []).map((r) => (
            <button
              key={`${r.type}:${r.id}`}
              type="button"
              disabled={pending !== null}
              onClick={async () => {
                setPending(r.id);
                await onPick(r, relationFor(r.type));
                setPending(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
            >
              <EntityIcon type={r.type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{entityTypeLabel(r.type)}</span>
              </span>
              {pending === r.id && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}