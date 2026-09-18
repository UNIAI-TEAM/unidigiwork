# GAP ANALYSIS — Sơ đồ mục tiêu Work Graph → AI Context Engine

Ngày: 2026-09-18 · Phạm vi: DECISION node, Temporal Freshness, Context Ranker, Contract consumer thống nhất
Trạng thái nền: GO-3 (Option B) và GO-4 (Execution provenance) đã CLOSED trên DB thật.
Tài liệu này **chỉ phân tích**, không thay đổi kiến trúc, không mở GO-5.

---

## 0. Tóm tắt mức độ khớp

| Tầng mục tiêu | Hiện trạng | Mức khớp |
|---|---|---|
| Authoritative systems → commit | Task, Meeting, Email, Chat, Document, Work Product, Execution, Person đều có bảng authority riêng | 90% — thiếu Decision |
| OUTBOX | `outbox_events` + `_emit_outbox_event`, channel `graph` | 100% |
| Idempotent projector | `project_*` RPC + unique `(tenant, type, id)`; đã chứng minh retry = 0 duplicate | 100% |
| Work Graph (nodes + relationships) | `work_nodes` / `work_edges`, 17 relationship code | 90% — thiếu node DECISION |
| Provenance / Traversal | `PRODUCES`, `REALIZED_AS`, `HAS_EXECUTION`, `PERFORMS`, `getWorkGraphNeighborhood` depth 1 | 85% |
| `resolveWorkEntities` | Có, permission-aware | 100% |
| Graph Context + Semantic Context | Có trong `buildAiContextPack` (graph expansion + lexical search) | 80% — hai nhánh trộn trong một hàm, không tách contract |
| CONTEXT RANKER | Có công thức ranking inline, **chưa là module độc lập** | 55% |
| Temporal Freshness | Chỉ là `recencyBoost` + badge UI, **không nằm trong Context Pack** | 40% |
| AI Context Engine | `ai-context.server.ts` là điểm vào duy nhất | 90% |
| 3 consumer (My AI / Executive Intelligence / AI Workers) | 6 call site gọi trực tiếp, **không có consumer contract chung** | 50% |

---

## 1. GAP A — DECISION node

### Hiện trạng
- Không có bảng `decisions` nào trong DB (`information_schema` trả về 0 dòng).
- Quyết định tồn tại ở 3 nơi rời rạc, không có identity ổn định:
  1. `meeting_intelligence`: `MeetingDecision { title, detail, confidence: EXPLICIT|LIKELY|UNCLEAR, sourceIds }` — lưu trong artifact/JSON của cuộc họp.
  2. `work-products-docx.functions.ts`: follow-up kind `DECISION` — comment trong mã ghi rõ *"chưa có bảng quyết định độc lập → ghi nhận vào nhật ký tài liệu"*.
  3. `ai-governance`: `GOVERNANCE_DECISIONS` — quyết định phê duyệt AI, khác bản chất (policy), không phải business decision.
- `WORK_ENTITY_TYPES` **không** chứa `DECISION`; nhãn `DECISION: "Quyết định"` đã tồn tại ở 3 file label nhưng không có node tương ứng → nhãn chết.

### Hệ quả
- Không truy vết được "quyết định nào dẫn tới task này" — mắt xích `MEETING → DECISION → TASK/WORK_PRODUCT` bị đứt.
- Quyết định không vào Context Pack như một thực thể hạng nhất; AI chỉ thấy nó lẫn trong text của meeting artifact.
- Không có trạng thái vòng đời (đề xuất → chốt → đảo ngược) → không phân biệt được quyết định còn hiệu lực với quyết định đã bị thay thế.

### Cần để đóng gap
1. Authority table `decisions` (tenant-scoped, RLS, GRANT) + `decision_id` ổn định; nguồn phát sinh: meeting artifact, document follow-up, CEO Command Center.
2. Node type `DECISION` trong `WORK_ENTITY_TYPES` + quan hệ mới: `MEETING —DECIDES→ DECISION`, `DECISION —DRIVES→ TASK|WORK_PRODUCT`, `DECISION —SUPERSEDES→ DECISION`.
3. Projector `project_decision_upserted` + outbox event `decision.decision.created`, theo đúng khuôn GO-3 (source-backed, không suy diễn).
4. `perTypeLimits.DECISION` và `RELATIONSHIP_WEIGHTS` cho quan hệ mới.
5. Backfill bounded từ meeting decisions đã có, **chỉ khi có sourceIds thật** — không sinh DECISION từ suy đoán văn bản.

