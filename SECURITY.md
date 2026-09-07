# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

Only the latest published version of Tangyr Workbench receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use one of the following methods:

1. **Email:** Contact the maintainer directly via the email associated with the [@alessandroraffa](https://github.com/alessandroraffa) GitHub profile
2. **GitHub Security Advisories:** Available to collaborators with repository access

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 7 days
- **Fix and release:** As soon as possible, depending on severity

### After Reporting

- You will receive an acknowledgment within 48 hours
- The maintainer will investigate and provide a timeline for a fix
- Once resolved, a security advisory will be published along with a patched release
- Credit will be given to the reporter unless anonymity is requested

## Scope

This security policy applies to the Tangyr Workbench VS Code extension source code and its published artifacts (`.vsix` packages on the VS Code Marketplace and GitHub Releases).

## Dependencies

The extension declares no runtime dependencies to be resolved on the user's
machine: everything it needs is bundled at build time by esbuild. Two libraries
are compiled into that bundle, both for offline token counting:

- [`js-tiktoken`](https://www.npmjs.com/package/js-tiktoken)
- [`@anthropic-ai/tokenizer`](https://www.npmjs.com/package/@anthropic-ai/tokenizer)

Their vocabulary tables are static data and account for roughly 98% of the
bundle's size; the extension's own compiled code is about 119 KB. Both
licenses are reproduced in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Development dependencies are monitored by `pnpm audit` in CI, with automated
updates through Dependabot.

## Transparency of the published artifact

The published bundle is **not minified**, and ships with a source map, so the
JavaScript that runs on a user's machine can be read directly and traced back to
the TypeScript in this repository. This is a deliberate trade of about 2% in
package size against verifiability.

The extension makes no network request, collects no telemetry, and executes no
code from session content. [PRIVACY.md](PRIVACY.md) lists the exact paths it
reads and gives commands that check these claims against the published `.vsix`.
