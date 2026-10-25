# Security Policy

## Reporting a Vulnerability

Please do **not** open a public issue for security concerns. Use GitHub
Security Advisories (private):
<https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/security/advisories/new>

I'll acknowledge receipt within a few business days and coordinate a fix +
disclosure timeline with you.

## Scope

Command Bar Studio is a client-side visual designer for Dataverse classic
ribbon / command bar customizations. It runs embedded in Power Platform
ToolBox (PPTB) and talks to Dataverse only through the host's
`dataverseAPI` bridge. Vulnerability reports of interest:

- **Authentication / token handling** — any path that could leak a
  Dataverse access token, the PPTB session token, or a connection's
  credentials from the host bridge.
- **Cross-site / injection** — XSS or markup injection via labels,
  tooltips, rule values, web resource content, icon SVGs, or imported
  RibbonDiffXml rendered in the canvas, XML drawer or diff viewer.
- **Generated customizations** — paths where the studio could emit
  RibbonDiffXml or a solution package that does something other than what
  the user designed (e.g. injecting commands, rules or web resources the
  user didn't add).
- **CSP / sandbox escape** — anything that lets studio code execute
  outside the host's iframe / allowed origins, or fetch from a
  non-Dataverse host.
- **Local persistence** — the auto-saved draft in `localStorage` being
  read across org scopes, or a crafted draft triggering code execution on
  restore.
- **Dependency vulnerabilities** — known CVEs in production dependencies
  (`@fluentui/*`, `monaco-editor`, `fflate`, etc.) that affect the shipped
  bundle.

## Out of scope

- **Changes the user makes to their own environment** — publishing ribbon
  customizations is the tool's purpose; the user is responsible for what
  they publish. Use a development environment first.
- **Behavior of JavaScript web resources or Power Fx** that the user
  writes and wires to commands — the studio only references them.
- **Dev-only tooling** (anything under `dev/`) — it is not part of the
  published npm package.

## Supported versions

| Version | Supported |
|---|---|
| The current stable release (npm `latest`) | ✅ Fixes and security fixes |
| The previous minor release | ✅ Critical and security fixes for 30 days after the next minor ships (npm `support-X.Y`) |
| Betas (npm `beta`) | Fixed in the next beta |
| Anything older | ❌ |

**Everything before 0.7.0 is deprecated on npm and gets no further fixes**, 0.6.x and
0.5.x included:
- **Before 0.6.2:** these versions bundle DOMPurify 3.2.7 (in the Monaco editor), which has
  critical advisories.
- **0.6.x:** it gets no support window after 0.7.0, because 0.7.0 needs the same Power
  Platform ToolBox (1.2.7). Update to 0.7.0.

Use 0.7.0 or later, which requires Power Platform ToolBox 1.2.7 or later; users on an older
PPTB need to update it. The previous-minor support window applies from 0.7 on, to 0.7.x after
0.8.0 ships. See [RELEASING.md](RELEASING.md) → *Supported versions*.

Thanks for helping keep the tool safe.
