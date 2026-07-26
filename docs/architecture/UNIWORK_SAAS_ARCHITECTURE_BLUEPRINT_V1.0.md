# UNIWORK SAAS ARCHITECTURE BLUEPRINT
## Lovable Cloud First · On-Premise Ready · Java/Microservice Ready

**Phiên bản:** 1.0  
**Mục đích:** Tài liệu kiến trúc nền bắt buộc cho toàn bộ quá trình phát triển UniWork trên Lovable.  
**Runtime chính ban đầu:** Lovable Cloud / Supabase.  
**Runtime mục tiêu:** Dedicated Cloud hoặc On-Premise với Java 21, Spring Boot, PostgreSQL, Keycloak, Redis, MinIO và LiveKit.  
**Chiến lược chuyển đổi:** Strangler pattern, chuyển từng bounded context, không dual-write.

---

# 1. MỤC TIÊU KIẾN TRÚC

UniWork phải được xây dựng như một nền tảng Digital Workplace SaaS đa khách hàng, có khả năng:

- Phục vụ nhiều khách hàng nhỏ trên cùng một nền tảng SaaS.
- Triển khai riêng cho khách hàng lớn khi cần.
- Chạy trước trên Lovable Cloud để tối ưu tốc độ phát triển và đưa sản phẩm ra thị trường.
- Không bị khóa cứng vào Lovable Cloud hoặc Supabase.
- Có thể triển khai Dedicated Cloud hoặc On-Premise.
- Có thể thay backend dần bằng Java 21 và Spring Boot.
- Có thể tách dần thành microservice khi có nhu cầu vận hành thực tế.
- Không phải viết lại toàn bộ frontend khi thay backend.
- Không duy trì hai nguồn ghi dữ liệu cho cùng một domain.
- Hỗ trợ họp trực tuyến thông qua LiveKit mã nguồn mở.
- Sẵn sàng tích hợp AI Cloud hoặc AI Local.

Kiến trúc phải ưu tiên:

1. Tốc độ triển khai sản phẩm.
2. An toàn dữ liệu đa tenant.
3. Khả năng bảo trì dài hạn.
4. Tính di động của dữ liệu và hạ tầng.
5. Khả năng chuyển đổi backend có kiểm soát.
6. Khả năng triển khai SaaS, Dedicated Cloud và On-Premise từ cùng một codebase.

---

# 2. NGUYÊN TẮC CHIẾN LƯỢC

## 2.1 Lovable Cloud là production runtime giai đoạn đầu

Trong giai đoạn đầu:

- Lovable Cloud / Supabase là backend chính thức.
- PostgreSQL là nguồn dữ liệu chính.
- Supabase Auth hoặc Lovable Auth là hệ thống xác thực ban đầu.
- Supabase Storage là kho file ban đầu.
- Supabase Realtime dùng cho realtime nghiệp vụ.
- Edge Functions hoặc trusted RPC dùng cho command quan trọng.
- Không xây Java như hệ thống song song ghi cùng dữ liệu.

Lovable Cloud không phải prototype tạm thời. Đây là runtime production ban đầu.

## 2.2 PostgreSQL là System of Record

Nguồn dữ liệu chuẩn của UniWork phải là:

- PostgreSQL schema.
- Migration scripts.
- Seed scripts.
- Data dictionary.
- Domain events.
- API contracts.
- Audit log.

Không được thiết kế business logic phụ thuộc vào một tính năng độc quyền không thể mang ra ngoài Lovable Cloud.

## 2.3 Modular Monolith trước, Microservice sau

Không triển khai microservice ngay từ đầu.

- Lovable backend phải được tổ chức theo bounded context.
- Java backend tương lai phải bắt đầu bằng Spring Boot Modular Monolith.
- Chỉ tách microservice khi có lý do vận hành rõ ràng.

Các lý do hợp lệ để tách service:

- Cần scale độc lập.
- Có workload CPU/GPU riêng.
- Có đội phát triển riêng.
- Có release cadence riêng.
- Có security boundary riêng.
- Có database workload riêng.
- Có SLA riêng.
- Module thường xuyên gây ảnh hưởng hệ thống chung.

