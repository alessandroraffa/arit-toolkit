---
title: 'A safe and predictable Markdown Headings command'
initiative: INIT-007-markdown-headings-correctness
status: 'active'
created: 2026-06-24
references:
  - docs/specifications/SPEC-005-markdown-headings-correctness.md
---

## Objectives

1. The Markdown Headings command is safe: running it never corrupts content that is not a heading, and it never mistakes code for a heading, no matter where the user's selection begins or ends.
2. The command is predictable: it moves every heading it can within the user's scope, leaves the rest untouched, and clearly says so when nothing changed — replacing the opaque all-or-nothing refusal that today leaves the user staring at an unchanged document with no explanation.
3. The command is correct against the recognized standard for Markdown headings and code blocks, so that what counts as a heading, where a code block begins and ends, and how indentation is interpreted are deterministic rather than approximate.

## Motivation

The Markdown Headings command is a shipped, user-facing editing feature: it raises or lowers heading levels over a selection or across the whole document. An adversarial assessment of the feature confirmed real defects, and the most serious of them is the worst failure mode an editing command can have — silent data corruption.

When the command runs on a selection that sits inside a fenced code block, it rewrites the user's code lines as though they were headings; when a selection straddles a code-block boundary, the result is inverted — the code is mangled while a genuine heading nearby is skipped. The damage looks irreversible in the moment and is exactly the kind of behavior that destroys a user's trust in an editor command: the one operation a user must be able to run without fear is one that silently corrupts what they did not intend to touch.

Alongside the corruption path, the command simply does not work in ordinary cases. Asking to lower every heading in a document that opens with a title appears to do nothing at all, because a single heading that cannot move further refuses the entire operation rather than moving the headings that can. Indented headings, headings with no title text, and documents with the other common line-ending convention are mishandled; over-indented code fences are misread as real fences; and when the editor holds more than one selection, only the first is acted on. Individually these are correctness gaps; together they make the feature feel unreliable.

These are not latent risks in unreleased code — they are defects in a command users can run today, and the silent-corruption path makes the cost of leaving them unaddressed open-ended. The corrected behavior and the reasoning behind it are already analyzed and settled: the [Markdown heading correctness specification](docs/specifications/SPEC-005-markdown-headings-correctness.md) defines, for every input shape, what the command must do and how each correction is verified. What remains is to motivate and authorize one scoped iteration that closes the confirmed defects.

Some of these corrections are intentional breaks from how the command behaves today. Refusing the whole operation becomes moving every heading it can: the all-or-nothing abort is itself the cause of the feature appearing broken in ordinary documents, so replacing it with a partial transform is the fix, not a behavioral preference. Symmetrically, code fences are recognized under a stricter indentation rule because over-indented lines misread as real fences are the mechanism behind the silent corruption — a falsely recognized fence either mangles a genuine heading or shields one that should move — so tightening fence recognition is the fix, not a style choice. Because the shipped command's observable contract changes, this iteration delivers a test suite that reflects the corrected contract, with no surviving test encoding the superseded behavior; the specification's [behavioral delta and test impact](docs/specifications/SPEC-005-markdown-headings-correctness.md#behavioral-delta-and-test-impact) records which changes are breaking and what they affect. The extension auto-updates, so this corrected behavior reaches users without an explicit opt-in; the recovery path is bounded — the prior Marketplace version remains installable through the version picker, and a patch revert is the route back if a regression is confirmed.

## Scope

Included:

- A correctness pass on the existing Markdown Headings command that makes it safe, predictable, and standard-correct across every input shape, with no change to its invocation surface, guaranteeing that content which is not a heading is never altered and that code is never mistaken for a heading independent of where a selection starts or ends relative to a code-block boundary — governed by the [Markdown heading correctness specification](docs/specifications/SPEC-005-markdown-headings-correctness.md)
- The shift from an all-or-nothing refusal to a partial transform that moves every heading it can, leaves the rest in place, and informs the user — distinguishably — when nothing changed
- Correct handling of the common cases the feature mishandles today: indented headings, headings with no title text, both line-ending conventions, stricter recognition of over-indented code fences, and acting on every selection rather than only the first
- A non-corruption guarantee for the heading style this iteration does not transform, paired with a known-limitation note that makes the resulting mixed-document inconsistency visible to users on a named surface — the CHANGELOG known-limitations note and the README — shipped in the same released version as the behavior change, so no user receives the changed behavior without the limitation also being visible
- A test suite reflecting the corrected contract delivered within this iteration, with no surviving test encoding the superseded behavior

Excluded:

- Transforming the alternative (underline-style) heading form — out of scope this iteration by the specification's own decision; only its non-corruption is guaranteed and the resulting mixed-document inconsistency is documented as a known limitation. Whether to transform that form is deferred to a future iteration once the baseline correctness ships
- Any new command, configuration option, or other addition to what the feature exposes — this iteration changes only the existing command's behavior
- Any in-product detector for the documented mixed-document inconsistency — not in scope this iteration
- The behavioral contract itself — the per-input-shape requirements, the breaking-change inventory, and the acceptance criteria are governed by the [Markdown heading correctness specification](docs/specifications/SPEC-005-markdown-headings-correctness.md) and referenced here, not restated

## Success criteria

These are strategic, product-level outcomes; the behavioral contracts that make each one verifiable are the specification's acceptance criteria, referenced rather than restated here, and each outcome below is satisfied against its governing acceptance criteria in the [Markdown heading correctness specification](docs/specifications/SPEC-005-markdown-headings-correctness.md).

- [ ] Running the command can no longer corrupt content that is not a heading, for any position of the user's selection relative to a code-block boundary — observable as code-block content left identical whether the selection sits inside the block, includes only its closing boundary, or straddles it
- [ ] A request to move headings moves every heading it can and leaves only the ones that cannot, instead of refusing the whole operation — observable as a titled document whose other headings all shift while the title stays put, with the command reporting success
- [ ] When nothing changes, the user is told so at an informational level — and can tell whether it was because the scope held no movable heading or because every heading was already at its limit — distinct from the failure notice shown for a genuinely invalid invocation
- [ ] The common cases the feature mishandles today all behave correctly: indented headings, headings with no title text, both line-ending conventions, over-indented fences, and multiple selections
- [ ] The heading form this iteration does not transform is never corrupted, and the resulting mixed-document inconsistency is stated on a user-facing documentation surface — the CHANGELOG known-limitations note and the README — released in the same version that ships the behavior change
- [ ] The delivered test suite reflects the corrected contract with no surviving test encoding the superseded behavior, so the breaking changes are pinned by the suite rather than left to documentation

## Revision history

2026-06-24 — Applied the dispositioned review conditions and auto-fixes. Removed the governance meta-objective (Objective 4) and the Motivation paragraph that previewed the Scope section, retaining only its load-bearing rationale. Added the value rationale for the stricter fence-recognition break (over-indented fences misread as real fences are the mechanism behind the silent corruption), symmetric with the abort→partial rationale. Named the surface for the mixed ATX+setext known-limitation note — the CHANGELOG known-limitations note and the README — and committed to shipping that documentation in the same released version as the behavior change. Acknowledged the bounded recovery path for this auto-updating breaking change: the prior Marketplace version stays installable via the version picker and a patch revert is the route back if a regression is confirmed. Restated the test commitment as an outcome (a suite reflecting the corrected contract, no surviving test encoding the superseded behavior) rather than an execution mechanism. Consolidated the per-criterion specification references into the success-criteria preamble, collapsed the redundant Scope sub-enumeration into its parent, and confirmed no spec normative content (requirement labels, thresholds, the test-impact inventory) is reproduced here.
