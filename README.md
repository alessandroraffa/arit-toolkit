<!-- markdownlint-disable MD041 -->

> This extension was previously published as `alessandroraffa.arit-toolkit`.
> If you have the old version installed, VS Code will show a Migrate button once Marketplace deprecation is processed.
> Your settings are copied automatically on first activation of this extension. The legacy `.arit-toolkit.jsonc` configuration file is migrated to `.tangyr.jsonc`, and the old file is then removed safely.

# Tangyr `▏▎▍▌▍▎▏` Workbench

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version/alessandroraffa.tangyr.png)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.tangyr)
[![Installs](https://vsmarketplacebadges.dev/installs/alessandroraffa.tangyr.png)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.tangyr)
[![Downloads](https://vsmarketplacebadges.dev/downloads/alessandroraffa.tangyr.png)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.tangyr)
[![Rating](https://vsmarketplacebadges.dev/rating/alessandroraffa.tangyr.png)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.tangyr&ssr=false#review-details)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Tangyr Workbench is the VS Code companion for agentic coding and vibe coding — turning AI coding sessions, decision logs, and prompt artifacts into versioned project material.

<!-- POPULARITY-INTRO:START -->

Chat sessions with Claude Code, OpenAI Codex, Cline, GitHub Copilot Chat, OpenCode, Aider, Continue, and RooCode are scattered across your filesystem — global storage, hidden directories, workspace storage. They don't survive a machine change, they aren't versioned with your code, and they're invisible to your team. Tangyr Workbench collects them automatically into your workspace, organized by date, as project artifacts.

<!-- POPULARITY-INTRO:END -->

In agentic and vibe coding workflows, documentation is not an afterthought — it is a project artifact. Decision logs, meeting notes, AI session transcripts: they all belong in the repository alongside the code they shaped. And the text you write — prompts, specs, context files — has a direct cost measured in tokens. Tangyr Workbench archives AI sessions from

<!-- POPULARITY-COUNT:START -->

8

<!-- POPULARITY-COUNT:END -->

assistants, creates timestamped files and folders for chronological project documentation, prefixes existing items with their creation date, and gives you real-time token counts and text metrics in the status bar — all without leaving VS Code.

## Agent Sessions Archiving

AI coding assistants store their session files in different locations and formats. Agent Sessions Archiving scans these sources periodically and copies the sessions that belong to the current workspace into a single archive directory, turning them into versionable project artifacts.

**Supported assistants:**

<!-- POPULARITY-TABLE:START -->

| Assistant           | Session location                            | Workspace matching                           |
| ------------------- | ------------------------------------------- | -------------------------------------------- |
| Claude Code         | `~/.claude/projects/<workspace-path>/`      | Project path derived from workspace          |
| OpenAI Codex        | `~/.codex/sessions/<YYYY>/<MM>/<DD>/`       | `cwd` field in session metadata              |
| Cline               | VS Code global storage                      | Session content references workspace path    |
| GitHub Copilot Chat | VS Code workspace storage (`chatSessions/`) | Per-workspace storage (`.json` and `.jsonl`) |
| OpenCode            | `~/.local/share/opencode/opencode.db`       | `directory` field in session row             |
| Aider               | Workspace root (`.aider.*` files)           | Files present in the workspace root          |
| Continue            | `~/.continue/sessions/`                     | Session content references workspace path    |
| RooCode             | VS Code global storage                      | Session content references workspace path    |

> **Note:** This popularity order is derived from public signals (downloads, installs, stars) and is not an endorsement, recommendation, or quality judgment of any assistant.
> Method: [PLAN-006](docs/plans/PLAN-006-assistant-popularity-ranking.md)
> As of: 2026-06

<!-- POPULARITY-TABLE:END -->

Missing your assistant? Contact the maintainer to request support.

**How it works:**

- Sessions are copied (not moved) to the archive directory
- Sessions are automatically converted to structured markdown during archiving
- Each session maps to exactly one archived file — when the source changes, the old archive is replaced
- Archive files are organized by year and month: `{archivePath}/{YYYY}/{MM}/{YYYYMMDDHHmm}-{name}.md`
- Existing flat-layout archives from earlier versions are migrated into the year/month structure automatically on activation
- The default archive path is `.tangyr/agent-sessions`. Workspaces still on the earlier default (`docs/archive/agent-sessions`) are migrated automatically — the configuration is updated and existing archives are relocated to the new path without loss; a custom `archivePath` you set yourself is preserved
- Only sessions belonging to the current workspace are archived
- Session file changes are detected automatically via file system watchers (with 10-second debounce), in addition to the periodic interval
- In a Git repository, you are prompted once per archive path to add it to `.gitignore`. The decision is remembered and re-evaluated when the archive path changes

**Configuration** (in `.tangyr.jsonc`):

```jsonc
{
  "agentSessionsArchiving": {
    "enabled": true,
    "archivePath": ".tangyr/agent-sessions",
    "intervalMinutes": 5,
    "ignoreSessionsBefore": "20250101",
  },
}
```

Set `ignoreSessionsBefore` to a `YYYYMMDD` date to skip sessions created before that date. Omit the field to archive everything.

**Toggle:** Command Palette → "Tangyr: Toggle Agent Sessions Archiving"

**Archive Now:** Command Palette → "Tangyr: Archive Agent Sessions Now" (also available in the status bar tooltip). Triggers an immediate archive cycle without waiting for the next interval.

## Timestamped Files and Folders

Create new files or directories with an automatic UTC timestamp prefix. Useful for meeting notes, decision logs, daily journals, or any artifact that benefits from chronological ordering.

**New file:** Right-click a folder → "Tangyr: New File with Timestamp" or `Ctrl+Alt+N` / `Cmd+Alt+N`
Creates `202602051430-meeting-notes.md`

**New folder:** Right-click a folder → "Tangyr: New Folder with Timestamp" or `Ctrl+Alt+Shift+N` / `Cmd+Alt+Shift+N`
Creates `202602051430-project-assets/`

## Prefix Creation Timestamp

Add the creation timestamp to existing files or directories. The timestamp is derived from the item's actual creation date. These commands are available only via the Explorer context menu (right-click), not from the Command Palette.

Right-click a file → "Tangyr: Prefix Creation Timestamp"
`report.pdf` → `202602051430-report.pdf`

Right-click a folder → "Tangyr: Prefix Creation Timestamp to Folder"
`assets/` → `202602051430-assets/`

## Text Stats

When you work with AI coding assistants, every file you feed into a conversation has a token cost. Knowing the token count of a prompt, a spec, or a context file before you send it helps you stay within model limits, estimate costs, and write more effective inputs. Text Stats gives you that visibility directly in VS Code.

Real-time text statistics displayed in the status bar. Shows character count, token count, word count, line count, paragraph count, estimated reading time, and file size — updated live as you type or select text.

**Status bar:** A dedicated item on the left side of the status bar shows a configurable summary. Click to change the tokenizer model. Hover for a detailed tooltip with all metrics.

**Selection-aware:** When text is selected, all metrics switch to cover only the selection. Multiple selections are joined with context-aware separators that preserve paragraph boundaries, line breaks, and word boundaries.

**Tokenizer models:** Choose between OpenAI `cl100k_base`, OpenAI `o200k_base`, or Anthropic `claude` tokenizer for accurate token counting. Token counting is lazy-loaded on first use and cached per model.

**Configuration** (in `.tangyr.jsonc`):

```jsonc
{
  "textStats": {
    "enabled": true,
    "delimiter": " | ",
    "unitSpace": true,
    "wpm": 200,
    "tokenizer": "o200k",
    "includeWhitespace": true,
    "tokenSizeLimit": 500000,
    "visibleMetrics": [
      "chars",
      "tokens",
      "words",
      "lines",
      "paragraphs",
      "readTime",
      "size",
    ],
  },
}
```

| Setting             | Default   | Description                                                  |
| ------------------- | --------- | ------------------------------------------------------------ |
| `enabled`           | `true`    | Enable or disable text stats                                 |
| `delimiter`         | `" \| "`  | Separator between metrics in the status bar                  |
| `unitSpace`         | `true`    | Space between value and unit (e.g., `42 chars`)              |
| `wpm`               | `200`     | Words per minute for reading time estimation                 |
| `tokenizer`         | `"o200k"` | Tokenizer model: `cl100k`, `o200k`, or `claude`              |
| `includeWhitespace` | `true`    | Include whitespace in character count                        |
| `tokenSizeLimit`    | `500000`  | Skip token counting for files exceeding this character count |
| `visibleMetrics`    | all 7     | Which metrics to show and in what order                      |

**Toggle:** Command Palette → "Tangyr: Toggle Text Stats"
**Change tokenizer:** Click the status bar item or Command Palette → "Tangyr: Change Tokenizer"

## Markdown Headings

Increment or decrement all markdown heading levels by one. Works on an entire file or just a selection.

**Increment** adds one `#` to each heading (`## Title` → `### Title`).
**Decrement** removes one `#` from each heading (`### Title` → `## Title`).

Headings at the level limit are skipped; the remaining headings in scope are still changed. When no heading is found or all headings are already at the limit, an information-level notice appears in the VS Code notification area. Headings inside fenced code blocks are left untouched.

**Known limitations.** Setext-style headings (underline with `===` or `---`) are not recognised or transformed. If a document uses setext headings exclusively, the command will show "No Markdown heading to change." Converting setext headings to ATX style before using this command keeps the document visibly in sync.

**Access:**

- **Editor context menu** (right-click in a `.md` file): operates on selection if present, otherwise on the entire file.
- **Explorer context menu** (right-click on a `.md` file): operates on the entire file.
- **Command Palette:** "Tangyr: Increment Markdown Headings" / "Tangyr: Decrement Markdown Headings"

## Extension Toggle

A **Tangyr** status bar item (bottom-right) shows the current state and lets you enable or disable advanced features with a click. Hover for a tooltip with active services and their status, with quick toggle buttons. A **Checkup** button in the tooltip runs a health check — it verifies version alignment, applies any pending config migration, preserves your customizations, and optionally commits the updated config file.

Command Palette → "Tangyr: Toggle Extension (Enable/Disable)" or "Tangyr: Checkup"

**Workspace initialization:** When you open a single-root workspace for the first time, Tangyr Workbench offers to create a `.tangyr.jsonc` configuration file at the workspace root. When the extension updates and introduces new configuration sections, you will be prompted to add them.

**Config auto-commit:** In a Git repository, when the extension writes changes to `.tangyr.jsonc` and the file is not gitignored, you are prompted to commit the change automatically. If the file has no actual Git changes, the prompt is skipped. Git hooks (pre-commit, commit-msg) are bypassed for these automated commits because VS Code's extension host process has a restricted environment where tools like `pnpm` may not be available.

**Workspace modes:**

- **Single-root workspace:** Full functionality. State persisted in `.tangyr.jsonc`.
- **Multi-root workspace:** Timestamp commands available. Toggle and archiving disabled; status bar shows limited mode.

## Why Tangyr Workbench

<!-- POPULARITY-FEATURES:START -->

- Archives sessions from Claude Code, OpenAI Codex, Cline, GitHub Copilot Chat, OpenCode, Aider, Continue, and RooCode into one place — no other extension does this

<!-- POPULARITY-FEATURES:END -->

- Archived files live in your workspace: version them with Git, share them with your team
- Real-time token counting with OpenAI and Anthropic tokenizers — know the cost of every file before you send it to an AI assistant
- Timestamps give you a consultable timeline of the work done on a project
- Minimal configuration: one `.tangyr.jsonc` file, sensible defaults
- Zero runtime dependencies — VS Code API only

## What's Next

- Support for additional assistants (Cursor, Windsurf)
- Full-text search across archived sessions
- Dashboard summarizing session activity per project
- Context window budgeting — track cumulative token usage across multiple files

## Configuration

| Setting                     | Default        | Description                              |
| --------------------------- | -------------- | ---------------------------------------- |
| `tangyr.timestampFormat`    | `YYYYMMDDHHmm` | Format for the timestamp prefix          |
| `tangyr.timestampSeparator` | `-`            | Separator between timestamp and filename |
| `tangyr.logLevel`           | `info`         | Logging level for debug output           |

**Timestamp formats:**

| Format           | Example                    | Description                    |
| ---------------- | -------------------------- | ------------------------------ |
| `YYYYMMDDHHmm`   | `202602051430`             | Year, month, day, hour, minute |
| `YYYYMMDD`       | `20260205`                 | Year, month, day only          |
| `YYYYMMDDHHmmss` | `20260205143022`           | Full timestamp with seconds    |
| `ISO`            | `2026-02-05T14-30-22-123Z` | ISO 8601 (with milliseconds)   |

## Keyboard Shortcuts

| Command                   | Windows/Linux      | macOS             | Context          |
| ------------------------- | ------------------ | ----------------- | ---------------- |
| New File with Timestamp   | `Ctrl+Alt+N`       | `Cmd+Alt+N`       | Explorer focused |
| New Folder with Timestamp | `Ctrl+Alt+Shift+N` | `Cmd+Alt+Shift+N` | Explorer focused |

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install alessandroraffa.tangyr`

### From VSIX File

1. Download the `.vsix` file from [Releases](https://github.com/alessandroraffa/tangyr-vscode/releases)
2. In VS Code, press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type "Install from VSIX" and select the downloaded file

## Requirements

- VS Code 1.109.0 or higher

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

## Contributing

This repository is private. Please contact the maintainer before proposing changes.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## About

Tangyr Workbench is built for developers who collaborate with AI coding assistants — across agentic flows where autonomous agents drive multi-step tasks, and vibe coding sessions where humans and models iterate quickly side by side. The extension complements the editor with session archiving, timestamped artifacts, and real-time text metrics so that AI-assisted work becomes versioned, reviewable project material.

**Alessandro Raffa** — [@alessandroraffa](https://github.com/alessandroraffa)
