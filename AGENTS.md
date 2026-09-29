# Architecture Decisions

- Public business-service pages use published `cms_entries` as their sole content source, so `/uniwork`, `/dich-vu`, and service details stay synchronized with the CMS.
- Dashboard card dimensions are stored in the existing namespaced user preferences payload, avoiding a second layout store or schema change.
- Industry packs (e.g. school) are a configuration overlay (tenants.industry_pack + i18n label overlay + templates + skills), never a fork of core modules, so businesses and schools share one codebase.
- School departments (tổ chuyên môn) are `tenant_member_profiles.department` (tasks inherit via owner/assignee, meetings via `meetings.department`), because workspaces are 1:1 with tenants; school roles map to tenant roles (owner/admin = BGH, manager = tổ trưởng, member = giáo viên).
- School policy metadata (số văn bản, hiệu lực, tổ áp dụng) lives in `document_policy_meta` keyed by document, never new columns on `documents`, so the core Documents module stays pack-neutral.
- School departments are registered in `school_departments` (catalog, BGH-only via RPCs); membership stays in `tenant_member_profiles.department`, and rename/delete RPCs cascade names to profiles, meetings and pending invites so there is still one membership source.
