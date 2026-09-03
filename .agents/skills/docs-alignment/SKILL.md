---
name: docs-alignment
description: Keep project code, machine contracts, and maintained documentation aligned during development; use before and after changes that may affect behavior, boundaries, contracts, workflows, or documentation.
---

# Documentation Alignment

Use [`docs-alignment.config.json`](../../../docs-alignment.config.json) as the repository configuration.

1. Before modifying code, run `docs-alignment impact <planned-path>...` or the repository's `npm run docs:impact -- <planned-path>...` wrapper.
2. Read every reported `required_reading` item and inspect the reported machine contracts and maintained documentation.
3. Update the relevant maintained documentation in the same change when behavior, boundaries, contracts, or workflows change.
4. Run the smallest relevant code and contract tests after implementation.
5. Run `npm run docs:check` last.
6. If documentation, code, tests, or contracts disagree and intent is uncertain, preserve the evidence and report the conflict to the user. Do not guess a winner.

Treat initialized module pages as candidates, not business truth. Do not promote a draft or assign authority without evidence or user confirmation.
