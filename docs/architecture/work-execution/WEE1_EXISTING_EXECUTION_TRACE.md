# WEE-1 — Vết thực thi hiện có (trước khi nâng cấp Orchestrator)

Tài liệu này ghi lại **chính xác** cách UNIWORK đang thực thi công việc bằng AI trước WEE-1,
để mọi thay đổi orchestrator đều là *bổ sung*, không phá vỡ bất biến đã kiểm thử.

## 1. Ba đường thực thi hiện có

| Đường | Entry point | Ghi dữ liệu nghiệp vụ | Bất biến |
|---|---|---|---|
| AI Task Execution | `runAiTask` (`src/lib/api/ai-tasks.functions.ts`) | Không — chỉ sinh deliverable | Luôn dừng ở `WAITING_REVIEW` hoặc `FAILED` |
| AI Action Layer | `proposeAiAction` → `confirmAiAction` (`src/lib/api/ai-actions.functions.ts`) | Có — chỉ sau xác nhận của người dùng | Allowlist 4 action, `requiresUserConfirmation = true` |
| AI Context Engine | `buildAiContextPack` (`src/lib/api/ai-context.server.ts`) | Không | Đọc bằng RLS của chính actor |

## 2. Vòng đời AI Task Execution (single-shot)

```
assignTaskToAi        → RPC assign_task_to_ai        (execution_mode = AI_ASSISTED)
runAiTask
  ├─ RPC get_ai_task_brief            (đọc spec + worker)
  ├─ RPC start_ai_task_execution      (tạo revision mới, status = RUNNING)
  ├─ runAiTaskExecution()             (1 lần gọi model, không có bước trung gian)
  │    ├─ buildAiContextPack()        (retrieval theo RLS actor)
  │    ├─ streamText(gpt-5.6-sol)     (JSON: title/markdown/assumptions/limitations)
  │    └─ validateAnswerCitations()   (loại trích dẫn không có thật)
  └─ RPC finish_ai_task_execution     (WAITING_REVIEW | FAILED)
requestAiTaskChanges  → RPC request_ai_execution_changes  (CHANGES_REQUESTED)
acceptAiTaskExecution → RPC accept_ai_task_execution      (ACCEPTED — chỉ con người)
```

**Điểm yếu cần WEE-1 giải quyết:** toàn bộ quá trình là *một hộp đen*. Người dùng chỉ thấy
spinner rồi thấy kết quả; không biết AI đã lấy ngữ cảnh nào, lập kế hoạch ra sao, bước nào
thất bại, và không có chỗ để AI đề xuất hành động ghi (đang nằm ở đường Action Layer tách rời).

## 3. Bất biến bắt buộc giữ nguyên

1. `ai-tasks.server.ts` **không** có `.insert/.update/.upsert/.delete` và **không** dùng service role.
2. Mọi mutation vòng đời đi qua RPC `SECURITY DEFINER` đã liệt kê ở §2.
3. `finish_ai_task_execution` chỉ được gọi với `WAITING_REVIEW` hoặc `FAILED`.
4. Nội dung `[SOURCE]` là dữ liệu, không phải mệnh lệnh (phòng vệ prompt injection).
5. AI ghi dữ liệu nghiệp vụ **chỉ** qua `confirmAiAction` với allowlist 4 action.

Test canh giữ: `src/lib/architecture/ai-task-execution.test.ts`,
`tests/runtime/ai-actions/{action-policy,security,idempotency,concurrency}.mjs`.

## 4. Hướng nâng cấp WEE-1

Thêm **lớp quan sát và điều phối** phía trên, không đổi bất biến:

```
runAiTask (giữ chữ ký)
  └─ orchestrateWorkExecution()
       CONTEXT   → dựng context pack, ghi bước
       PLAN      → model lập kế hoạch các bước
       GENERATE  → sinh deliverable (chính là runAiTaskExecution cũ)
       ACTION    → đề xuất action qua Action Layer (PROPOSED, chờ người xác nhận)
       VALIDATE  → tự chấm theo acceptance_criteria
       REVIEW    → finish_ai_task_execution(WAITING_REVIEW)
```

Mỗi bước ghi một dòng `work_execution_steps` để UI hiển thị timeline thật.
Bước `ACTION` **không bao giờ** tự thực thi: nó chỉ tạo đề xuất `PROPOSED`.
