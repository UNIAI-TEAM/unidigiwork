const slugToLabel: Record<string, string> = {
  "san-pham": "Sản phẩm",
  "huong-dan": "Hướng dẫn",
  "case-study": "Case study",
  "van-hoa": "Văn hoá",
};

/** Bỏ dấu tiếng Việt và chuyển về slug an toàn cho URL. */
export function categorySlug(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function decodeCategory(slug: string) {
  return slugToLabel[slug] || slug;
}