## 2.4 Không dual-write

Tuyệt đối không cho:

- Frontend ghi đồng thời Lovable và Java.
- Edge Function ghi Supabase và Java cùng lúc.
- Java ghi database khác trong khi Lovable vẫn là writer chính.
- Hai backend cùng có quyền cập nhật một domain.

Mỗi bounded context chỉ có một writer chính tại một thời điểm.

## 2.5 Frontend không phụ thuộc cứng backend

Frontend chỉ được sử dụng:

- Client SDK.
- API contract.
- Domain DTO.
- Stable error codes.
- Realtime abstraction.
- Storage abstraction.
- Identity abstraction.

Không để business UI phụ thuộc trực tiếp vào:

- Supabase-specific response.
- Supabase generated types trong domain model.
- Public storage URL cố định.
- LiveKit room name tự tạo ở client.
- Table schema cụ thể trong component.

---

# 3. KIẾN TRÚC TỔNG THỂ

```text
┌────────────────────────────────────────────────────────────┐
│                    UNIWORK FRONTEND                         │
│ React + TypeScript + PWA                                   │
│ Lovable phát triển và triển khai ban đầu                   │
└─────────────────────────────┬──────────────────────────────┘
                              │
                     Application Client SDK
                              │
              ┌───────────────┴────────────────┐
              │                                │
┌─────────────▼─────────────┐      ┌───────────▼─────────────┐
│ SaaS Runtime              │      │ Enterprise Runtime      │
│ Lovable Cloud / Supabase  │      │ Java 21 / Spring Boot   │
│ PostgreSQL                │      │ PostgreSQL              │
│ Auth                      │      │ Keycloak                │
│ Storage                   │      │ MinIO                   │
│ Realtime                  │      │ WebSocket / SSE         │
│ Edge Functions / RPC      │      │ Java APIs / Workers     │
└─────────────┬─────────────┘      └───────────┬─────────────┘
              │                                │
              └───────────────┬────────────────┘
                              │
                  Shared Domain and Contracts
                              │
       ┌──────────────┬───────┴────────┬───────────────┐
       │              │                │               │
     Redis          LiveKit         AI Gateway     Observability
```

---

# 4. CÁC CHẾ ĐỘ TRIỂN KHAI

## 4.1 Tier A — Shared SaaS

Dành cho khách hàng nhỏ:

```text
Lovable Cloud
Shared PostgreSQL
Shared Auth
Shared Storage
Shared Realtime
Shared LiveKit
Shared AI Gateway
```

Đặc điểm:

- Nhiều tenant dùng chung nền tảng.
- Dữ liệu cách ly bằng tenant_id, RLS và permission.
- Chi phí vận hành thấp.
- Nâng cấp đồng loạt.
- Phù hợp mô hình subscription.

## 4.2 Tier B — Dedicated Cloud

Dành cho khách hàng vừa hoặc yêu cầu cách ly cao:

```text
Dedicated database hoặc dedicated Lovable/Supabase project
Dedicated storage namespace hoặc bucket
Shared hoặc dedicated LiveKit
Shared hoặc dedicated AI
```

## 4.3 Tier C — On-Premise

Dành cho khách hàng enterprise, cơ quan nhà nước hoặc đơn vị không cho phép dữ liệu ra ngoài:

```text
Frontend container
Java 21 / Spring Boot
Keycloak
PostgreSQL
Redis
MinIO
LiveKit
LiveKit Egress
Monitoring
Optional Local AI
```

---

# 5. MÔ HÌNH MULTI-TENANT

## 5.1 Cấu trúc tổ chức

```text
Platform
└── Tenant
    ├── Workspaces
    ├── Departments
    ├── Teams
    ├── Members
    ├── Subscription
    ├── Entitlements
    ├── Quotas
    └── Tenant Data
```

## 5.2 Phân biệt Tenant và Workspace

- Tenant là tổ chức trả phí và sở hữu dữ liệu.
- Workspace là không gian cộng tác trong tenant.
- Khách hàng nhỏ có thể chỉ có một workspace.
- Khách hàng lớn có thể có nhiều workspace.

