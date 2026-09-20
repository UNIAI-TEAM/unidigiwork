// Client Supabase chạy dưới role `anon` — dùng cho đúng một việc: đường vào của
// khách ngoài chưa đăng nhập (xem meeting-guest.functions.ts).
//
// KHÔNG phải service-role. Blueprint cấm service-role chạm bảng domain, và
// khách ngoài là principal ít tin cậy nhất trong hệ thống nên càng phải đi bằng
// khoá yếu nhất. Mọi thẩm quyền nằm trong các RPC SECURITY DEFINER được cấp
// EXECUTE cho `anon`; client này không được phép SELECT thẳng bảng nào.
//
// Đặt ngoài `src/integrations/supabase/` vì thư mục đó là file sinh tự động.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let cached: SupabaseClient<Database> | null = null;

export function supabaseAnon(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}`);
  }

  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
