# Universal Search V2 — Permission-Aware Enterprise Search

## 1. Nguyên tắc
- PostgreSQL là search engine chính (pg_trgm + unaccent). Không thêm hạ tầng search ngoài.
- Một entry point duy nhất: `public.search_universal` (SECURITY INVOKER) → RLS của người gọi là nguồn phân quyền duy nhất.
- Tenant boundary cứng: RPC chỉ chạy khi `is_tenant_member(_tenant_id)`; tenant_id do server function resolve từ cookie active-tenant và được DB re-validate.

## 2. Surface inventory
| Entity | Nguồn | Trường tìm | Ghi chú quyền |
|---|---|---|---|
| PROJECT | `workspaces` | name | RLS workspace_members |
| TASK | `tasks` | title, mã ngắn (8 ký tự đầu id) | RLS task/workspace |
| MEETING | `meetings` | title, agenda | RLS meeting |
| DOCUMENT | `documents` | title | RLS document_permissions |
| EMAIL | `email_threads` | subject (không lộ body) | RLS email |
| CHAT_CHANNEL | `chat_channels` | name | kênh riêng tư chỉ hiện với thành viên (`chat_members`) |
| PERSON | `users` ⨝ `tenant_members` | display_name, primary_email | chỉ thành viên active của tenant |

## 3. Ranking
`EXACT 100 > PREFIX 80 > word-boundary 65 > contains 55 > FUZZY 25 + similarity*25`
cộng boost loại (PROJECT +6, TASK +3) và boost recency (7 ngày +3, 30 ngày +1).

## 4. Index plan
Chuẩn hoá bằng `public.search_norm()` (IMMUTABLE, unaccent + lower + trim) và GIN trigram trên biểu thức đó:
`workspaces.name`, `tasks.title`, `meetings.title`, `documents.title`, `chat_channels.name`,
`email_threads.subject`, `users.display_name`, `users.primary_email`, `knowledge_articles.title`.

## 5. Work Graph expansion
Depth-1 quanh kết quả mạnh nhất qua `get_work_context` → resolve batched bằng `resolveWorkEntities` (không N+1, entity không có quyền bị loại bỏ, không lộ tồn tại).

## 6. Surfaces
- `/search`: filter theo loại + dự án, infinite scroll, hiển thị match type và latency.
- ⌘K (`src/components/command-palette.tsx`): live results (debounce 180ms, top 8) + điều hướng + "tìm tất cả".
- Server contract: `src/lib/api/search-universal.functions.ts` (`universalSearch`), mapping tại `search-universal.server.ts`.
