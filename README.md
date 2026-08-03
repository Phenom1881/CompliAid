# CompliAid

**Compliance guidance, built for the field.** CompliAid helps emergency
managers, subrecipients, and recovery specialists navigate FEMA **Public
Assistance (PA)** requirements — faster, with fewer errors, and without the
guesswork. It's aimed at the people who actually carry the documentation
burden: small localities, nonprofits, and state recovery agencies working under
disaster-recovery pressure.

Live at **[compliaid.com](https://compliaid.com)**.

## The suite

| Tool | What it does |
| --- | --- |
| **REACT** (`react.html`) | An AI-powered FEMA PA compliance assistant. Ask questions in plain language and get answers grounded in PA policy. |
| **Documentation Checklist** (`checklist.html`) | Track required and submitted documents across FEMA PA Categories A–G (plus Direct Administrative Costs) for an active project worksheet. Progress and project details save on your device; export to CSV or print/PDF. |
| **DisasterData.IO** | County-level FEMA disaster-declaration visualization (external — [disasterdata.io](https://disasterdata.io)). |

## How it's built

A deliberately simple, dependency-free **static site** hosted on **GitHub
Pages** with a custom domain (`CNAME` → `compliaid.com`):

- Hand-written HTML with inline CSS — no framework, no build step.
- Vanilla JavaScript on the checklist (state persisted via `localStorage`).
- Fonts: Instrument Serif (display), DM Sans (body), DM Mono (metadata).
- REACT embeds a third-party Botpress webchat widget.
- Brand assets live in `assets/` (favicon, Open Graph share image).

To work on it locally, serve the repo root over HTTP so relative asset paths
resolve:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Disclaimer

CompliAid is a **guidance tool** and does not constitute legal, financial, or
official FEMA advice. Always verify compliance decisions with your FEMA program
delivery manager or state recipient.
