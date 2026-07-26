# Data Dictionary

Khung tài liệu mô tả từng bảng nghiệp vụ. Được điền dần từ Batch 0B trở đi. Không tạo bảng nào chưa có entry ở đây.

## Format cho mỗi bảng

```
### <schema>.<table>

- Bounded context: <domain>
- Scope: platform | identity | tenant | membership
- Owner module: <module>
- Writers: <danh sách trusted command / server-fn duy nhất được ghi>
- RLS strategy: <mô tả policy>
- Standard columns: tenant_id?, row_version?, idempotency_key?, deleted_at?
- Foreign keys: <bảng cha, on-delete>
- Indexes: <danh sách>
- Retention: <policy>
- Classification: public | internal | confidential | restricted
- Realtime: yes/no + channel
- Migration risk: <ghi chú>
```

## Trạng thái

Chưa có bảng nào được ghi entry đầy đủ. Batch 0B sẽ điền cho toàn bộ bảng ở Table Classification Manifest.
