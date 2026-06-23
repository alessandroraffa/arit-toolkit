<!-- markdownlint-disable MD041 -->

## Monthly popularity ranking refresh

### Editorial checklist

- [ ] **Sanity bound**: [FLAGGED for heightened review / Routine — N inverted pairs]
- [ ] **Position delta**: [List which targets moved and by how much]
- [ ] **Signal coverage**: [Any target with zero or one counted signal this refresh]

### Method

Signals: npm monthly downloads, VS Code Marketplace installs, Open VSX downloads, GitHub stars.
Aggregation: per-signal dense rank, normalized to pool-size-comparable position (best = 0), averaged ascending.
See `docs/plans/PLAN-006-assistant-popularity-ranking.md`.
