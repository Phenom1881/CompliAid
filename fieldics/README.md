# FieldICS

Offline ICS forms, activity logs, check-in, and cost documentation for local emergency management. It runs in a web browser, keeps everything on the device, and works with no signal. Devices share by package file or by a loop of QR codes. Everything merges, and nothing is silently overwritten.

Version 0.3.

## What is in this version

| Form or tool | What it does |
|---|---|
| ICS 214 Activity Log | Append-only log with linked corrections. Photos on entries. Filter by person or operational period. |
| Notes | Working notes for the incident, kept apart from the official 214: callback numbers, addresses, follow-ups, decisions. Type and press Enter. Kinds (Info, Contact, Location, Follow-up, Decision), pin to the top, tick off follow-ups, search, and attach photos. Notes can be edited, and every version is kept. "Add to 214" moves a note into the activity log at the time it was taken; "Make 213" starts a message from it. Notes print as a list for shift handoff and travel in package files and QR transfers. |
| Log it | A button on every screen (and Ctrl+Shift+L on a keyboard) that adds a 214 entry or a note, with a photo, without leaving the form you are in. It remembers which one you used last. |
| ICS 201 Incident Briefing | All blocks, a map or sketch photo, actions, the organization (printed as a chart), and resources. Prints as the four 201 pages. |
| ICS 202, 203, 204, 205 | One set per operational period, copied forward from the last period. The IAP prints with page numbers. |
| ICS 211 Incident Check-In List | Check in people, equipment, and crews. Check-ins and check-outs go into the 214 automatically. Add a checked-in resource to a 204. Turn hours on scene into labor or equipment cost entries, one per day. |
| ICS 213 and 213 RR | Messages and resource requests. Request items can become materials, rental, or contract cost entries that keep the request number. |
| Cost capture | Force account labor, equipment, materials, rentals, contracts, and travel, meals, and other direct costs, laid out like the FEMA Public Assistance summary records. Photos of receipts and invoices on any entry. Volunteer labor and donated equipment and materials are kept out of the cost totals and listed as donated resources. |
| PA cost spreadsheets | An Excel workbook with a Summary sheet, one sheet per cost type, and a Donated sheet. Each cost sheet calculates its line costs with formulas, so finance can fill in a rate in Excel and every total, including the category of work totals on the Summary, updates. Also one CSV of every cost entry, and one CSV per cost type. Exports follow the category and site chosen on the cost summary. |
| FEMA equipment rates | The FEMA 2025 Schedule of Equipment Rates (465 items) is built in. "Find a rate" on an equipment entry searches by code, type, make, or size and fills the code, rate, and unit. A newer FEMA schedule or local rates load from a CSV. |
| Readiness checks | "Check this form" lists empty blocks and missing required items. "Check the IAP" looks for missing 202, 203, 204s, and 205 and empty blocks before a briefing. "Check cost documentation" looks for missing rates, categories of work, invoices or receipts, equipment operators and codes, procurement methods, budgeted status, and donors. "Jump to block" moves straight to any block on a long form. |
| PDFs | Every printout saves as a PDF on the device, with no print dialog, or shares straight to Mail or Messages where the phone allows it. Print still works. |
| Paper backup kit | One PDF with blank 201 through 214 forms, a daily labor sign-in sheet, an equipment use log, and a materials and donations log, labeled with your locality. |
| Exercise mode | Mark an incident as an exercise. The header is striped, and every printout and PDF says EXERCISE. Metrics count exercises separately. |
| Pilot metrics | A one-page report and CSV of counts only (incidents, entries, forms, check-ins, cost entries, time to first 201 and 202, sharing). No names or form contents. |

Every form fills in the incident name, number, and operational period. "Prepared by" fills in from your settings.

## Locality setup file

The emergency management office prepares a setup file once and loads it on every device (Settings, Locality setup, or "Load locality setup file" on the first screen). It holds:

- Locality name, agency, PA applicant name, and state
- People: name, ICS position, job title, department, type, budgeted, pay rates, and fringe percentages. Typing a name on a labor entry fills the rest.
- Equipment: description, unit number, FEMA code, rate, and rate source. Typing a unit number on an equipment entry fills the rest.
- Work sites and check-in places, offered as suggestions
- Local rate schedules
- Options: regular hours per day before overtime (used when check-ins become labor entries), how long before the backup reminder, and whether check-ins go into the 214

