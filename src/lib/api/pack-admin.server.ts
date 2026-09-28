// Tính bản đang có hiệu lực của Gói Trường học: bản của trường ghi đè bản chuẩn UniWork.
export type PackItemRow = {
  id: string;
  tenant_id: string | null;
  kind: "template" | "vocabulary" | "skill" | "brief_schedule";
  item_key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: Record<string, any>;
  status: "draft" | "published" | "archived";
  publish_at: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

export function effectiveItem(
  rows: PackItemRow[],
  kind: PackItemRow["kind"],
  key: string,
  now = Date.now(),
): PackItemRow | null {
  const live = rows
    .filter(
      (r) =>
        r.kind === kind &&
        r.item_key === key &&
        r.status === "published" &&
        r.publish_at &&
        Date.parse(r.publish_at) <= now,
    )
    .sort((a, b) => Date.parse(b.publish_at!) - Date.parse(a.publish_at!));
  return live.find((r) => r.tenant_id) ?? live.find((r) => !r.tenant_id) ?? null;
}

export function mergedVocabulary(rows: PackItemRow[], now = Date.now()) {
  const out = { vi: {} as Record<string, string>, en: {} as Record<string, string> };
  const live = rows
    .filter(
      (r) =>
        r.kind === "vocabulary" &&
        r.status === "published" &&
        r.publish_at &&
        Date.parse(r.publish_at) <= now,
    )
    .sort((a, b) => Date.parse(b.publish_at!) - Date.parse(a.publish_at!));
  const pick = [live.find((r) => !r.tenant_id), live.find((r) => r.tenant_id)];
  for (const r of pick) {
    if (!r) continue;
    for (const lang of ["vi", "en"] as const) {
      const m = r.content[lang];
      if (m && typeof m === "object") {
        for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) out[lang][k] = v.trim().slice(0, 120);
        }
      }
    }
  }
  return out;
}

export async function listPackRows(supabase: any, tenantId: string | null): Promise<PackItemRow[]> {
  const { data } = await supabase.rpc("list_pack_items", { _tenant_id: tenantId });
  return (data ?? []) as PackItemRow[];
}