---

## 2. GAP B — Temporal Freshness

### Hiện trạng
- `src/domain/ai-context/freshness.ts`: 4 bậc `fresh ≤7d / recent ≤30d / aging ≤90d / stale >90d` + `unknown`.
- Chỉ được dùng ở tầng hiển thị: `source-freshness-badge.tsx`, `uni-copilot.tsx`.
- Trong retrieval, "thời gian" chỉ xuất hiện dưới dạng `recencyBoost(updatedAt) * 0.6` trong công thức rank và một bộ lọc `timeRange` cứng.
- `ContextSource` có `updatedAt` nhưng **không có** `freshness` — model không nhận được tín hiệu độ cũ.

### Hệ quả
- LLM trả lời bằng nguồn 6 tháng tuổi với cùng độ tự tin như nguồn hôm qua; cảnh báo chỉ hiện cho người dùng sau khi câu trả lời đã sinh ra.
- Không có khái niệm "hiệu lực theo loại": một quyết định 90 ngày vẫn có thể còn hiệu lực, một trạng thái task 7 ngày có thể đã sai — hiện dùng chung một thang.
- Không phân biệt `updatedAt` của bản ghi với thời điểm sự kiện nghiệp vụ (ví dụ `document_versions.created_at`, `meeting.starts_at`).

### Cần để đóng gap
1. Đưa `freshness: SourceFreshnessInfo` vào `ContextSource` và vào phần render cho model (`renderContextForModel`), để model tự hạ độ chắc chắn.
2. Thang half-life theo loại thực thể (ví dụ TASK 7 ngày, MEETING 30, DOCUMENT 90, DECISION 180, WORK_PRODUCT theo version mới nhất) thay cho một thang duy nhất.
3. Chọn mốc thời gian đúng ngữ nghĩa cho từng loại thay vì luôn dùng `updated_at`.
4. Ghi `freshnessDistribution` vào `retrieval` của Context Pack để đo chất lượng theo thời gian.

---

## 3. GAP C — Context Ranker

### Hiện trạng
Công thức nằm inline trong `ai-context.server.ts` (PHASE H):

```
rank = lexical*0.35 + relWeight*0.25 + priority*0.25 + proximity + recencyBoost*0.6
```
- `relWeight` từ `RELATIONSHIP_WEIGHTS` (17 mã, deterministic).
- `priority` = `ENTITY_PRIORITY_BASE` + cộng thêm theo intent (`wantsBlockers`, `wantsCommunication`, `wantsLatestMeeting`, `wantsMeetingOutcome`).
- `proximity` = 0.35 nếu depth 1, 0.1 nếu xa hơn.
- Sau đó: dedupe theo `type:id`, giới hạn per-type, cắt theo `maxSources` (20) và `maxTokens` (8k/12k).

### Khoảng cách so với mục tiêu
| Vấn đề | Chi tiết |
|---|---|
| Không phải module độc lập | Không thể unit-test riêng, không thể thay thuật toán mà không sửa retrieval |
| Trọng số không chuẩn hoá | Tổng hệ số > 1, `proximity` và `recencyBoost` không nhân với trọng số cấu hình → khó lý giải |
| Không có explainability | Chỉ lưu `sourceRank` là một số; không lưu breakdown từng thành phần → không debug được "vì sao nguồn này lọt vào" |
| Không phân tách Graph Context và Semantic Context | Hai nhánh đổ chung vào một mảng `candidates`, không cân bằng tỷ lệ; truy vấn mạnh về lexical có thể đẩy hết nguồn graph ra ngoài |
| Chưa có freshness/authority/permission-confidence là biến hạng nhất | Freshness chỉ là boost nhỏ; độ "chính thống" của nguồn (version mới nhất vs cũ) không tính |
| Không có ngưỡng chất lượng | Không có `minRank` → nguồn rác vẫn được đưa vào nếu còn quota |

