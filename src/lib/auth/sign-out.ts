import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Đăng xuất người dùng hiện tại.
 *
 * Luôn kết thúc bình thường: nếu máy chủ từ chối (phiên đã hết hạn, lỗi 5xx,
 * mất mạng) thì supabase-js không xoá phiên cục bộ, nên phải thử lại ở phạm vi
 * `local`. Cache truy vấn được dọn trong mọi trường hợp để dữ liệu của tenant
 * cũ không còn nằm lại cho lần đăng nhập kế tiếp.
 */
export async function performSignOut(queryClient?: QueryClient): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Không chặn luồng đăng xuất: vẫn dọn cache và để nơi gọi điều hướng về /auth.
  } finally {
    queryClient?.clear();
  }
}
