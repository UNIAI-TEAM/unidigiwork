# UniWork — bản app điện thoại nội bộ (không lên kho)

App dùng Capacitor, nạp trực tiếp bản đã publish `https://unidigiwork.lovable.app`.
Nghĩa là: sửa code → publish → app trên máy nhân viên tự có bản mới, không phải cài lại.

## Dựng lần đầu (một lần)

```sh
bun install
bun run mobile:init     # tạo thư mục android/ và ios/
bun run mobile:sync
```

## Android (file .apk phát nội bộ)

```sh
bun run mobile:android       # mở Android Studio
# Build > Generate Signed Bundle / APK > APK > tạo keystore > release
```
File `.apk` nằm ở `android/app/build/outputs/apk/release/`. Gửi cho nhân viên, họ bật
"Cài ứng dụng từ nguồn không xác định" rồi cài.

## iOS (TestFlight nội bộ / Ad Hoc)

Cần máy Mac + Xcode + tài khoản Apple Developer.

```sh
bun run mobile:ios           # mở Xcode
# Chọn Team ở tab Signing & Capabilities > Product > Archive > Distribute App
```
Chọn **TestFlight Internal Testing** (tối đa 100 thiết bị nội bộ, không cần duyệt kho)
hoặc **Ad Hoc** nếu đã đăng ký UDID thiết bị.

## Trỏ app sang môi trường khác

```sh
CAPACITOR_SERVER_URL=https://project--c938c072-6a99-4ce4-bf24-94e5f5e28333-dev.lovable.app bun run mobile:sync
```

## Ngoại tuyến

App dùng lại toàn bộ cơ chế đã có: cache IndexedDB 7 ngày cho công việc / góp ý / Work Graph
và hàng đợi gửi lại khi có mạng (`src/lib/offline/*`). Phần native bổ sung:

- trạng thái mạng lấy từ hệ điều hành (`@capacitor/network`), chính xác hơn `navigator.onLine`;
- mở lại app (resume) → tự đồng bộ hàng đợi và làm mới dữ liệu;
- nút Back Android, splash screen, thanh trạng thái tối.

## Guardrails vỏ app (bổ sung)

1. **Health-check trước bootstrap** — binary mở `native-shell/index.html`, gọi
   `GET /api/public/app-health` rồi mới chuyển sang bản web đã publish.
2. **Màn hình dự phòng** — mất mạng/máy chủ không phản hồi: hiện Retry + nút
   "Chẩn đoán mạng" (trạng thái online, mã HTTP, lỗi, userAgent).
3. **Version handshake** — web công bố `window.UniWorkNative`
   (`contractVersion`, `nativeVersion`, `platform`, `capabilities`, `has()`);
   shell chặn bootstrap nếu `nativeVersion < minNativeVersion`.
4. **Cache/version invalidation** — `webVersion` trong health; gói web cũ tự xoá
   cache, cập nhật service worker và nạp lại đúng 1 lần mỗi phiên.
5. **Kill-switch từ xa** — biến môi trường `UNIWORK_KILL_SWITCH=true`,
   `UNIWORK_KILL_MESSAGE`, `UNIWORK_MIN_NATIVE_VERSION` (không cần build lại).

Dùng capability trước khi gọi native:

```ts
import { hasNativeCapability } from "@/lib/native/capabilities";
if (hasNativeCapability("push")) { /* native */ } else { /* Web Notification */ }
```

`src/lib/native/notify.ts` là ví dụ fallback push -> Web Notification.
