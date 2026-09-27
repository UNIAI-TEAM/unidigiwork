# Architecture Decisions

- Public business-service pages use published `cms_entries` as their sole content source, so `/uniwork`, `/dich-vu`, and service details stay synchronized with the CMS.
- Dashboard card dimensions are stored in the existing namespaced user preferences payload, avoiding a second layout store or schema change.