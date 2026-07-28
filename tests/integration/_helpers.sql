-- Integration test helpers.
-- Two auth-linked users provisioned in Batch 1A. Both exist in auth.users
-- and public.users; used as owners for isolated tenants in each test run.
\set OWNER_A '''999a12c6-85b6-4327-8469-b91fc7a8e765'''
\set OWNER_B '''8236c840-8676-48ba-9f9b-497663e1e905'''

\set QUIET on
SET client_min_messages TO warning;