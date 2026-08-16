# ADR — AI chỉ nhận ngữ cảnh đã được ủy quyền và bị giới hạn

- Trạng thái: Accepted (2026-08-16)
- Phạm vi: mọi AI capability của UNIWORK

## Bối cảnh
AI cần dữ liệu công việc thật để hữu ích, nhưng dữ liệu workspace là đa tenant, có RLS, có kênh riêng tư và hộp thư cá nhân.

## Quyết định
1. LLM **không bao giờ** có quyền truy cập database, không sinh SQL, không gọi tool đọc dữ liệu tùy ý.
2. Mọi retrieval đi qua AI Context Engine, dùng client Supabase của chính actor (RLS là nguồn ủy quyền duy nhất). Không dùng service role cho ngữ cảnh AI.
3. Ngữ cảnh bị chặn cứng: depth graph ≤ 1, ≤ 20 source, ≤ 12k token, excerpt cap theo từng loại.
4. Không xây model phân quyền thứ hai; tái sử dụng Universal Search V2 và Work Graph V1.
5. Nội dung workspace là dữ liệu không đáng tin (prompt injection defense).
6. V1 read-only: không mutation, không agent tự trị.

## Hệ quả
- Câu trả lời luôn có nguồn kiểm chứng được; không có nguồn ⇒ không khẳng định.
- Không cache ngữ cảnh xuyên request ở V1 để tránh bypass thu hồi quyền; chuyển tenant làm mới state.
- Chi phí và độ trễ dự đoán được nhờ context bounded.