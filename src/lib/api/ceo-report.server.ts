// BÁO CÁO CEO COMMAND CENTER — kết xuất PDF/Excel từ đúng dữ liệu màn hình điều hành.
// Chỉ đọc; không ghi dữ liệu nghiệp vụ. Dùng lại bộ máy PDF builtin và thư viện xlsx sẵn có.
import * as XLSX from "xlsx";
import type { CeoOverview, CeoPeriod } from "./ceo.server";

export const PERIOD_LABEL: Record<CeoPeriod, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
  quarter: "Quý",
  half: "6 tháng",
  year: "Năm",
};

const d = (iso: string) => new Date(iso).toLocaleDateString("vi-VN");
const num = (v: number) => v.toLocaleString("vi-VN");
const delta = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v}%`);

/** Nội dung markdown-ish dùng cho bộ máy kết xuất PDF. */
export function ceoReportMarkdown(o: CeoOverview): string {
  const lines: string[] = [];
  lines.push(`# Tổng quan kỳ ${PERIOD_LABEL[o.period]} (${d(o.from)} – ${d(o.to)})`);
  lines.push(
    `- Việc mới: ${num(o.totals.tasks.current)} (kỳ trước ${num(o.totals.tasks.previous)}, ${delta(o.totals.tasks.changePct)})`,
  );
  lines.push(
    `- Hoàn thành: ${num(o.totals.completed.current)} (kỳ trước ${num(o.totals.completed.previous)}, ${delta(o.totals.completed.changePct)})`,
  );
  lines.push(`- Đang thực hiện: ${num(o.totals.inProgress)} · Quá hạn: ${num(o.totals.overdue)}`);

  lines.push("## Chuyển dịch Người ↔ AI");
  lines.push(`- Người: ${num(o.split.human)} việc · AI: ${num(o.split.ai)} việc`);
  lines.push(`- AI đảm nhiệm ${o.split.aiSharePct}% (kỳ trước ${o.split.aiSharePrevPct}%)`);

  lines.push("## Thời gian làm việc");
  lines.push(`- Giờ AI (đo thật): ${o.time.aiHours}`);
  lines.push(`- Giờ người (ƯỚC TÍNH, chưa có chấm công): ${o.time.humanHours}`);
  lines.push(
    `- Giờ họp đã diễn ra: ${o.time.meetingHours} · Họp sắp tới (chưa tính KPI): ${o.time.upcomingMeetingHours} (${o.time.upcomingMeetings} cuộc)`,
  );
  lines.push(`- Tiến độ trung bình việc đang chạy: ${o.time.avgProgressPct}%`);
  lines.push(`- Ước tính tiết kiệm: ${o.time.savedHours}`);
  lines.push(`- Đòn bẩy AI: ${o.time.leverage ?? "chưa đủ dữ liệu"}`);

  lines.push("## Chất lượng kết quả");
  lines.push(
    `- Có kết quả: ${num(o.quality.withResult)}/${num(o.quality.tasksCreated)} (${o.quality.resultRate ?? "—"}%)`,
  );
  lines.push(
    `- Đã review: ${num(o.quality.reviewed)} · Đạt: ${num(o.quality.passed)} (${o.quality.passRate ?? "—"}%)`,
  );

  lines.push("## Đề xuất từ Bộ não AI");
  lines.push(
    `- Đề xuất trong kỳ: ${num(o.proposals.total.current)} (kỳ trước ${num(o.proposals.total.previous)}, ${delta(o.proposals.total.changePct)})`,
  );
  lines.push(
    `- Đề xuất giao việc: ${num(o.proposals.assignment)} · Đã thực thi: ${num(o.proposals.executed)} (${o.proposals.executionRate ?? "—"}%)`,
  );
  lines.push(
    `- Chờ duyệt: ${num(o.proposals.pending)} · Từ chối/hủy: ${num(o.proposals.rejected)}`,
  );
  for (const p of o.proposals.entries.slice(0, 15)) {
    lines.push(
      `- ${p.title} — ${p.actionType} · ${p.status}${p.workerName ? ` · ${p.workerName}` : ""}${p.taskTitle ? ` · ${p.taskTitle}` : ""} · ${d(p.createdAt)}`,
    );
  }

  if (o.people.length) {
    lines.push("## Thời gian và khối lượng theo nhân sự");
    for (const p of o.people.slice(0, 30)) {
      lines.push(
        `- ${p.name} (${p.kind === "ai" ? "AI" : "Người"}${p.role ? ` · ${p.role}` : ""}): ${p.tasks} việc, hoàn thành ${p.completed}, ${p.hours} giờ${p.hoursEstimated ? " (ước tính)" : ""}, review đạt ${p.reviewPassRate ?? "—"}%`,
      );
    }
  }

  if (o.departments.length) {
    lines.push("## Công việc theo bộ phận");
    for (const dep of o.departments) {
      lines.push(
        `- ${dep.name}: người ${dep.human} · AI ${dep.ai} · tổng ${dep.total} · hoàn thành ${dep.completed} · quá hạn ${dep.overdue} · AI ${dep.aiSharePct}% · ~${dep.hoursEstimated} giờ · ${dep.proposals} đề xuất`,
      );
    }
  }

  if (o.issues.length) {
    lines.push("## Vấn đề cần xử lý");
    for (const i of o.issues.slice(0, 30)) lines.push(`- [${i.kind}] ${i.title} — ${i.detail}`);
  }

  lines.push("## Bốn câu hỏi của CEO");
  const blocks: [string, string[]][] = [
    ["Nguồn lực đang ở đâu?", o.answers.resources],
    ["Chúng ta tạo ra gì?", o.answers.outputs],
    ["Điều gì đang thay đổi?", o.answers.changes],
    ["Giá trị nằm ở đâu?", o.answers.value],
  ];
  for (const [q, items] of blocks) {
    lines.push(`### ${q}`);
    for (const it of items) lines.push(`- ${it}`);
  }

  return lines.join("\n");
}

