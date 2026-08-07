// Helper server-only cho Documents: bổ sung tên tác giả cho lịch sử phiên bản.
type VersionRow = {
  author_id: string | null;
  [k: string]: unknown;
};

type MinimalClient = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, vals: string[]) => Promise<{ data: Array<{ id: string; display_name: string | null }> | null }>;
    };
  };
};

export async function withAuthorNames<T extends VersionRow>(
  supabase: unknown,
  rows: T[],
): Promise<Array<T & { author_name: string | null }>> {
  const ids = Array.from(new Set(rows.map((r) => r.author_id).filter((v): v is string => !!v)));
  if (ids.length === 0) return rows.map((r) => ({ ...r, author_name: null }));
  const client = supabase as MinimalClient;
  const { data } = await client.from("users").select("id, display_name").in("id", ids);
  const map = new Map((data ?? []).map((u) => [u.id, u.display_name]));
  return rows.map((r) => ({ ...r, author_name: r.author_id ? (map.get(r.author_id) ?? null) : null }));
}