Không được đồng nhất tenant và workspace trong thiết kế dữ liệu.

## 5.3 Trường bắt buộc trên bảng nghiệp vụ

Mọi bảng nghiệp vụ tenant-scoped phải có:

```text
id
tenant_id
created_at
updated_at
created_by
updated_by
row_version
```

Tùy module có thể có thêm:

```text
workspace_id
status
deleted_at
idempotency_key
classification
retention_until
```

## 5.4 Tenant isolation nhiều lớp

Mọi request phải được bảo vệ qua:

1. Xác thực người dùng.
2. Kiểm tra membership.
3. Xác định active tenant.
4. Kiểm tra role và permission.
5. Tenant-scoped repository query.
6. PostgreSQL RLS.
7. Composite foreign key.
8. Cache namespace.
9. Storage namespace.
10. Queue payload validation.
11. Search index tenant filter.
12. Audit log.

Không được chỉ dựa vào tenant_id frontend truyền lên.

## 5.5 Tenant context

```ts
type RequestContext = {
  actorId: string;
  tenantId: string;
  workspaceId?: string;
  roles: string[];
  permissions: string[];
  correlationId: string;
};
```

---

# 6. BOUNDED CONTEXT VÀ DOMAIN OWNERSHIP

Hệ thống phải được chia thành các bounded context sau:

1. Identity & Access
2. Tenant & Subscription
3. Organization & People
4. Workspace
5. Project & Task
6. Chat & Collaboration
7. Calendar
8. Meeting
9. Document
10. Knowledge
11. Workflow
12. Notification
13. Search
14. Reporting
15. AI
16. Audit & Compliance

Mỗi bounded context phải có:

- Data ownership rõ ràng.
- API contract riêng.
- Permission riêng.
- Stable error codes.
- Domain events.
- Migration.
- Test.
- Không truy cập trực tiếp bảng domain khác nếu không có contract.

---

# 7. KIẾN TRÚC SOURCE CODE

## 7.1 Monorepo đề xuất

```text
uniwork/
  apps/
    web/
    lovable-functions/
    java-backend/
    worker/

  packages/
    api-contracts/
    domain-types/
    validation/
    client-sdk/
    event-contracts/
    design-system/

  database/
    migrations/
    seeds/
    policies/
    tests/

  infrastructure/
    docker/
    helm/
    terraform/
    livekit/
    monitoring/

  docs/
    architecture/
    api/
    data-dictionary/
    migration/
    runbooks/
```

## 7.2 Feature architecture cho frontend

```text
src/
  features/
    identity/
    tenants/
    workspaces/
    people/
    tasks/
    chat/
    calendar/
    meetings/
    documents/
    workflows/
    notifications/
    ai/
```

Mỗi feature nên có:

```text
api/
components/
hooks/
schemas/
services/
types/
pages/
permissions/
```

Không đặt toàn bộ business logic trực tiếp trong route hoặc component.

---

# 8. APPLICATION CLIENT SDK

Frontend không được gọi trực tiếp backend theo cách phân tán.

```ts
export interface TaskApi {
  create(input: CreateTaskCommand): Promise<TaskDto>;
  assign(taskId: string, input: AssignTaskCommand): Promise<TaskDto>;
  complete(taskId: string, input: CompleteTaskCommand): Promise<TaskDto>;
}
```

## 8.1 Giai đoạn Lovable

```ts
class LovableTaskApi implements TaskApi {
  // Edge Function hoặc trusted RPC
}
```

## 8.2 Giai đoạn Java

```ts
class JavaTaskApi implements TaskApi {
  // REST API Spring Boot
}
```

Frontend chỉ gọi:

```ts
const taskApi = resolveTaskApi();
```

Không gọi trực tiếp:

```ts
supabase.from("tasks").update(...)
```

đối với lifecycle quan trọng.

---

# 9. QUY TẮC TRUY CẬP DỮ LIỆU

## 9.1 Read đơn giản

Có thể đọc trực tiếp qua Supabase khi:

