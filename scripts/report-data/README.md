# Report mockup data

`data.mjs` is the synthetic person behind the report and dashboard mockups in
[`docs/report-concepts/`](../../docs/report-concepts/): 24 complete months
(Oct 2024 – Sep 2026) of income, expenses and transfers across eight accounts,
with four goals, bills and subscriptions, and a year of budgets. Amounts are
USD cents. The random numbers are seeded, so every import gives the same rows.

It exports the rows (`accounts`, `goals`, `recurring`, `tx`) and the figures
derived from them the way the views and report functions do (`monthly`,
`balances`, `netWorth`, `catMonth`, `budgetPlan`). `data.test.mjs` checks that
those figures hold together, and runs with `npm test`.

Synthetic only: no real names, accounts or amounts, as for every fixture and
seed in this repository.
