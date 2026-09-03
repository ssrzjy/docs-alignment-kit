---
title: Knowledge Conflict Register
status: active
canonical: false
owners: [maintainers]
source_of_truth_for: []
code_paths: []
sources:
  - docs/wiki/roadmap/document-migration.md
summary: Neutral register for contradictory documentation claims, provenance, detection timestamps, and later human decisions without rewriting historical sources.
keywords: [conflict, provenance, human-review, register, migration]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: 09b7af91df353deee75bd47a344154497d280682
---

# Knowledge Conflict Register

当前没有已登记冲突。迁移或实现对齐发现矛盾时，新增 `KCR-001` 形式的稳定 ID，记录双方来源、claim、来源时间、检测时间和状态。

允许的状态：`pending-human-review`、`resolved-human-decision`。解决冲突时追加决定和保留/替代来源，不删除原始记录。

对应的来源级双向边见 [`document-knowledge-relations.json`](document-knowledge-relations.json)。
