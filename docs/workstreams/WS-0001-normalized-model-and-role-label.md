---
title: 'Normalized model extension and role label change'
plan: 202603151100-enriched-turn-metadata-plan
workstream: WS-0001
status: 'draft'
workspaces: []
dependencies: []
created: 2026-03-15
---

This workstream implements Increment 1 of the enriched turn metadata plan. It establishes the data contract by extending the `NormalizedTurn` interface with three optional metadata fields, updates the renderer to change the role label from "Assistant" to "Agent" and to conditionally display the new fields, and updates the renderer test suite to cover all new behaviors. No parser changes are required — the new fields are optional and existing parsers omit them by convention, following the same pattern as the existing `thinking` field.

## Execution instructions

Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `agent-coding/procedures/execution-protocol.md`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/skills/draft-review/SKILL.md` to validate the workstream. Read the implementation plan, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any npm/pnpm scripts. If the workstream status is `idle`, set it to `in-progress`. If no plan branch exists yet, create the branch `feat/enriched-turn-metadata` from `main` and push it to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" before moving to the next task.

**Before each commit** → run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`.

## Activities, Tasks and Subtasks

### [ ] Activity 1: Extend the normalized turn interface

#### [ ] Task 1.1: Add three optional metadata fields to `NormalizedTurn`

Open `src/features/agentSessionsArchiving/markdown/types.ts`. After the existing `readonly thinking?: string;` line on the `NormalizedTurn` interface, add the following three properties in this order:

```typescript
readonly timestamp?: string;
readonly agentName?: string;
readonly skillName?: string;
```

Each property is `readonly` and optional (`?`), matching the `thinking` field pattern. Do not assign `undefined` anywhere — `exactOptionalPropertyTypes: true` requires population by omission. No other changes to this file.

#### [ ] Task 1.2: Verify existing parsers compile without modification

Run `pnpm run check-types`. Confirm the type checker reports zero errors. The new fields are optional; existing parsers that do not reference them require no changes. If the type checker reports errors in any parser file, the interface change introduced a structural incompatibility — stop and escalate to the project manager before proceeding.

#### [ ] Task 1.3: Update impacted documentation

No external documentation changes required — the new fields are self-documented in the TypeScript interface. Update workstream file checkboxes.

#### [ ] Task 1.4: Commit changes

Commit `src/features/agentSessionsArchiving/markdown/types.ts` and this workstream file. Use commit message: `feat(agentSessionsArchiving): add timestamp, agentName, skillName to NormalizedTurn`.

### [ ] Activity 2: Update the renderer

#### [ ] Task 2.1: Change the role label from "Assistant" to "Agent" and add agent name support

Open `src/features/agentSessionsArchiving/markdown/renderer.ts`. Locate the `renderTurn` function. Replace the line:

```typescript
const roleLabel = turn.role === 'user' ? 'User' : 'Assistant';
```

with:

```typescript
const agentLabel =
  turn.role !== 'user' && turn.agentName ? `Agent(${turn.agentName})` : 'Agent';
const roleLabel = turn.role === 'user' ? 'User' : agentLabel;
```

This makes `roleLabel` equal to `'User'` for user turns, `'Agent(agent-name)'` for non-user turns with an agent name, and `'Agent'` for non-user turns without an agent name.

#### [ ] Task 2.2: Add timestamp rendering adjacent to the role label

In `renderer.ts`, in the `renderTurn` function, add a timestamp formatting helper and incorporate the timestamp into the role label line. Insert the following private helper function at module scope (after the existing `renderFileList` function or similar position, keeping module-level functions grouped):

```typescript
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
```

Then, in the `renderTurn` function, immediately after the `roleLabel` assignment lines added in Task 2.1, add:

```typescript
const timestampSuffix = turn.timestamp ? ` — ${formatTimestamp(turn.timestamp)}` : '';
```

Change the two render lines that use `roleLabel` from:

```typescript
lines.push(`**${roleLabel}:** ${turn.content}`, '');
// and
lines.push(`**${roleLabel}:**`, '');
```

to:

```typescript
lines.push(`**${roleLabel}:**${timestampSuffix} ${turn.content}`, '');
// and
lines.push(`**${roleLabel}:**${timestampSuffix}`, '');
```

The timestamp appears directly after the colon and before any content, separated by `—` (space, em dash, space). When no timestamp is present, `timestampSuffix` is an empty string and the output is identical to the previous format except for the "Agent" label change.

#### [ ] Task 2.3: Add skill name annotation before content sections

In `renderer.ts`, add a helper function for skill annotation rendering and invoke it in `renderTurn`. Insert at module scope:

```typescript
function renderSkillAnnotation(skillName: string | undefined): string[] {
  if (!skillName) return [];
  return [`> **Skill:** ${skillName}`, ''];
}
```

In the `renderTurn` function body, after the role label lines and before the `renderToolsSection` call, insert:

```typescript
lines.push(...renderSkillAnnotation(turn.skillName));
```

The annotation renders as a markdown blockquote line `> **Skill:** skill-name` followed by a blank line. When `skillName` is undefined, the helper returns an empty array and no output is produced.

#### [ ] Task 2.4: Update impacted documentation

No documentation changes are required for this activity beyond the workstream file checkbox updates.

#### [ ] Task 2.5: Commit changes

