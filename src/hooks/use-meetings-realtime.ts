import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Mọi họ query phụ thuộc trạng thái phòng họp — phải làm mới cùng lúc. */
const MEETING_QUERY_KEYS = [
  ["meeting-rooms"],
  ["meetings-range"],
  ["meetings-month"],
  ["meeting-stats"],
  ["meeting"],
] as const;

/** Khi socket khỏe, poll dự phòng giãn ra 4 nhịp (mặc định 30s → 2 phút). */
const HEALTHY_SOCKET_TICKS = 4;

/**
 * Đồng bộ thời gian thực trạng thái phòng họp.
 * - Subscription Postgres changes trên bảng meetings (theo workspace nếu có).
 * - Polling dự phòng cho trường hợp socket bị chặn: tạm dừng hoàn toàn khi tab
 *   bị ẩn, và giãn nhịp khi socket đã kết nối được (vẫn giữ lưới an toàn phòng
 *   khi bảng chưa nằm trong publication realtime).
 * - Quay lại tab sau khi ẩn thì đồng bộ ngay một lần cho chắc.
 */
export function useMeetingsRealtime(workspaceId?: string | null, pollMs = 30000) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      for (const queryKey of MEETING_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    let socketLive = false;

    const channel = supabase
      .channel(`meetings-rt-${workspaceId ?? "all"}`)
      .on(
        "postgres_changes",
        workspaceId
          ? {
              event: "*",
              schema: "public",
              table: "meetings",
              filter: `workspace_id=eq.${workspaceId}`,
            }
          : { event: "*", schema: "public", table: "meetings" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_participants" },
        invalidate,
      )
      .subscribe((status) => {
        socketLive = status === "SUBSCRIBED";
      });

    let tick = 0;
    const timer = window.setInterval(() => {
      // Tab ẩn: không tạo tải nền.
      if (document.hidden) return;
      tick += 1;
      if (socketLive && tick % HEALTHY_SOCKET_TICKS !== 0) return;
      invalidate();
    }, pollMs);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        tick = 0;
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, workspaceId, pollMs]);
}
