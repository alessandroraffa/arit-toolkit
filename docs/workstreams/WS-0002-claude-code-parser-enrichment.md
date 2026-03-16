---
title: 'Claude Code parser enrichment'
plan: 202603151100-enriched-turn-metadata-plan
workstream: WS-0002
status: 'in-progress'
workspaces: []
dependencies: [WS-0001]
created: 2026-03-15
---

This workstream implements Increment 2 of the enriched turn metadata plan. It populates the three new metadata fields — `timestamp`, `agentName`, and `skillName` — in the Claude Code parser by extracting them from the JSONL event data. It depends on WS-0001, which established the `NormalizedTurn` interface fields and the renderer's ability to display them. No changes are required to other parsers (Cline/Roo Code, Codex, Copilot Chat, Continue) — they leave the new fields undefined by omission, as permitted by the optional-field convention.

## Execution instructions

Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `agent-coding/procedures/execution-protocol.md`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/skills/draft-review/SKILL.md` to validate the workstream. Verify that WS-0001 has status `completed` before starting. Read the implementation plan, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. If the workstream status is `idle`, set it to `in-progress`. The branch `feat/enriched-turn-metadata` already exists from WS-0001 — check it out, do not create a new branch.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" before moving to the next task.

**Before each commit** → run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. Verify that no additional workstream is needed for the plan, then propose the PR and merge to the project manager.

## Activities, Tasks and Subtasks

### [x] Activity 1: Extend the Claude Code parser's internal types and turn construction

#### [x] Task 1.1: Add `timestamp` field to the `JsonlEvent` interface

Open `src/features/agentSessionsArchiving/markdown/parsers/claudeCodeParser.ts`. Locate the `JsonlEvent` interface. Add `timestamp?: string;` as a direct property of the interface (not inside `message`), after the `type: string;` line:

```typescript
interface JsonlEvent {
  type: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}