Commit `src/features/agentSessionsArchiving/markdown/renderer.ts` and this workstream file. Use commit message: `feat(agentSessionsArchiving): update renderer for Agent label, timestamp, and skill annotation`.

### [ ] Activity 3: Update the renderer test suite

#### [ ] Task 3.1: Update existing renderer tests that assert "Assistant:" label

Open `test/unit/features/agentSessionsArchiving/markdown/renderer.test.ts`. Apply the following replacements throughout the file:

1. Replace every occurrence of `expect(md).toContain('**Assistant:** ...)` with `expect(md).toContain('**Agent:** ...)` — preserving the text that follows the colon.
2. Replace every occurrence of `expect(md).toContain('**Assistant:**')` (no trailing content) with `expect(md).toContain('**Agent:**')`.
3. Leave `expect(md).not.toContain('**Assistant:**')` assertions unchanged — they now correctly verify that the old label does not appear.
4. Replace the regex match `md.match(/\*\*Assistant:\*\*/g)` with `md.match(/\*\*Agent:\*\*/g)`.

The affected test cases (find them by name, not line number): "should render assistant turn with tools", "should render thinking in details block", "should render files modified", "should not render empty sections", "should render multiple turns with role prefixes", "should skip empty assistant turns" (both the regex match and the toContain assertion), "should skip whitespace-only assistant turns", and "should keep turn with only thinking".

#### [ ] Task 3.2: Add new renderer tests for timestamp, agent name, skill name, and combinations

In `renderer.test.ts`, after the last existing `it(...)` block and before the closing `});` of the top-level `describe`, add the following new test cases:

**Test: timestamp renders in turn header when present**

```typescript
it('should render timestamp adjacent to role label when present', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'assistant',
        content: 'Hello.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
        timestamp: '2026-03-15T10:30:00.000Z',
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  expect(md).toContain('**Agent:**');
  expect(md).toContain('2026-03-15');
  expect(md).toContain('10:30:00');
});
```

**Test: no timestamp placeholder when timestamp absent**

```typescript
it('should not render timestamp placeholder when timestamp absent', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'assistant',
        content: 'Hello.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  expect(md).toContain('**Agent:** Hello.');
  expect(md).not.toContain(' — ');
});
```

**Test: agent name renders in role label when present**

```typescript
it('should render agent name in role label when present', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'assistant',
        content: 'Subagent response.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
        agentName: 'code-review-agent',
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  expect(md).toContain('**Agent(code-review-agent):** Subagent response.');
  expect(md).not.toContain('**Agent:** Subagent response.');
});
```

**Test: role label is plain "Agent:" when agent name absent**

```typescript
it('should render plain Agent label when agent name absent', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'assistant',
        content: 'Response.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  expect(md).toContain('**Agent:** Response.');
  expect(md).not.toContain('**Agent():**');
});
```

**Test: skill annotation renders before content when present**

```typescript
it('should render skill annotation before content when skill name present', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'assistant',
        content: 'Skill output.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
        skillName: 'code-review',
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  const skillPos = md.indexOf('> **Skill:** code-review');
  const contentPos = md.indexOf('Skill output.');
  expect(skillPos).toBeGreaterThan(-1);
  expect(contentPos).toBeGreaterThan(skillPos);
});
```

**Test: no skill annotation when skill name absent**

```typescript
it('should not render skill annotation when skill name absent', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'assistant',
        content: 'Plain response.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  expect(md).not.toContain('> **Skill:**');
});
```

**Test: timestamp renders on user turn when present**

```typescript
it('should render timestamp on user turn when present', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'user',
        content: 'Hello.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
        timestamp: '2026-03-15T09:00:00.000Z',
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  expect(md).toContain('**User:**');
  expect(md).toContain('2026-03-15');
  expect(md).toContain('09:00:00');
});
```

**Test: all three fields render correctly when all present**

```typescript
it('should render timestamp, agent name, and skill annotation when all three fields present', () => {
  const session: NormalizedSession = {
    providerName: 'claude-code',
    providerDisplayName: 'Claude Code',
    sessionId: 'test',
    turns: [
      {
        role: 'assistant',
        content: 'Full metadata response.',
        toolCalls: [],
        filesRead: [],
        filesModified: [],
        timestamp: '2026-03-15T10:30:00.000Z',
        agentName: 'analysis-agent',
        skillName: 'analysis',
      },
    ],
  };

  const md = renderSessionToMarkdown(session);

  expect(md).toContain('**Agent(analysis-agent):**');
  expect(md).toContain('2026-03-15');
  const skillPos = md.indexOf('> **Skill:** analysis');
  const contentPos = md.indexOf('Full metadata response.');
  expect(skillPos).toBeGreaterThan(-1);
  expect(contentPos).toBeGreaterThan(skillPos);
});
```

#### [ ] Task 3.3: Run the quality gate

Run `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three commands must exit with code 0. If any test fails, fix the test or the implementation before proceeding — do not mark this task complete until all three pass.

#### [ ] Task 3.4: Update impacted documentation

No additional documentation changes are required. Update workstream file checkboxes.

#### [ ] Task 3.5: Commit changes

Commit `test/unit/features/agentSessionsArchiving/markdown/renderer.test.ts` and this workstream file. Use commit message: `test(agentSessionsArchiving): update and extend renderer tests for enriched turn metadata`.

## Divergences and notes

_None recorded._

### Reflection

_To be compiled at workstream completion._
