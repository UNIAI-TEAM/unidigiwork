// QUẢN LÝ LỊCH HỌP — thêm, sửa, hủy cuộc họp, gán người tham dự và bộ phận.
// Dùng lại RPC lịch họp sẵn có; KPI Command Center và Bộ não AI đọc ngay dữ liệu này.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, Loader2, Pencil, Plus, Upload, X } from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveWorkspace, useMyWorkspaces } from "@/lib/active-workspace";
import {
  listTenantMeetings,
  listMeetingCandidates,
  setMeetingDepartment,
  importTenantMeetings,
} from "@/lib/api/meetings-admin.functions";
import { scheduleMeeting, updateMeeting, cancelMeeting } from "@/lib/api/meetings.functions";

export const Route = createFileRoute("/_authenticated/meetings-manage")({
  head: () => ({
    meta: [
      { title: "Quản lý lịch họp — UNIWORK" },
      {
        name: "description",
        content:
          "Thêm, sửa, hủy lịch họp, gán nhân sự và bộ phận để KPI điều hành bám lịch họp thật.",
      },
      { property: "og:title", content: "Quản lý lịch họp — UNIWORK" },
      {
        property: "og:description",
        content: "Lịch họp thật của tổ chức, gán nhân sự và bộ phận cho từng cuộc họp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeetingsManagePage,
});

type Draft = {
  id: string | null;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  agenda: string;
  department: string;
  participantIds: string[];
};

const toLocalInput = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

const emptyDraft = (): Draft => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: null,
    title: "",
    startAt: toLocalInput(start.toISOString()),
    endAt: toLocalInput(end.toISOString()),
    location: "",
    agenda: "",
    department: "",
    participantIds: [],
  };
};

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

function MeetingsManagePage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();
  const { workspaceId } = useActiveWorkspace();
  const { data: workspaces } = useMyWorkspaces();
  const activeWs = workspaceId ?? workspaces?.[0]?.id ?? "";

  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const listFn = useServerFn(listTenantMeetings);
  const candidatesFn = useServerFn(listMeetingCandidates);
  const departmentFn = useServerFn(setMeetingDepartment);
  const importFn = useServerFn(importTenantMeetings);
  const scheduleFn = useServerFn(scheduleMeeting);
  const updateFn = useServerFn(updateMeeting);
  const cancelFn = useServerFn(cancelMeeting);

  const meetingsQuery = useQuery({
    queryKey: ["meetings-admin", activeWs],
    queryFn: () => listFn({ data: { workspaceId: activeWs, limit: 100 } }),
    enabled: Boolean(activeWs),
  });
  const candidatesQuery = useQuery({
    queryKey: ["meetings-admin", "candidates", activeWs],
    queryFn: () => candidatesFn({ data: { workspaceId: activeWs } }),
    enabled: Boolean(activeWs),
  });

  const meetings = meetingsQuery.data ?? [];
  const candidates = candidatesQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.department ?? "").toLowerCase().includes(q) ||
        m.participants.some((p) => p.name.toLowerCase().includes(q)),
    );
  }, [meetings, query]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["meetings-admin"] });
    void qc.invalidateQueries({ queryKey: ["ceo"] });
    void qc.invalidateQueries({ queryKey: ["ai-brain"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const startAt = new Date(d.startAt).toISOString();
      const endAt = new Date(d.endAt).toISOString();
      if (d.id) {
        await updateFn({
          data: {
            idempotencyKey: newKey(),
            meetingId: d.id,
            title: d.title.trim(),
            startAt,
            endAt,
            location: d.location.trim() || undefined,
            agenda: d.agenda.trim() || undefined,
          },
        });
        await departmentFn({
          data: {
            workspaceId: activeWs,
            meetingId: d.id,
            department: d.department.trim() || null,
          },
        });
        return;
      }
      const created = (await scheduleFn({
        data: {
          idempotencyKey: newKey(),
          workspaceId: activeWs,
          title: d.title.trim(),
          startAt,
          endAt,
          location: d.location.trim() || undefined,
          agenda: d.agenda.trim() || undefined,
          participantIds: d.participantIds,
        },
      })) as { id?: string; meeting_id?: string } | null;
      const id = created?.id ?? created?.meeting_id ?? null;
      if (id && d.department.trim()) {
        await departmentFn({
          data: { workspaceId: activeWs, meetingId: id, department: d.department.trim() },
        });
      }
    },
    onSuccess: () => {
      toast.success("Đã lưu lịch họp.");
      setDraft(null);
      invalidate();
    },
    onError: () => toast.error("Không lưu được lịch họp."),
  });

  const cancelMutation = useMutation({
    mutationFn: (meetingId: string) =>
      cancelFn({ data: { idempotencyKey: newKey(), meetingId, reason: "Hủy từ quản lý lịch họp" } }),
    onSuccess: () => {
      toast.success("Đã hủy cuộc họp.");
      invalidate();
    },
    onError: () => toast.error("Không hủy được cuộc họp."),
  });

  async function onImport(file: File) {
    setBusy(true);
    try {
      const { readXlsxRows, readCsvRows, normalizeDateCell } = await import("@/lib/xlsx-read");
      const rows: string[][] = file.name.toLowerCase().endsWith(".csv")
        ? readCsvRows(await file.text())
        : readXlsxRows(await file.arrayBuffer());
      if (rows.length < 2) throw new Error("Tệp không có dữ liệu.");
      const header = rows[0]!.map((h: string) => h.trim().toLowerCase());
      const at = (row: string[], names: string[]) => {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i >= 0 && row[i]) return row[i]!.trim();
        }
        return "";
      };
      const payload = rows
        .slice(1)
        .filter((r: string[]) => r.some((c: string) => c.trim()))
        .map((r: string[]) => ({
          title: at(r, ["title", "tiêu đề", "cuộc họp"]),
          startAt: normalizeDateCell(at(r, ["start", "bắt đầu", "thời gian"])) ?? "",
          endAt: normalizeDateCell(at(r, ["end", "kết thúc"])) || null,
          location: at(r, ["location", "địa điểm"]) || null,
          agenda: at(r, ["agenda", "nội dung", "chương trình"]) || null,
          department: at(r, ["department", "bộ phận"]) || null,
          participants: at(r, ["participants", "người tham dự", "email"]) || null,
        }))
        .filter((r: { title: string; startAt: string }) => r.title && r.startAt)
        .slice(0, 200);
      if (!payload.length) throw new Error("Cần ít nhất cột tiêu đề và thời gian bắt đầu.");
      const res = await importFn({ data: { workspaceId: activeWs, rows: payload } });
      toast.success(
        `Đã nhập ${res.created} cuộc họp.${res.failed.length ? ` Lỗi: ${res.failed.join(", ")}` : ""}`,
      );
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đọc được tệp.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active="calendar" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="meeting" onOpenSidebar={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
                Quản lý lịch họp
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Lịch họp thật của tổ chức. KPI điều hành và Bộ não AI dùng chính dữ liệu này.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/ceo">Mở Command Center</Link>
            </Button>
          </header>

          <div className="flex flex-wrap items-center gap-2">
            <Button className="min-h-11" onClick={() => setDraft(emptyDraft())} disabled={!activeWs}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Thêm cuộc họp
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                disabled={busy || !activeWs}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onImport(f);
                }}
              />
              <span className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden />
                )}
                Nhập từ Excel
              </span>
            </label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tiêu đề, bộ phận, người tham dự"
              className="h-11 max-w-xs"
            />
          </div>

          <ul className="space-y-2">
            {filtered.map((m) => (
              <li key={m.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.startAt.slice(0, 16).replace("T", " ")}
                      {m.endAt ? ` → ${m.endAt.slice(11, 16)}` : ""}
                      {m.location ? ` · ${m.location}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.department ? <Badge variant="secondary">{m.department}</Badge> : null}
                      {m.projectName ? <Badge variant="outline">{m.projectName}</Badge> : null}
                      {m.status ? <Badge variant="outline">{m.status}</Badge> : null}
                      {m.participants.slice(0, 5).map((p) => (
                        <Badge key={p.userId} variant="outline">
                          {p.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() =>
                        setDraft({
                          id: m.id,
                          title: m.title,
                          startAt: toLocalInput(m.startAt),
                          endAt: toLocalInput(m.endAt),
                          location: m.location ?? "",
                          agenda: m.agenda ?? "",
                          department: m.department ?? "",
                          participantIds: m.participants.map((p) => p.userId),
                        })
                      }
                    >
                      <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> Sửa
                    </Button>
                    {m.status !== "canceled" ? (
                      <Button
                        variant="outline"
                        className="min-h-11 text-destructive"
                        onClick={() => cancelMutation.mutate(m.id)}
                      >
                        <X className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Hủy cuộc họp</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
            {!filtered.length && !meetingsQuery.isLoading ? (
              <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Chưa có cuộc họp nào. Thêm mới hoặc nhập từ Excel.
              </li>
            ) : null}
          </ul>
        </main>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Sửa cuộc họp" : "Thêm cuộc họp"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-title">Tiêu đề</Label>
                <Input
                  id="m-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-start">Bắt đầu</Label>
                  <Input
                    id="m-start"
                    type="datetime-local"
                    value={draft.startAt}
                    onChange={(e) => setDraft({ ...draft, startAt: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-end">Kết thúc</Label>
                  <Input
                    id="m-end"
                    type="datetime-local"
                    value={draft.endAt}
                    onChange={(e) => setDraft({ ...draft, endAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-loc">Địa điểm</Label>
                  <Input
                    id="m-loc"
                    value={draft.location}
                    onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-dep">Bộ phận</Label>
                  <Input
                    id="m-dep"
                    value={draft.department}
                    onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-agenda">Nội dung</Label>
                <Textarea
                  id="m-agenda"
                  rows={3}
                  value={draft.agenda}
                  onChange={(e) => setDraft({ ...draft, agenda: e.target.value })}
                />
              </div>
              {!draft.id ? (
                <div className="space-y-1.5">
                  <Label>Người tham dự</Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {candidates.map((c) => {
                      const checked = draft.participantIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDraft({
                                ...draft,
                                participantIds: checked
                                  ? draft.participantIds.filter((id) => id !== c.id)
                                  : [...draft.participantIds, c.id],
                              })
                            }
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      );
                    })}
                    {!candidates.length ? (
                      <p className="p-2 text-xs text-muted-foreground">
                        Chưa có thành viên nào để mời.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setDraft(null)}>
              Hủy
            </Button>
            <Button
              className="min-h-11"
              disabled={save.isPending || !draft?.title.trim() || !activeWs}
              onClick={() => draft && save.mutate(draft)}
            >
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
