---
title: 'Markdown heading increment/decrement — correctness'
spec: SPEC-005
status: 'approved'
workspaces: []
created: 2026-06-24
references:
  - Existing Markdown Headings feature (markdownHeadings) — commands tangyr.markdownHeadings.increment / tangyr.markdownHeadings.decrement
  - Multi-agent adversarial assessment of the Markdown Headings feature (2026-06)
  - CommonMark specification — ATX headings (§4.2), setext headings (§4.3), fenced code blocks (§4.5), indented code blocks (§4.4)
---

## Introduction

The Markdown Headings feature provides two commands — `tangyr.markdownHeadings.increment` and `tangyr.markdownHeadings.decrement` — that shift ATX heading levels by adding or removing one `#`. They run on the active Markdown editor (over a selection, or the whole document when there is no selection) and on a Markdown file selected in the Explorer.

A multi-agent adversarial assessment confirmed defects in the current behavior that range from silent code corruption to whole-operation aborts. This specification defines the corrected, observable behavior the feature must exhibit. It governs _what_ the commands must do for every input shape — not how the transform is implemented. Where it cites a current defect location (a function or a regular expression in the existing code), that citation is context for the reader, not a requirement: requirements here are stated as observable outcomes.

The corrected behavior is anchored to CommonMark so that heading recognition, code-block boundaries, and indentation limits are deterministic rather than ad hoc.

### Terminology

**Leading indentation (columns).** Throughout this specification, leading indentation is measured in _columns after tab expansion_, per CommonMark §2.2: a tab advances to the next 4-column tab stop, so it contributes one to four columns depending on its position. The phrase "0–3 leading spaces" is shorthand for "0–3 columns of leading indentation"; a single leading tab already reaches column 4 and therefore exceeds the 0–3 column range.

**ATX heading.** A line beginning with one to six `#` characters, with 0–3 columns of leading indentation, where the run of `#` is followed by a space, a tab, or the end of the line. The number of `#` characters is the heading _level_.

**Setext heading.** A line of text immediately followed by a line of one or more `=` characters (level 1) or `-` characters (level 2), with no intervening blank line. The line of `=` or `-` characters is the setext _underline_; the preceding line is the setext _text line_. Setext headings express only levels 1 and 2.

