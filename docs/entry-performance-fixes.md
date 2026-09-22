# Finstat: entry and performance fixes

## Implemented

- Public `/auth` renders its form on the server without waiting for Supabase middleware. The dashboard retains verified-user, blocked-user and email-confirmation checks.
- Redirect responses preserve updated/sign-out cookies.
- Free-trial calls to action open the registration tab (`?mode=signup`).
- Missing signup session prompts email confirmation independently of the frontend setting. Resend exceptions release the submit button.
- Fixed incorrect SupabaseClient type import; type checking is enabled.
- Scanner and AI panel load on demand. Dashboard query errors are displayed with retry instead of zero financial indicators.
- Added sitemap and robots routes; auth is noindex; removed duplicate viewport.
- Added visible prices and softened unsupported OCR claims; improved selected mobile grids.
- Existing event tracking receives signup submission/response and successful login events, without form values. Signup response is deliberately not named conversion: backend may obscure existing accounts.

## Verification

- TypeScript check passed after correcting the existing import.
- Five middleware regression cases: public entry does not call Auth, anonymous dashboard denied, blocked user denied, confirmation enforced, active user allowed; sign-out cookies retained.
- Production build uses placeholder public Supabase configuration, not production credentials. This verifies compilation, not real signup or database access.

## Unresolved, do not describe as fixed

1. `lib/hr.ts` calculates sick leave using tenure percentages and a three-day employer split; `app/dashboard/sick-leaves/page.tsx` uses calendar days and salary / 22. Proper Kazakhstan calculation needs actual average earnings, scheduled working days, monthly limits and exceptions, payroll deductions and accounting validation. Existing records have not been recalculated. Landing states that verification is pending.
2. Legal offer still lacks the actual operator's verified name and identifiers. Supply these before editing.
3. Dashboard financial formulas and unpaginated queries remain unaudited; totals may be incomplete above API row limits. Database aggregates need tenant/RLS and accountant-reviewed definitions before implementation.
4. No live sign-up, payment, billing or document workflow was tested. No production database mutation or deployment performed.
5. No measured user speed improvement or registration uplift is claimed. Measure real Web Vitals and funnel after deployment.
6. Infrastructure location and personal-data compliance require separate assessment; no hosting migration performed.

## Release

Review the branch and test in a preview with the project's environment. Verify registration with and without email confirmation, expired/blocked sessions, resend failure, and real dashboard queries. Merge/deploy only after that review. Rollback by reverting the change commit.
