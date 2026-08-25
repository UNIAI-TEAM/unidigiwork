# Product

## Register

product

## Users

Small-to-medium Vietnamese teams (10–1,000 people) running daily operations across tasks, projects, meetings, documents, and communications. Primary users are team leads, PMs, operators, developers, and HR/ops admins who spend many hours a day inside the workspace and expect AI agents to participate as first-class teammates. Users work on web, tablet, and mobile PWA, in Vietnamese or English, with a bias toward clarity and speed over visual noise.

## Product Purpose

UNIWORK is an AI-native Work OS: a single digital workplace where humans and AI agents co-own tasks, co-attend meetings, co-author documents, and co-run workflows. Success = the tool disappears into the work — a team coordinates people + agents without switching context, and every surface (task, meeting, doc, email, chat) feels like it was built for the same flow.

## Brand Personality

Restrained, precise, trustworthy. The interface stays neutral; color appears only as signal (status, brand, error). "克制即高级" — restraint reads as quality. The visual language follows the Stripe/Notion/Linear/Vercel/Retool school: minimal, premium, spacious, modern enterprise SaaS, strong typography hierarchy, soft shadows, rounded corners, and an 8px grid. UNIWORK does not chase trends; it removes friction.

## Anti-references

- Decorative color, hardcoded Tailwind palette values, gradient chrome, or glassmorphism.
- SaaS-dashboard clichés: hero KPI cards, orchestrated load animations, oversized charts on every page.
- Strangeness without purpose — custom controls where shadcn/Base UI standards already exist.
- Dense admin UIs, tiny buttons, crypto/gaming aesthetics, or old-school portal layouts.
- Mock data in production-facing surfaces; empty states must be truthful and actionable.

## Design Principles

1. **Subtraction by default** — every element must justify its existence; whitespace is design.
2. **Hierarchy through grayscale**; color is semantic signal only (max 2–3 semantic colors per screen).
3. **Consistency over personality** — same interaction, same feedback, driven by tokens not hardcoded values.
4. **Max 3 text hierarchy levels per screen**; 3-core-size type discipline (body, title, display).
5. **Every change verified in both light and dark mode**; the system is dark-first but must degrade gracefully.
6. **Work OS navigation, not module menus** — group by behavior (My Work, Communication, Knowledge, Automation, Insights) not by product module.
7. **Mobile-first PWA parity** — bottom-tab navigation, touch-friendly targets, native-feeling transitions.
8. **Real data only** — no fake metrics, demo rows, or synthetic charts; empty states explain the next step.

## Accessibility & Inclusion

WCAG AA as the working bar (4.5:1 body text contrast, 3:1 for large text and UI components). Full keyboard navigation for menus, dialogs, command palettes, and task lists. Vietnamese + English UI copy parity by default; Myanmar, Khmer, and Lao supported progressively. Reduced-motion respected — sidebar and panel animations gate on `useReducedMotion`. Focus indicators visible, form errors explicit, and color never the sole signal for status.