```

The `timestamp` field on a JSONL event is a top-level property (not nested inside `message`), present on `user` and `assistant` event objects as an ISO 8601 string.

#### [x] Task 1.2: Extend `PendingState` and `makeTurn` to carry and propagate the new metadata fields

In `claudeCodeParser.ts`, apply the following two changes:

**Change 1 — Extend `PendingState`.** Add three optional string fields after `filesModified`:

```typescript
interface PendingState {
  toolCalls: ToolCall[];
  thinking: string;
  filesRead: string[];
  filesModified: string[];
  timestamp?: string;
  agentName?: string;
  skillName?: string;
}
```

**Change 2 — Extend `makeTurn` to conditionally include the new fields.** The current `makeTurn` function uses a `base` object and conditionally spreads `thinking`. Apply the same pattern for the three new fields. Replace the `makeTurn` function body with:

```typescript
function makeTurn(params: {
  role: 'user' | 'assistant';
  content: string;
  toolCalls: readonly ToolCall[];
  thinking: string;
  filesRead: readonly string[];
  filesModified: readonly string[];
  timestamp?: string;
  agentName?: string;
  skillName?: string;
}): NormalizedTurn {
  const {
    role,
    content,
    toolCalls,
    filesRead,
    filesModified,
    thinking,
    timestamp,
    agentName,
    skillName,
  } = params;
  const base: NormalizedTurn = { role, content, toolCalls, filesRead, filesModified };
  const withThinking: NormalizedTurn = thinking ? { ...base, thinking } : base;
  const withTimestamp: NormalizedTurn = timestamp
    ? { ...withThinking, timestamp }
    : withThinking;
  const withAgentName: NormalizedTurn = agentName
    ? { ...withTimestamp, agentName }
    : withTimestamp;
  return skillName ? { ...withAgentName, skillName } : withAgentName;
}
```

This preserves the omission-based pattern for all optional fields. `exactOptionalPropertyTypes: true` requires that optional fields are never explicitly set to `undefined`.

**Change 3 — Update `emptyPending`.** The `emptyPending` function returns a `PendingState`. The new optional fields (`timestamp`, `agentName`, `skillName`) do not need to be initialized in `emptyPending` — they are optional and will be absent by omission when not set. No change required to `emptyPending`.

#### [x] Task 1.3: Update impacted documentation

No documentation changes are required for this activity beyond workstream file checkbox updates.

#### [x] Task 1.4: Commit changes

Commit `src/features/agentSessionsArchiving/markdown/parsers/claudeCodeParser.ts` and this workstream file. Use commit message: `feat(agentSessionsArchiving): extend claude code parser internal types for metadata fields`.

### [x] Activity 2: Implement metadata extraction in the Claude Code parser

#### [x] Task 2.1: Extract timestamp from `user` and `assistant` events

In `claudeCodeParser.ts`, locate the `processUserEvent` method. It currently calls `makeTurn` with a literal object. Change it to extract and validate the timestamp from the event, then pass it to `makeTurn`:

```typescript
private processUserEvent(event: JsonlEvent, turns: NormalizedTurn[]): void {
  const text = extractText(event.message?.content);
  if (text) {
    const validTimestamp = parseTimestamp(event.timestamp);
    const turnParams: Parameters<typeof makeTurn>[0] = {
      role: 'user',
      content: text,
      toolCalls: [],
      thinking: '',
      filesRead: [],
      filesModified: [],
    };
    if (validTimestamp) turnParams.timestamp = validTimestamp;
    turns.push(makeTurn(turnParams));
  }
}
```

Add the `parseTimestamp` module-level helper function before `makeTurn`:

```typescript
function parseTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : value;
}
```

`parseTimestamp` returns the original ISO 8601 string if valid (parseable by `new Date()`), or `undefined` if the value is absent or results in an invalid date. The raw string is stored in the model — formatting is the renderer's responsibility.

For the `processAssistantEvent` method: it calls `makeTurn({ role: 'assistant', content: text, ...pending })`. The spread of `pending` now includes the optional metadata fields when present. No structural change is needed to the `processAssistantEvent` call site — the `...pending` spread already propagates any fields set on `PendingState`, including the new optional ones. The timestamp for assistant events must be captured before `emptyPending()` is returned. Add timestamp capture at the start of `processAssistantEvent`:

```typescript
private processAssistantEvent(
  event: JsonlEvent,
  turns: NormalizedTurn[],
  pending: PendingState
): PendingState {
  const validTimestamp = parseTimestamp(event.timestamp);
  if (validTimestamp) pending.timestamp = validTimestamp;

  const textParts: string[] = [];
  for (const block of getBlocks(event.message?.content)) {
    this.processAssistantBlock(block, textParts, pending);
  }

  const text = textParts.join('\n\n');
  if (text || pending.toolCalls.length > 0 || pending.thinking) {
    turns.push(makeTurn({ role: 'assistant', content: text, ...pending }));
  }
  return emptyPending();
}
```

#### [x] Task 2.2: Extract agent name from `Agent` tool_use blocks

In `claudeCodeParser.ts`, locate the `processAssistantBlock` method. The block processing for `tool_use` blocks calls `processToolUseBlock`. Agent tool_use blocks have `block.name === 'Agent'` and carry `block.input.subagent_type` as the agent name.

Add a module-level helper function:

```typescript
function toKebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function sanitizeName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const kebab = toKebabCase(value);
  return kebab.length > 0 ? kebab : undefined;
}
```

`toKebabCase` splits PascalCase/camelCase word boundaries with hyphens, replaces spaces and underscores with hyphens, collapses consecutive hyphens, and lowercases the result (e.g., `"Explore"` → `"explore"`, `"CodeReview"` → `"code-review"`, `"code_review"` → `"code-review"`). `sanitizeName` returns `undefined` for non-string, empty, or whitespace-only values after normalization, as required by SPEC-001.

In the `processAssistantBlock` method, add detection of `Agent` tool_use blocks after the existing `tool_use` branch:

```typescript
private processAssistantBlock(
  block: ContentBlock,
  textParts: string[],
  pending: PendingState
): void {
  if (block.type === 'text' && block.text) textParts.push(block.text);
  if (block.type === 'thinking' && block.thinking) {
    pending.thinking += (pending.thinking ? '\n\n' : '') + block.thinking;
  }
  if (block.type === 'tool_use') {
    processToolUseBlock(block, pending);
    if (block.name === 'Agent') {
      const agentName = sanitizeName(block.input?.subagent_type);
      if (agentName) pending.agentName = agentName;
    }
  }
}
```

The `subagent_type` field on the `Agent` tool_use block's `input` is already typed as `Record<string, unknown>` on `ContentBlock`, so access via `block.input?.subagent_type` is valid. `sanitizeName` returns `undefined` for empty or whitespace-only strings, which keeps the field absent by omission as required.

**Note:** If a single assistant event contains multiple `Agent` tool_use blocks (rare but possible), the last one wins — `pending.agentName` is overwritten. This is an acceptable simplification: multiple subagent delegations in a single turn are not a realistic scenario in current Claude Code output.

#### [x] Task 2.3: Extract skill name from `Skill` tool_use blocks

In `claudeCodeParser.ts`, in the `processAssistantBlock` method, add detection of `Skill` tool_use blocks after the `Agent` detection added in Task 2.2:

```typescript
if (block.name === 'Skill') {
  const skillName = sanitizeName(block.input?.skill);
  if (skillName) pending.skillName = skillName;
}
```

The full updated `tool_use` branch in `processAssistantBlock` now reads:

```typescript
if (block.type === 'tool_use') {
  processToolUseBlock(block, pending);
  if (block.name === 'Agent') {
    const agentName = sanitizeName(block.input?.subagent_type);
    if (agentName) pending.agentName = agentName;
  }
  if (block.name === 'Skill') {
    const skillName = sanitizeName(block.input?.skill);
    if (skillName) pending.skillName = skillName;
  }
}
```

#### [x] Task 2.4: Update impacted documentation

No documentation changes are required for this activity beyond workstream file checkbox updates.

#### [x] Task 2.5: Commit changes

Commit `src/features/agentSessionsArchiving/markdown/parsers/claudeCodeParser.ts` and this workstream file. Use commit message: `feat(agentSessionsArchiving): extract timestamp, agent name, and skill name in claude code parser`.

### [ ] Activity 3: Add parser unit tests and run the quality gate

#### [ ] Task 3.1: Add unit tests for timestamp extraction

Open `test/unit/features/agentSessionsArchiving/markdown/parsers/claudeCodeParser.test.ts`. After the last existing `it(...)` block and before the closing `});` of the top-level `describe`, add:

**Test: timestamp extracted from user event**

```typescript
it('should extract timestamp from user event when valid ISO 8601', () => {
  const content = jsonl({
    type: 'user',
    timestamp: '2026-03-15T10:30:00.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.timestamp).toBe('2026-03-15T10:30:00.000Z');
});
```

**Test: timestamp extracted from assistant event**

```typescript
it('should extract timestamp from assistant event when valid ISO 8601', () => {
  const content = jsonl({
    type: 'assistant',
    timestamp: '2026-03-15T10:31:00.000Z',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there.' }] },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.timestamp).toBe('2026-03-15T10:31:00.000Z');
});
```

**Test: invalid timestamp treated as absent**

```typescript
it('should treat invalid timestamp as absent', () => {
  const content = jsonl({
    type: 'user',
    timestamp: 'not-a-date',
    message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.timestamp).toBeUndefined();
});
```

**Test: absent timestamp field produces undefined**

```typescript
it('should leave timestamp undefined when event has no timestamp field', () => {
  const content = jsonl({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.timestamp).toBeUndefined();
});
```

#### [ ] Task 3.2: Add unit tests for agent name extraction

In `claudeCodeParser.test.ts`, add:

**Test: agent name extracted from Agent tool_use block**

```typescript
it('should extract agentName from Agent tool_use block', () => {
  const content = jsonl({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Agent',
          id: 'tool-agent-1',
          input: { subagent_type: 'code-review-agent' },
        },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.agentName).toBe('code-review-agent');
});
```

**Test: empty agent name treated as absent**

```typescript
it('should treat empty subagent_type as absent agentName', () => {
  const content = jsonl({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Agent',
          id: 'tool-agent-2',
          input: { subagent_type: '   ' },
        },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.agentName).toBeUndefined();
});
```

**Test: PascalCase subagent_type is normalized to kebab-case**

```typescript
it('should normalize PascalCase subagent_type to kebab-case', () => {
  const content = jsonl({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Agent',
          id: 'tool-agent-3',
          input: { subagent_type: 'CodeReview' },
        },
        { type: 'text', text: 'Done.' },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.agentName).toBe('code-review');
});
```

**Test: non-Agent tool_use block does not set agentName**

```typescript
it('should not set agentName for non-Agent tool_use blocks', () => {
  const content = jsonl({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', name: 'Read', id: 'tool-3', input: { file_path: 'a.ts' } },
        { type: 'text', text: 'Done.' },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.agentName).toBeUndefined();
});
```

#### [ ] Task 3.3: Add unit tests for skill name extraction

In `claudeCodeParser.test.ts`, add:

**Test: skill name extracted from Skill tool_use block**

```typescript
it('should extract skillName from Skill tool_use block', () => {
  const content = jsonl({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Skill',
          id: 'tool-skill-1',
          input: { skill: 'code-review' },
        },
        { type: 'text', text: 'Skill complete.' },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.skillName).toBe('code-review');
});
```

**Test: PascalCase skill name is normalized to kebab-case**

```typescript
it('should normalize PascalCase skill name to kebab-case', () => {
  const content = jsonl({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Skill',
          id: 'tool-skill-3',
          input: { skill: 'CodeReview' },
        },
        { type: 'text', text: 'Done.' },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.skillName).toBe('code-review');
});
```

**Test: empty skill name treated as absent**

```typescript
it('should treat empty skill field as absent skillName', () => {
  const content = jsonl({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Skill',
          id: 'tool-skill-2',
          input: { skill: '' },
        },
        { type: 'text', text: 'Done.' },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.skillName).toBeUndefined();
});
```

**Test: turn with timestamp, agentName, and skillName all present**

```typescript
it('should populate all three metadata fields when all present in one assistant event', () => {
  const content = jsonl({
    type: 'assistant',
    timestamp: '2026-03-15T11:00:00.000Z',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Agent',
          id: 'tool-a',
          input: { subagent_type: 'analysis-agent' },
        },
        {
          type: 'tool_use',
          name: 'Skill',
          id: 'tool-s',
          input: { skill: 'analysis' },
        },
        { type: 'text', text: 'Analysis complete.' },
      ],
    },
  });

  const session = expectParsed(parser.parse(content, 'session-1'));

  expect(session.turns[0]!.timestamp).toBe('2026-03-15T11:00:00.000Z');
  expect(session.turns[0]!.agentName).toBe('analysis-agent');
  expect(session.turns[0]!.skillName).toBe('analysis');
});
```

#### [ ] Task 3.4: Run the quality gate

Run `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three commands must exit with code 0. If any test fails, fix the implementation or the test before proceeding — do not mark this task complete until all three pass.

#### [ ] Task 3.5: Update impacted documentation

Update the workstream file checkboxes. No additional documentation changes are required.

#### [ ] Task 3.6: Commit changes

Commit `test/unit/features/agentSessionsArchiving/markdown/parsers/claudeCodeParser.test.ts` and this workstream file. Use commit message: `test(agentSessionsArchiving): add parser tests for timestamp, agent name, and skill name extraction`.

## Divergences and notes

**Activity 1 — H1 heading removed from workstream file.** The workstream file as authored contained a `# Claude Code parser enrichment` H1 heading after the frontmatter. This triggered a markdownlint MD025 error (multiple top-level headings, since the frontmatter `title:` field also constitutes a document title). WS-0001 does not have an H1 heading and passed lint. The H1 was removed to match the WS-0001 pattern and satisfy the quality gate. No behavioral impact; the title is preserved in the frontmatter.

### Reflection

_To be compiled at workstream completion._
