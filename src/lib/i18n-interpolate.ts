/**
 * Chèn biến vào chuỗi dịch: fmt("Còn {time}", { time: "05:00" }) -> "Còn 05:00".
 * Biến không có giá trị được giữ nguyên dạng `{name}` để dễ phát hiện thiếu.
 */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
