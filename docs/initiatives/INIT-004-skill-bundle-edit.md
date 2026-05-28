---
title: 'In-bundle SKILL.md editing for skill packages'
status: draft
created: 2026-05-28
references:
  - docs/technical-context.md
---

## Objectives

1. Authors can edit the `SKILL.md` file inside a `.skill` bundle (ZIP archive) directly from VS Code, without manual extract/edit/repack shell workflows.
2. Bundles preserve byte-perfect integrity of all entries other than `SKILL.md` across every edit cycle: timestamps, attributes, and compressed bytes of unrelated files are identical before and after the user saves their edits.
3. Authors are protected from data loss across the full set of identified failure modes — bundle moved or deleted during editing, missing `SKILL.md` inside the bundle, corrupted archive, and concurrent open of the same bundle.
4. The feature respects the extension's zero-runtime-dependencies constraint: ZIP support enters through a dev-dependency bundled by esbuild, following the precedent established for the tokenizer libraries.

## Motivation

Skill bundles (`.skill`) are ZIP archives that encode the standard layout of a Claude-ecosystem skill: a mandatory `SKILL.md` manifest plus optional companion files (references, images, scripts). Authors of skill bundles need to iterate on the `SKILL.md` content during development.

VS Code today treats `.skill` files as opaque binaries: opening one produces a "Cannot open binary file" error. The current workaround is a manual sequence — extract the archive to a directory, edit `SKILL.md` with the standard editor, repack the directory back into the archive, delete the working directory. Each step is a friction point and an opportunity for error: forgetting the repack, repacking with wrong relative paths, accidentally committing the working directory, or losing metadata on unrelated files in the bundle.

The Tangyr Workbench extension is the natural integration point. It already provides authoring utilities for AI-coding artifacts (timestamped files, agent-session archiving, real-time text metrics), so integrating skill-bundle editing aligns with its product positioning. The user (project PM) authors skill bundles as a regular part of agent-coding work, and the missing in-editor workflow is a recurrent papercut.

## Scope

Included:

- A command and Explorer context-menu entry that opens the `SKILL.md` inside a selected `.skill` bundle for editing in the standard VS Code text editor.
- Automatic repack of the bundle on each save of the open `SKILL.md` buffer, preserving every other bundle entry byte-for-byte.
- Detection and recovery flow when the original bundle is moved, renamed, or deleted while the buffer is open, including a "save as new bundle" path that creates a fresh `.skill` containing the current buffer content plus the preserved other entries.
- Detection and prompt flow when the bundle does not contain `SKILL.md`: the user can elect to create one from a standard template that includes the required YAML frontmatter and guidance comments for skill authoring.
- Detection and abort flow when the file is not a valid ZIP archive or otherwise cannot be parsed, with a clear error message.
- Behavior that focuses the existing editor tab when the same bundle is opened a second time, instead of overwriting the in-progress buffer.
- Lifecycle management for the temporary extracted file: cleanup on tab close (both saved and unsaved closures) and a sweep of orphan temp files on every extension activation.

Excluded:

- Editing of any file other than `SKILL.md` inside the bundle (deferred until a concrete user need emerges).
- A tree view or browser of bundle contents.
- Registration as the default editor for `.skill` files (via `CustomEditorProvider`). The context-menu and command-palette entry points are sufficient for v1; promotion to default editor is a candidate v2 enhancement.
- A virtual file system provider (`skill://` URI scheme) that would let editors operate directly on bundle contents without temporary extraction.
- Creation of new `.skill` bundles ex novo: the user always starts from an existing bundle file.
- Multi-bundle or batch operations.

## Success criteria

- [ ] Right-clicking a `.skill` file in the Explorer shows a "Tangyr: Edit SKILL.md" entry that opens the `SKILL.md` content in a standard editor tab.
- [ ] The Command Palette exposes a "Tangyr: Edit SKILL.md from Bundle…" entry that prompts for a `.skill` file and opens it equivalently.
- [ ] Saving the open `SKILL.md` buffer (via any standard save trigger) updates the original `.skill` archive in place with the new content.
- [ ] After save, every entry in the bundle other than `SKILL.md` is byte-identical to the pre-save bundle (verified by checksum comparison on test fixtures).
- [ ] Opening the same `.skill` while a tab for its `SKILL.md` is already open reveals the existing tab and does not overwrite the buffer.
- [ ] Opening a `.skill` that does not contain `SKILL.md` shows a prompt offering to create one; on accept, a template-populated buffer opens and the next save adds `SKILL.md` to the bundle.
- [ ] Opening a `.skill` whose bytes are not a valid ZIP shows a clear error and does not create any temp file or tab.
- [ ] Moving, renaming, or deleting the source `.skill` while the buffer is open and then saving shows an error notification with a "Save as new bundle…" action that uses the standard save dialog to produce a new `.skill` containing the current buffer plus all preserved companion entries.
- [ ] Temp files under the extension's `globalStorageUri/skill-edits/` are deleted when the editor tab is closed (regardless of save state) and any residual files are deleted on the next extension activation.
- [ ] No new runtime dependencies appear in the extension's distribution. `fflate` is present as a dev dependency, bundled by esbuild, and the production bundle continues to declare zero runtime dependencies.
