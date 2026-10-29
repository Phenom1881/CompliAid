# FieldICS

Offline ICS forms, activity logs, check-in, and cost documentation for local emergency management. It runs in a web browser, keeps everything on the device, and works with no signal. Devices share by package file or by a loop of QR codes. Everything merges, and nothing is silently overwritten.

Version 0.5.

## What is in this version

| Form or tool | What it does |
|---|---|
| ICS 214 Activity Log | Append-only log with linked corrections. Photos on entries. Filter by person or operational period. |
| Notes | Working notes for the incident, kept apart from the official 214: callback numbers, addresses, follow-ups, decisions. Type and press Enter. Kinds (Info, Contact, Location, Follow-up, Decision), pin to the top, tick off follow-ups, search, and attach photos. Notes can be edited, and every version is kept. "Add to 214" moves a note into the activity log at the time it was taken; "Make 213" starts a message from it. Notes print as a list for shift handoff and travel in package files and QR transfers. |
| Log it | A button on every screen (and Ctrl+Shift+L on a keyboard) that adds a 214 entry or a note, with a photo, without leaving the form you are in. It remembers which one you used last. |
| ICS 201 Incident Briefing | All blocks, a map or sketch photo, actions, the organization (printed as a chart), and resources. Prints as the four 201 pages. |
| ICS 202, 203, 204, 205 | One set per operational period, copied forward from the last period. The IAP prints with page numbers. |
| ICS 205A, 206, 207, 208 | The rest of the IAP. "Fill from 203 and setup" builds the 205A contact list from the 203 and the phone numbers in the locality setup. The 206 medical plan has aid stations, ambulance services, and hospitals. The 207 chart is drawn from the 203. The 208 copies the site safety plan from the 202 and the hazards from the 215A. The IAP prints in order: 202, 203, 204s, 205, 205A, 206, 207, 208. |
| ICS 215 and 215A | The planning worksheet names up to six resource kinds; each assignment records what it requires and has, and the printout works out what to order. The safety analysis lists hazards and mitigations by area. |
| ICS 209 | A new status summary starts filled in from the incident: the commanders from the 203, significant events from the log, block 30 damage counts from the damage assessment, resources by agency from the 211, and costs to date. Only empty blocks are filled. |
| ICS 221 | Demobilization check-out. "Make ICS 221" on a checked-out 211 starts one with the resource's details. |
| Damage assessment | Homes for Individual Assistance (address, "Add my location" from the phone's GPS, dwelling type, insurance, owner or renter, damage level by the FEMA water-depth guidance, photos) and damaged public facilities for Public Assistance. A summary counts dwellings by level, insurance, and renters. The damage inventory exports in the columns of the FEMA Grants Portal template, as Excel and CSV. |
| Volunteers | Sign spontaneous and affiliated volunteers in and out, with waiver and safety briefing. Their hours become donated labor entries at a rate you set. Donated goods and equipment are recorded from the same screen. |
| Sign-offs | "Sign off" on a saved form records who prepared, reviewed, or approved that version. The sign-off prints on the form, and if the form changes later it is marked as on an earlier version. It is a record, not a legal electronic signature. |
| Close out | One archive file for the incident record: the package file with photos, PDFs of every form, the IAPs, the log, the cost summary, and the damage assessment, plus the spreadsheets. Then the incident becomes read only on every device. It can be reopened. |
| Practice incident | An invented flash flood with forms, a log, check-ins, costs, a damage assessment, and volunteers, marked EXERCISE, for training. |
| Quick start | A short guide inside the app (Settings, Quick start) that works with no signal. |
| Hospitals (HICS) | Choose HICS as an incident's command system for a hospital. The menu, positions, and forms switch to the Hospital Incident Command System: the IAP Quick Start, HICS 200 to 206 and 215A (the IAP prints in HICS order with the HICS 207 chart drawn from the 203), 221 demobilization checklists, 251 facility system status, 252 time sheets, 253 volunteer registration, 256 procurement, 257 resource accounting, 258 resource directory, and 259 casualty and fatality reports that count themselves from the 254. Job Action Sheets for 25 HIMT positions record each action with its time; a hospital loads its own sheets in the setup file. A HICS paper backup kit prints blank forms and sheets. |
| Patient tracking | HICS 254, 255, and 260. These open only with the device lock on. A package file that carries them must have a passphrase (or leave them out), QR transfers never carry them, a shared folder carries them only when it is locked, and close-out archives keep them only in the locked package file, never in the PDFs. |
| ICS 211 Incident Check-In List | Check in people, equipment, and crews. Check-ins and check-outs go into the 214 automatically. Add a checked-in resource to a 204. Turn hours on scene into labor or equipment cost entries, one per day. |
| ICS 213 and 213 RR | Messages and resource requests. Request items can become materials, rental, or contract cost entries that keep the request number. |
| Cost capture | Force account labor, equipment, materials, rentals, contracts, and travel, meals, and other direct costs, laid out like the FEMA Public Assistance summary records. Photos of receipts and invoices on any entry. Volunteer labor and donated equipment and materials are kept out of the cost totals and listed as donated resources. |
| Budgeted straight time | On Category A and B (emergency) work, FEMA generally reimburses only the overtime of budgeted employees. FieldICS keeps their straight time documented but sets it apart: a tag on the entry, a separate line on the summary and in the workbook, and a total without it. If the applicant elects the PA alternative procedures for debris removal (incident details), Category A straight time is no longer set apart. |
| Contracts | Contract type, the procurement method, and a checklist drawn from 2 CFR 200.318 to 200.327 (SAM.gov check, cost or price analysis, required clauses, and others). The cost check flags cost plus a percentage of cost contracts, time and materials contracts without a ceiling, and noncompetitive contracts without a written reason. |
| PA cost spreadsheets | An Excel workbook with a Summary sheet, one sheet per cost type, and a Donated sheet. Each cost sheet calculates its line costs with formulas, so finance can fill in a rate in Excel and every total, including the category of work totals on the Summary, updates. Also one CSV of every cost entry, and one CSV per cost type. Exports follow the category and site chosen on the cost summary. |
| FEMA equipment rates | The FEMA 2025 Schedule of Equipment Rates (465 items) is built in. "Find a rate" on an equipment entry searches by code, type, make, or size and fills the code, rate, and unit. A newer FEMA schedule or local rates load from a CSV. |
| Readiness checks | "Check this form" lists empty blocks and missing required items. "Check the IAP" looks for missing 202, 203, 204s, and 205 and empty blocks before a briefing. "Check cost documentation" looks for missing rates, categories of work, invoices or receipts, equipment operators and codes, procurement methods, budgeted status, and donors. "Jump to block" moves straight to any block on a long form. |
| PDFs | Every printout saves as a PDF on the device, with no print dialog, or shares straight to Mail or Messages where the phone allows it. Print still works. |
| Paper backup kit | One PDF with blank ICS 201 through 221 forms, home damage assessment forms, a volunteer sign-in sheet, a daily labor sign-in sheet, an equipment use log, and a materials and donations log, labeled with your locality. |
| Exercise mode | Mark an incident as an exercise. The header is striped, and every printout and PDF says EXERCISE. Metrics count exercises separately. |
| Pilot metrics | A one-page report and CSV of counts only (incidents, entries, forms, check-ins, cost entries, budgeted straight time, damage assessments, volunteer hours, sign-offs, close-outs, time to first 201 and 202, sharing). No names or form contents. |
| Diagnostics file | Settings, Diagnostics file: browser, storage, and feature details plus counts, for whoever supports the devices. No names or incident details. |

Every form fills in the incident name, number, and operational period. "Prepared by" fills in from your settings.

## Locality setup file

The emergency management office prepares a setup file once and loads it on every device (Settings, Locality setup, or "Load locality setup file" on the first screen). It holds:

- Locality name, agency, PA applicant name, and state
- People: name, ICS position, job title, department, type, budgeted, pay rates, and fringe percentages. Typing a name on a labor entry fills the rest.
- Equipment: description, unit number, FEMA code, rate, and rate source. Typing a unit number on an equipment entry fills the rest.
- Work sites and check-in places, offered as suggestions
- Local rate schedules
- People's phone numbers and email, used by the 205A contact list
- Options: regular hours per day before overtime (used when check-ins become labor entries), how long before the backup reminder, whether check-ins go into the 214, and whether every device must use the device lock, with the shortest passcode allowed

People and equipment lists load from CSV spreadsheets, and each has a template. The setup stays on the device and is never part of a package file. `tests/fixtures/sample-setup.json` is an example.

## Sharing between devices

**Package file.** Share and print, then Save package file. Move it by USB drive, email, text, AirDrop, Nearby Share, or a shared folder, and choose Import package file on the other device. Add a passphrase if the file will travel by email or text. "Leave out photos" makes a much smaller file; the photos stay marked as not yet backed up until a file with photos is saved.

**QR code.** For two phones side by side with no signal and no cable. One phone shows a moving QR code, the other scans it with its camera. Photos are not sent this way. A typical incident takes a few seconds to a minute.

**Shared folder (EOC computers).** On Chrome or Edge on a computer, Settings, Shared folder connects a folder that every EOC computer can reach: a county network drive, or a folder kept in sync by OneDrive, Google Drive, or Dropbox. Each computer writes its own copy of each incident there every 30 seconds and merges everyone else's, the same way package files merge. Nothing in the folder is deleted. A passphrase locks the files in the folder (use one for any cloud folder). Exercise incidents stay out of the folder unless you choose to share them. Phones and iPads keep using package files and QR codes.

**Backup reminder.** When changes have been on only one device for more than four hours (adjustable in the setup), a notice offers to save a package file.

**Clock check.** Times come from each device's clock. The app compares its clock with the web server when it has a connection, warns when an imported file looks like it came from the future, and has a Clock check screen showing the time and time zone.

## How merging works

- Every save of a form adds a version. Merging two devices combines their versions. Importing the same file twice adds nothing.
- If two devices edit the same form before they share, a yellow bar lists that form. Compare versions shows who saved each one and every item that differs. Keep one, or pick item by item.
- History shows every saved version and can restore an older one. Deleted items can be shown again and restored.
- Imported files are checked before anything is merged. Damaged or invalid files are refused with a plain message.

## Device lock

Settings, Device lock. A passcode encrypts incidents, forms, photos, drafts, the locality setup, and the shared folder settings stored on the device (AES-256-GCM, with the key protected by PBKDF2-SHA256 at 600,000 rounds). The app locks after a set time without use or in the background. Five wrong tries start a wait that doubles each time. Names and display settings stay readable so the lock screen can show them. The passcode cannot be recovered; a device whose passcode is lost can only be erased.

Use a passcode of 10 or more characters. A six-digit passcode can be guessed by someone who copies the phone's storage. Keep the phone's own screen lock on as well. A locality setup can require the lock on every device and set the shortest passcode; a device that loads it is asked to turn the lock on and cannot turn it off.

Photos are stored once each, apart from the incident, so saving stays fast with hundreds of photos, and turning the lock on encrypts each photo once. After opening or unlocking, the app is usable at once and photos fill in over the next few seconds.

## Display

Settings has Night (dark) mode, which also follows the phone's setting, and Large and Larger text.

## Printing

Share and print has the IAP for any operational period, the 207 chart, the 215 and 215A, the 201, the 209s, the 211, the 214 (everyone or one person, all entries or one period, with a photo appendix), all 213s, all 213 RRs, the 221s, the PA cost summary (with photo appendix), the damage assessment summary (with photos), the volunteer sign-in sheet, notes, the paper kit, and the metrics report. Every form also has its own Print button. Each printout opens a screen with Save PDF, Share PDF, and Print.

Printouts follow the ICS block numbers and order. They are not the official fillable PDFs. Each one notes which version it shows, who saved it, and when.

## Try it

The app is plain HTML, CSS, and JavaScript. There is no build step.

    python3 -m http.server 8080

Then open http://localhost:8080. It also runs by opening `index.html` directly from a folder, without installing (no camera for QR there in some browsers).

To use it in the field, host it over HTTPS so phones can install it and use the camera. GitHub Pages is free: put this folder in a repository, turn on Pages, and open the address on each phone while it has a connection. The status chip reads "Ready for offline use" when it is saved on the device. Add it to the home screen. On iPhone this also keeps Safari from clearing its data when the app has not been opened in a while.

## Where data lives

- On the device, in the browser's IndexedDB storage, with fallbacks if a browser blocks it (a banner says so). The app asks the browser to protect its data from automatic cleanup.
- Nothing is sent to any server. The page's security policy only allows it to load its own files.
- Unsaved typing is kept: leaving a form, switching apps, or closing the page saves it, and a copy is kept while typing so a crash does not lose it.
- Data and package files from versions 0.1 and 0.2 move forward automatically.

## Known limits

- The automated tests run in Chromium here, and the version 0.4 browser test also runs in WebKit (the engine Safari uses) on GitHub. Real iPhones, iPads, cameras, and GPS have not been tested by hand yet. Use `docs/device-test-checklist.md` on your own devices before a pilot.
- The shared folder needs Chrome or Edge on a computer. Some browsers cannot remember the folder between visits; FieldICS then asks for it again after a restart.
- Damage levels follow the FEMA damage assessment guidance, but the assessor decides. Counts are for the initial assessment and the 209, not a joint preliminary damage assessment.
- HICS forms follow the 2014 HICS forms. The starter Job Action Sheets are written for FieldICS from the HICS position descriptions; replace them with your hospital's own. FieldICS is not a HIPAA compliance program: the hospital decides who uses it, on which devices, and how records are kept.
- Close-out marks an incident read only in FieldICS. It is not a records retention system; keep the archive under your retention schedule.
- Times come from each device's clock.
- QR transfer leaves photos out and works best indoors with both screens bright. Very large incidents need a package file.
- The device lock protects data on the phone. Package files are only protected if you add a passphrase.
- Cost summaries organize documentation. Eligibility is decided under the FEMA Public Assistance Program and Policy Guide.
- This tool supports documentation. It does not replace plans, paper forms, or the official ICS forms. Keep the paper kit printed.

## Not included yet

A local Wi-Fi hub for phones to share with no internet, and cloud sync through a hosted service. Maps and the ICS 210, 217A, 218, 219, 220, and 225 are not included.

## Development

    js/forms.js         one definition per form and cost type; drives validation, the editor, and printing
    js/core.js          data rules, versions and conflicts, packages and merging, costs, CSV (no browser code)
    js/checks.js        readiness checks
    js/assess.js        damage assessment counts, the damage inventory, volunteer hours
    js/practice.js      the practice incident
    js/hics-jas.js      the starter HICS Job Action Sheets
    js/setup.js         locality setup files, CSV lists, rate schedules
    js/xlsx.js          Excel workbook writer (no outside library)
    js/costbook.js      the PA cost workbook and the all-costs CSV
    js/metrics.js       pilot metrics
    js/secure.js        device lock encryption
    js/qr.js            QR transfer framing
    js/store.js         device storage and migration
    js/print.js         printed layouts
    js/pdf.js           PDF maker
    js/data/            FEMA 2025 equipment rates
    js/vendor/          QR libraries (see THIRD_PARTY_NOTICES.md)
    js/app/*.js         the screens, one module per area, loaded in the order listed in index.html
    sw.js               offline caching
    tests/              automated tests
    docs/               device test checklist, privacy, terms, accessibility, and pilot documents

App modules share one object, `window.FieldApp`. A module may use what earlier modules defined; anything from a later module goes through `A.later('name')`. `tests/modules.test.js` checks this, and that every script is cached for offline use.

Tests:

    npm install
    npm run lint             catches undefined names and leftovers
    npm test                 rule tests in Node, no browser needed
    npx playwright-core install chromium   (or set CHROMIUM_PATH to an installed Chrome)
    npm run test:e2e         the browser tests: devices sharing, conflicts, printing, offline, and every 0.3 and 0.4 feature
    npm run test:webkit      the 0.4 and HICS browser tests in WebKit (npx playwright-core install webkit first)

The browser tests write screenshots, PDFs, and package files to `tests/e2e-output`, `tests/e2e-v3-output`, `tests/e2e-v4-output`, and `tests/e2e-hics-output`. `.github/workflows/test.yml` runs all of it on GitHub for every push and keeps that output for 14 days.

When you change any app file, change `CACHE` in `sw.js` (for example to `field-ics-v4-2`) so installed copies pick up the update.

## License

Copyright 2026 CompliAid. All rights reserved (see LICENSE). Local governments and nonprofits may use FieldICS free during the preview under PREVIEW-LICENSE.md. Third-party parts keep their own licenses, listed in THIRD_PARTY_NOTICES.md.
