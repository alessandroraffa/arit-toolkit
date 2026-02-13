# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

Only the latest published version of ARIT Toolkit receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use one of the following methods:

1. **GitHub Security Advisories (preferred):** Use the [Report a vulnerability](https://github.com/alessandroraffa/arit-toolkit/security/advisories/new) feature on GitHub
2. **Email:** Contact the maintainer directly via the email associated with the [@alessandroraffa](https://github.com/alessandroraffa) GitHub profile

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

This security policy applies to the ARIT Toolkit VS Code extension source code and its published artifacts (`.vsix` packages on the VS Code Marketplace and GitHub Releases).

## Dependencies

This extension has zero runtime dependencies. All code is bundled at build time via esbuild. Development dependencies are monitored via `pnpm audit` in CI and automated dependency updates via Dependabot.
