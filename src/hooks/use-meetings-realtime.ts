import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Đồng bộ thời gian thực trạng thái phòng họp.
 * - Subscription Postgres changes trên bảng meetings (theo workspace nếu có).
 * - Polling nhẹ làm phương án dự phòng khi socket bị chặn.
 */
export function useMeetingsRealtime(workspaceId?: string | null, pollMs = 30000) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings-range"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings-month"] });
      void queryClient.invalidateQueries({ queryKey: ["meeting"] });
    };

    const channel = supabase
      .channel(`meetings-rt-${workspaceId ?? "all"}`)
      .on(
        "postgres_changes",
        workspaceId
          ? { event: "*", schema: "public", table: "meetings", filter: `workspace_id=eq.${workspaceId}` }
          : { event: "*", schema: "public", table: "meetings" },
        invalidate,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_participants" }, invalidate)
      .subscribe();

    const timer = window.setInterval(invalidate, pollMs);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, workspaceId, pollMs]);
}
