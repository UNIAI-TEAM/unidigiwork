# Architecture Decisions

- Public business-service pages use published `cms_entries` as their sole content source, so `/uniwork`, `/dich-vu`, and service details stay synchronized with the CMS.
- Dashboard card dimensions are stored in the existing namespaced user preferences payload, avoiding a second layout store or schema change.
- Industry packs (e.g. school) are a configuration overlay (tenants.industry_pack + i18n label overlay + templates + skills), never a fork of core modules, so businesses and schools share one codebase.
