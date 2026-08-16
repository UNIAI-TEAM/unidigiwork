# UNIWORK — Information Architecture V2

Từ **Module-Based Navigation** → **Work OS Navigation**.

SSOT điều hướng: `src/config/navigation.ts`. Mọi bề mặt (sidebar desktop,
bottom nav mobile, trang `/m/more`, command palette) đọc từ file này hoặc
khớp nhãn nhóm với nó. Không đổi business logic, schema, auth.

## 1. Cây điều hướng

```text
HOME                 (luôn mở, không collapse)
├── My Work          /tasks
└── Inbox            /notifications        badge: chưa đọc

WORK
├── Projects         /workspace
├── Calendar         /calendar
└── People           /people

COMMUNICATION
├── Chat             /chat
├── Meeting          /meeting              badge: Trực tiếp
└── Email Hub        /email

KNOWLEDGE
├── Docs             /documents
└── Wiki             /knowledge

AUTOMATION
├── Workflows        /workflows
└── AI Agents        /ai

INSIGHTS
├── Dashboard        /dashboard
└── Reports          /reports

ADMIN                (chỉ hiển thị khi có quyền quản trị)
├── People/Console   /admin
├── Security & Audit /workspace/audit
└── Billing          /billing

FOOTER: Settings /settings · Help /help
```

## 2. Nguyên tắc

1. **Home = việc, không phải KPI.** Sau đăng nhập/onboarding người dùng vào
   `/tasks` (My Work); Dashboard chuyển xuống INSIGHTS.
2. **Gom theo hành vi, không theo module.** Chat/Meeting/Email nằm chung
   COMMUNICATION; Dashboard/Reports nằm chung INSIGHTS.
3. **ADMIN permission-aware.** `visibility: "admin"` — nhóm bị loại bỏ hoàn
   toàn (không render heading rỗng) khi không có quyền. UI chỉ là UX; backend
   RLS/RPC vẫn là nơi kiểm soát an ninh.
4. **Active state theo prefix.** `/tasks/123` vẫn sáng My Work; khi nhiều mục
   cùng khớp thì mục có prefix dài nhất thắng (`/workspace/audit` >
   `/workspace`).
5. **Nhóm collapse được, lưu localStorage** (`uniwork:nav-collapsed-groups`);
   nhóm chứa route đang mở luôn tự bung.
6. **Không thêm request cho menu.** Sidebar chỉ thêm 1 query quyền quản trị
   (cache 5 phút); badge tái dùng hook chưa đọc sẵn có.

## 3. Mobile PWA

Bottom nav 5 tab: **Home · Chat · Work (nút trung tâm nổi bật) · Meet · More**.
Email chuyển từ tab chính sang `/m/more`. Trang More render theo nhóm IA V2
với cùng nhãn i18n, cộng Settings/Help ở cuối.

| Tab | Route |
|---|---|
| Home | `/m/home` |
| Chat | `/m/chat` |
| Work | `/m/tasks` |
| Meet | `/m/meet` |
| More | `/m/more` |

## 4. i18n

Nhãn nhóm: `nav.group.home|work|communication|knowledge|automation|insights|admin`.
Nhãn mục: `nav.mywork`, `nav.inbox`, `nav.projects`, `nav.calendar`,
`nav.people`, `nav.chat`, `nav.meetings`, `nav.email`, `nav.documents`,
`nav.knowledge`, `nav.workflows`, `nav.ai`, `nav.dashboard`, `nav.reports`,
`nav.admin`, `nav.security`, `nav.billing`, `nav.settings`, `nav.help`.
Không hard-code chuỗi trong component điều hướng.

## 5. Breadcrumbs & Command Palette

- Breadcrumb gốc đổi "Dashboard" → "Trang chủ" (`/tasks`).
- Command palette (⌘K) liệt kê đúng thứ tự IA V2 và hiển thị tên nhóm ở cột
  gợi ý (`hint`), thêm Workspace, Admin, Billing.

## 6. Thêm một mục menu mới

Chỉ sửa `src/config/navigation.ts`: thêm object vào `NAV_ITEMS` với `group`,
`order`, `visibility`, `match` (nếu có route con) và `mobile` (nếu muốn xuất
hiện trên PWA). Không cần sửa `app-shell.tsx` hay `more.tsx`.