People and equipment lists load from CSV spreadsheets, and each has a template. The setup stays on the device and is never part of a package file. `tests/fixtures/sample-setup.json` is an example.

## Sharing between devices

**Package file.** Share and print, then Save package file. Move it by USB drive, email, text, AirDrop, Nearby Share, or a shared folder, and choose Import package file on the other device. Add a passphrase if the file will travel by email or text. "Leave out photos" makes a much smaller file; the photos stay marked as not yet backed up until a file with photos is saved.

**QR code.** For two phones side by side with no signal and no cable. One phone shows a moving QR code, the other scans it with its camera. Photos are not sent this way. A typical incident takes a few seconds to a minute.

**Backup reminder.** When changes have been on only one device for more than four hours (adjustable in the setup), a notice offers to save a package file.

**Clock check.** Times come from each device's clock. The app compares its clock with the web server when it has a connection, warns when an imported file looks like it came from the future, and has a Clock check screen showing the time and time zone.

## How merging works

- Every save of a form adds a version. Merging two devices combines their versions. Importing the same file twice adds nothing.
- If two devices edit the same form before they share, a yellow bar lists that form. Compare versions shows who saved each one and every item that differs. Keep one, or pick item by item.
- History shows every saved version and can restore an older one. Deleted items can be shown again and restored.
- Imported files are checked before anything is merged. Damaged or invalid files are refused with a plain message.

## Device lock

Settings, Device lock. A passcode encrypts incidents, forms, photos, drafts, and the locality setup stored on the device (AES-256-GCM, with the key protected by PBKDF2-SHA256 at 600,000 rounds). The app locks after a set time without use or in the background. Five wrong tries start a wait that doubles each time. Names and display settings stay readable so the lock screen can show them. The passcode cannot be recovered; a device whose passcode is lost can only be erased.

Use a passcode of 10 or more characters. A six-digit passcode can be guessed by someone who copies the phone's storage. Keep the phone's own screen lock on as well.

## Display

Settings has Night (dark) mode, which also follows the phone's setting, and Large and Larger text.

## Printing

Share and print has the IAP for any operational period, the 201, the 211, the 214 (everyone or one person, all entries or one period, with a photo appendix), all 213s, all 213 RRs, the PA cost summary (with photo appendix), the paper kit, and the metrics report. Every form also has its own Print button. Each printout opens a screen with Save PDF, Share PDF, and Print.

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

- Every automated test runs in Chromium. Safari on iPhone and real cameras have not been tested yet. Use `docs/device-test-checklist.md` on your own phones before a pilot.
- Times come from each device's clock.
- QR transfer leaves photos out and works best indoors with both screens bright. Very large incidents need a package file.
- The device lock protects data on the phone. Package files are only protected if you add a passphrase.
- Cost summaries organize documentation. Eligibility is decided under the FEMA Public Assistance Program and Policy Guide.
- This tool supports documentation. It does not replace plans, paper forms, or the official ICS forms. Keep the paper kit printed.

## Not included yet

ICS 205A, 206, 207, 208, 209, 215, 215A, and 221. Cloud sync and a local Wi-Fi hub for shared offline use are on the roadmap.

## Development

    js/forms.js         one definition per form and cost type; drives validation, the editor, and printing
    js/core.js          data rules, versions and conflicts, packages and merging, costs, CSV (no browser code)
    js/checks.js        readiness checks
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
    docs/               phone test checklist

App modules share one object, `window.FieldApp`. A module may use what earlier modules defined; anything from a later module goes through `A.later('name')`. `tests/modules.test.js` checks this, and that every script is cached for offline use.

Tests:

    npm install
    npm run lint             catches undefined names and leftovers
    npm test                 rule tests in Node, no browser needed
    npx playwright-core install chromium   (or set CHROMIUM_PATH to an installed Chrome)
    npm run test:e2e         both browser tests: two devices sharing, conflicts, printing, offline, and every 0.3 feature

The browser tests write screenshots, PDFs, and package files to `tests/e2e-output` and `tests/e2e-v3-output`. `.github/workflows/test.yml` runs all of it on GitHub for every push and keeps that output for 14 days.

When you change any app file, change `CACHE` in `sw.js` (for example to `field-ics-v4`) so installed copies pick up the update.

## License

Not chosen yet. Decide before publishing the repository. Third-party parts are listed in THIRD_PARTY_NOTICES.md.
