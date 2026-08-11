// Tạo hóa đơn dạng in/PDF từ dữ liệu hóa đơn.
// Dùng iframe ẩn + print() để trình duyệt xuất PDF, tránh phụ thuộc font
// Unicode của thư viện PDF (tiếng Việt có dấu hiển thị chuẩn).

export type PrintableInvoice = {
  invoiceNumber: string;
  planName: string | null;
  amount: number;
  currency: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
};

function d(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("vi-VN")} ${currency}`;
  }
}

function esc(v: string) {
  return v.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function buildHtml(inv: PrintableInvoice, tenantName: string, title: string) {
  const rows: Array<[string, string]> = [
    ["Số hóa đơn", inv.invoiceNumber],
    ["Ngày phát hành", d(inv.issuedAt)],
    ["Hạn thanh toán", d(inv.dueAt)],
    ["Ngày thanh toán", d(inv.paidAt)],
    ["Phương thức thanh toán", inv.paymentMethod ?? "—"],
  ];

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif; color: #101828; margin: 0; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 2px; letter-spacing: -0.02em; }
  .muted { color: #667085; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #101828; padding-bottom: 14px; margin-bottom: 20px; }
  .badge { display: inline-block; border: 1px solid #12b76a; color: #027a48; background: #ecfdf3; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td, th { text-align: left; padding: 8px 0; border-bottom: 1px solid #eaecf0; vertical-align: top; }
  th { color: #667085; font-weight: 500; width: 45%; }
  .items th, .items td { border-bottom: 1px solid #eaecf0; padding: 10px 0; }
  .items th { color: #667085; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .right { text-align: right; }
  .total { display: flex; justify-content: flex-end; margin-top: 14px; }
  .total .box { min-width: 240px; }
  .total .line { display: flex; justify-content: space-between; padding: 6px 0; }
  .total .grand { border-top: 2px solid #101828; margin-top: 6px; padding-top: 10px; font-size: 16px; font-weight: 700; }
  footer { margin-top: 32px; border-top: 1px solid #eaecf0; padding-top: 12px; font-size: 11px; color: #667085; }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>HÓA ĐƠN</h1>
      <div class="muted">${esc(inv.invoiceNumber)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700;font-size:16px">UNIWORK</div>
      <div class="muted">Nền tảng làm việc số</div>
      <div style="margin-top:8px"><span class="badge">ĐÃ THANH TOÁN</span></div>
    </div>
  </div>

  <div style="display:flex;gap:32px;margin-bottom:18px">
    <div style="flex:1">
      <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Khách hàng</div>
      <div style="font-weight:600;margin-top:4px">${esc(tenantName)}</div>
    </div>
    <div style="flex:1">
      <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Kỳ dịch vụ</div>
      <div style="font-weight:600;margin-top:4px">${d(inv.periodStart)} → ${d(inv.periodEnd)}</div>
    </div>
  </div>

  <table>
    ${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
  </table>

  <table class="items" style="margin-top:24px">
    <thead><tr><th>Nội dung</th><th class="right">Thành tiền</th></tr></thead>
    <tbody>
      <tr>
        <td>Thuê bao gói <strong>${esc(inv.planName ?? "—")}</strong><br><span class="muted">${d(inv.periodStart)} → ${d(inv.periodEnd)}</span></td>
        <td class="right">${esc(money(inv.amount, inv.currency))}</td>
      </tr>
    </tbody>
  </table>

  <div class="total"><div class="box">
    <div class="line"><span class="muted">Tạm tính</span><span>${esc(money(inv.amount, inv.currency))}</span></div>
    <div class="line"><span class="muted">Thuế</span><span>0</span></div>
    <div class="line grand"><span>Tổng cộng</span><span>${esc(money(inv.amount, inv.currency))}</span></div>
  </div></div>

  <footer>
    Hóa đơn được tạo tự động từ hệ thống UNIWORK ngày ${d(new Date().toISOString())}.
    Mọi thắc mắc về thanh toán vui lòng liên hệ bộ phận hỗ trợ.
  </footer>
</body></html>`;
}

/** Mở hộp thoại in/lưu PDF cho một hóa đơn. */
export function downloadInvoicePdf(inv: PrintableInvoice, tenantName: string) {
  const title = `Hoa-don-${inv.invoiceNumber}`;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("PRINT_FRAME_UNAVAILABLE");
  }
  doc.open();
  doc.write(buildHtml(inv, tenantName, title));
  doc.close();

  const run = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    window.setTimeout(() => iframe.remove(), 1000);
  };

  if (doc.readyState === "complete") window.setTimeout(run, 100);
  else iframe.onload = () => window.setTimeout(run, 100);
}
