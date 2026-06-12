---
name: unicom-ui-design
description: Chuẩn UI/UX cho các sản phẩm UNICOM AI Software Factory (UNIWORK và phụ phẩm). Kích hoạt khi người dùng yêu cầu tạo trang/màn hình/component mới, thiết kế lại UI, hoặc cần đồng bộ phong cách enterprise SaaS theo chuẩn Stripe/Notion/Linear/Vercel với tiếng Việt mặc định.
---

# UNICOM UI Design Skill

Skill này định nghĩa ngôn ngữ thiết kế dùng chung cho mọi giao diện trong hệ sinh thái UNICOM AI Software Factory (UNIWORK, các module nội bộ, sản phẩm khách hàng). Mục tiêu: mọi màn hình mới sinh ra đều **tối giản, premium, thoáng, hiện đại** kiểu enterprise SaaS — không cần thiết kế lại từ đầu.

---

## 1. Tinh thần thiết kế (bắt buộc)

Cảm giác phải đạt được:
- **Minimal** — chỉ giữ nội dung có giá trị, loại bỏ trang trí thừa.
- **Premium** — đường nét sạch, typography mạnh, shadow mềm.
- **Spacious** — nhiều whitespace, không nén nội dung.
- **Modern enterprise SaaS** — phong cách Stripe, Notion, Linear, Vercel, Retool.
- **Hierarchy rõ ràng** — heading lớn, body trung tính, label nhỏ.

Tham chiếu: Stripe (form & data), Notion (document layout), Linear (sidebar + command bar), Vercel (typography & marketing), Retool (dense admin).

---

## 2. Cấm tuyệt đối

Không bao giờ tạo ra giao diện có:
- Lộn xộn, nhiều khối chen chúc, dày đặc card không nghỉ.
- Quá nhiều màu (>2 màu nhấn cùng lúc).
- Gradient nặng, gradient tím-hồng generic AI.
- Phong cách admin cũ (Bootstrap 3, AdminLTE).
- Nút quá nhỏ (<32px chiều cao), icon-only không tooltip/aria-label.
- Phong cách crypto/gaming (neon, glow mạnh, glassmorphism dày).
- Font generic AI: Inter mặc định kèm gradient tím trên nền trắng là tín hiệu lười — phải có cam kết phong cách cụ thể hơn.
- Hardcode chuỗi UI (xem mục 9 – i18n).

---

## 3. Foundation tokens

### Màu
- Nền chính: **trắng / off-white** ở light, **xám-xanh sâu hue 260** ở dark.
- Bảng grayscale trung tính (neutral 50–900), không pha quá nhiều hue.
- Accent: **deep blue / indigo** (`primary` ~ `oklch(0.56 0.18 285)`). Chỉ 1 accent chính; trạng thái dùng `success / destructive / muted`.
- **Luôn dùng semantic token** từ `src/styles.css`: `bg-background`, `text-foreground`, `bg-surface`, `border-border`, `text-muted-foreground`, `bg-primary text-primary-foreground`, …
- **Cấm hardcode**: `text-white`, `bg-black`, `bg-[#...]`, `text-gray-500` trực tiếp trong component. Cần màu mới → thêm token vào `src/styles.css` trước.
- Hỗ trợ đồng thời **light + dark**; mọi cặp bg/foreground phải đạt contrast WCAG AA.

### Typography
- Font: **Inter** hoặc **Geist** (sans). Heading cùng family, weight 600–700.
- Hierarchy gợi ý:
  - Display / H1: `text-3xl md:text-4xl font-semibold tracking-tight`
  - H2: `text-2xl font-semibold tracking-tight`
  - H3: `text-lg font-semibold`
  - Body: `text-sm md:text-base text-foreground`
  - Muted / meta: `text-xs text-muted-foreground`
- Line-height thoáng (`leading-relaxed` cho đoạn văn).
- Không dùng serif trừ khi người dùng yêu cầu rõ ràng.

### Spacing & layout
- Lưới **8px** (Tailwind: 2, 4, 6, 8, 10, 12, 16, 20, 24…).
- Padding section: `py-10 md:py-16`. Padding card: `p-4 md:p-6`.
- Max-width nội dung đọc: `max-w-3xl`. Dashboard: `max-w-7xl mx-auto`.
- Khoảng cách giữa các khối: tối thiểu `gap-6`, section lớn `gap-12`.

### Bo góc & shadow
- Radius: `rounded-lg` (button, input) → `rounded-xl` (card) → `rounded-2xl` (panel lớn).
- Shadow mềm: `shadow-sm` mặc định, `shadow-md` cho hover/elevated. Hạn chế `shadow-lg+`.
- Ưu tiên `border border-border` mỏng 1px hơn shadow nặng.

### Motion
- Transition `transition-colors duration-150` cho hover/focus.
- Animation modal/route < 250ms, easing `ease-out`. Không bounce, không spring nặng.

---

## 4. Component conventions

