// WE-1 — Work Economics & Sell Work Metering (server-only).
//
// Lớp QUAN SÁT thuần: mọi số đo được TÍNH LẠI TRONG DATABASE từ dữ liệu đã ghi
// (ai_task_executions, work_execution_steps, ai_action_proposals). App không gửi
// số liệu nào lên — vì vậy không thể bơm số đẹp từ client hay từ model.
//
// Bất biến:
//  - Không dùng service role; RPC chạy SECURITY DEFINER nhưng tự kiểm tra tenant.
//  - Không ghi trực tiếp vào bảng metrics (không có policy INSERT/UPDATE).
//  - Metering thất bại KHÔNG được làm hỏng lượt chạy công việc.
import type { WorkExecutionMetricsRow } from "@/domain/work-economics/contracts";

type Supa = { rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }> };

/**
 * Tính lại (idempotent) số đo kinh tế cho một lượt chạy.
 * Gọi sau mỗi mốc vòng đời: kết thúc chạy, tiếp tục, yêu cầu sửa, nghiệm thu.
 */
export async function meterWorkExecution(
  supabase: unknown,
  executionId: string,
): Promise<WorkExecutionMetricsRow | null> {
  try {
    const res = await (supabase as Supa).rpc("recompute_work_execution_metrics", {
      _execution_id: executionId,
    });
    if (res.error) return null;
    // WE-3: chi phí đơn vị được tính lại NGAY SAU số đo, từ cùng nguồn dữ liệu.
    // Thất bại ở lớp chi phí không bao giờ làm hỏng lượt chạy.
    await costWorkExecution(supabase, executionId);
    return (res.data ?? null) as WorkExecutionMetricsRow | null;
  } catch {
    return null;
  }
}

/** WE-3 — tính lại chi phí đã biết cho một lượt chạy (idempotent, server-authoritative). */
export async function costWorkExecution(supabase: unknown, executionId: string): Promise<unknown | null> {
  try {
    const res = await (supabase as Supa).rpc("recompute_work_execution_cost", {
      _execution_id: executionId,
    });
    if (res.error) return null;
    return res.data ?? null;
  } catch {
    return null;
  }
}

