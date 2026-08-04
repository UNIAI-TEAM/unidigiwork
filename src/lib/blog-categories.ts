const slugToLabel: Record<string, string> = {
  "san-pham": "Sản phẩm",
  "huong-dan": "Hướng dẫn",
  "case-study": "Case study",
  "van-hoa": "Văn hoá",
};

export function decodeCategory(slug: string) {
  return slugToLabel[slug] || slug;
}
