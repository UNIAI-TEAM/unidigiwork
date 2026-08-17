# AI Market — Chợ tuyển dụng nhân sự AI

Tách rõ: **AI Market** = catalog ứng viên do UNICOM cung cấp (global, read-only với tenant). **AI Workforce** = nhân sự AI đã tuyển vào công ty (tenant-scoped, đang làm việc).

## Luồng nghiệp vụ

```text
DISCOVER  →  INTERVIEW  →  OFFER (đàm phán)  →  TRIAL (thử việc)  →  HIRED  →  TERMINATED
   chợ        chat +          lương/điều khoản    chạy thật,          mở đầy đủ
              case chuẩn                          bắt buộc duyệt      allowlist hồ sơ
```

- **Thử việc**: agent hoạt động thật nhưng mọi AI Action đều phải người duyệt, có quota giới hạn và ngày kết thúc.
- **Chính thức**: kế thừa allowlist hành động theo hồ sơ, tính lương cố định + phí theo action đã duyệt.
- Mỗi chuyển trạng thái đi qua server function + ghi audit event (không direct-write từ component).

## Dữ liệu (Lovable Cloud)

Bảng global (mọi tenant đọc, chỉ hệ thống ghi):
- `ai_market_agents` — ứng viên: mã, tên, lĩnh vực, persona, mô tả, avatar, kỹ năng, khoảng lương (min/max), phí mỗi action, trạng thái xuất bản.
- `ai_market_experiences` — "công ty đã làm": ngành nghề + mô tả ẩn danh + thời lượng.
- `ai_market_interview_cases` — bộ câu hỏi tình huống chuẩn theo lĩnh vực, có thang chấm.

Bảng tenant-scoped (RLS theo tenant_id):
- `ai_employments` — hợp đồng: market_agent_id, status, lương chốt, phí/action, ngày bắt đầu, hạn thử việc, điều khoản, workflow_agent_id sau khi tuyển.
- `ai_interviews` + `ai_interview_messages` — phiên phỏng vấn, điểm từng case, transcript chat.
- `ai_employment_events` — lịch sử đàm phán/chuyển trạng thái.

KPI hồ sơ (số việc hoàn thành, tỉ lệ duyệt) **tính động** từ `ai_action_proposals` + `workflow_agent_runs`, không lưu cứng.

## Server functions

`src/lib/api/ai-market.functions.ts`
- `listMarketAgents` (lọc theo lĩnh vực, kỹ năng, khoảng lương, sắp xếp theo rating/KPI)
- `getMarketAgentProfile` (hồ sơ + kinh nghiệm + KPI tổng hợp + trạng thái tuyển của tenant)
- `startInterview`, `sendInterviewMessage` (chat có giới hạn lượt), `runInterviewCases` (chấm bộ case chuẩn)
- `submitOffer` / `counterOffer` (validate trong khoảng min–max, thời hạn cam kết giảm giá)
- `startTrial`, `convertToFullTime`, `terminateEmployment`

Phỏng vấn dùng AI Gateway với persona của ứng viên, ở chế độ chỉ đọc — không truy cập dữ liệu tenant ngoài phạm vi công khai.

Khi `HIRED` hoặc `TRIAL`: tạo/kích hoạt bản ghi trong `workflow_agents` với hồ sơ, kỹ năng và allowlist tương ứng, để toàn bộ AI Action Layer hiện có chạy nguyên vẹn.

## Chi phí

- Lương cố định theo tháng + phí biến đổi theo mỗi action được duyệt.
- Ghi nhận qua `usage_events` / `usage_counters` sẵn có, hiển thị trên `/billing` như một dòng chi phí "Nhân sự AI".
- Đàm phán chỉ được chốt trong khoảng do market định; ngoài khoảng thì từ chối ở server.

## Giao diện

Desktop:
- `/ai-market` — lưới ứng viên, bộ lọc lĩnh vực/kỹ năng/lương, so sánh nhiều ứng viên.
- `/ai-market/$id` — hồ sơ đầy đủ: nhiệm vụ, kỹ năng, kinh nghiệm, KPI, bảng lương, nút Phỏng vấn / Gửi đề nghị.
- Phòng phỏng vấn: cột trái case chuẩn có điểm, cột phải chat tự do, đáy là hành động Đề nghị tuyển.
- `/ai-workforce` bổ sung tab hợp đồng: đang thử việc / chính thức / đã kết thúc, kèm nút chuyển chính thức và chi phí tháng.

Mobile: `/m/ai-market` (danh sách + lọc), `/m/ai-market/$id` (hồ sơ toàn màn hình + phỏng vấn).

Dùng đúng semantic token và i18n như phần AI Workforce hiện tại, tái sử dụng component hồ sơ đã có.

## Thứ tự triển khai

1. Migration + seed catalog ứng viên & bộ case phỏng vấn.
2. Server functions market + hồ sơ + KPI.
3. Trang chợ và hồ sơ (desktop + mobile).
4. Phỏng vấn (case chuẩn + chat).
5. Đàm phán → thử việc → chính thức, nối vào `workflow_agents`.
6. Chi phí và tab hợp đồng trong AI Workforce.
