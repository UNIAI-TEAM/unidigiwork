# UNIWORK — FRONTEND BUNDLE & RENDER AUDIT

Phương pháp: kiểm tra cấu trúc route + import nặng. Số liệu bundle chi tiết cần chạy
`vite build --mode production` với `rollup-plugin-visualizer` (chưa cài — tránh thêm dependency
trong Giai đoạn 0).

## Điểm đã xác nhận
- Route-based code splitting: TanStack Start tự tách theo file route → LiveKit chỉ tải ở
  `meeting_.$id.tsx`; editor email chỉ ở `email.tsx`.
- `livekit-stage.tsx` là component riêng, import trong route meeting → không vào bundle chung.
- PWA `/m/*` dùng chung component với desktop → không nhân đôi bundle.
- Badge chưa đọc đọc `localStorage` trước khi fetch → tránh layout shift.

## Rủi ro
| ID | Vấn đề | Ảnh hưởng |
|---|---|---|
| FE-001 | Danh sách dài (tasks, chat, notifications) render toàn bộ, chưa virtualize | Ở 1.000+ dòng gây INP xấu |
| FE-002 | Nhiều query trên `/dashboard` chạy song song không có `staleTime` thống nhất | Refetch thừa khi chuyển tab |
| FE-003 | Chưa gửi web-vitals → không có RUM |
| FE-004 | Chưa có `React.memo` cho row component trong chat/tasks | Re-render toàn danh sách khi realtime bump |

## Ngân sách đề xuất
- Initial JS (gzip) ≤ 250 KB, route chunk ≤ 150 KB, LCP ≤ 2.5s (4G), INP ≤ 200 ms.
Trạng thái: **NOT_MEASURED**.