### Cần để đóng gap
1. Tách `src/domain/ai-context/ranker.ts` thuần (không I/O): `rankCandidates(candidates, signals, policy) → RankedCandidate[]` kèm `breakdown`.
2. Chuẩn hoá về tổng trọng số 1.0 và khai báo trọng số trong `AI_CONTEXT_POLICY` (versioned: `rankerVersion`).
3. Bổ sung tín hiệu: `freshness`, `authorityLevel` (latest version / superseded), `provenanceDepth` (GO-4 execution chain).
4. Quota tối thiểu cho từng nhánh (ví dụ ≥30% nguồn từ graph expansion) để giữ tính nhân quả.
5. Ghi `rankBreakdown` vào Context Pack cho trang `/admin/ai-context` để soi.

---

## 4. GAP D — Contract consumer thống nhất

### Hiện trạng — 6 điểm gọi, 4 cách dùng khác nhau
| Call site | Cách dùng | Khác biệt |
|---|---|---|
| `ai-copilot.functions.ts` (My AI) | `buildAiContextPack` + `renderContextForModel` + `validateAnswerCitations` | Đầy đủ nhất — coi như chuẩn de facto |
| `ai-actions.functions.ts` | dynamic import, tự render | Không validate citation đồng nhất |
| `ai-tasks.server.ts` | `buildAiContextPack` + `usableSources` | Có validate, khác policy nguồn |
| `work-execution.server.ts` (AI Workers) | `buildAiContextPack` + render | Không trả `sources` về UI theo cùng shape |
| `work-quality.server.ts` | dùng `ContextSource` để chấm chất lượng | Consumer đọc, không truy vấn |
| CEO / Executive Intelligence | Chủ yếu truy vấn KPI trực tiếp, **chưa qua Context Engine** | Lệch hoàn toàn khỏi sơ đồ |

### Hệ quả
- Không đảm bảo mọi câu trả lời AI đều có citation hợp lệ và freshness — phụ thuộc từng call site nhớ gọi đúng chuỗi.
- Không đo được chất lượng context theo consumer (không có `consumerId` trong Context Pack).
- Executive Intelligence không dùng graph → báo cáo CEO không thừa hưởng provenance GO-4.
- Không có nơi áp policy theo consumer (budget token, loại nguồn được phép, mức freshness tối thiểu).

### Cần để đóng gap
1. Một hàm vào duy nhất: `answerWithContext({ consumer, request, prompt })` bọc trọn build → render → gọi model → validate citation → trả `AiGroundedResponse`.
2. `AiContextConsumer = "MY_AI" | "EXECUTIVE_INTELLIGENCE" | "AI_WORKER" | "AI_ACTION" | "WORK_QUALITY"` kèm `CONSUMER_POLICY` (maxSources, maxTokens, entity types cho phép, có bắt buộc citation không).
3. `consumer` và `rankerVersion` ghi vào `AiContextPack.retrieval` để phân tích theo consumer.
4. Architecture gate (test) chặn call site mới gọi thẳng `buildAiContextPack` ngoài lớp bọc.
5. Đưa Executive Intelligence qua Context Engine với consumer policy riêng (ưu tiên DECISION + WORK_PRODUCT + EXECUTION).

---

## 5. Phụ thuộc và thứ tự đề xuất

```text
D (consumer contract)  ──► không phụ thuộc gì, làm được ngay, rủi ro thấp nhất
C (ranker module)      ──► nên làm sau D để có chỗ đo chất lượng theo consumer
B (freshness)          ──► cần C (tín hiệu hạng nhất trong ranker)
A (DECISION node)      ──► nặng nhất: migration + projector + backfill; cần B/C để phát huy
```

Khuyến nghị: D → C → B → A. A là thay đổi schema nên phải theo đúng quy trình GO (migration + integration test + bounded backfill + runtime acceptance), không gộp chung với D/C.

---

## 6. Rủi ro khi đóng gap

| Rủi ro | Giảm thiểu |
|---|---|
| Thêm node DECISION làm phình graph và sinh edge suy diễn | Chỉ project khi có source linkage thật (nguyên tắc Option B đã khoá) |
| Đổi ranker làm thay đổi câu trả lời hiện tại | `rankerVersion` + so sánh song song trên tập truy vấn mẫu trước khi bật |
| Lớp bọc consumer gây regression 6 call site | Giữ `buildAiContextPack` nguyên vẹn, bọc thêm; gate chỉ chặn call site mới |
| Freshness vào prompt làm tăng token | Nhúng dạng nhãn ngắn, không thêm câu mô tả dài |

---

## 7. Không nằm trong phạm vi
Outcome table, billing, marketplace, execution engine mới, event bus mới, graph database mới. GO-5 chưa mở.
