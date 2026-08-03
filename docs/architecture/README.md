# UNIWORK Architecture — Source of Truth

Toàn bộ tài liệu kiến trúc của UNIWORK được lưu ở đây. Blueprint là **Single Source of Truth** cao nhất; mọi thay đổi backend/schema/permission phải trích dẫn ADR hoặc chương Blueprint tương ứng.

## Tài liệu gốc

- [UNIWORK SaaS Architecture Blueprint v1.0](./UNIWORK_SAAS_ARCHITECTURE_BLUEPRINT_V1.0.md) — SSOT
- [Project Architecture Rules](./PROJECT_ARCHITECTURE_RULES.md) — Core rules trích lược, dán vào memory
- [ADR Template](./adr/ADR_TEMPLATE.md)
- [ADR-1E-001 — LiveKit Conferencing](./adr/ADR-1E-001-livekit-conferencing.md)
- [Data Dictionary](./data-dictionary/README.md)

## Manifests (Batch 0A)

- [Table Classification Manifest](./manifests/TABLE_CLASSIFICATION_MANIFEST.md) — phân loại scope từng bảng trước khi thêm `tenant_id`
- [Domain Ownership Manifest](./manifests/DOMAIN_OWNERSHIP_MANIFEST.md) — 16 bounded context
- [Direct Database Access Manifest](./manifests/DIRECT_DATABASE_ACCESS_MANIFEST.md) — mọi caller `supabase.from(...)`

## Contracts, Testing & CI (Batch 0C)

- [API Contract Rules](./contracts/API_CONTRACT_RULES.md)
- [Stable Error Catalogue](./contracts/STABLE_ERROR_CATALOGUE.md)
- [Domain Event Catalogue](./contracts/DOMAIN_EVENT_CATALOGUE.md)
- [Architecture Test Strategy](./testing/ARCHITECTURE_TEST_STRATEGY.md)
- [Tenant Isolation Test Matrix](./testing/TENANT_ISOLATION_TEST_MATRIX.md)
- [CI Quality Gates](./ci/QUALITY_GATES.md)
- [Lint Baseline](./technical-debt/LINT_BASELINE.md)

## Migration

- [Lovable → Java Migration Rules](./migration/LOVABLE_TO_JAVA_MIGRATION_RULES.md)

## Nguyên tắc bất di bất dịch

1. Blueprint là SSOT — xung đột phải dừng và báo (Blueprint §29).
2. Không dual-write — mỗi bounded context chỉ có **một writer** (Blueprint §2.4).
3. Không direct-write lifecycle quan trọng từ component (Blueprint §9, §25.1, §25.11).
4. Mọi tenant-scoped table phải có `tenant_id` + RLS (Blueprint §5.3, §25.2, §25.3).
5. Java/Keycloak/MinIO/Redis là nhánh portability — chưa cutover, chưa writer song song (Blueprint §21, §25.27).
6. Không thêm microservice trong Giai đoạn 0 (Blueprint §2.3, §25.16).

## Trạng thái

- Giai đoạn hiện tại: **0 — Architecture Baseline** (Batch 0A hoàn tất).
- Runtime production: Lovable Cloud / Supabase (Blueprint §2.1, §28).