/** Kết xuất PDF qua bộ máy builtin (font Unicode, đọc được tiếng Việt). */
export async function buildCeoPdf(o: CeoOverview, orgLabel: string): Promise<Uint8Array> {
  const { builtinOfficeEngine } = await import("./office-builtin.server");
  const res = await builtinOfficeEngine.render({
    format: "PDF",
    title: `Báo cáo điều hành — ${orgLabel}`,
    content: ceoReportMarkdown(o),
    businessType: "REPORT",
    version: 1,
    workProductId: `ceo-${o.period}-${o.to}`,
    provenance: [],
    template: {
      key: "ceo",
      accent: "087BFF",
      label: `Kỳ ${PERIOD_LABEL[o.period]}`,
      cover: true,
      header: "UNIWORK · CEO Command Center",
      footer: "Chỉ đọc — tổng hợp từ dữ liệu vận hành thật",
    },
  });
  return res.bytes;
}

/** Kết xuất Excel nhiều sheet: Tổng quan, Nhân sự, Bộ phận, Vấn đề. */
export function buildCeoXlsx(o: CeoOverview): Uint8Array {
  const wb = XLSX.utils.book_new();

  const overview: Record<string, string | number>[] = [
    { "Chỉ số": "Kỳ", "Giá trị": `${PERIOD_LABEL[o.period]} (${d(o.from)} – ${d(o.to)})` },
    { "Chỉ số": "Việc mới", "Giá trị": o.totals.tasks.current },
    { "Chỉ số": "Việc mới kỳ trước", "Giá trị": o.totals.tasks.previous },
    { "Chỉ số": "Hoàn thành", "Giá trị": o.totals.completed.current },
    { "Chỉ số": "Hoàn thành kỳ trước", "Giá trị": o.totals.completed.previous },
    { "Chỉ số": "Đang thực hiện", "Giá trị": o.totals.inProgress },
    { "Chỉ số": "Quá hạn", "Giá trị": o.totals.overdue },
    { "Chỉ số": "Việc do người", "Giá trị": o.split.human },
    { "Chỉ số": "Việc do AI", "Giá trị": o.split.ai },
    { "Chỉ số": "Tỷ trọng AI (%)", "Giá trị": o.split.aiSharePct },
    { "Chỉ số": "Tỷ trọng AI kỳ trước (%)", "Giá trị": o.split.aiSharePrevPct },
    { "Chỉ số": "Giờ AI (đo thật)", "Giá trị": o.time.aiHours },
    { "Chỉ số": "Giờ người (ước tính)", "Giá trị": o.time.humanHours },
    { "Chỉ số": "Giờ họp đã diễn ra", "Giá trị": o.time.meetingHours },
    { "Chỉ số": "Giờ họp sắp tới (chưa tính KPI)", "Giá trị": o.time.upcomingMeetingHours },
    { "Chỉ số": "Tiến độ TB việc đang chạy (%)", "Giá trị": o.time.avgProgressPct },
    { "Chỉ số": "Ước tính tiết kiệm (giờ)", "Giá trị": o.time.savedHours },
    { "Chỉ số": "Đòn bẩy AI", "Giá trị": o.time.leverage ?? "—" },
    { "Chỉ số": "Việc có kết quả", "Giá trị": o.quality.withResult },
    { "Chỉ số": "Việc được tạo", "Giá trị": o.quality.tasksCreated },
    { "Chỉ số": "Tỷ lệ có kết quả (%)", "Giá trị": o.quality.resultRate ?? "—" },
    { "Chỉ số": "Đã review", "Giá trị": o.quality.reviewed },
    { "Chỉ số": "Review đạt", "Giá trị": o.quality.passed },
    { "Chỉ số": "Tỷ lệ đạt (%)", "Giá trị": o.quality.passRate ?? "—" },
    { "Chỉ số": "Đề xuất trong kỳ", "Giá trị": o.proposals.total.current },
    { "Chỉ số": "Đề xuất giao việc", "Giá trị": o.proposals.assignment },
    { "Chỉ số": "Đề xuất đã thực thi", "Giá trị": o.proposals.executed },
    { "Chỉ số": "Đề xuất chờ duyệt", "Giá trị": o.proposals.pending },
    { "Chỉ số": "Đề xuất bị từ chối/hủy", "Giá trị": o.proposals.rejected },
    { "Chỉ số": "Tỷ lệ đề xuất được thực thi (%)", "Giá trị": o.proposals.executionRate ?? "—" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), "Tổng quan");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      o.people.map((p) => ({
        "Nhân sự": p.name,
        Loại: p.kind === "ai" ? "AI" : "Người",
        "Vai trò": p.role ?? "",
        "Số việc": p.tasks,
        "Hoàn thành": p.completed,
        Giờ: p.hours,
        "Giờ là ước tính": p.hoursEstimated ? "Có" : "Không",
        "Review đạt (%)": p.reviewPassRate ?? "",
      })),
    ),
    "Nhân sự",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      o.departments.map((x) => ({
        "Bộ phận": x.name,
        Người: x.human,
        AI: x.ai,
        Tổng: x.total,
        "Hoàn thành": x.completed,
        "Quá hạn": x.overdue,
        "Tỷ lệ AI (%)": x.aiSharePct,
        "Giờ ước tính": x.hoursEstimated,
        "Đề xuất": x.proposals,
        "Trọng số KPI": x.weight,
      })),
    ),
    "Bộ phận",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      o.proposals.entries.map((p) => ({
        "Đề xuất": p.title,
        "Loại hành động": p.actionType,
        "Trạng thái": p.status,
        Nguồn: p.source ?? "",
        "Rủi ro": p.risk ?? "",
        "Nhân sự AI": p.workerName ?? "",
        "Công việc": p.taskTitle ?? "",
        "Ngày tạo": d(p.createdAt),
        "Ngày thực thi": p.executedAt ? d(p.executedAt) : "",
      })),
    ),
    "Đề xuất",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      o.issues.map((i) => ({ Loại: i.kind, "Vấn đề": i.title, "Chi tiết": i.detail })),
    ),
    "Vấn đề",
  );

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}

export function ceoReportFileName(o: CeoOverview, ext: "pdf" | "xlsx"): string {
  return `bao-cao-dieu-hanh-${o.period}-${o.to.slice(0, 10)}.${ext}`;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