**Fenced code block.** A region opened by a line whose first non-space content is a run of three or more backtick (`` ` ``) or tilde (`~`) characters, with 0–3 columns of leading indentation, and closed by a matching fence line of the same character, at least as long, with 0–3 columns of leading indentation and no trailing non-whitespace content — or by the end of the document.

**Indented code block.** A line with 4 or more columns of leading indentation that is not inside a fenced code block. Its content is literal and is never a heading or a fence.

**Scope.** The set of lines the command operates over: the lines spanned by the user's selection (each partially-selected line counted in full), or every line of the document when there is no selection. In the Explorer, the scope is always the entire file.

**Boundary heading.** For increment, a level-6 heading; for decrement, a level-1 heading. A boundary heading cannot move further in the requested direction.

## Functional requirements

### Code-block context integrity

1. The command must determine whether a line is inside a fenced code block by evaluating fenced-code-block state over the **entire document**, not over the selected fragment. A line that is inside a fenced code block in the full document must never be transformed, regardless of whether the scope is a selection or the whole document, and regardless of which fence lines (opening, closing, both, or neither) the selection happens to include.

2. A genuine ATX heading that lies within the scope and is not inside a fenced code block in the full document must be transformed (subject to the boundary rule in _Partial transform at level limits_), regardless of its proximity to a fence boundary and regardless of whether the selection includes the adjacent fence lines.

3. The command's effect must be confined to the scope: lines outside the scope must remain byte-identical, even though full-document context is consulted to classify lines inside the scope.

### Partial transform at level limits

1. The command must transform every in-scope ATX heading that can move in the requested direction. A boundary heading within the scope must be left unchanged and must not prevent the other in-scope headings from being transformed.

2. When at least one in-scope heading is transformed, the command applies the change and reports success. The presence of a boundary heading among the in-scope headings is not an error and produces no warning.

3. When no in-scope heading is transformed, the document must be left byte-identical and the user must receive a single no-op notice delivered at VS Code **information** level. The no-op notice must distinguish at least the two causes that produce it: (i) the scope contains no transformable heading, and (ii) every in-scope heading is already at the level limit (a boundary heading). The exact message wording is left to implementation; the information level and the two-cause distinction are normative.

4. The no-op notice of item 3 is informational, not a failure. It must be delivered at a different notification level from the failure notices the feature uses for genuinely invalid invocations — a non-Markdown target or no active editor — which must be delivered at **warning** or **error** level. The level split (information for the no-op, warning/error for genuine failures) is normative.

### ATX heading recognition and indentation

1. A line whose first non-space content is a run of one to six `#` characters with 0–3 columns of leading indentation, followed by a space, a tab, or the end of the line, must be recognized as an ATX heading and transformed (subject to the boundary rule). Leading indentation is measured in columns after tab expansion: a single leading tab reaches column 4, so a tab-indented `#` line is an indented code block, not a heading.

2. When such a heading is transformed, its leading indentation must be preserved exactly, byte for byte, and the run of `#` characters must be increased or decreased by exactly one.

3. A line with 4 or more columns of leading indentation whose remaining content begins with `#` must be treated as an indented code block, not a heading, and must be left unchanged. This includes a line whose leading indentation reaches column 4 by a tab.

4. A line in which the run of `#` is immediately followed by a non-space, non-tab character (for example `#hashtag`) is not an ATX heading and must be left unchanged.

### Bare ATX heading recognition

1. A line consisting only of one to six `#` characters — with 0–3 columns of leading indentation and optionally trailing spaces or tabs, but no title text — is a valid empty ATX heading and must be transformed (subject to the boundary rule), preserving its leading indentation and any trailing whitespace exactly.

### Line-ending integrity

1. The command must preserve the document's existing line endings. A document using LF endings must remain LF throughout; a document using CRLF endings must remain CRLF throughout. The command must not introduce, remove, or convert line endings, and must not leave stray carriage-return artifacts on any line.

2. Heading and fenced-code-block recognition must behave identically whether the document uses LF or CRLF endings: a heading recognized in an LF document must be recognized in the byte-identical CRLF document, and vice versa.

### Fenced-code-block boundary correctness

1. A fenced-code-block opener must be recognized only when the fence run has 0–3 columns of leading indentation. A line whose fence run is preceded by 4 or more columns of leading indentation — including indentation that reaches column 4 by a tab — must be treated as indented code content, not as a fence opener.

2. A closing fence must be recognized only when it has 0–3 columns of leading indentation, uses the same fence character as the opener, is at least as long as the opener's fence run, and carries no trailing non-whitespace content. A ` ``` ` (or `~~~`) line preceded by 4 or more columns of leading indentation must not close an open fence.

3. A fence line — opener or closer — must never be evaluated as an ATX heading, even when its info string or content begins with `#`. A fence opener whose info string starts with `#` (for example ` ```# section `) opens a code block and is left byte-identical; it is not a heading.

4. For closing-fence recognition, a trailing carriage return (`\r`) introduced by CRLF line endings is a line-ending artifact, not trailing content. A closing fence line that is otherwise valid must still be recognized as a closer when its only trailing byte is the `\r` of a CRLF ending.

5. When no closing fence is present before the end of the document, the fenced code block extends to the end of the document; every line from the opener onward is code and must be left unchanged.

### Multi-selection

1. When the editor has multiple selections, the command must apply the corrected transform to every selection, not only the primary one. The boundary, code-block, indentation, and line-ending rules apply across the combined scope. Lines covered by none of the selections must remain byte-identical.

2. When two or more selections cover the same line, that line is transformed exactly once. The set of covered lines is de-duplicated before any transform is applied, so an overlapping selection never shifts a heading by more than one level.

3. When no in-scope heading across all selections is transformed, the document must be left byte-identical and the user must receive the single information-level no-op notice described in _Partial transform at level limits_, item 3.

### Setext heading handling

This iteration transforms ATX headings only. Setext headings are not transformed, and the command must guarantee that they are never corrupted. Two guarantees are normative.

1. **Setext underlines are never modified.** A setext underline line — a line of one or more `=` characters or one or more `-` characters that underlines a preceding text line — must be left byte-identical through any transform. The command must not add, remove, or alter any character of a setext underline.

2. **A setext text line is never transformed as an ATX heading.** The text line of a setext heading must never be mistaken for an ATX heading or transformed as one. Because a setext text line does not begin with a `#` run, it falls outside ATX recognition and must be left byte-identical.

### Known limitations

1. **Mixed ATX and setext documents desynchronize.** Because setext headings are not transformed this iteration, a document mixing ATX and setext headings has its ATX levels shifted while its setext levels stay fixed, leaving the heading hierarchy internally inconsistent. This limitation must be communicated on a user-facing documentation surface — the README, the CHANGELOG known-limitations note, or both. No in-product detector for the desync is in scope this iteration.

## Constraints

1. **Heading and code-block semantics follow CommonMark.** ATX heading recognition, setext recognition, fenced-code-block boundaries, and the 0–3 versus 4-or-more column indentation distinction (measured after tab expansion) must conform to the CommonMark specification. Where the current implementation diverges from CommonMark (see the defect citations in _Error handling_), CommonMark governs.

2. **No content beyond the heading marker changes.** The only bytes the command may alter are the `#` run of a transformed heading. Title text, indentation, trailing whitespace, blank lines, code-block content, fence lines, and line endings must be preserved exactly.

   _Corollary (context independence)._ Because the transform alters only the `#` run and classifies lines against full-document context, the change applied to any in-scope heading depends only on the document's content and the chosen scope, never on which fence lines a selection incidentally includes. This is restated as an observable outcome in _Acceptance criteria_, "Selection result matches whole-document result per heading."

3. **Invocation contracts unchanged.** The command continues to operate on the active Markdown editor (selection or whole document) and on a Markdown file targeted from the Explorer. The existing guards — rejecting a non-Markdown target and reporting when there is no active editor — remain in force and are unaffected by this specification.

## Error handling

1. **Genuine invocation failures remain failures.** When the command is invoked with no active editor, or against a non-Markdown target from the Explorer, it must report the corresponding failure notice at warning or error level and make no change. These cases are distinct from the information-level no-op notice of _Partial transform at level limits_, item 3.

2. **Boundary headings are not failures.** A boundary heading is skipped, never an error; the whole-operation abort that the current implementation raises when any in-scope heading is at the boundary must be removed. The user-visible outcome of removing the abort: where the command previously refused the entire operation and showed a warning, it now transforms every movable in-scope heading, leaves the boundary heading in place, and reports success — the document changes instead of being rejected wholesale.

3. **Each confirmed defect maps to one corrected-behavior requirement.** The defects the adversarial assessment confirmed are each corrected by exactly one governing requirement, listed below. The parenthetical code locations are context for the reader, not requirements; the requirement is the observable corrected behavior.
   - **Selection-fragment code-block misclassification** — code-block state recomputed from the selected fragment alone, corrupting in-code `#` lines when the opener is above the selection and mis-classifying a selection that includes a closing fence but not its opener (current `transformHeadings` consuming only the range text from `getTargetRange` in `command.ts`). Governed by _Code-block context integrity_, which must hold for every selection shape.
   - **Whole-operation abort at the boundary** — the entire operation aborted whenever any in-scope heading is at the boundary (the `validateHeadings` short-circuit in `headingTransform.ts`, surfaced as a warning by `command.ts`). Governed by _Partial transform at level limits_; see item 2.
   - **Over-indented fence lines accepted** — fence matching that accepts any indentation, so a 4-or-more-column-indented fence line is wrongly treated as a fence, closing a block prematurely or falsely protecting a real heading (the permissive fence regular expression and the unbounded leading-space trim in the current closing-fence check). Governed by _Fenced-code-block boundary correctness_.
   - **CRLF corruption** — line endings corrupted by the split and re-join path, producing stray `\r` artifacts or skewed recognition. Governed by _Line-ending integrity_.

## Acceptance criteria

1. **Selected code-block content is inert under increment (SR-1).** Given a document with a fenced code block whose opening ` ``` ` is above the selection, selecting only the content lines inside the block (including lines that begin with `#`) and running increment leaves the selected bytes identical; no `#` is added to any in-code line.

2. **Selected code-block content is inert under decrement (SR-1, decrement).** Given the same document with a fenced code block whose opening ` ``` ` is above the selection and whose in-code lines include ones beginning with `##`, selecting only the content lines inside the block and running decrement leaves the selected bytes identical; no `#` is removed from any in-code line.

3. **Closing-fence-only selection (SR-2).** Given a document with a fenced code block followed by a real heading, selecting a range that includes the block's closing fence and the real heading but not the opening fence, and running increment, transforms only the real heading; the in-code line(s) and the fence lines are unchanged.

4. **Heading at a fence boundary.** Given a real heading immediately adjacent to a fenced code block, selecting that heading together with neighbouring fence lines and running the command transforms only the real heading; no fence line or in-code line changes.

5. **Full-document decrement with H1 title proceeds.** Given a document beginning with a level-1 title followed by deeper headings, running decrement over the whole document leaves the level-1 title unchanged and decrements every other heading by one; the command reports success and shows no warning.

6. **Increment with an H6 present proceeds.** Given a document containing a level-6 heading among shallower headings, running increment over the whole document leaves the level-6 heading unchanged and increments every other heading by one.

7. **No transformable heading yields an information-level no-op.** Given a scope that contains no transformable heading — for example a selection of only body text — running the command leaves the document byte-identical and shows a single VS Code information-level notice whose cause is "no transformable heading found in scope"; no error or warning is shown.

8. **All-at-limit yields an information-level no-op.** Given a whole document whose only heading is a level-1 heading under decrement (or only a level-6 heading under increment), running the command leaves the document byte-identical and shows a single VS Code information-level notice whose cause is "all in-scope headings are already at the level limit"; no error or warning is shown.

9. **No-op uses information level while genuine failures use warning or error.** Running the command on a non-Markdown target or with no active editor delivers its notice at VS Code warning or error level, distinct from the information level used for the no-op notices of criteria 7 and 8.

10. **Code-block-only selection yields the "no transformable heading" no-op.** Given a selection whose only `#` lines lie inside a fenced code block (the opener being above or within the document context), running the command leaves the document byte-identical and shows the information-level "no transformable heading found in scope" notice.

11. **Indented ATX heading is transformed with indentation preserved.** Given a heading with 1–3 columns of leading indentation (for example `## Section`), running increment yields the same heading with one more `#` and the identical leading indentation (`### Section`); the title text is unchanged.

12. **Over-indented ATX line is left unchanged.** Given a line with 4 or more columns of leading indentation beginning with `#` (for example `# not a heading`), running the command leaves it byte-identical.

13. **Tab-indented `#` line is indented code, not a heading.** Given a line consisting of a single leading tab followed by `# Title`, running the command leaves the line byte-identical: the tab reaches column 4, so the line is indented code, not a heading.

14. **Bare ATX heading preserves trailing whitespace.** Given the line `##` (two `#` characters followed by two trailing spaces and no title text), running increment yields `###` with the two trailing spaces preserved exactly; running decrement on `##` yields `#` with the two trailing spaces preserved.

15. **LF document keeps LF endings.** Given an LF-terminated document, running the command produces an LF-terminated result with no carriage-return characters anywhere.

16. **CRLF document keeps CRLF endings.** Given a CRLF-terminated document, running the command produces a CRLF-terminated result in which every heading recognized in the LF-equivalent document is recognized and transformed, and no line acquires or loses a carriage return.

17. **Over-indented fence does not close a block.** Given a fenced code block in which a line of ` ``` ` is indented by 4 or more columns, that indented line does not close the block; `#` lines after it but before the real closing fence remain in-code and are left unchanged by increment.

18. **Over-indented fence opener is not a fence.** Given a ` ``` ` line indented by 4 or more columns that is not inside an open fence, it is treated as indented code (not a fence opener); a genuine heading on a later line is still transformed.

19. **Tab-indented fence line is not a fence.** Given a line consisting of a single leading tab followed by ` ``` `, that line is not treated as a fence opener or closer: the tab reaches column 4, so the line is indented code content.

20. **Fence info-string line beginning with `#` is not a heading.** Given a fence opener whose info string begins with `#` (for example ` ```# section `), running the command leaves that line byte-identical; it opens a code block and is never transformed as a heading.

21. **CRLF closing fence is recognized.** Given a CRLF-terminated document with a fenced code block whose closing fence line is otherwise valid and whose only trailing byte is the `\r` of the CRLF ending, the closing fence is recognized: a heading after the closing fence is transformed, and the in-code `#` lines before it are left unchanged.

22. **Unclosed fence protects to end of document.** Given a fenced code block opened but never closed, every line from the opener to the end of the document is left unchanged by the command, including lines beginning with `#`.

23. **Unclosed fence with a fully-interior selection.** Given an unclosed fence, a selection lying entirely inside the block body — excluding the opener line and the document end — leaves every selected `#` line byte-identical under increment.

24. **Multiple selections all transform.** Given two disjoint selections each containing a transformable heading, running the command transforms the headings in both selections; lines covered by neither selection are byte-identical.

25. **Overlapping selections transform a shared line once.** Given two selections that both cover the same heading line, running increment shifts that heading by exactly one level — a single `#`-level change — not two.

26. **Selection result matches whole-document result per heading.** Given any single heading, the change the command applies to it when that heading is inside a selection is identical to the change it applies when the command runs over the whole document — the selection's incidental inclusion or exclusion of fence lines never alters the per-heading outcome.

27. **Setext underline is never modified.** Given a document containing a setext heading (a text line underlined by `===` or `---`) alongside ATX headings, running increment or decrement leaves the setext underline line byte-identical while the ATX headings shift.

28. **Setext text line is never transformed.** Given the same document, the setext text line is left byte-identical by increment and decrement; it is never mistaken for or transformed as an ATX heading.

## Behavioral delta and test impact

The corrected behavior changes the observable contract in three ways that are BREAKING relative to the currently shipped feature. Each must be reflected in the test suite: the existing tests below encode the OLD contract and must be rewritten to the corrected behavior. Test remediation is therefore in implementation scope from the start, not a follow-up.

1. **Limit handling: all-or-nothing abort becomes partial transform.** The feature previously aborted the whole operation and surfaced a warning whenever any in-scope heading was at the boundary. It now transforms every movable heading, leaves boundary headings in place, and shows an information-level no-op only when nothing moved. The unit tests that assert the abort error strings — "Cannot increment: one or more headings are already at level 6 (maximum)." and "Cannot decrement: one or more headings are already at level 1 (minimum)." — encode the old abort contract and must be rewritten to assert the partial-transform outcome.

2. **Fenced-code indentation tightened to 0–3 columns for both opener and closer.** The feature previously accepted fence lines at any indentation. It now recognizes a fence opener or closer only at 0–3 columns of leading indentation (measured after tab expansion). The existing fence test around `headingTransform.test.ts:120-128` uses a 3-space-indented fence, which is a valid fence under both the old permissive rule and the new 0–3-column rule, so its assertion does not change; the gap is that no existing test covers the over-indented case. A new fixture at 4 or more columns of indentation (four spaces, or a leading tab) must be added asserting that the over-indented fence line is treated as indented code rather than a fence — this is an added case, not an inversion of the existing 3-space assertion.

3. **CRLF preservation.** The feature previously risked stray `\r` artifacts and skewed recognition on CRLF documents. It now preserves CRLF endings exactly and recognizes headings and fences identically across LF and CRLF. New CRLF cases (line-ending preservation and CRLF closing-fence recognition) must be added; any test that assumes LF-only input must be extended to cover the CRLF-equivalent.

## Open questions

None. The setext heading question raised in the initial draft has been resolved: this iteration transforms ATX headings only, guarantees setext non-corruption, and documents the mixed-document desync as a known limitation (see _Setext heading handling_ and _Known limitations_).

## Revision history

2026-06-24 — Initial draft. Defines the corrected observable behavior for the Markdown Headings increment/decrement commands across seven defect areas confirmed by adversarial assessment: full-document code-block context integrity for selection scopes (SR-1/SR-2), partial transform at level limits with an informational no-op notice, indented and bare ATX heading recognition, LF/CRLF line-ending integrity, CommonMark fenced-code-block boundary correctness, and multi-selection support. Setext heading handling raised as the single open question with a recommendation for option (b) (out of scope this iteration, with a non-corruption guarantee and a documented limitation). Cites current code defect locations as context (selection-fragment code-block recomputation, the level-limit whole-operation abort, the unbounded fence indentation matching, and the CRLF-unsafe split/join path).

2026-06-24 — Applied the dispositioned review-gate conditions and auto-fixes. (1) Indentation is now measured in columns after tab expansion per CommonMark §2.2 across ATX recognition and fenced-code boundaries, with tab-indented `#` and fence-line acceptance criteria added. (2) Setext handling was decided as ATX-only with a non-corruption guarantee: the option analysis became a normative _Setext heading handling_ subsection with two guarantees and two acceptance criteria, and the stale "for the purpose of the decision in Open questions" qualifier was removed from the CommonMark constraint. The (a)/(b) trade-off rationale is recorded here: option (b) was chosen because option (a)'s setext-to-ATX conversion changes line counts and document structure in ways that interact with the multi-selection and range-preservation guarantees and is better specified on its own once the ATX correctness baseline ships; the cost of (b) is that mixed ATX+setext documents remain partially shifted, now stated as a documented limitation. (3) The no-op notice is pinned to VS Code information level while genuine-failure notices use warning or error level. (4) Overlapping multi-selections transform a covered line exactly once via de-duplication. (5) The no-op notice distinguishes "no transformable heading found in scope" from "all in-scope headings are already at the level limit," with a code-block-only-selection acceptance criterion. (6) An unclosed-fence-with-fully-interior-selection acceptance criterion was added. (7) The mixed ATX+setext desync limitation is required on a user-facing documentation surface (README and/or CHANGELOG), with no in-product detector in scope. (8) Added a _Behavioral delta and test impact_ subsection naming the BREAKING changes (abort-to-partial, fence indentation tightening, CRLF preservation) and the existing tests that encode the old contract — the abort error-string assertions and the over-indented-fence test around `headingTransform.test.ts:120-128` — so test remediation is in implementation scope. Auto-fixes: added a decrement variant to the code-block-protection criteria (WT-005); the bare-heading criterion now carries explicit trailing whitespace and asserts preservation (WT-006); fence opener/closer lines are never evaluated as ATX headings, with a ` ```# section ` info-string criterion (BK-005); a trailing `\r` is treated as a CRLF artifact for closing-fence recognition, with a CRLF closing-fence criterion (BK-007); the error-handling defect list was de-duplicated into a defect-to-requirement mapping, the context-independence constraint demoted to a corollary, the vague cross-scope criterion rewritten as a concrete scenario, and the multi-selection cross-reference shortened (GR-002/003/004/005, form only); and a sentence on the user-visible outcome of removing the abort was added (OR-005). Open questions now resolved to "None."
