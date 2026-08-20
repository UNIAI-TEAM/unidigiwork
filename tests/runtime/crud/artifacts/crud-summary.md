# CRUD runtime summary

Run: ba78787e · 2026-08-20T03:16:10.049Z

| Cell | Entity | Operation | Status |
|---|---|---|---|
| WS-C-01 | workspace | CREATE | PASS_REAL |
| WS-T-01 | workspace | TRANSACTION_ATOMICITY | PASS_REAL |
| WS-U-01 | workspace | UPDATE | PASS_REAL |
| WS-U-02 | workspace | UPDATE_CROSS_TENANT | PASS_REAL |
| WS-R-01 | workspace | READ_FOREIGN | PASS_REAL |
| TAG-C-01 | workspace_tag | CREATE | PASS_REAL |
| TAG-U-01 | workspace_tag | UPDATE | PASS_REAL |
| TAG-U-02 | workspace_tag | UPDATE_CROSS_TENANT | PASS_REAL |
| TAG-D-01 | workspace_tag | DELETE | PASS_REAL |
| MEM-U-01 | tenant_member | CHANGE_ROLE | PASS_REAL |
| MEM-U-02 | tenant_member | CHANGE_ROLE_PERMISSION | PASS_REAL |
| TASK-C-01 | task | CREATE | PASS_REAL |
| TASK-C-02 | task | CREATE_INVALID | PASS_REAL |
| TASK-C-03 | task | CREATE_CROSS_TENANT | PASS_REAL |
| TASK-C-04 | task | CREATE_PERMISSION | PASS_REAL |
| TASK-C-05 | task | CREATE_IDEMPOTENCY | PASS_REAL |
| TASK-R-01 | task | READ_LIST | PASS_REAL |
| TASK-R-02 | task | READ_LIST_FOREIGN | PASS_REAL |
| TASK-R-03 | task | READ_DETAIL | PASS_REAL |
| TASK-U-01 | task | UPDATE | PASS_REAL |
| TASK-U-02 | task | UPDATE_STALE_VERSION | PASS_REAL |
| TASK-U-03 | task | UPDATE_PERMISSION | PASS_REAL |
| TASK-U-04 | task | UPDATE_DIRECT_TABLE | PASS_REAL |
| TASK-L-01 | task | COMPLETE | PASS_REAL |
| TASK-A-01 | task | ASSIGN | PASS_REAL |
| TASK-AU-01 | task | AUDIT | PASS_REAL |
| TASK-OB-01 | task | OUTBOX | PASS_REAL |
| TASK-D-01 | task | DELETE_DIRECT_DENIED | PASS_REAL |
| DOC-C-01 | document | CREATE | PASS_REAL |
| DOC-C-02 | document | CREATE_PERMISSION | PASS_REAL |
| DOC-R-01 | document | READ_LIST | PASS_REAL |
| DOC-R-02 | document | READ_LIST_FOREIGN | PASS_REAL |
| DOC-U-01 | document | UPDATE | PASS_REAL |
| DOC-A-01 | document | SHARE | PASS_REAL |
| DOC-D-01 | document | ARCHIVE | PASS_REAL |
| DOC-D-02 | document | ARCHIVE_REPEAT | PASS_REAL |
| DOC-AU-01 | document | AUDIT | PASS_REAL |

Total 37 · PASS 37 · FAIL 0
Teardown orphans: dcc5c1ee-107a-49f3-b87f-7e539a0dd45d, 43814662-0011-4f86-951c-704798c27115
