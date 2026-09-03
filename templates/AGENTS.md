<!-- docs-alignment-kit:start -->
## Documentation alignment

When changing this repository:

1. Before editing code, run `docs-alignment impact <planned-path>...` (or `npm run docs:impact -- <planned-path>...`).
2. Read the reported `required_reading`, then inspect the relevant maintained documents and machine contracts.
3. When behavior, a contract, boundary, or workflow changes, update the related documentation in the same change.
4. After editing, run the relevant tests and `docs-alignment check` (or `npm run docs:check`).
5. If sources disagree, preserve both claims and record the conflict for human review; do not guess a winner.

The deterministic CLI checks repository state. This file only guides the Coding Agent; it does not replace tests or `docs:check`.
<!-- docs-alignment-kit:end -->
