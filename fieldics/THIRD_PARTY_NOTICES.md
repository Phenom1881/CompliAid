# Third-party notices

FieldICS includes the following work by others. Both libraries are copied into `js/vendor/` unchanged, load only on this device, and are used only for QR code transfer.

| Component | Version | License | Copyright | Used for |
|---|---|---|---|---|
| QR Code Generator for JavaScript (qrcode-generator) | 2.0.4 | MIT | Copyright (c) 2009 Kazuhiko Arase | Drawing QR codes on the sending device |
| jsQR | 1.4.0 | Apache License 2.0 | Copyright the jsQR authors (https://github.com/cozmo/jsQR) | Reading QR codes from the camera on the receiving device |

Full license texts: `js/vendor/LICENSE-qrcode-generator.txt` and `js/vendor/LICENSE-jsqr.txt`.

## Fonts

| Font | License | Copyright | Used for |
|---|---|---|---|
| IBM Plex Sans and IBM Plex Sans Condensed (Latin, from Fontsource 5.2.8) | SIL Open Font License 1.1 | Copyright 2017 IBM Corp. | All on-screen text. Printouts use Arial or Helvetica. |

The font files are in `fonts/` with the full license in `fonts/LICENSE-IBM-Plex.txt`. They load from the app itself, so no font service is contacted.

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## Data

`js/data/fema-rates-2025.js` is converted from the FEMA 2025 Schedule of Equipment Rates (fema_pa_schedule-equipment-rates_2025.pdf, published by the Federal Emergency Management Agency, September 2025). It is a work of the United States government. The conversion keeps FEMA's text as printed, with two rows repaired where the PDF's text layer was garbled (cost codes 8684 and 8773), checked against the printed page.

## Development tools

ESLint, globals, and playwright-core are used only to test the app. They are not part of what runs on devices.
