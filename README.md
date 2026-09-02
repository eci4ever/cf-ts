# TapMe (cf-ts)

Attendance, leave and billing platform for Malaysian SMEs — clock-in with
geofencing, leave management with quotas, monthly PDF reports, and manual
credit billing.

**Live:** https://tapme.nimfi.dev

## Stack

- **Framework:** TanStack Start (React 19, SSR) + TanStack Router/Query
- **Auth:** better-auth (email + password, 2FA, organizations, admin impersonation)
- **DB:** Cloudflare D1 (SQLite) + Drizzle ORM
- **Hosting:** Cloudflare Workers — custom domain `tapme.nimfi.dev`
- **Email:** Resend (verification, invites, operational notifications)
- **UI:** Tailwind CSS v4 + shadcn/ui

## Features

| Module | Highlights |
| --- | --- |
| Attendance | Geofenced clock-in/out (per-site radius), GPS accuracy capture, late/short/missing-out tracking, clock notes |
| Heatmap | 12-week GitHub-style attendance heatmap with per-day detail popovers |
| Leave | Types with quotas, supervisor approval flow, cross-year quota splitting, public holidays |
| Issues | Auto-derived attendance issues, justification → supervisor verification workflow |
| Reports | Monthly summary + daily register + issues, per-employee filter, one-click PDF download |
| Billing | Pro/Business credit plans, monthly auto-renewal, top-up request workflow, billing email alerts |
| Platform Admin | User management (ban/impersonate), org billing overview, stats dashboard |

## Quick start (local)

```bash
npm install
cp .dev.vars.example .dev.vars        # then set BETTER_AUTH_SECRET
npm run db:migrate:local              # apply D1 migrations locally
npm run dev                           # http://localhost:3000
```

Test accounts live in `.test_cred` (gitignored — never commit it).

## Production

```bash
npm run deploy                        # build + wrangler deploy
npm run db:migrate:remote             # apply migrations to prod D1
```

Required secrets (`.dev.vars` locally, `wrangler secret` in prod):
`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, optional `EMAIL_FROM`, `EMAIL_BRAND_NAME`.

## Documentation

See the [repo wiki](https://github.com/eci4ever/cf-ts/wiki) for architecture,
module deep-dives and the changelog.
