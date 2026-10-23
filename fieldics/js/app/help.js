/* FieldICS: The quick start guide, inside the app so it works with no signal. */
(function (A) {
  'use strict';

  var h = A.h;
  var openPanel = A.openPanel;

  var GUIDE = [
    ['Before an incident', [
      'Load the locality setup file from your emergency management office: Settings, Locality setup. It adds your people, phone numbers, equipment, sites, and rates, and it can require the device lock.',
      'Print the paper backup kit (Share and print) and keep copies in the EOC and in vehicles.',
      'Practice with the practice incident (Settings, Practice incident). It is marked EXERCISE everywhere.'
    ]],
    ['The first hour', [
      'Create the incident and its first operational period.',
      'Log what happens on the ICS 214 as it happens. The Log it button works from any screen, and Ctrl+Shift+L on a keyboard.',
      'Keep phone numbers, addresses, and follow-ups in Notes. Move a note into the 214 when it belongs in the record.',
      'Fill in the ICS 201 for the first briefing, and check people and equipment in on the ICS 211.'
    ]],
    ['Each operational period', [
      'ICS 202 objectives, 203 organization, 204 assignments, and 205 radio plan. Add the 205A contact list, 206 medical plan, and 208 safety message when the plan needs them; the 207 chart is drawn from the 203.',
      'Use the 215 planning worksheet and the 215A safety analysis at the planning meeting.',
      'Press "Check the IAP" before the briefing, then print the IAP or save it as a PDF.',
      'Send status with the ICS 209. A new 209 starts filled in from the log, damage assessment, check-ins, and costs.'
    ]],
    ['Sharing between devices', [
      'Save a package file every few hours; FieldICS reminds you. Move it any way you can, and import it on the other device. Everything merges and nothing is overwritten.',
      'On EOC computers with Chrome or Edge, a shared folder keeps everyone in step: Settings, Shared folder.',
      'With no signal, send the log and forms phone to phone by QR code.'
    ]],
    ['Costs and recovery', [
      'Record labor, equipment, materials, rentals, contracts, and travel as they happen, with photos of receipts.',
      'FieldICS sets apart the straight time of budgeted employees on Category A and B work, which FEMA generally does not reimburse, and keeps it documented.',
      'Assess homes and damaged public facilities with their locations and photos. The damage inventory exports in the FEMA Grants Portal columns.',
      'Sign volunteers in and out; their hours become donated resources. Press "Check cost documentation" before sending anything to the state.'
    ]],
    ['Closing out', [
      'Share and print, Close out: one archive file with the package, PDFs of every form and the log, and the spreadsheets. Then the incident becomes read only. It can be reopened.'
    ]],
    ['If something goes wrong', [
      'Two devices changed the same form: a yellow bar lists it. Compare the versions and keep the right one.',
      'A lost device-lock passcode cannot be recovered. Import the latest package file on another device.',
      'Something looks broken: Settings, Diagnostics file. Send that file to whoever supports FieldICS. It holds counts and settings only.'
    ]]
  ];

  function openHelp() {
    var body = openPanel('Quick start');
    var box = h('div', { class: 'help' });
    box.appendChild(h('p', { text: 'FieldICS keeps ICS forms, the activity log, and cost and damage records on this device, and works with no signal. It supports documentation; it does not replace your plans or the official forms.' }));
    GUIDE.forEach(function (sec) {
      box.appendChild(h('h3', { text: sec[0] }));
      var ul = h('ul');
      sec[1].forEach(function (t) { ul.appendChild(h('li', { text: t })); });
      box.appendChild(ul);
    });
    body.appendChild(box);
  }

  A.openHelp = openHelp;
  A.HELP_GUIDE = GUIDE;
})(window.FieldApp);