- Có RLS đầy đủ.
- Không chứa business rule phức tạp.
- Không yêu cầu transaction nhiều bảng.
- Không yêu cầu audit đặc biệt.
- Không yêu cầu idempotency.

## 9.2 Command nghiệp vụ

Phải qua trusted boundary:

```text
Frontend
→ Client SDK
→ Edge Function / Trusted RPC
→ Domain transaction
```

Ví dụ command:

- createTask
- assignTask
- completeTask
- approveWorkflow
- rejectWorkflow
- createMeeting
- joinMeeting
- startRecording
- inviteMember
- changeSubscription
- createDocumentVersion
- executeAIAction

## 9.3 Không dùng generic update cho lifecycle

Không dùng:

```text
PATCH /tasks/{id}
status = completed
```

Nên dùng:

```text
POST /api/v1/tasks/{id}/complete
```

Backend phải kiểm tra:

1. Quyền.
2. Trạng thái hiện tại.
3. row_version.
4. idempotency_key.
5. Business rule.
6. Audit event.
7. Outbox event.
8. Transaction commit.

---

# 10. API CONTRACT

## 10.1 REST API

```text
/api/v1/tenants
/api/v1/workspaces
/api/v1/tasks
/api/v1/meetings
/api/v1/workflows
/api/v1/documents
/api/v1/notifications
```

## 10.2 Command endpoint

```text
POST /api/v1/tasks
POST /api/v1/tasks/{id}/assign
POST /api/v1/tasks/{id}/complete
POST /api/v1/workflows/{id}/approve
POST /api/v1/meetings/{id}/join-token
POST /api/v1/meetings/{id}/start-recording
```

## 10.3 Error contract

```json
{
  "code": "TASK_VERSION_CONFLICT",
  "message": "Dữ liệu công việc đã thay đổi.",
  "correlationId": "cor_123",
  "details": {}
}
```

Stable error code phải giống nhau giữa Lovable và Java.

## 10.4 OpenAPI

Mọi external API hoặc API dùng chung phải có:

- OpenAPI specification.
- Request schema.
- Response schema.
- Stable error codes.
- Versioning.
- Authentication rule.
- Permission rule.

---

# 11. CONCURRENCY VÀ IDEMPOTENCY

Mọi aggregate có thay đổi trạng thái phải có:

```text
row_version
```

Mọi command có khả năng retry hoặc bị gửi lặp phải có:

```text
idempotency_key
```

Ví dụ:

- Complete task.
- Approve workflow.
- Start recording.
- Send invitation.
- Create invoice.
- Generate transcript.
- Create AI action item.

Nếu cùng idempotency_key được gửi lại:

- Không tạo bản ghi trùng.
- Trả lại kết quả trước đó.
- Không phát lại domain event.
- Không gửi notification trùng.

---

# 12. AUDIT VÀ DOMAIN EVENT

## 12.1 Audit

Mọi hành động quan trọng phải ghi:

```text
tenant_id
actor_id
action
resource_type
resource_id
before_state
after_state
correlation_id
occurred_at
source
ip_address
user_agent
```

## 12.2 Outbox pattern

Trong cùng transaction:

```text
Update aggregate
Insert audit event
Insert outbox event
Commit
```

Worker đọc outbox sau commit.

## 12.3 Event contract

```json
{
  "eventId": "evt_123",
  "eventType": "task.completed.v1",
  "tenantId": "tnt_123",
  "aggregateId": "tsk_123",
  "occurredAt": "2026-07-26T08:00:00+07:00",
  "payload": {}
}
```

Ban đầu dùng PostgreSQL outbox + worker. Sau này mới cân nhắc Kafka, Redpanda, NATS JetStream hoặc RabbitMQ.

---

# 13. AUTHENTICATION VÀ IDENTITY PORTABILITY

## 13.1 SaaS ban đầu

Dùng Lovable Cloud hoặc Supabase Auth.

## 13.2 On-Premise

Dùng Keycloak.

## 13.3 Internal user identity

Không dùng trực tiếp auth provider user ID làm khóa nghiệp vụ ở mọi bảng.

Nên có:

```text
users
external_identities
tenant_members
```

