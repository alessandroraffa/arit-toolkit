# Assistant popularity ranking: method

The README lists the supported assistants in popularity order, and the
extension applies the same order at runtime. This document explains how that
order is produced, so the claim can be checked rather than taken on trust.

**The order is not an endorsement.** It is derived from public download,
install, and star counts. It says nothing about the quality, correctness, or
suitability of any assistant.

## Signals

Each assistant is measured on up to three public signals.

| Signal    | Meaning                        | Source                                       |
| --------- | ------------------------------ | -------------------------------------------- |
| **CLI**   | Monthly command-line downloads | npm download-point API, or PyPI recent stats |
| **EXT**   | Editor extension install total | VS Code Marketplace gallery, or Open VSX     |
| **STARS** | Source repository star total   | GitHub REST `stargazers_count`               |

All sources are queried anonymously. A read-only GitHub token is used when
available to raise the rate-limit ceiling, but it is a robustness measure: a
run without it still completes.

An assistant is measured only on the signals it actually has. Where a surface
does not exist, it is recorded as absent and simply does not participate. Two
cases are recorded distinctly:

- **Absent** — no such public surface exists. Cline and RooCode publish no
  command-line package; Aider publishes no first-party editor extension.
- **Excluded** — a surface exists but belongs to a sibling product. The npm
  package `@github/copilot` is the Copilot CLI, a different product from the
  Copilot Chat extension this target models, so it is not counted.

Every assistant counts at least two signals.

## Scoring

The computation is pure and deterministic: given the recorded raw values, it
performs no network access and always yields the same result.

1. **Dense rank per signal.** Within each signal, the assistants that possess
   it are ranked, 1 being most popular. Equal values share a rank and the next
   distinct value takes the immediately following rank, with no gap.

2. **Normalize to a position.** Each dense rank becomes
   `position = (denseRank - 1) / (maxDenseRank - 1)`, where `maxDenseRank` is
   the largest dense rank among the assistants that possess that signal. The
   best end is `0`, the worst end is `1`, and a sole possessor is `0`. When
   only one assistant possesses a signal, the position is `0`.

   The pool is the possessing set only, so an assistant that lacks a signal
   perturbs neither the ranks nor the positions of those that have it.

3. **Average.** An assistant's score is the arithmetic mean of its normalized
   positions across the signals it possesses.

4. **Order.** Ascending by score, lowest first. Exact ties are broken by
   canonical assistant name, case-insensitive ASCII, ascending — so the order
   is total and reproducible.

### A known property of rank aggregation

Ranking discards magnitude. An assistant that leads a signal only few
assistants possess reaches the top position on that signal just as decisively
as one that leads a signal everyone possesses. This is a deliberate trade-off
in favour of comparability across signals of very different scales, and it is
the main reason the order should be read as indicative rather than precise.

## Provenance and refresh

The order ships as a single generated TypeScript module compiled into the
extension. Per assistant it records the raw signals, the source and period of
each, the computed score, the resolved position, and the refresh date. Every
score is therefore recomputable from the data shipped alongside it.

The module is generated, never hand-edited. A scheduled monthly job re-queries
the sources and proposes any change as a pull request, so each refresh is a
reviewable diff and a bad refresh is undone by reverting one commit. The
extension performs no network request at runtime.

To refresh manually:

```bash
pnpm run refresh:popularity
```

The README table and the shipped artifact are generated from that same module,
so the two cannot disagree.
