# Marketplace Availability Verification

Use this runbook to answer one question: **is a published version actually
downloadable by VS Code clients yet?**

Publishing is not a single event. A release passes through GitHub, then
`vsce publish`, then an asynchronous Marketplace validation, then propagation to
the CDN that clients resolve through. Each stage can succeed while a later one
fails, and several of them fail _silently_. The surfaces below routinely
disagree with each other, so check the one that matches the question you are
actually asking.

## Quick check

```bash
pnpm run check:marketplace                 # is the version in package.json downloadable?
pnpm run check:marketplace -- --version 2.11.2
pnpm run check:marketplace -- --any        # does the extension resolve at all?
pnpm run check:marketplace -- --wait       # poll until available (default 30 min)
pnpm run check:marketplace -- --wait --timeout 60
```

Exit codes make it scriptable:

| Code | Verdict            | Meaning                                                                                                          |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 0    | `available`        | Clients can download the requested version now.                                                                  |
| 2    | `pending`          | The extension is healthy but still serving an older version. Publication is in flight.                           |
| 3    | `missing`          | No client-facing surface resolves the extension, while the control does. Something is wrong with this extension. |
| 4    | `gallery-degraded` | The control extension fails too. Conclude nothing; re-check later.                                               |

The checker always probes a third-party control extension alongside yours. Without
a control you cannot tell "my extension is gone" from "the gallery is having a
bad day", and that distinction changes what you do next.

## The surfaces, and what each one proves

| Surface         | URL                                                                                                                        | What a 200 proves                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **CDN gallery** | `https://www.vscode-unpkg.net/_gallery/<publisher>/<name>/latest`                                                          | **The one that matters.** This is `extensionUrlTemplate` in VS Code's `product.json` — what installed clients actually resolve through. |
| REST gallery    | `POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`                                            | `vsce` and web clients can see it. Returns HTTP 200 with an empty `extensions` array when absent, so check the array, not the status.   |
| Item page       | `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>`                                                   | The human-visible listing exists. Can lag behind the CDN after a publish.                                                               |
| VSIX asset      | `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/<publisher>/vsextensions/<name>/<version>/vspackage` | That exact version is downloadable.                                                                                                     |
| Publisher page  | `https://marketplace.visualstudio.com/publishers/<publisher>`                                                              | The publisher record survives. A non-existent publisher returns 404, so this is a meaningful test.                                      |
| Real client     | `code --install-extension <publisher>.<name>`                                                                              | VS Code's own resolver can find it. The most faithful end-to-end check.                                                                 |

Read `product.json` yourself if the endpoints ever change:

```bash
python3 -c "import json;print(json.load(open('/Applications/Visual Studio Code.app/Contents/Resources/app/product.json'))['extensionsGallery'])"
```

## Signals upstream of the gallery

These tell you whether a publish was even attempted, before availability is a
meaningful question.

- **GitHub release and tag** — `gh release list`. semantic-release creates the
  tag, the `chore(release): x.y.z [skip ci]` commit, and attaches the VSIX.
  No tag means no publish was attempted.
- **Release workflow log** — a green run is **not** proof of publication. When two
  PRs are merged within the same minute, the first run reaches semantic-release
  after the second push has landed and logs
  `The local branch main is behind the remote one, therefore a new version won't be published` —
  then exits **successfully** having published nothing. Grep the log for that line.
- **Validation email** from `vsmarketplace@microsoft.com` — arrives minutes _after_
  the workflow succeeds, and can say `[Failed]`. Validation is asynchronous and
  independent of CI. The failure email links a verification log that requires a
  signed-in session to read.

## What does NOT prove availability

Every item here has produced a false "it's fine" reading.

- **Your own VS Code.** Once installed, the extension keeps working and keeps
  showing its marketplace metadata regardless of gallery state. Opening a new
  window does not re-query anything.
- **A cached VSIX.** VS Code keeps the downloaded package at
  `~/Library/Application Support/Code/CachedExtensionVSIXs/<publisher>.<name>-<version>`.
  It will offer that version from disk long after the gallery stopped serving it.
  Check the file's mtime and `__metadata.installedTimestamp` in the installed
  extension's `package.json` to see _when_ it was really fetched.
- **"Restart Required" / "Last Released N days ago"** in the Extensions view —
  frozen local state from the last successful fetch.
- **README shields.io badges.** They query the Marketplace and render `unknown`
  when it cannot find the extension — useful as a corroborating signal, but they
  cache, so they lag both ways.
- **A green CI run.** CI never talks to the Marketplace.

## If the extension is missing

1. Run `pnpm run check:marketplace -- --any` and confirm the control is healthy.
2. Check the signed-in publisher page at
   `https://marketplace.visualstudio.com/manage/publishers/<publisher>`, which
   shows state the public APIs do not expose.
3. Check the mailbox for `vsmarketplace@microsoft.com`, including spam.
4. Users are not stranded: every GitHub release carries its VSIX, so an install
   from file always works.

   ```bash
   gh release download v2.11.1 --pattern '*.vsix'
   code --install-extension tangyr-2.11.1.vsix
   ```

Do not retry the release repeatedly while the listing is absent. `vsce verify-pat`
answers identity-scoped failures — `RequestBlockedException` naming resource
`Concurrency` in namespace `VSID`, or a plain HTTP 503 — that read like a bad
token but are not. Establish availability first, then publish.