```text
users.id = internal stable ID
external_identities.provider = supabase | keycloak
external_identities.provider_subject = external user ID
```

```ts
type AuthenticatedIdentity = {
  subject: string;
  email?: string;
  displayName?: string;
  provider: "lovable" | "supabase" | "keycloak";
};
```

---

# 14. AUTHORIZATION

Phân quyền phải có ít nhất ba lớp:

1. Platform role.
2. Tenant/workspace role.
3. Resource-level permission.

Ví dụ role:

```text
platform_admin
tenant_owner
tenant_admin
workspace_admin
manager
member
guest
```

Ví dụ permission:

```text
task.view
task.create
task.assign
task.update
task.complete
task.delete
meeting.create
meeting.host
meeting.record
document.read
document.edit
workflow.approve
```

Không được chỉ dùng hai role owner/member.

---

# 15. STORAGE PORTABILITY

## 15.1 SaaS

Lovable/Supabase Storage.

## 15.2 On-Premise

MinIO.

## 15.3 Storage abstraction

```ts
interface ObjectStorage {
  createUploadUrl(input: UploadRequest): Promise<UploadUrl>;
  createDownloadUrl(input: DownloadRequest): Promise<DownloadUrl>;
  deleteObject(input: DeleteRequest): Promise<void>;
}
```

Database chỉ lưu:

```text
storage_provider
bucket
object_key
checksum
size_bytes
mime_type
tenant_id
created_by
classification
retention_until
```

Không lưu public URL cố định.

## 15.4 Namespace

```text
tenants/{tenantId}/documents/
tenants/{tenantId}/chat/
tenants/{tenantId}/tasks/
tenants/{tenantId}/meetings/
tenants/{tenantId}/recordings/
```

---

# 16. REALTIME PORTABILITY

## 16.1 SaaS

Supabase Realtime.

## 16.2 On-Premise

- Spring WebSocket hoặc SSE.
- Redis Pub/Sub.
- Kafka khi cần.
- LiveKit Data Channel chỉ dùng trong phòng họp.

## 16.3 Abstraction

```ts
interface RealtimeClient {
  subscribe(channel: string, handler: EventHandler): Unsubscribe;
}
```

Component không được phụ thuộc trực tiếp cú pháp channel riêng của Supabase.

---

# 17. LIVEKIT MEETING ARCHITECTURE

## 17.1 Vai trò của UniWork

UniWork quản lý:

- Meeting metadata.
- Lịch họp.
- Người được mời.
- Quyền host/co-host.
- Recording policy.
- Transcript.
- Summary.
- Action items.
- Audit.

## 17.2 Vai trò của LiveKit

LiveKit quản lý:

- WebRTC room.
- Audio/video.
- Screen sharing.
- Participant connection.
- Media transport.
- Egress recording.

LiveKit không phải system of record cho meeting.

## 17.3 Kiến trúc

```text
UniWork Web/PWA
      │
      ├── HTTPS → UniWork Meeting API
      │              ├── Authenticate
      │              ├── Authorize
      │              ├── Resolve role
      │              └── Generate token
      │
      └── WebRTC → LiveKit
                      ├── Redis
                      ├── TURN/TLS
                      ├── Egress
                      └── MinIO/S3
```

## 17.4 Room naming

```text
tnt:{tenantId}:mtg:{meetingId}
```

## 17.5 Participant identity

```text
usr:{userId}
```

Không dùng email làm identity.

## 17.6 Token service

```text
POST /api/v1/meetings/{meetingId}/join-token
```

Backend phải kiểm tra:

- User thuộc tenant.
- Meeting thuộc tenant.
- User được mời hoặc có quyền.
- Meeting còn hiệu lực.
- Role.
- Quota.
- Subscription entitlement.

## 17.7 Recording

```text
LiveKit Egress
→ MinIO/S3
→ Transcript Worker
→ Summary
→ Decisions
→ Action Items
```

Không lưu recording trong PostgreSQL.

## 17.8 AI meeting assistant

Giai đoạn đầu:

```text
Recording
→ STT
→ Transcript
→ Summary
→ Action item suggestion
```

Realtime AI chỉ triển khai sau khi media core ổn định.

