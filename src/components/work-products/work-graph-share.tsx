// Chia sẻ bản đồ công việc bằng liên kết xem — chỉ chủ sở hữu / quản trị tổ chức.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, Share2, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createWorkGraphShare,
  deleteWorkGraphShare,
  listWorkGraphShares,
  revokeWorkGraphShare,
} from "@/lib/api/work-graph-share.functions";

export function WorkGraphSharePanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("Bản đồ công việc");
  const [days, setDays] = useState(7);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [freshLink, setFreshLink] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["work-graph-shares"],
    queryFn: () => listWorkGraphShares(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["work-graph-shares"] });

  const create = useMutation({
    mutationFn: () =>
      createWorkGraphShare({ data: { label, days, includeTasks, includeDocuments } }),
    onSuccess: (res) => {
      setFreshLink(`${window.location.origin}${res.path}`);
      refresh();
      toast.success("Đã tạo liên kết xem");
    },
    onError: () => toast.error("Không tạo được liên kết"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeWorkGraphShare({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Đã thu hồi liên kết");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWorkGraphShare({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Đã xóa liên kết");
    },
  });

  if (!data?.canManage) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Share2 />
          Chia sẻ bản đồ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chia sẻ bản đồ công việc</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Người nhận liên kết xem được tên công việc, cuộc họp và tài liệu cùng cách chúng liên kết
          với nhau — không cần đăng nhập, không xem được nội dung bên trong. Ai có liên kết đều xem
          được, nên chỉ gửi cho người bạn tin tưởng.
        </p>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Tên liên kết</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hết hạn sau (ngày)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Math.min(90, Math.max(1, Number(e.target.value) || 7)))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Hiện công việc</Label>
            <Switch checked={includeTasks} onCheckedChange={setIncludeTasks} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Hiện tài liệu</Label>
            <Switch checked={includeDocuments} onCheckedChange={setIncludeDocuments} />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
            Tạo liên kết xem
          </Button>
        </div>

        {freshLink && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium">Liên kết mới (chỉ hiện một lần)</p>
            <div className="flex gap-2">
              <Input readOnly value={freshLink} className="text-xs" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(freshLink);
                  toast.success("Đã sao chép");
                }}
              >
                <Copy />
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(data.shares ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <span className="text-sm font-medium">{s.label}</span>
              <Badge variant={s.active ? "secondary" : "outline"} className="text-[10px]">
                {s.active ? "Đang hoạt động" : s.revokedAt ? "Đã thu hồi" : "Hết hạn"}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {s.viewCount} lượt xem · hết hạn {new Date(s.expiresAt).toLocaleDateString("vi-VN")}
              </span>
              <div className="ml-auto flex gap-1">
                {s.active && (
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                    <XCircle />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          {!(data.shares ?? []).length && (
            <p className="text-xs text-muted-foreground">Chưa có liên kết nào.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
