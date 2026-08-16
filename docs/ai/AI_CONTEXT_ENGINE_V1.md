# AI CONTEXT ENGINE V1

Lớp retrieval trung tâm, bounded, permission-aware, source-grounded. Mọi AI feature về sau phải đi qua đây.

## 1. Kiến trúc
```text
Câu hỏi → askUni (server fn, auth)
        → buildAiContextPack
            ├── Scope resolver (root entity / active tenant / workspace)
            ├── Universal Search V2 (candidates ≤ 30)
            ├── Work Graph depth-1 (candidates ≤ 30)
            ├── Ranking (lexical · relationship weight · entity priority · proximity · recency)
            ├── Per-type limits + maxSources ≤ 20
            ├── Hydration CHỈ cho source đã chọn (batched, không N+1)
            └── Budget (≤ 12k token, mặc định 8k)
        → Context Pack (sources có provenance)
        → LLM (Lovable AI Gateway, Responses API)
        → Citation validation → Grounded answer + source deep links
```
LLM không bao giờ nhận quyền truy cập database. Không có SQL do model sinh ra.

## 2. Contract
- `AiContextRequest`, `AiContextPack`, `ContextEntity`, `ContextSource`, `ContextFact`, `AiGroundedResponse`: `src/domain/ai-context/contracts.ts`.
- `tenantId`/`userId` **không** nhận từ browser; server resolve từ session + `tenant_members` (cookie chỉ là gợi ý).

## 3. Permission
- Mọi truy vấn dùng Supabase client của actor (RLS). Không dùng service role.
- `search_universal` là SECURITY INVOKER; `get_work_context` + `resolveWorkEntities` loại bỏ hoàn toàn entity không nhìn thấy → không leak title/id/type/quan hệ.
- Root entity ẩn ⇒ `AI_CONTEXT_ROOT_NOT_FOUND` (không phân biệt "không tồn tại" và "không có quyền").
- Email chỉ đọc `email_messages` trong quyền RLS; chat chỉ kênh user thuộc về; document theo ACL hiện hữu; people chỉ `display_name`.

## 4. Retrieval strategies
`ROOT_CONTEXT`, `SEARCH`, `GRAPH_EXPANSION`, `TIME_FILTERED`, `MIXED`. Chọn deterministic; không dùng LLM planner ở V1.

## 5. Query understanding
`src/domain/ai-context/query-intent.ts`: nhận diện time range (hôm nay / hôm qua / tuần này / tuần trước / 7 ngày / 30 ngày) theo timezone người dùng, entity hints VI/EN, ý định blockers / trao đổi / đếm / họp gần nhất.

## 6. Ranking & weights
Trọng số quan hệ tập trung ở `RELATIONSHIP_WEIGHTS` (BLOCKS 1.0 → RELATED_TO 0.3). Recency chỉ là boost nhỏ. Entity priority tăng theo ý định câu hỏi.

## 7. Budget & truncation
`maxSources ≤ 20`, `maxTokens ≤ 12.000` — kẹp ở server, client không override được. Truncation theo source (bỏ source rank thấp), không cắt chuỗi ngẫu nhiên. Excerpt mỗi source cap 700 ký tự; chat cap 5 tin nhắn; email 1 message mới nhất/thread.

## 8. Prompt injection defense
Nội dung workspace được coi là **dữ liệu không đáng tin**: bọc trong khối `[SOURCE Sx] … [/SOURCE Sx]`, strip script/style/HTML, system prompt cấm tuân theo mệnh lệnh trong source.

## 9. Citations
Model trả JSON `{answer, citations:[{sourceId}]}`. Server validate mọi `sourceId` với pack; citation lạ bị loại. Source chip deep-link qua `workEntityHref`.

## 10. Observability
`requestId` mỗi lần build; `retrieval.timings` gồm root / search / graph / hydrate / total; `budget.estimatedTokens`; `usage` tokens từ provider. Không log raw prompt/nội dung source.

## 11. Read-only
Engine không thực hiện mutation. Yêu cầu "tạo task", "gửi email"… được trả lời rằng chức năng thực thi chưa bật (AI Action Layer là batch sau).

## 12. Điểm mở rộng tương lai
`SemanticRetriever` (embeddings) và `LexicalRetriever`/`GraphRetriever` cắm vào cùng engine mà không đổi UI hoặc contract.