---

# 18. SUBSCRIPTION, ENTITLEMENT VÀ QUOTA

SaaS phải có module nền tảng:

```text
plans
plan_features
tenants
subscriptions
subscription_items
entitlements
usage_events
usage_counters
invoices
payments
```

Không kiểm tra trực tiếp:

```ts
if (plan === "business")
```

Phải dùng:

```ts
entitlements.can("meeting.recording")
```

Các quota cần hỗ trợ:

- Số thành viên.
- Dung lượng lưu trữ.
- Số workspace.
- Meeting participant-minutes.
- Recording minutes.
- AI tokens.
- AI transcription minutes.
- Workflow runs.
- API requests.

---

# 19. AI ARCHITECTURE

AI phải là một bounded context độc lập.

```text
AI Gateway
├── Provider Registry
├── Model Router
├── Prompt Registry
├── RAG
├── Tool Authorization
├── Usage Metering
└── Audit
```

Mọi AI request phải:

1. Resolve tenant.
2. Check entitlement.
3. Check user permission.
4. Retrieve only authorized data.
5. Execute model.
6. Log usage and cost.
7. Audit result.
8. Require confirmation for write action where necessary.

Không dùng service role mặc định cho AI tool.

Mọi vector chunk phải có:

```text
tenant_id
document_id
permission_scope
classification
embedding_model
embedding_version
```

---

# 20. JAVA BACKEND MỤC TIÊU

## 20.1 Công nghệ

```text
Java 21
Spring Boot
Spring Security
Spring Data JPA hoặc jOOQ
PostgreSQL
Flyway
Redis
Keycloak
MinIO
OpenAPI
Micrometer
OpenTelemetry
```

## 20.2 Java Modular Monolith

```text
uniwork-backend/
  modules/
    identity/
    tenant/
    organization/
    workspace/
    task/
    meeting/
    document/
    workflow/
    notification/
    audit/
```

## 20.3 Cấu trúc module Java

```text
task/
  domain/
  application/
  infrastructure/
  api/
```

```text
task/domain
- Task
- TaskStatus
- TaskRepository
- TaskCompleted

task/application
- CreateTaskUseCase
- AssignTaskUseCase
- CompleteTaskUseCase

task/infrastructure
- JpaTaskRepository
- TaskOutboxPublisher

task/api
- TaskController
- TaskDto
- TaskMapper
```

---

# 21. LỘ TRÌNH CHUYỂN ĐỔI SANG JAVA

## 21.1 Strangler pattern

```text
Frontend SDK
      │
      ▼
Backend Adapter
├── Task → Java
├── Meeting → Lovable
├── Document → Lovable
└── Workflow → Lovable
```

Mỗi domain chỉ có một writer.

## 21.2 Quy trình chuyển một module

### Bước 1 — Chuẩn hóa Lovable domain

- Chốt schema.
- Chốt API contract.
- Chốt permission.
- Chốt stable errors.
- Chốt events.
- Chốt runtime tests.

### Bước 2 — Java shadow-read

- Java đọc dữ liệu.
- Lovable vẫn ghi chính.
- So sánh kết quả.
- Không cho Java ghi.

### Bước 3 — Cutover command

- Command chuyển sang Java.
- Java trở thành writer duy nhất.
- Read có thể vẫn từ Lovable hoặc Java.

### Bước 4 — Cutover read

- Read và write đều qua Java.

### Bước 5 — Khóa đường ghi cũ

- Revoke RPC cũ.
- Chặn direct table write.
- Tắt Edge Function cũ.
- Scanner kiểm tra caller.
- Audit cutover.

### Bước 6 — Xóa compatibility layer

Sau thời gian ổn định.

## 21.3 Dùng chung PostgreSQL khi chuyển đổi

Giai đoạn đầu có thể dùng chung PostgreSQL nếu:

- Mỗi domain có owner rõ.
- Java không sửa bảng domain chưa cutover.
- Lovable không sửa bảng domain đã cutover.
- Không có hai writer.
- Migration có governance.

---

# 22. ỨNG VIÊN TÁCH MICROSERVICE ĐẦU TIÊN

