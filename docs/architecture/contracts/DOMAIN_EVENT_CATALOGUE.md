# Domain Event Catalogue (Blueprint §11)

Naming: `domain.action.vN`. Breaking payload change → new version.

| Event | Version | Producer | Consumers | Tenant scope | Sensitive |
|---|---|---|---|---|---|
| tenant.created.v1 | 1 | platform | audit, provisioning | tenant | no |
| tenant.member_added.v1 | 1 | platform | notifications | tenant | no |
| workspace.created.v1 | 1 | workspaces | audit, notifications | tenant | no |
| task.created.v1 | 1 | tasks | notifications, search | tenant | no |
| task.assigned.v1 | 1 | tasks | notifications | tenant | no |
| task.completed.v1 | 1 | tasks | notifications, reports | tenant | no |
| meeting.created.v1 | 1 | meetings | calendar, notifications | tenant | no |
| meeting.ended.v1 | 1 | meetings | reports | tenant | no |
| document.created.v1 | 1 | documents | search, notifications | tenant | no |
| document.updated.v1 | 1 | documents | search | tenant | no |
| notification.created.v1 | 1 | notifications | realtime | tenant/identity | no |

## Payload rules

No secrets, tokens, service-role keys, LiveKit tokens, binary/video. Validate envelope with `DomainEventEnvelopeSchema`.
