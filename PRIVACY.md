# Privacy and data handling

Tangyr Workbench reads AI coding session files, which are among the most
sensitive things on a developer's machine. This document states exactly what it
touches, what it never does, and how to verify both claims yourself rather than
take them on trust.

**Nothing leaves your machine.** The extension makes no network request of any
kind. It collects no telemetry, no analytics, no usage statistics, and no crash
reports. It contacts no server, including the author's.

## What it reads

Only to discover sessions belonging to the currently open workspace:

| Source              | Location                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Claude Code         | `~/.claude/projects/<workspace-path>/`, and each `~/.claude-*/projects/<workspace-path>/` profile |
| OpenAI Codex        | `~/.codex/sessions/<YYYY>/<MM>/<DD>/`                                                             |
| OpenCode            | `~/.local/share/opencode/opencode.db` (read-only)                                                 |
| Continue            | `~/.continue/sessions/`                                                                           |
| Cline, RooCode      | VS Code global storage                                                                            |
| GitHub Copilot Chat | VS Code workspace storage (`chatSessions/`)                                                       |
| Aider               | `.aider.*` files in the workspace root                                                            |

Sessions that do not match the open workspace are ignored. The extension never
reads a session belonging to another project.

## What it writes

- Archived sessions, as Markdown, into the archive directory inside your
  workspace (`docs/archive/agent-sessions/` by default, configurable).
- Its own configuration file, `.tangyr.jsonc`, in the workspace root.

Nothing is written outside the open workspace, and no source session file is
modified or deleted.

## What it never does

- No network requests. No telemetry. No analytics. No error reporting.
- No credential handling. The extension neither reads nor stores secrets.
- No code execution from session content.
- The only subprocess it ever starts is
  `git check-ignore --quiet -- <path>`, with a fixed argument list and no
  shell, used to respect your `.gitignore`.

## Verify it yourself

These claims are checkable against the published package, without trusting this
document. Download the `.vsix` from the Marketplace or from a GitHub release,
unzip it, and inspect `extension/dist/extension.js`.

The bundle is shipped **unminified** and with a source map precisely so that it
can be read:

```bash
unzip -o tangyr-<version>.vsix -d tangyr-check
cd tangyr-check/extension

# No network API reaches the bundle.
grep -cE "\bfetch\(|XMLHttpRequest|node:https?|require\(.https?.\)" dist/extension.js

# No dynamic code execution.
grep -cE "\beval\(|new Function\(" dist/extension.js

# The only subprocess call.
grep -oE ".{60}child_process.{160}" dist/extension.js
```

Each of the first two commands prints `0`.

Roughly 98% of the bundle is static tokenizer vocabulary data from
[`js-tiktoken`](https://www.npmjs.com/package/js-tiktoken) and
[`@anthropic-ai/tokenizer`](https://www.npmjs.com/package/@anthropic-ai/tokenizer),
used for offline token counting. The extension's own compiled code is about
119 KB of that total.

## Your archived sessions are yours

Archiving copies session transcripts into your repository, where they become
ordinary files under your control and your version control. Consider whether
those transcripts should be committed, especially in a shared repository:
session content can contain anything you or the assistant typed. The archive
directory is gitignorable like any other path, and the extension respects
`.gitignore` when it looks for existing archives.

## Questions

Open an issue at
[github.com/alessandroraffa/tangyr-vscode/issues](https://github.com/alessandroraffa/tangyr-vscode/issues),
or for anything security-sensitive follow [SECURITY.md](SECURITY.md).
