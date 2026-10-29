/*
 * FieldICS pilot metrics. Counts only: no names, no form contents.
 * No DOM access, so this runs in Node tests too.
 *
 * events: the device's own event counts, kept by the app per incident:
 *   { [incidentId]: { exports, imports, prints, pdfs, qrSent, qrReceived, firstOpened } }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./forms.js'), require('./core.js'), require('./assess.js'));
  } else {
    root.FieldMetrics = factory(root.FieldICSForms, root.FieldICS, root.FieldAssess);
  }
})(typeof self !== 'undefined' ? self : this, function (Forms, C, Assess) {
  'use strict';

  var EVENT_KEYS = ['exports', 'imports', 'prints', 'pdfs', 'qrSent', 'qrReceived', 'closeouts'];

  function minutesBetween(a, b) {
    var x = Date.parse(a);
    var y = Date.parse(b);
    if (isNaN(x) || isNaN(y)) return null;
    return Math.max(0, Math.round((y - x) / 60000));
  }

  function firstSave(inc, type) {
    var first = '';
    inc.revs.forEach(function (r) {
      if (r.type === type && (!first || r.at < first)) first = r.at;
    });
    return first;
  }

  /* Metrics for one incident. */
  function incident(inc, events) {
    var ev = (events && events[inc.id]) || {};
    var devices = new Set();
    var people = new Set();
    var first = inc.createdAt;
    var last = inc.createdAt;
    function seen(at) {
      if (at && at < first) first = at;
      if (at && at > last) last = at;
    }
    inc.entries.forEach(function (e) {
      if (e.deviceId) devices.add(e.deviceId);
      people.add(e.author.toLowerCase());
      seen(e.recordedAt);
    });
    var combined = 0;
    inc.revs.forEach(function (r) {
      if (r.deviceId) devices.add(r.deviceId);
      if (r.by) people.add(r.by.toLowerCase());
      if (r.parents.length > 1) combined++;
      seen(r.at);
    });
    var forms = {};
    Forms.FORM_TYPES.concat(Forms.HICS_TYPES || []).forEach(function (t) { forms[t] = C.listRecords(inc, t).length; });
    var plist = C.periods(inc);
    var iapComplete = plist.filter(function (p) {
      var has = function (t) { var g = C.getRecord(inc, C.recordId(t, p.n)); return g && !g.deleted; };
      return has('202') && has('203') && C.listRecords(inc, '204', p.n).length > 0;
    }).length;
    var costs = C.costRecords(inc);
    var summary = C.costSummary(inc);
    var complete = costs.filter(function (x) { return !x.cost.missingRate; }).length;
    var photos = C.photoRefs(inc).length;
    var t201 = firstSave(inc, '201');
    var t202 = firstSave(inc, '202');
    var volunteers = C.listRecords(inc, 'volunteer');
    var volunteerHours = volunteers.reduce(function (sum, g) { return sum + (Assess.volunteerHours(g.winner.data) || 0); }, 0);
    var out = {
      id: inc.id,
      name: inc.name,
      exercise: inc.exercise === true,
      hics: inc.hics === true,
      createdAt: inc.createdAt,
      lastActivity: last,
      activeHours: Math.round(minutesBetween(first, last) / 6) / 10,
      logEntries: inc.entries.length,
      corrections: inc.entries.filter(function (e) { return e.corrects; }).length,
      people: people.size,
      devices: devices.size,
      forms: forms,
      formsTotal: Object.keys(forms).reduce(function (s, k) { return s + forms[k]; }, 0),
      versions: inc.revs.length,
      conflictsOpen: C.conflictList(inc).length,
      conflictsResolved: combined,
      periods: plist.length,
      iapComplete: iapComplete,
      minutesTo201: t201 ? minutesBetween(inc.createdAt, t201) : null,
      minutesTo202: t202 ? minutesBetween(inc.createdAt, t202) : null,
      checkIns: forms['211'] || 0,
      costEntries: costs.length,
      costEntriesComplete: complete,
      costTotal: summary.total,
      donatedValue: summary.donated.total,
      budgetedST: summary.budgetedST.total,
      photos: photos,
      notes: C.listRecords(inc, 'note').length,
      homesAssessed: C.listRecords(inc, 'daHome').length,
      sitesAssessed: C.listRecords(inc, 'daSite').length,
      volunteers: volunteers.length,
      volunteerHours: Math.round(volunteerHours * 10) / 10,
      signoffs: C.listRecords(inc, 'signoff').length,
      closedOut: C.isClosed(inc)
    };
    EVENT_KEYS.forEach(function (k) { out[k] = typeof ev[k] === 'number' ? ev[k] : 0; });
    return out;
  }

  /* Metrics for every incident on the device, with totals for real incidents and exercises. */
  function report(incidents, events) {
    var rows = incidents.map(function (inc) { return incident(inc, events); });
    rows.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    function total(list) {
      var t = { count: list.length, logEntries: 0, formsTotal: 0, versions: 0, people: 0, devices: 0, periods: 0, iapComplete: 0,
        checkIns: 0, costEntries: 0, costEntriesComplete: 0, costTotal: 0, donatedValue: 0, budgetedST: 0, photos: 0, conflictsResolved: 0,
        notes: 0, homesAssessed: 0, sitesAssessed: 0, volunteers: 0, volunteerHours: 0, signoffs: 0, closedOut: 0 };
      EVENT_KEYS.forEach(function (k) { t[k] = 0; });
      list.forEach(function (r) {
        Object.keys(t).forEach(function (k) { if (k !== 'count' && typeof r[k] === 'number') t[k] += r[k]; });
        if (r.closedOut) t.closedOut++;
      });
      t.costTotal = Math.round(t.costTotal * 100) / 100;
      t.donatedValue = Math.round(t.donatedValue * 100) / 100;
      t.budgetedST = Math.round(t.budgetedST * 100) / 100;
      t.volunteerHours = Math.round(t.volunteerHours * 10) / 10;
      return t;
    }
    return {
      rows: rows,
      real: total(rows.filter(function (r) { return !r.exercise; })),
      exercise: total(rows.filter(function (r) { return r.exercise; }))
    };
  }

  var CSV_COLUMNS = [
    ['name', 'Incident'], ['exercise', 'Exercise'], ['createdAt', 'Created (UTC)'], ['activeHours', 'Hours from first to last activity'],
    ['logEntries', 'ICS 214 entries'], ['corrections', 'Corrections'], ['people', 'People recorded'], ['devices', 'Devices'],
    ['formsTotal', 'Forms'], ['versions', 'Form versions'], ['conflictsResolved', 'Separate edits combined'], ['conflictsOpen', 'Versions still to compare'],
    ['periods', 'Operational periods'], ['iapComplete', 'Periods with 202, 203, and 204s'],
    ['minutesTo201', 'Minutes to first 201'], ['minutesTo202', 'Minutes to first 202'], ['checkIns', 'Check-ins'],
    ['costEntries', 'Cost entries'], ['costEntriesComplete', 'Cost entries with rate or amount'], ['costTotal', 'Costs documented ($)'],
    ['donatedValue', 'Donated resources value ($)'], ['budgetedST', 'Budgeted straight time set apart ($)'], ['photos', 'Photos'], ['notes', 'Notes'],
    ['homesAssessed', 'Homes assessed'], ['sitesAssessed', 'Public facilities assessed'], ['volunteers', 'Volunteer sign-ins'], ['volunteerHours', 'Volunteer hours'],
    ['signoffs', 'Sign-offs'], ['closedOut', 'Closed out'],
    ['exports', 'Package files saved'], ['imports', 'Package files imported'], ['qrSent', 'QR transfers sent'], ['qrReceived', 'QR transfers received'],
    ['prints', 'Print jobs'], ['pdfs', 'PDFs saved'], ['closeouts', 'Close-out archives made']
  ];

  function toCSV(rep) {
    var lines = [CSV_COLUMNS.map(function (c) { return C.csvCell(c[1], true); }).join(',')];
    rep.rows.forEach(function (r) {
      lines.push(CSV_COLUMNS.map(function (c) {
        var v = r[c[0]];
        if (typeof v === 'boolean') v = v ? 'yes' : '';
        return C.csvCell(v === null || v === undefined ? '' : v, typeof v === 'string');
      }).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  return { incident: incident, report: report, toCSV: toCSV, EVENT_KEYS: EVENT_KEYS, CSV_COLUMNS: CSV_COLUMNS };
});