- **Library**: shadcn/ui (`src/components/ui/`). Luôn dùng `Button`, `Input`, `Dialog`, `Card`, `Tabs`, `DropdownMenu`… có sẵn thay vì viết lại.
- **Icon**: `lucide-react`. Size: `h-4 w-4` trong button, `h-5 w-5` trong nav, `h-3.5 w-3.5` cho meta.
- **Button**:
  - Primary: `variant="default"` (chỉ 1 primary mỗi vùng).
  - Phụ: `variant="outline"` hoặc `"ghost"`.
  - Nguy hiểm: `variant="destructive"`.
  - Min height 36px (`h-9`), padding ngang ≥ 12px.
- **Input/Form**: label luôn hiển thị (không placeholder-only), helper `text-xs text-muted-foreground`, error `text-destructive`.
- **Empty state**: icon nhẹ + tiêu đề ngắn + 1 dòng mô tả + 1 CTA. Không để trang trống.
- **Loading**: `Skeleton` hoặc shimmer text "Đang tải…", **không** spinner full-screen.
- **Toast**: `sonner` qua `@/components/ui/sonner`.

---

## 5. Layout patterns

- **App shell**: sidebar trái (collapsible) + topbar + main. Dùng `AppSidebar`, `AppTopbar` trong `src/components/app-shell.tsx` nếu có.
- **Marketing/Public**: dùng `public-shell`. Hero gọn, CTA rõ, social proof, feature grid, footer đầy đủ.
- **Detail page**: breadcrumb → tiêu đề + actions phải → meta row → nội dung → sidebar phụ (xl trở lên).
- **List page**: header (title + filter + CTA) → search/sort bar → list/table → empty state.
- Responsive: **luôn test desktop / tablet / mobile**. Mobile cảm giác native app (sticky header, bottom-safe, tap target ≥ 44px).

---

## 6. Routing & SEO (TanStack Start)

- Mỗi section nội dung lớn = **route file riêng** trong `src/routes/`, không dùng hash anchor làm điều hướng chính.
- Mỗi route có `head()` riêng: `title` (<60 ký tự, có keyword), `description` (<160), `og:title`, `og:description`. Route detail derive từ loader data.
- Một `<h1>` mỗi trang. Semantic HTML (`<nav> <main> <article> <section> <footer>`).
- Ảnh: `alt` mô tả thực, `loading="lazy"` ngoài hero.

---

## 7. Accessibility

- Contrast AA tối thiểu, AAA cho body khi có thể.
- Mọi control bàn phím được: `focus-visible:ring-1 focus-visible:ring-ring`.
- Icon-only button cần `aria-label` hoặc `sr-only` text.
- Form input bind `id` ↔ `label`; lỗi liên kết qua `aria-describedby`.
- Modal/Dialog dùng primitive shadcn (đã lo focus trap, ESC).

---

## 8. Data display

- Bảng: header `text-xs uppercase tracking-wide text-muted-foreground`, row `text-sm`, hover `bg-muted/40`, divider `border-border`.
- Number: `Intl.NumberFormat('vi-VN')`, tiền tệ rõ đơn vị.
- Date: tương đối ("2 phút trước") cho hoạt động, tuyệt đối có tooltip cho audit.
- Badge trạng thái: `Badge` variant; màu semantic (`success`, `warning`, `destructive`, `muted`).

---

## 9. Nội dung & i18n

- **Ngôn ngữ mặc định: tiếng Việt**, hỗ trợ English & i18n tương lai.
- Không hardcode chuỗi UI trong JSX khi dự án có `src/lib/i18n.tsx` — dùng key i18n.
- Văn phong: ngắn gọn, thân thiện, chuyên nghiệp. Ưu tiên động từ chủ động ("Tạo workspace", "Mời thành viên"). Tránh "OK", "Submit".
- Microcopy nút: động từ ngắn ("Lưu", "Hủy", "Tải lên").

---

## 10. Checklist trước khi kết thúc một màn hình

Trả lời "có" cho tất cả mục dưới:

1. Dùng semantic tokens, không có class màu hardcode.
2. Layout có hierarchy rõ (heading / body / meta phân tầng).
3. Spacing trên lưới 8px, đủ thoáng.
4. Hỗ trợ light + dark, contrast đạt AA.
5. Responsive desktop / tablet / mobile; tap target ≥ 44px trên mobile.
6. Mỗi component tương tác có trạng thái hover / focus / disabled / loading / empty / error.
7. Icon-only có aria-label; form có label hiển thị.
8. Route mới có `head()` với title + description riêng (nếu là page).
9. Văn bản tiếng Việt, dùng i18n key khi có sẵn, không hardcode chuỗi.
10. Không vi phạm danh sách "Cấm tuyệt đối" ở mục 2.

---

## 11. Anti-patterns nhanh

| Sai | Đúng |
| --- | --- |
| `className="text-white bg-[#111]"` | `className="text-primary-foreground bg-primary"` |
| `<div>` làm nút | `<Button variant="...">` |
| Spinner full-screen | `<Skeleton />` từng vùng |
| Placeholder thay label | `<Label>` + `<Input placeholder="…">` |
| Hash `#features` làm nav | Route `/features` riêng với SEO head |
| Hardcode "Save" | `t('common.save')` |
| Card chật, padding `p-2` | `rounded-xl border border-border bg-card p-6` |

---

Áp dụng skill này như checklist mặc định cho **mọi yêu cầu UI** trong workspace UNICOM, trừ khi người dùng yêu cầu rõ muốn lệch chuẩn.