Thứ tự đề xuất:

1. Notification Service.
2. Document Processing Service.
3. AI Runtime.
4. Meeting Processing.
5. Search Service.
6. Billing & Metering.

Không nên tách Task, Workspace hoặc People đầu tiên nếu chưa có nhu cầu vận hành thật.

---

# 23. ON-PREMISE REFERENCE STACK

```text
Reverse Proxy / WAF
        │
        ├── Frontend
        ├── API Gateway
        └── LiveKit endpoint

Application
        ├── Java backend
        ├── Worker
        └── Scheduler

Platform
        ├── PostgreSQL
        ├── Redis
        ├── Keycloak
        ├── MinIO
        ├── LiveKit
        └── LiveKit Egress

Observability
        ├── Prometheus
        ├── Grafana
        ├── Loki
        └── OpenTelemetry
```

Triển khai nhỏ:

```text
Docker Compose
```

Triển khai enterprise:

```text
Kubernetes
Helm
GitOps
External Secrets
```

---

# 24. CI/CD VÀ QUALITY GATES

Mọi thay đổi phải chạy:

```text
install
lint
typecheck
unit test
integration test
RLS test
tenant isolation test
build
migration validation
security scan
```

Mỗi module phải có:

- Happy path.
- Permission denied.
- Tenant isolation.
- Invalid lifecycle.
- Version conflict.
- Idempotent replay.
- Audit verification.
- Outbox verification.
- Error contract verification.

Không được coi một module PASS chỉ vì UI hiển thị đúng.

---

# 25. CÁC QUY TẮC LOVABLE PHẢI TUÂN THỦ

1. Không gọi trực tiếp bảng cho lifecycle quan trọng.
2. Mọi bảng nghiệp vụ phải có tenant_id.
3. Mọi bảng tenant-scoped phải có RLS.
4. Có tenant isolation test.
5. Có row_version.
6. Command quan trọng có idempotency_key.
7. Có audit event.
8. Có outbox event nếu ảnh hưởng module khác.
9. Không đưa Supabase-specific type vào domain model.
10. Không lưu public storage URL cố định.
11. Không để component trực tiếp gọi Supabase cho command quan trọng.
12. Mọi API có stable error code.
13. Mọi domain có bounded context rõ ràng.
14. Không truy cập trực tiếp bảng domain khác.
15. Không dual-write.
16. Không tạo microservice khi chưa có nhu cầu rõ.
17. Không để frontend tự xác định tenant hoặc quyền.
18. Không để frontend tự sinh LiveKit token.
19. Không lưu video hoặc file binary trong PostgreSQL.
20. Không xây AI tool bằng service-role unrestricted access.
21. Không coi mock UI là module đã hoàn thiện.
22. Không hard-code plan name trong business logic.
23. Không dùng generic PATCH cho lifecycle phức tạp.
24. Không thay đổi API contract mà không version.
25. Không sửa schema production ngoài migration.
26. Không bỏ qua rollback plan.
27. Không xây Java song song với hai writer.
28. Không thay backend toàn bộ trong một lần.
29. Không phụ thuộc cứng vào Lovable Cloud-specific behavior.
30. Không cutover domain nếu runtime verification chưa PASS.

---

# 26. THỨ TỰ TRIỂN KHAI ĐỀ XUẤT

## Giai đoạn 0 — Architecture Baseline

- Chuẩn hóa source.
- Monorepo.
- API contract.
- Domain event contract.
- Error contract.
- Tenant context.
- Storage abstraction.
- Realtime abstraction.
- CI/CD.
- RLS scanner.
- Test harness.

## Giai đoạn 1 — SaaS Foundation

- Tenant.
- Workspace.
- Member.
- Role.
- Permission.
- Subscription.
- Entitlement.
- Quota.
- Audit.
- Notification foundation.

## Giai đoạn 2 — Collaboration Core

- Task.
- Chat.
- Calendar.
- Document.
- Meeting metadata.
- LiveKit meeting.

## Giai đoạn 3 — Portability Layer

- Client SDK.
- OpenAPI.
- Storage adapter.
- Identity adapter.
- Realtime adapter.
- Event outbox.
- Export/import.

