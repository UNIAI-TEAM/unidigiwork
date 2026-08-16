# UNIWORK — AI Surface Inventory (Phase A)

Ngày kiểm kê: 2026-08-16

## 1. Provider / gateway
| Thành phần | Đường dẫn | Ghi chú |
|---|---|---|
| Lovable AI Gateway provider (Responses API) | `src/lib/ai-gateway.server.ts` | `createLovableResponsesProvider`, propagate `X-Lovable-AIG-Run-ID`. Server-only. |
| API key | `LOVABLE_API_KEY` (process.env) | Chỉ đọc trong handler server. Không có biến `VITE_*` AI nào. |
| Model đang dùng | `openai/gpt-5.6-sol` | AI Workspace, Home AI Brief, Ask UNI. |

## 2. AI server functions hiện có
| Surface | File | Bản chất |
|---|---|---|
| AI Workspace (hội thoại, usage, export) | `src/lib/api/ai-chat.functions.ts` | Chat tổng quát, lưu `ai_conversations` / `ai_messages`, có usage tokens. Không grounded. |
| Home AI Brief | `src/lib/api/home-brief.server.ts` | Tóm tắt từ `loadHomeSummary` (dữ liệu thật của chính user), trả `unavailable` khi không có AI/dữ liệu. |
| **AI Context Engine V1 (mới)** | `src/lib/api/ai-context.server.ts` + `ai-context.functions.ts` | Retrieval permission-aware + grounded answer + citation. |

## 3. Retrieval nền tảng được tái sử dụng
| Thành phần | File / RPC | Vai trò |
|---|---|---|
| Universal Search V2 | `public.search_universal` (SECURITY INVOKER), `src/lib/api/search-universal.{server,functions}.ts` | Candidate retrieval lexical/fuzzy, hard tenant boundary. |
| Work Graph V1 | `public.get_work_context`, `src/lib/api/work-graph.{server,functions}.ts` | Depth-1 relationship expansion + `resolveWorkEntities` (batched, RLS-aware). |
| Deep-link registry | `src/domain/work-graph/route-resolver.ts` | Nguồn duy nhất cho href của entity. |
| Authorization | RLS + `requireSupabaseAuth` middleware | Không có model phân quyền thứ hai. |

## 4. UI AI hiện có
- `/ai` — AI Workspace (chat tổng quát, lịch sử, usage).
- Home V2 — AI Brief panel (lazy, chỉ khi user mở Home và section bật).
- **Mới:** `AskUniPanel` (`src/components/ai/ask-uni-panel.tsx`) trên `/workspace/$id` và `/tasks/$id`.

## 5. Kết luận
Không tạo provider layer song song. AI Context Engine V1 dùng lại đúng gateway, đúng search, đúng graph và đúng lớp phân quyền hiện hữu.