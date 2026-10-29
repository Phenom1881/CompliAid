/* FieldICS: Hospital incidents (HICS): form lists, Job Action Sheets, the HIMT chart, the HICS IAP, and patient tracking safeguards. */
(function (A) {
  'use strict';

  var C = A.C;
  var P = A.P;
  var S = A.S;
  var FORMS = A.FORMS;
  var btn = A.btn;
  var commitSession = A.commitSession;
  var currentPeriodNumber = A.currentPeriodNumber;
  var deletedToggle = A.deletedToggle;
  var deviceLabel = A.deviceLabel;
  var fmtDT = A.fmtDT;
  var fmtShort = A.fmtShort;
  var formNode = A.formNode;
  var go = A.go;
  var h = A.h;
  var itemLink = A.itemLink;
  var markDirty = A.markDirty;
  var needPeriodCard = A.needPeriodCard;
  var nowMinute = A.nowMinute;
  var persist = A.persist;
  var plural = A.plural;
  var printCtx = A.printCtx;
  var printMany = A.printMany;
  var recordRouteView = A.recordRouteView;
  var render = A.render;
  var routeBase = A.routeBase;
  var runPrint = A.runPrint;
  var savedLine = A.savedLine;
  var setup = A.setup;
  var startNew = A.startNew;
  var toast = A.toast;
  var versionText = A.versionText;
  var whoName = A.whoName;

  var JAS = window.FieldJAS;

  function live(inc, rid) {
    var g = C.getRecord(inc, rid);
    return g && !g.deleted ? g : null;
  }

  function count(list, label, labels) {
    return plural((list || []).length, label, labels);
  }

  /* ---------- titles in lists ---------- */

  function itemTitle(type, d) {
    switch (type) {
      case 'h204': return [d.section, d.branch].filter(Boolean).join(': ') || 'Assignment list';
      case 'h221': return [d.section, d.position || d.name].filter(Boolean).join(': ') || 'Demobilization check-out';
      case 'h251': return (d.facility || 'Facility status') + (d.reportAt ? ', ' + fmtShort(d.reportAt) : '');
      case 'h252': return [d.section, d.unit].filter(Boolean).join(', ') || 'Time sheet';
      case 'h253': return 'Volunteers' + (d.from ? ' from ' + fmtShort(d.from) : '');
      case 'h254': return d.area || 'Patient tracking';
      case 'h255': return 'Evacuation' + (d.from ? ' from ' + fmtShort(d.from) : '');
      case 'h256': return 'Purchases' + (d.from ? ' from ' + fmtShort(d.from) : '');
      case 'h257': return 'Resources' + (d.from ? ' from ' + fmtShort(d.from) : '');
      case 'h259': return 'Report' + (d.reportAt ? ' at ' + fmtShort(d.reportAt) : '');
      case 'h260': return (d.name || 'Patient') + (d.fromUnit ? ', from ' + d.fromUnit : '');
      case 'jas': return d.position || 'Job Action Sheet';
      default: return '';
    }
  }

  function itemLines(type, d) {
    switch (type) {
      case 'h204': return [count(d.lines, 'objective', 'objectives') + ', ' + count(d.units, 'unit', 'units')];
      case 'h221': {
        var done = (d.checks || []).filter(function (x) { return x.initials; }).length;
        return [(d.name ? d.name + ' | ' : '') + done + ' of ' + (d.checks || []).length + ' checks initialed'];
      }
      case 'h251': {
        var down = 0;
        var part = 0;
        Object.keys(d).forEach(function (k) {
          if (!/Status$/.test(k)) return;
          if (d[k] === 'Nonfunctional') down++;
          if (d[k] === 'Partially functional') part++;
        });
        return [down || part ? down + ' nonfunctional, ' + part + ' partly working' : 'No systems reported down'];
      }
      case 'h252': return [count(d.people, 'person', 'people')];
      case 'h253': return [count(d.volunteers, 'volunteer', 'volunteers')];
      case 'h254': return [count(d.patients, 'patient', 'patients')];
      case 'h255': return [count(d.patients, 'patient', 'patients')];
      case 'h256': {
        var total = (d.purchases || []).reduce(function (a, x) { return a + (typeof x.amount === 'number' ? x.amount : 0); }, 0);
        return [count(d.purchases, 'purchase', 'purchases') + ', $' + total.toFixed(2)];
      }
      case 'h257': return [count(d.items, 'item', 'items')];
      case 'h259': return [(d.casSeenTotal !== null && d.casSeenTotal !== undefined ? d.casSeenTotal : 0) + ' patients seen'];
      case 'h260': return [[d.destination, d.departureAt ? 'Departed ' + fmtShort(d.departureAt) : ''].filter(Boolean).join(' | ')];
      default: return [];
    }
  }

  var HINTS = {
    h204: 'One assignment list per section or branch for the operational period.',
    h221: 'One check-out per position or section as it demobilizes. "Fill the checklist" adds the HICS checks for the section.',
    h251: 'Each building, department, or unit reports the status of its systems. The Infrastructure Branch rolls them up.',
    h252: 'One time sheet per section or unit. The Time Unit collects them every 12 hours or each operational period.',
    h253: 'Volunteers registered by the Labor Pool and Credentialing Unit, with badges issued and returned.',
    h254: 'One sheet per triage or treatment area. Send to the Patient Tracking Manager hourly.',
    h255: 'The master list of patients evacuated, where they went, and confirmation they arrived.',
    h256: 'Purchases made for the response, for the Procurement Unit and reimbursement.',
    h257: 'Equipment and supplies issued, dispensed, and returned.',
    h259: 'Counts of patients seen, admitted, discharged, transferred, and expired, for the county and state. "Count from HICS 254" fills it in.',
    h260: 'One form per patient moved. The original travels with the patient.'
  };

  /* ---------- patient information ---------- */

  /* Patient forms open only with the device lock on, so the information is encrypted on the device. */
  function phiBlocked(type) {
    return !!(FORMS[type] && FORMS[type].phi && !A.lockEnabled());
  }

  function phiCard(type) {
    var card = h('section', { class: 'card', id: 'phiLockCard' });
    card.appendChild(h('h2', { text: FORMS[type].code + ' ' + FORMS[type].title }));
    card.appendChild(h('p', { text: 'This form holds patient information. Turn on the device lock first, so everything on this device is encrypted and the app locks when it is not in use.' }));
    card.appendChild(h('p', { class: 'hint', text: 'Package files with patient records need a passphrase, QR transfers never carry them, and a shared folder carries them only when it is locked with a passphrase.' }));
    card.appendChild(btn('Turn on device lock', function () { A.openLockSettings(); }, 'btn-primary', { id: 'phiLockBtn' }));
    return card;
  }

  /* ---------- list screens ---------- */

  function listView(inc, type) {
    var def = FORMS[type];
    if (phiBlocked(type)) return phiCard(type);
    var n = def.scope === 'period-many' ? currentPeriodNumber(inc) : null;
    if (def.scope === 'period-many' && !n) return needPeriodCard(def.code + ' ' + def.title);
    var items = C.listRecords(inc, type, n, S.showDeleted).sort(function (a, b) { return b.created < a.created ? -1 : 1; });
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: def.code + ' ' + def.title }),
        h('p', { class: 'hint', text: (n ? 'Operational period ' + n + '. ' : '') + (HINTS[type] || '') })),
      deletedToggle()));
    var tools = h('div', { class: 'row wrap tools' });
    if (!C.isClosed(inc)) tools.appendChild(btn('New ' + def.code, function () { startNew(type); }, 'btn-primary', { id: 'new' + type }));
    if (items.some(function (g) { return !g.deleted; })) tools.appendChild(btn('Print all', function () { printMany(inc, type, n); }, 'btn-quiet'));
    if (type === 'h259' && !C.isClosed(inc)) tools.appendChild(btn('New report counted from HICS 254', function () { new259(inc); }, '', { id: 'new259Count' }));
    card.appendChild(tools);
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      ul.appendChild(itemLink(routeBase(type) + '/' + g.rid, itemTitle(type, d) || def.code, itemLines(type, d).concat([savedLine(g)]), g));
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: 'None yet.' }));
    return card;
  }

  ['h204', 'h221', 'h251', 'h252', 'h253', 'h254', 'h255', 'h256', 'h257', 'h259', 'h260'].forEach(function (type) {
    A.views[type] = function (inc, r) {
      if (phiBlocked(type)) return phiCard(type);
      return r.id ? recordRouteView(inc, type, r.id) : listView(inc, type);
    };
  });

  /* ---------- form tools ---------- */

  var CHECKS_221 = {
    'Command Staff': [
      'Incident Commander: all units demobilized and paperwork gathered for the after action report',
      'Incident Commander: final message issued; clinical operations back to normal; HCC and EOP deactivated',
      'Public Information Officer: final media, staff, and patient briefings issued; social media updated',
      'Liaison Officer: partners notified that the HCC is deactivating',
      'Safety Officer: final facility safety review documented; hazards resolved; regulators notified; paperwork submitted',
      'Medical-Technical Specialists: roles deactivated; paperwork submitted'
    ],
    'Operations Section': [
      'Staging: supplies and equipment returned; staff debriefed',
      'Medical Care Branch: procedures rescheduled; patients repatriated and families notified; records complete',
      'Medical Care Branch: alternate care areas closed; supplies returned; staffing normal; units debriefed',
      'Infrastructure Branch: damage assessments reported; repairs done or ready; utilities normal; resupply under way',
      'Security Branch: lockdown lifted; added measures ended; staff debriefed',
      'HazMat Branch: decontamination ended; wastewater disposed of; authorities notified; staff referred to Employee Health',
      'Business Continuity Branch: relocated services back; data entry backlog resolved',
      'Patient Family Assistance Branch: family areas closed; supplies returned; staff debriefed'
    ],
    'Planning Section': [
      'Resources Unit: tracking forms submitted; tracking tools stored',
      'Situation Unit: tracking forms submitted; tracking tools stored',
      'Documentation Unit: all paperwork submitted and catalogued',
      'Demobilization Unit: approved demobilization plan and paperwork submitted'
    ],
    'Logistics Section': [
      'Service Branch: communications equipment readied and stored; IT equipment returned and data archived',
      'Service Branch: food and water stocks restored; disposable food supplies removed',
      'Support Branch: supplies inspected and stored; equipment needing service sent to maintenance; units debriefed'
    ],
    'Finance/Administration Section': [
      'Time Unit: time sheets collected',
      'Procurement Unit: order forms and expense records collected',
      'Compensation/Claims Unit: time sheets collected; insurance and claims forms submitted',
      'Cost Unit: expense reports complete; outstanding expenses and cards resolved'
    ],
    'All positions': [
      'All response paperwork submitted',
      'Equipment and supplies restocked',
      'Supervisor notified of return to normal duty'
    ]
  };

  A.toolsFor.h221 = function (inc, s) {
    return [['Fill the checklist', function () {
      var list = CHECKS_221[s.data.section];
      if (!list) {
        toast('Choose the section first (block 3).');
        return;
      }
      var have = new Set((s.data.checks || []).map(function (x) { return x.item; }));
      var added = 0;
      s.data.checks = (s.data.checks || []).slice();
      list.concat(s.data.section === 'All positions' ? [] : CHECKS_221['All positions']).forEach(function (item) {
        if (have.has(item)) return;
        s.data.checks.push({ item: item, remarks: '', initials: '' });
        added++;
      });
      markDirty();
      render();
      toast(added ? 'Added ' + plural(added, 'check', 'checks') + '.' : 'The checklist is already there.');
    }]];
  };

  A.toolsFor.h252 = function (inc, s) {
    return [['Work out total hours', function () {
      var n = 0;
      (s.data.people || []).forEach(function (p) {
        if (!p.in || !p.out) return;
        var ms = Date.parse(p.out) - Date.parse(p.in);
        if (ms > 0) {
          p.hours = Math.round(ms / 36000) / 100;
          n++;
        }
      });
      markDirty();
      render();
      toast(n ? 'Worked out hours for ' + plural(n, 'person', 'people') + '.' : 'Enter times in and out first.');
    }]];
  };

  /* Age in whole years from a "DOB/age" entry: a date (m/d/y or y-m-d) or a number. Null when unknown. */
  function ageOf(text, at) {
    var t = String(text || '').trim();
    if (!t) return null;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t) || null;
    var born = null;
    if (m) born = new Date(+m[3], +m[1] - 1, +m[2]);
    else if (/^\d{4}-\d{2}-\d{2}/.test(t)) born = new Date(t.slice(0, 10) + 'T12:00:00');
    if (born && !isNaN(born.getTime())) {
      var ref = at ? new Date(at) : new Date();
      var age = ref.getFullYear() - born.getFullYear();
      if (ref.getMonth() < born.getMonth() || (ref.getMonth() === born.getMonth() && ref.getDate() < born.getDate())) age--;
      return age >= 0 && age < 130 ? age : null;
    }
    var y = /^(\d{1,3})\s*(y|yr|yrs|years?)?$/i.exec(t);
    if (y) return +y[1];
    if (/^\d{1,2}\s*(m|mo|mos|months?|d|days?|wk|weeks?)$/i.test(t)) return 0;
    return null;
  }

  /*
   * Counts for a HICS 259 from every HICS 254 in the incident. A patient on two sheets
   * (same field tag, record number, or name) is counted once, with the latest disposition.
   * Patients whose age is not recorded are counted as adults and noted.
   */
  function count259(inc, from, to) {
    var byKey = new Map();
    C.listRecords(inc, 'h254').forEach(function (g) {
      (g.winner.data.patients || []).forEach(function (p) {
        var key = (p.tag || p.mrn || p.name || '').trim().toLowerCase();
        if (!key) return;
        var when = p.dispAt || g.winner.at;
        if (from && when < from) return;
        if (to && when >= to) return;
        var have = byKey.get(key);
        if (!have || (p.dispAt || '') >= (have.dispAt || '')) byKey.set(key, p);
      });
    });
    var rows = { Seen: [0, 0], Waiting: [0, 0], Admitted: [0, 0], Discharged: [0, 0], Transferred: [0, 0], Expired: [0, 0] };
    var unknownAge = 0;
    byKey.forEach(function (p) {
      var age = ageOf(p.dobAge);
      if (age === null) unknownAge++;
      var col = age !== null && age < 18 ? 1 : 0;
      rows.Seen[col]++;
      var d = p.disposition;
      if (p.triage === 'Expired' || d === 'Morgue') rows.Expired[col]++;
      else if (d === 'Admit' || d === 'Surgery') rows.Admitted[col]++;
      else if (d === 'Discharge') rows.Discharged[col]++;
      else if (d === 'Transfer') rows.Transferred[col]++;
      else rows.Waiting[col]++;
    });
    return { rows: rows, patients: byKey.size, unknownAge: unknownAge };
  }

  function apply259(data, res) {
    Object.keys(res.rows).forEach(function (k) {
      data['cas' + k + 'Adult'] = res.rows[k][0];
      data['cas' + k + 'Peds'] = res.rows[k][1];
      data['cas' + k + 'Total'] = res.rows[k][0] + res.rows[k][1];
    });
    if (res.unknownAge) data.casSeenNote = plural(res.unknownAge, 'patient', 'patients') + ' with no age recorded counted as adult.';
  }

  A.toolsFor.h259 = function (inc, s) {
    return [['Count from HICS 254', function () {
      var res = count259(inc, s.data.from, s.data.to);
      apply259(s.data, res);
      markDirty();
      render();
      toast('Counted ' + plural(res.patients, 'patient', 'patients') + ' from the HICS 254 sheets. Bed types are not on the 254; fill those in.');
    }]];
  };

  function new259(inc) {
    var data = A.defaultsFor(inc, 'h259');
    var n = currentPeriodNumber(inc);
    var p = n ? C.periodOf(inc, n) : null;
    if (p) {
      data.from = p.start || null;
      data.to = p.end || null;
    }
    apply259(data, count259(inc, data.from, data.to));
    commitSession('leave');
    S.session = null;
    S.prefill = { type: 'h259', data: data };
    go(routeBase('h259') + '/new');
  }

  /* The IAP Quick Start's HIMT list from the period's HICS 203. */
  function himtFrom203(d) {
    var out = [];
    FORMS.h203.blocks.forEach(function (b) {
      if (!b.matrix) return;
      b.matrix.rows.forEach(function (r) {
        var name = d[b.matrix.prefix + r[0] + 'Name'];
        if (name) out.push({ position: r[1], name: name });
      });
    });
    ['cmdOther', 'opsOther', 'planOther', 'logOther', 'finOther'].forEach(function (k) {
      (d[k] || []).forEach(function (x) { if (x.name) out.push({ position: x.position || '', name: x.name }); });
    });
    return out;
  }

  A.toolsFor.hqs = function (inc, s) {
    var g = live(inc, C.recordId('h203', s.period));
    if (!g) return [];
    return [['Fill the HIMT from the HICS 203', function () {
      var list = himtFrom203(g.winner.data);
      var have = new Set((s.data.himt || []).map(function (x) { return String(x.name || '').toLowerCase() + '|' + String(x.position || '').toLowerCase(); }));
      s.data.himt = (s.data.himt || []).slice();
      var added = 0;
      list.forEach(function (x) {
        var k = x.name.toLowerCase() + '|' + x.position.toLowerCase();
        if (have.has(k)) return;
        s.data.himt.push(x);
        added++;
      });
      markDirty();
      render();
      toast(added ? 'Added ' + plural(added, 'position', 'positions') + ' from the HICS 203.' : 'Everyone on the HICS 203 is already listed.');
    }]];
  };

  A.toolsFor.h203 = function (inc, s) {
    return s.isNew ? [] : [['Print HICS 207 chart', function () { print207(inc, s.period); }]];
  };

  /* ---------- the HICS IAP and the HIMT chart ---------- */

  function chartNode(inc, n, iapPage) {
    var g = live(inc, C.recordId('h203', n));
    if (!g) return null;
    return P.hics207(printCtx(inc), g.winner.data, { period: C.periodOf(inc, n), iapPage: iapPage, versionText: versionText(g) });
  }

  function print207(inc, n) {
    commitSession('quiet');
    var node = chartNode(inc, n);
    if (!node) {
      toast('Fill in the HICS 203 for period ' + n + ' first. The HICS 207 chart is drawn from it.');
      return;
    }
    runPrint([node], { title: 'HICS 207 chart, period ' + n });
  }

  /* The IAP in HICS order: 200 cover, Quick Start, 201 (when listed), 202, 203, 207, 204s, 205A, 206, 215A. */
  function iapNodes(inc, n) {
    var nodes = [];
    var page = 1;
    function add(type) {
      var g = live(inc, C.recordId(type, n));
      if (g) nodes.push(formNode(inc, g, { iapPage: page++ }));
      return g;
    }
    var cover = add('h200');
    var listed = cover ? cover.winner.data.attachments || [] : null;
    add('hqs');
    if (listed && listed.indexOf('HICS 201') !== -1) {
      var g201 = live(inc, C.recordId('h201'));
      if (g201) nodes.push(formNode(inc, g201, { iapPage: page++ }));
    }
    add('h202');
    add('h203');
    if (!listed || listed.indexOf('HICS 207') !== -1) {
      var chart = chartNode(inc, n, page);
      if (chart) {
        nodes.push(chart);
        page++;
      }
    }
    C.listRecords(inc, 'h204', n).sort(function (a, b) {
      return itemTitle('h204', a.winner.data).localeCompare(itemTitle('h204', b.winner.data));
    }).forEach(function (g) { nodes.push(formNode(inc, g, { iapPage: page++ })); });
    add('h205a');
    add('h206');
    add('h215a');
    return nodes;
  }

  /* ---------- Job Action Sheets ---------- */

  function sheets() {
    return JAS.sheetsFor(setup());
  }

  function sheetById(id) {
    return sheets().filter(function (x) { return x.id === id; })[0] || null;
  }

  /* The latest record for a position, or null. */
  function recordFor(inc, sheet) {
    var list = C.listRecords(inc, 'jas').filter(function (g) { return g.winner.data.position === sheet.position; });
    list.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    return list[0] || null;
  }

  function saveJas(inc, g, data) {
    var o = { type: 'jas', data: data, by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel() };
    if (g) {
      o.rid = g.rid;
      o.parents = g.heads ? g.heads.map(function (r) { return r.id; }) : [g.winner.id];
    }
    var rev = C.saveRecord(inc, o);
    persist(inc);
    return rev;
  }

  function jasListView(inc) {
    var card = h('section', { class: 'card' });
    var own = setup().jas && setup().jas.length;
    card.appendChild(h('div', { class: 'view-head' }, h('div', null,
      h('h2', { text: 'Job Action Sheets' }),
      h('p', { class: 'hint', text: own ? 'Your hospital\'s Job Action Sheets, from the locality setup file.'
        : 'Starter Job Action Sheets for the main HICS positions. Load your hospital\'s own sheets in the setup file to replace them.' }))));
    card.appendChild(h('div', { class: 'row wrap tools' },
      btn('Print blank sheets', function () { printBlankSheets(); }, 'btn-quiet', { id: 'jasPrintBlank' })));
    var bySection = new Map();
    sheets().forEach(function (sh) {
      var k = sh.section || 'Other';
      if (!bySection.has(k)) bySection.set(k, []);
      bySection.get(k).push(sh);
    });
    bySection.forEach(function (list, section) {
      card.appendChild(h('h3', { class: 'small-title', text: section }));
      var ul = h('ul', { class: 'items' });
      list.forEach(function (sh) {
        var g = recordFor(inc, sh);
        var total = JAS.PHASES.reduce(function (a, p) { return a + (sh.phases[p[0]] || []).length; }, 0);
        var done = g ? (g.winner.data.done || []).length : 0;
        ul.appendChild(itemLink('#/jas/' + sh.id, sh.position, [g ? (g.winner.data.name || 'Assigned') + ', ' + done + ' of ' + total + ' actions done' : 'Not in use'], g));
      });
      card.appendChild(ul);
    });
    return card;
  }

  function jasView(inc, id) {
    var sh = sheetById(id);
    if (!sh) return h('section', { class: 'card' }, h('p', { text: 'That Job Action Sheet is not on this device.' }), h('a', { class: 'btn', href: '#/jas', text: 'All Job Action Sheets' }));
    var g = recordFor(inc, sh);
    var d = g ? g.winner.data : null;
    var closed = C.isClosed(inc);
    var card = h('section', { class: 'card jas' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: sh.position }), h('p', { class: 'hint', text: [sh.section, sh.reportsTo ? 'Reports to ' + sh.reportsTo : ''].filter(Boolean).join(' | ') })),
      h('a', { class: 'btn btn-quiet', href: '#/jas', text: 'All sheets' })));
    if (sh.mission) card.appendChild(h('p', { class: 'jas-mission', text: sh.mission }));
    var who = h('input', { type: 'text', id: 'jasName', maxlength: '120', list: 'people' });
    who.value = d ? d.name || '' : S.settings.name || '';
    var tools = h('div', { class: 'row wrap tools' });
    if (!closed) {
      tools.appendChild(h('div', { class: 'field' }, h('label', { for: 'jasName', text: 'Assigned to' }), who));
      if (!g) {
        tools.appendChild(btn('Start this sheet', function () {
          saveJas(inc, null, { position: sh.position, name: who.value.trim(), startedAt: nowMinute().toISOString(), reportsTo: sh.reportsTo || '', done: [] });
          render();
          toast('Job Action Sheet started.');
        }, 'btn-primary', { id: 'jasStart' }));
      } else {
        tools.appendChild(btn('Save name', function () {
          var next = A.clone(d);
          next.name = who.value.trim();
          saveJas(inc, g, next);
          render();
        }, 'btn-quiet'));
        tools.appendChild(btn('Hand off to someone new', function () {
          if (!window.confirm('Start a fresh copy of this sheet for the person taking over? This copy stays in the record.')) return;
          saveJas(inc, null, { position: sh.position, name: who.value.trim(), startedAt: nowMinute().toISOString(), reportsTo: sh.reportsTo || '', done: [] });
          render();
          toast('A fresh sheet is started. Brief the new person on what is done.');
        }, 'btn-quiet', { id: 'jasHandoff' }));
      }
    }
    tools.appendChild(btn('Print', function () { printSheet(inc, sh, g); }, 'btn-quiet', { id: 'jasPrint' }));
    card.appendChild(tools);
    if (g) card.appendChild(h('p', { class: 'hint', text: 'Started ' + fmtDT(d.startedAt) + (d.name ? ' by ' + d.name : '') + '. Tick each action as it is done; the time is recorded.' }));
    var doneMap = new Map();
    (d ? d.done || [] : []).forEach(function (x) { doneMap.set(x.item, x); });
    JAS.PHASES.forEach(function (p) {
      var items = sh.phases[p[0]] || [];
      if (!items.length) return;
      var box = h('fieldset', { class: 'field plain jas-phase' }, h('legend', { text: p[1] }));
      items.forEach(function (text, i) {
        var id = 'jas-' + sh.id + '-' + p[0] + '-' + i;
        var x = doneMap.get(text);
        var cb = h('input', { type: 'checkbox', id: id, checked: !!x, disabled: closed || !g });
        cb.addEventListener('change', function () {
          var cur = recordFor(inc, sh);
          if (!cur) return;
          var next = A.clone(cur.winner.data);
          next.done = (next.done || []).filter(function (y) { return y.item !== text; });
          if (cb.checked) next.done.push({ item: text, at: nowMinute().toISOString(), by: whoName() });
          try {
            saveJas(inc, cur, next);
          } catch (e) {
            toast(e.message);
          }
          render();
        });
        box.appendChild(h('label', { class: 'check jas-item' + (x ? ' is-done' : ''), for: id }, cb, ' ' + text,
          x ? h('span', { class: 'jas-when', text: ' ' + fmtShort(x.at) + (x.by ? ', ' + x.by : '') }) : null));
      });
      card.appendChild(box);
    });
    if (!g && !closed) card.appendChild(h('p', { class: 'hint', text: 'Start the sheet to tick off actions.' }));
    return card;
  }

  A.views.jas = function (inc, r) { return r.sub ? jasView(inc, r.sub) : jasListView(inc); };

  function printSheet(inc, sh, g) {
    runPrint([P.jasSheet(printCtx(inc), sh, g ? g.winner.data : null, JAS.PHASES)], { title: 'Job Action Sheet: ' + sh.position });
  }

  function printBlankSheets() {
    var ctx = printCtx({ name: '', number: '', exercise: false, hics: true, atts: [] });
    runPrint(sheets().map(function (sh) { return P.jasSheet(ctx, sh, null, JAS.PHASES); }), { title: 'Job Action Sheets (blank)' });
  }

  /* ---------- share and print screen ---------- */

  function printPeriodForm(inc, type, n) {
    var g = live(inc, C.recordId(type, n));
    if (!g) {
      toast('No ' + FORMS[type].code + ' saved for period ' + n + ' yet.');
      return;
    }
    runPrint([formNode(inc, g)], { title: FORMS[type].code + ', period ' + n });
  }

  function printPaperKit() {
    var ctx = printCtx({ name: '', number: '', exercise: false, hics: true, atts: [] });
    var blank = function (type) { return P.form(type, C.sanitize(type, {}), ctx, { versionText: 'Blank form.', blank: true }); };
    var types = ['hqs', 'h200', 'h201', 'h202', 'h203', 'h204', 'h204', 'h205a', 'h206', 'h215a', 'h251', 'h252', 'h253', 'h254', 'h254', 'h255', 'h256', 'h257', 'h258', 'h259', 'h260', 'h221'];
    var nodes = [P.paperCover(ctx, ['HICS IAP Quick Start', 'HICS 200 to 206 and 215A', 'HICS 204 (2 copies)', 'HICS 251 to 260', 'HICS 254 (2 copies)', 'HICS 221', 'HICS 213 General Message (3 copies)', 'HICS 214 Activity Log (2 copies)', 'Job Action Sheets'])];
    types.forEach(function (t) { nodes.push(blank(t)); });
    nodes.push(blank('213'), blank('213'), blank('213'));
    var log = function () {
      return P.log214(ctx, { entries: [], person: null, people: [], period: null, agency: '', preparedBy: '', preparedPosition: '', corrections: new Map(), byId: new Map(), blank: true, blankRows: 24 });
    };
    nodes.push(log(), log());
    sheets().forEach(function (sh) { nodes.push(P.jasSheet(ctx, sh, null, JAS.PHASES)); });
    runPrint(nodes, { title: 'HICS paper backup kit', file: 'fieldics_hics-paper-kit_' + C.slug(setup().locality.name || 'blank') });
  }

  function printCard(inc) {
    var card = h('section', { class: 'card' });
    card.appendChild(h('h2', { text: 'Print or save as PDF' }));
    card.appendChild(h('p', { class: 'hint', text: 'HICS forms with the incident name and operational period filled in. Save a PDF, share it, or print it.' }));
    var list = C.periods(inc);
    var n = currentPeriodNumber(inc);
    var row = h('div', { class: 'row wrap' });
    if (list.length) {
      var ps = h('select', { id: 'iapPeriod', 'aria-label': 'Operational period for the IAP' });
      list.forEach(function (p) { ps.appendChild(h('option', { value: String(p.n), text: 'Period ' + A.periodLabel(p), selected: p.n === n })); });
      row.appendChild(ps);
      row.appendChild(btn('IAP (HICS 200 to 215A)', function () { A.printIAP(inc, +ps.value); }, 'btn-primary', { id: 'printIap' }));
      row.appendChild(btn('Check the IAP', function () { A.openIAPCheck(inc, +ps.value); }, 'btn-quiet', { id: 'checkIapShare' }));
      row.appendChild(btn('HICS 207 chart', function () { print207(inc, +ps.value); }, 'btn-quiet', { id: 'print207' }));
      row.appendChild(btn('IAP Quick Start', function () { printPeriodForm(inc, 'hqs', +ps.value); }, 'btn-quiet'));
    } else {
      row.appendChild(h('span', { class: 'hint', text: 'Create an operational period to print an incident action plan.' }));
    }
    card.appendChild(row);
    card.appendChild(h('div', { class: 'row wrap' },
      btn('HICS 214 activity log', function () { A.openLogPrint(); }),
      btn('HICS 201 briefing', function () { A.printOne(inc, 'h201'); }),
      btn('HICS 251 facility status', function () { printMany(inc, 'h251'); }),
      btn('HICS 259 casualty reports', function () { printMany(inc, 'h259'); }, '', { id: 'print259' }),
      btn('HICS 258 resource directory', function () { A.printOne(inc, 'h258'); }),
      btn('HICS 252 time sheets', function () { printMany(inc, 'h252'); }),
      btn('HICS 256 procurement', function () { printMany(inc, 'h256'); }),
      btn('HICS 213 messages', function () { printMany(inc, '213'); }),
      btn('HICS 221 check-outs', function () { printMany(inc, 'h221'); }),
      btn('PA cost summary', function () { A.openCostPrint(); })));
    card.appendChild(h('h3', { class: 'small-title', text: 'Paper backup kit' }));
    card.appendChild(h('p', { class: 'hint', text: 'Blank HICS forms and Job Action Sheets for the Hospital Command Center, for when devices are down.' }));
    card.appendChild(h('div', { class: 'row wrap' },
      btn('HICS paper backup kit', function () { printPaperKit(); }, '', { id: 'hicsKitBtn' }),
      btn('Blank Job Action Sheets', function () { printBlankSheets(); }, 'btn-quiet')));
    return card;
  }

  /* ---------- exports ---------- */

  A.hicsItemTitle = itemTitle;
  A.hicsIapNodes = iapNodes;
  A.hicsPrintCard = printCard;
  A.hicsPhiBlocked = phiBlocked;
  A.hicsPhiCard = phiCard;
  A.hicsCount259 = count259;
  A.hicsAgeOf = ageOf;
  A.printHics207 = print207;
  A.printHicsPaperKit = printPaperKit;
  A.hicsJasSheets = sheets;
})(window.FieldApp);