## Giai đoạn 4 — On-Premise Reference Stack

- Java Spring Boot modular monolith.
- Keycloak.
- PostgreSQL.
- Redis.
- MinIO.
- LiveKit.
- Docker Compose.
- Backup/restore.
- Monitoring.

## Giai đoạn 5 — Module Cutover đầu tiên

Ưu tiên:

- Notification.
- Meeting token/webhook.
- Document processing.
- AI gateway.

## Giai đoạn 6 — Enterprise Production

- HA.
- Kubernetes.
- Disaster recovery.
- SSO.
- Security hardening.
- Load testing.
- Upgrade rollback.

## Giai đoạn 7 — Microservice Extraction

Chỉ tách theo nhu cầu đã chứng minh.

---

# 27. DEFINITION OF DONE CHO MỖI MODULE

Một module chỉ được coi là hoàn thành khi:

- UI hoàn chỉnh.
- API contract hoàn chỉnh.
- Database migration hoàn chỉnh.
- RLS hoàn chỉnh.
- Permission hoàn chỉnh.
- Tenant isolation test PASS.
- Lifecycle test PASS.
- row_version hoạt động.
- Idempotency hoạt động.
- Audit hoạt động.
- Outbox hoạt động.
- Error code ổn định.
- Realtime hoạt động nếu có.
- Không còn mock data.
- Không còn direct write trái quy định.
- Build/typecheck/test PASS.
- Có tài liệu migration sang Java.
- Có rollback plan.

---

# 28. QUYẾT ĐỊNH KIẾN TRÚC CHỐT

## Runtime hiện tại

```text
Frontend:
React + TypeScript + PWA trên Lovable

Backend:
Lovable Cloud / Supabase
PostgreSQL
Auth
Storage
Realtime
Edge Functions
Trusted RPC

External:
Redis/BullMQ khi cần
LiveKit
AI Gateway
```

## Runtime on-premise tương lai

```text
Java 21
Spring Boot Modular Monolith
Keycloak
PostgreSQL
Redis
MinIO
LiveKit
OpenTelemetry
Docker/Kubernetes
```

## Lộ trình microservice

```text
Modular Monolith
→ Notification
→ Document Processing
→ AI Runtime
→ Meeting Processing
→ Search
→ Billing/Metering
```

## Nguyên tắc chuyển đổi

```text
Lovable Cloud production
→ chuẩn hóa contract
→ dựng Java runtime
→ chuyển từng bounded context
→ một writer duy nhất
→ hoàn thiện on-premise
→ tách microservice khi cần
```

---

# 29. INSTRUCTION FOR LOVABLE

Lovable phải xem tài liệu này là kiến trúc nguồn chuẩn.

Trước khi triển khai bất kỳ module nào, Lovable phải:

1. Xác định bounded context.
2. Xác định tenant ownership.
3. Xác định permission.
4. Xác định trusted command boundary.
5. Xác định schema và migration.
6. Xác định audit.
7. Xác định outbox event.
8. Xác định stable error codes.
9. Xác định idempotency.
10. Xác định Java-ready API contract.
11. Xác định test gates.
12. Xác định rollback.

Nếu yêu cầu mới xung đột với tài liệu này, Lovable phải dừng và báo rõ xung đột trước khi thay đổi kiến trúc.

---

# 30. KẾT LUẬN

UniWork không được xây theo hướng:

```text
Lovable hôm nay
→ viết lại toàn bộ Java ngày mai
```

UniWork phải được xây theo hướng:

```text
Lovable Cloud là production SaaS ban đầu
→ PostgreSQL và contract là lõi trung lập
→ domain boundary được chuẩn hóa
→ Java Modular Monolith tiếp quản từng domain
→ không dual-write
→ on-premise dùng cùng product contract
→ microservice chỉ tách khi có nhu cầu vận hành thật
```

Đây là kiến trúc bắt buộc để UniWork vừa phát triển nhanh trên Lovable, vừa có khả năng trở thành nền tảng enterprise, SaaS đa khách hàng và on-premise bền vững trong dài hạn.
