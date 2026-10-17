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

Only the latest released minor version on `main` receives security fixes.

Thanks for helping keep the tool safe.
