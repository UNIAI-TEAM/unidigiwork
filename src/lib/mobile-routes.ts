export function toMobileHref(href: string): string {
  const mappings: Array<[RegExp, string]> = [
    [/^\/tasks\/([^/?#]+)/, "/m/tasks/$1"],
    [/^\/work-products\/([^/?#]+)/, "/m/work-products/$1"],
    [/^\/documents\/([^/?#]+)/, "/m/documents/$1"],
    [/^\/meeting\/([^/?#]+)/, "/m/meet/$1"],
    [/^\/work-graph/, "/m/work-graph"],
    [/^\/settings/, "/m/settings"],
    [/^\/documents/, "/m/documents"],
    [/^\/tasks/, "/m/tasks"],
    [/^\/work-products/, "/m/work-products"],
  ];
  for (const [pattern, replacement] of mappings) {
    if (pattern.test(href)) return href.replace(pattern, replacement);
  }
  // Không tạo deep-link đến một route mobile không tồn tại. Các module chưa có
  // presentation mobile riêng vẫn mở route thật trong responsive shell.
  return href;
}
