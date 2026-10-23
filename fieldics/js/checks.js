/*
 * FieldICS readiness checks. No DOM access, so they run in Node tests too.
 *
 * Each check returns a list of findings:
 *   { level: 'fix' | 'check', text, type?, rid?, field?, period? }
 * 'fix' means the item is missing or blocks a clean printout (no 202, a form with
 * versions to compare). 'check' means it is worth a look before briefing or
 * submitting (a 204 with no supervisor, an equipment entry with no FEMA code).
 * type, rid, and field let the app open the form at the right block.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./forms.js'), require('./core.js'));
  } else {
    root.FieldChecks = factory(root.FieldICSForms, root.FieldICS);
  }
})(typeof self !== 'undefined' ? self : this, function (Forms, C) {
  'use strict';

  var FORMS = Forms.FORMS;

  function empty(v) {
    return C.isEmptyValue(v) || (typeof v === 'string' && !v.trim());
  }

  function live(inc, rid) {
    var g = C.getRecord(inc, rid);
    return g && !g.deleted ? g : null;
  }

  function title204(d) {
    return [d.branch && 'Branch ' + d.branch, d.division && 'Division ' + d.division, d.group && 'Group ' + d.group, d.staging && 'Staging ' + d.staging]
      .filter(Boolean).join(', ') || 'a 204 with no branch, division, or group';
  }

  /* Blocks of a form that have nothing filled in. Header and app-only blocks are skipped. */
  function emptyBlocks(type, data) {
    var out = [];
    FORMS[type].blocks.forEach(function (b, i) {
      if (b.noPrint || b.prepared || b.signature || b.geo) return;
      var filled = b.fields.some(function (f) { return !empty(data[f.k]); });
      if (!filled) out.push({ index: i, n: b.n || '', title: b.title, field: b.fields[0].k });
    });
    return out;
  }

  /* Checks the incident action plan for one operational period. */
  function iap(inc, n) {
    var out = [];
    function add(level, text, extra) {
      var x = { level: level, text: text, period: n };
      if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
      out.push(x);
    }
    var p = C.periodOf(inc, n);
    if (!p) {
      add('fix', 'Operational period ' + n + ' does not exist.');
      return out;
    }
    if (p.conflict) add('fix', 'Operational period ' + n + ' has start and end times saved separately on two devices.', { type: 'period' });

    var g202 = live(inc, C.recordId('202', n));
    if (!g202) {
      add('fix', 'No ICS 202 Incident Objectives for this period.', { type: '202' });
    } else {
      var d = g202.winner.data;
      if (g202.conflict) add('fix', 'The 202 has versions to compare.', { type: '202', rid: g202.rid });
      if (empty(d.objectives)) add('fix', 'The 202 has no objectives (block 3).', { type: '202', rid: g202.rid, field: 'objectives' });
      if (empty(d.emphasis)) add('check', 'The 202 has no command emphasis (block 4).', { type: '202', rid: g202.rid, field: 'emphasis' });
      if (empty(d.sspRequired)) add('check', 'The 202 does not say whether a site safety plan is required (block 5).', { type: '202', rid: g202.rid, field: 'sspRequired' });
      if (empty(d.prepName)) add('check', 'The 202 has no Prepared by name (block 7).', { type: '202', rid: g202.rid, field: 'prepName' });
      if (empty(d.approvedName)) add('check', 'The 202 is not marked approved by the Incident Commander (block 8).', { type: '202', rid: g202.rid, field: 'approvedName' });
      /* Support forms the 202 says are in the plan must exist for the period. */
      [['ICS 205A', '205A'], ['ICS 206', '206'], ['ICS 208', '208']].forEach(function (x) {
        if ((d.iapItems || []).indexOf(x[0]) === -1) return;
        var g = live(inc, C.recordId(x[1], n));
        if (!g) add('fix', 'The 202 lists the ' + x[0] + ', but there is none for this period.', { type: x[1] });
        else if (g.conflict) add('fix', 'The ' + x[0].replace('ICS ', '') + ' has versions to compare.', { type: x[1], rid: g.rid });
      });
      if ((d.iapItems || []).indexOf('ICS 207') !== -1 && !live(inc, C.recordId('203', n))) {
        add('fix', 'The 202 lists the ICS 207 organization chart, which FieldICS draws from the 203. Fill in the 203 first.', { type: '203' });
      }
    }

    var g206 = live(inc, C.recordId('206', n));
    if (g206) {
      var d6 = g206.winner.data;
      if (!(d6.hospitals || []).length) add('fix', 'The 206 lists no hospitals (block 5).', { type: '206', rid: g206.rid, field: 'hospitals' });
      if (!(d6.transport || []).length) add('check', 'The 206 lists no ambulance service (block 4).', { type: '206', rid: g206.rid, field: 'transport' });
      if (empty(d6.approvedName)) add('check', 'The 206 is not approved by the Safety Officer (block 8).', { type: '206', rid: g206.rid, field: 'approvedName' });
    }
    var g208 = live(inc, C.recordId('208', n));
    if (g208 && empty(g208.winner.data.message)) add('fix', 'The 208 has no safety message (block 3).', { type: '208', rid: g208.rid, field: 'message' });

    var g203 = live(inc, C.recordId('203', n));
    if (!g203) {
      add('fix', 'No ICS 203 Organization Assignment List for this period.', { type: '203' });
    } else {
      if (g203.conflict) add('fix', 'The 203 has versions to compare.', { type: '203', rid: g203.rid });
      if (empty(g203.winner.data.icuc)) add('fix', 'The 203 has no Incident Commander (block 3).', { type: '203', rid: g203.rid, field: 'icuc' });
      if (empty(g203.winner.data.opsChief) && C.listRecords(inc, '204', n).length) {
        add('check', 'The 203 has no Operations Section Chief, but the period has 204s (block 7).', { type: '203', rid: g203.rid, field: 'opsChief' });
      }
    }

    var list204 = C.listRecords(inc, '204', n);
    if (!list204.length) add('fix', 'No ICS 204 Assignment Lists for this period.', { type: '204' });
    list204.forEach(function (g) {
      var d4 = g.winner.data;
      var name = title204(d4);
      if (g.conflict) add('fix', 'The 204 for ' + name + ' has versions to compare.', { type: '204', rid: g.rid });
      if (empty(d4.branch) && empty(d4.division) && empty(d4.group) && empty(d4.staging)) {
        add('fix', 'A 204 has no branch, division, group, or staging area (block 3).', { type: '204', rid: g.rid, field: 'branch' });
      }
      if (empty(d4.supervisor) && empty(d4.branchDirector)) add('check', 'The 204 for ' + name + ' names no supervisor or branch director (block 4).', { type: '204', rid: g.rid, field: 'supervisor' });
      if (!(d4.resources || []).length) add('check', 'The 204 for ' + name + ' has no resources assigned (block 5).', { type: '204', rid: g.rid, field: 'resources' });
      if (empty(d4.work)) add('fix', 'The 204 for ' + name + ' has no work assignments (block 6).', { type: '204', rid: g.rid, field: 'work' });
      if (!(d4.comms || []).length) add('check', 'The 204 for ' + name + ' has no communications contacts (block 8).', { type: '204', rid: g.rid, field: 'comms' });
    });

    var g205 = live(inc, C.recordId('205', n));
    if (!g205) {
      add('check', 'No ICS 205 Radio Communications Plan for this period.', { type: '205' });
    } else {
      if (g205.conflict) add('fix', 'The 205 has versions to compare.', { type: '205', rid: g205.rid });
      var ch = g205.winner.data.channels || [];
      if (!ch.length) add('fix', 'The 205 lists no channels (block 4).', { type: '205', rid: g205.rid, field: 'channels' });
      ch.forEach(function (c, i) {
        if (empty(c.function) || (empty(c.rxFreq) && empty(c.name))) {
          add('check', 'Channel ' + (i + 1) + ' on the 205 is missing its function or a frequency or talkgroup.', { type: '205', rid: g205.rid, field: 'channels' });
        }
      });
    }
    return out;
  }

  function nameOf(x) {
    var d = x.data;
    return d.name || d.description || d.contractor || d.kind || FORMS[x.type].code;
  }

  function listNames(items) {
    var names = items.slice(0, 3).map(nameOf);
    return names.join(', ') + (items.length > 3 ? ', and ' + (items.length - 3) + ' more' : '');
  }

  /* Checks cost documentation for gaps FEMA PA reviewers usually ask about. */
  function costs(inc) {
    var out = [];
    var all = C.costRecords(inc);
    function group(level, test, text, type, field) {
      var hits = all.filter(test);
      if (!hits.length) return;
      var n = hits.length;
      var t = text.replace('{n}', String(n)).replace('{names}', listNames(hits))
        .replace('{entries}', n === 1 ? 'entry' : 'entries').replace('{s}', n === 1 ? '' : 's')
        .replace('{has}', n === 1 ? 'has' : 'have').replace('{needs}', n === 1 ? 'needs' : 'need')
        .replace('{does}', n === 1 ? 'does' : 'do').replace('{uses}', n === 1 ? 'uses' : 'use');
      out.push({ level: level, text: t, type: type || hits[0].type, rid: hits[0].rec.rid, field: field, count: n });
    }
    if (!inc.applicant) out.push({ level: 'check', text: 'The incident has no applicant name. Add it under Details, in Cost recovery details.', type: 'incident' });
    if (!inc.disasterNumber) out.push({ level: 'check', text: 'The incident has no disaster number yet. Add it once a declaration is made.', type: 'incident' });
    group('fix', function (x) { return x.cost.missingRate; }, '{n} {entries} still {needs} a rate or amount: {names}.');
    group('check', function (x) { return !x.data.category; }, '{n} {entries} {has} no FEMA category of work: {names}.', null, 'category');
    group('check', function (x) { return x.type === 'labor' && !x.cost.donated && (!x.data.personType || x.data.personType === 'Applicant employee') && !x.data.budgeted; },
      '{n} labor {entries} {does} not say whether the employee is budgeted: {names}. PA staff need this for straight-time rules.', 'labor', 'budgeted');
    group('check', function (x) { return x.type === 'equipment' && x.data.rateSource === 'FEMA schedule' && !x.data.code; },
      '{n} equipment {entries} {uses} a FEMA rate but {has} no FEMA equipment code: {names}.', 'equipment', 'code');
    group('check', function (x) { return x.type === 'equipment' && !x.data.operator && !x.cost.donated; },
      '{n} equipment {entries} {has} no operator: {names}. Operator time is claimed as labor.', 'equipment', 'operator');
    var st = all.filter(function (x) { return x.cost.flagged; });
    if (st.length) {
      var stCents = st.reduce(function (n, x) { return n + x.cost.flaggedCents; }, 0);
      out.push({
        level: 'check', type: 'labor', rid: st[0].rec.rid, field: 'budgeted', count: st.length,
        text: st.length + ' labor ' + (st.length === 1 ? 'entry has' : 'entries have') + ' straight time for budgeted employees on Category A or B work, $' +
          (stCents / 100).toFixed(2) + ' in all: ' + listNames(st) + '. FEMA generally reimburses only overtime for budgeted employees on emergency work, so this straight time is shown separately. It stays documented.' +
          (inc.altDebris ? '' : ' If the applicant elected the alternative procedures for debris removal, mark that under Details and Category A straight time is no longer flagged.')
      });
    }
    group('check', function (x) { return x.type === 'contracts' && !x.data.procurement; },
      '{n} contract{s} {has} no procurement method: {names}.', 'contracts', 'procurement');
    group('fix', function (x) { return x.type === 'contracts' && x.data.contractType === 'Cost plus a percentage of cost'; },
      '{n} contract{s} {uses} cost plus a percentage of cost, which is not allowed with federal funds (2 CFR 200.324(c)): {names}.', 'contracts', 'contractType');
    group('check', function (x) { return x.type === 'contracts' && x.data.contractType === 'Time and materials' && (x.data.procChecks || []).indexOf('ceiling') === -1; },
      '{n} time and materials contract{s} {does} not show a ceiling price and a finding that no other contract type fit (2 CFR 200.318(j)): {names}.', 'contracts', 'procChecks');
    group('check', function (x) { return x.type === 'contracts' && /^Noncompetitive/.test(x.data.procurement || '') && empty(x.data.justification); },
      '{n} noncompetitive contract{s} {has} no written reason: {names}. Keep the documentation of the exigency, emergency, or sole source (2 CFR 200.320(c)).', 'contracts', 'justification');
    group('check', function (x) { return x.type === 'contracts' && (x.data.procChecks || []).indexOf('sam') === -1; },
      '{n} contract{s} {does} not record a SAM.gov check that the contractor is not suspended or debarred: {names}.', 'contracts', 'procChecks');
    group('check', function (x) { return (x.type === 'materials' && x.data.obtained === 'Purchased' || x.type === 'rentals' || x.type === 'contracts' || x.type === 'travel') && !x.data.invoice && !x.data.receipt && !(x.data.photos || []).length; },
      '{n} purchase{s} {has} no invoice or receipt number and no photo of one: {names}.', null, 'invoice');
    group('check', function (x) { return x.cost.donated && x.type !== 'labor' && !x.data.donor; },
      '{n} donated item{s} {does} not name the donor: {names}.', null, 'donor');
    return out;
  }

  return { iap: iap, costs: costs, emptyBlocks: emptyBlocks };
});
