import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArchiveRestore,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";
import {
  archiveWorkspace,
  createWorkspace,
  listWorkspaceMembers,
  listWorkspaces,
  removeWorkspaceMember,
  setWorkspaceMemberRole,
  updateWorkspace,
  type WorkspaceListItemDTO,
} from "@/lib/api/workspaces.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/workspace/")({
  head: () => ({
    meta: [
      { title: "Quản lý workspace · UNIWORK" },
      {
        name: "description",
        content:
          "Tạo, đổi tên, lưu trữ workspace và phân quyền chủ sở hữu / thành viên trong UNIWORK.",
      },
      { property: "og:title", content: "Quản lý workspace · UNIWORK" },
      {
        property: "og:description",
        content: "Danh sách không gian làm việc kèm thao tác tạo, sửa, xóa và phân quyền.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceManagePage,
});

const TIMEZONES = ["Asia/Ho_Chi_Minh", "Asia/Singapore", "Asia/Tokyo", "UTC", "Europe/Paris"];

function WorkspaceManagePage() {
  const [open, setOpen] = useSidebarState();
  const qc = useQueryClient();

  const list = useQuery({ queryKey: ["workspaces", "manage"], queryFn: () => listWorkspaces() });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceListItemDTO | null>(null);
  const [removing, setRemoving] = useState<WorkspaceListItemDTO | null>(null);
  const [membersOf, setMembersOf] = useState<WorkspaceListItemDTO | null>(null);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workspaces", "manage"] });
    qc.invalidateQueries({ queryKey: ["my-workspaces"] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      createWorkspace({
        data: { name: name.trim(), timezone, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: () => {
      toast.success("Đã tạo workspace mới");
      setCreateOpen(false);
      setName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Không tạo được workspace"),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateWorkspace({
        data: { workspaceId: editing!.id, name: name.trim(), timezone },
      }),
    onSuccess: () => {
      toast.success("Đã cập nhật workspace");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Không cập nhật được"),
  });

  const archiveMut = useMutation({
    mutationFn: (v: { id: string; restore: boolean }) =>
      archiveWorkspace({ data: { workspaceId: v.id, restore: v.restore } }),
    onSuccess: (_r, v) => {
      toast.success(v.restore ? "Đã khôi phục workspace" : "Đã lưu trữ workspace");
      setRemoving(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Thao tác thất bại"),
  });

  const rows = list.data ?? [];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active="dashboard" open={open} onClose={() => setOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />

        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Không gian làm việc</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tạo, chỉnh sửa, lưu trữ workspace và phân quyền thành viên.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link to="/workspace/settings">
                  <Settings2 className="mr-1.5 h-4 w-4" /> Cài đặt workspace
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/workspace/members">
                  <UserPlus className="mr-1.5 h-4 w-4" /> Quản lý thành viên
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/workspace/invite">
                  <UserPlus className="mr-1.5 h-4 w-4" /> Mời thành viên
                </Link>
              </Button>
              <Button
                onClick={() => {
                  setName("");
                  setTimezone(TIMEZONES[0]);
                  setCreateOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Tạo workspace
              </Button>
            </div>
          </header>

          <div className="mt-6 rounded-2xl border border-border bg-surface">
            {list.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách…
              </div>
            ) : list.isError ? (
              <div className="py-16 text-center text-sm text-destructive">
                Không tải được danh sách workspace.
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Chưa có workspace nào. Hãy tạo workspace đầu tiên.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((w) => (
                  <li
                    key={w.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3.5 hover:bg-surface-2/50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                      {w.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/workspace/$id"
                          params={{ id: w.id }}
                          className="truncate text-sm font-medium hover:text-primary"
                        >
                          {w.name}
                        </Link>
                        {w.isOwner && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                            <Crown className="h-3 w-3" /> Chủ sở hữu
                          </span>
                        )}
                        {w.archived && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Đã lưu trữ
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {w.members} thành viên
                        </span>
                        <span>{w.timezone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setMembersOf(w)}>
                        <Settings2 className="mr-1 h-4 w-4" /> Phân quyền
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!w.isOwner}
                        onClick={() => {
                          setName(w.name);
                          setTimezone(w.timezone);
                          setEditing(w);
                        }}
                      >
                        <Pencil className="mr-1 h-4 w-4" /> Sửa
                      </Button>
                      {w.archived ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!w.isOwner || archiveMut.isPending}
                          onClick={() => archiveMut.mutate({ id: w.id, restore: true })}
                        >
                          <ArchiveRestore className="mr-1 h-4 w-4" /> Khôi phục
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={!w.isOwner}
                          onClick={() => setRemoving(w)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Xóa
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      {/* Tạo workspace */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo workspace mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Tên workspace</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Phòng Kinh doanh"
              />
            </div>
            <TimezoneSelect value={timezone} onChange={setTimezone} />
            <p className="text-xs text-muted-foreground">
              Bạn sẽ là chủ sở hữu và có toàn quyền quản trị workspace này.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Hủy
              </Button>
              <Button
                disabled={name.trim().length < 2 || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Tạo workspace
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sửa workspace */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-edit-name">Tên workspace</Label>
              <Input
                id="ws-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <TimezoneSelect value={timezone} onChange={setTimezone} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button
                disabled={name.trim().length < 2 || updateMut.isPending}
                onClick={() => updateMut.mutate()}
              >
                {updateMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Xóa workspace */}
      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa workspace “{removing?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Workspace sẽ được lưu trữ và ẩn khỏi hệ thống. Dữ liệu vẫn được giữ lại và bạn có thể
            khôi phục sau.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={archiveMut.isPending}
              onClick={() => archiveMut.mutate({ id: removing!.id, restore: false })}
            >
              {archiveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Xóa workspace
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phân quyền thành viên */}
      <MembersDialog
        workspace={membersOf}
        onClose={() => setMembersOf(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="ws-tz">Múi giờ</Label>
      <select
        id="ws-tz"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm focus:outline-none"
      >
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
    </div>
  );
}

function MembersDialog({
  workspace,
  onClose,
  onChanged,
}: {
  workspace: WorkspaceListItemDTO | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const members = useQuery({
    queryKey: ["workspace-members", wsId],
    queryFn: () => listWorkspaceMembers({ data: { workspaceId: wsId! } }),
    enabled: !!wsId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workspace-members", wsId] });
    onChanged();
  };

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: "owner" | "member" }) =>
      setWorkspaceMemberRole({ data: { workspaceId: wsId!, userId: v.userId, role: v.role } }),
    onSuccess: () => {
      toast.success("Đã cập nhật vai trò");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không đổi được vai trò"),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) =>
      removeWorkspaceMember({ data: { workspaceId: wsId!, userId } }),
    onSuccess: () => {
      toast.success("Đã gỡ thành viên");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không gỡ được thành viên"),
  });

  const canManage = workspace?.isOwner ?? false;

  return (
    <Dialog open={!!workspace} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Phân quyền · {workspace?.name}</DialogTitle>
        </DialogHeader>
        {!canManage && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
            Chỉ chủ sở hữu workspace mới có thể thay đổi vai trò hoặc gỡ thành viên.
          </p>
        )}
        {members.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thành viên…
          </div>
        ) : (members.data ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Chưa có thành viên nào.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(members.data ?? []).map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.name}
                    {m.isMe && <span className="ml-1 text-xs text-muted-foreground">(bạn)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                <select
                  value={m.role}
                  disabled={!canManage || roleMut.isPending}
                  onChange={(e) =>
                    roleMut.mutate({
                      userId: m.userId,
                      role: e.target.value as "owner" | "member",
                    })
                  }
                  className="h-8 rounded-md border border-border bg-surface-2 px-2 text-xs focus:outline-none disabled:opacity-60"
                >
                  <option value="owner">Quản trị</option>
                  <option value="member">Thành viên</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={!canManage || removeMut.isPending || m.userId === workspace?.ownerId}
                  onClick={() => removeMut.mutate(m.userId)}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between pt-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/workspace/invite">
              <UserPlus className="mr-1.5 h-4 w-4" /> Mời thêm
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
