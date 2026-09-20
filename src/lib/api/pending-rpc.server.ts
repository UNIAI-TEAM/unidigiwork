// Cầu tạm cho RPC đã có trong supabase/migrations nhưng chưa có trong
// src/integrations/supabase/types.ts — file đó sinh tự động từ database, nên
// giữa lúc viết migration và lúc Lovable áp migration rồi sinh lại types luôn
// có một quãng RPC chưa tồn tại dưới mắt TypeScript.
//
// Mỗi lời gọi qua đây là một món nợ: sau khi types được sinh lại, đổi sang
// `client.rpc("<tên>", {...})` thẳng để lấy lại kiểu trả về thật.
// Tìm chỗ còn nợ bằng: grep -rn callPendingRpc src/
import type { PostgrestError } from "@supabase/supabase-js";

type RpcCapable = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;
};

export async function callPendingRpc<T>(
  client: unknown,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const res = await (client as RpcCapable).rpc(name, args);
  return { data: (res.data ?? null) as T | null, error: res.error };
}
