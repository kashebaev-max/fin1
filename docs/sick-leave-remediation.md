# Sick leave: interim correction

The previous workflow used salary / 22, calendar days, tenure-based 60/80/100% rates, an employer/State Social Insurance Fund split after three days, and flat income tax on the employer part. It immediately created journal entries and reported success without checking insert errors. This is not an appropriate standard Kazakhstan temporary disability calculation.

## Implemented

- Remove the wrong formula and automatic accounting writes.
- Provide an explicitly unsaved preliminary gross calculator for ordinary cases in a single calendar month in 2026. Inputs are verified average daily earnings, payable workdays from the employee's schedule, and other benefits already accrued that month.
- Apply a 25 MRP monthly cap (MRP 4325 KZT), subtracting prior monthly accruals from the available cap. Reject invalid dates, unsupported years, cross-month periods, and invalid amounts/days.
- Explain month splitting, exceptional categories, the gross/net distinction and the suspended posting workflow in the UI.
- Keep historical data unchanged, display employee names and original totals, and mark records for review. Load errors are explicit; latest 100 records are shown.
- Remove the landing page claim that all HR calculations comply automatically with every Labor Code rule.

## Primary sources checked September 2026

- https://www.gov.kz/situations/55/202?lang=ru — employer-funded benefit, average daily earnings multiplied by payable working days, monthly 25 MRP cap, special categories.
- https://www.gov.kz/article/17157 — 2026 MRP = 4325 KZT.

## Remaining work

This is containment plus a usable preliminary calculator, not a complete payroll implementation. Gross totals are not saved or posted. Supporting exceptional categories, combined payroll deductions, all years, verified average-earnings computation, immutable calculation versions, atomic posting and accountant-reviewed legacy corrections requires a further implementation with the actual schema and representative payroll fixtures. No legacy records or journal entries were changed. No authenticated production database workflow has been tested.

## Verification

Nine calculation regression tests plus five existing auth/middleware tests. TypeScript and production build checks. Deployment checks must distinguish public entry verification from authenticated payroll testing.
