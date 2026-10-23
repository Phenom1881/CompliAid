/* FieldICS: Printing and PDFs for forms, the IAP, the 211, the 214, costs, the paper kit, and pilot metrics. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var COST_TYPES = A.COST_TYPES;
  var F = A.F;
  var FORMS = A.FORMS;
  var P = A.P;
  var S = A.S;
  var btn = A.btn;
  var canShareFiles = A.canShareFiles;
  var closeDialog = A.closeDialog;
  var closePanel = A.closePanel;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var deviceLabel = A.deviceLabel;
  var download = A.download;
  var h = A.h;
  var openDialog = A.openDialog;
  var openPanel = A.openPanel;
  var periodLabel = A.periodLabel;
  var persistSettings = A.persistSettings;
  var plural = A.plural;
  var printCtx = A.printCtx;
  var setup = A.setup;
  var title204 = A.title204;
  var toast = A.toast;
  var track = A.track;
  var versionText = A.versionText;
  var appendixItems = A.appendixItems;
  var waitForPhotos = A.withPhotos;

  /* ---------- print or PDF ---------- */

  function fileBase(inc, what) {
    return 'fieldics_' + C.slug(inc ? inc.name : 'blank') + '_' + C.slug(what) + '_' + C.stamp() + (inc && inc.exercise ? '_exercise' : '');
  }

  function clones(nodes) {
    return nodes.map(function (n) { return n.cloneNode(true); });
  }

  function sendToPrinter(nodes) {
    var area = $('printArea');
    area.textContent = '';
    clones(nodes).forEach(function (n) { area.appendChild(n); });
    track('prints');
    setTimeout(function () { window.print(); }, 80);
  }

  function makePDF(nodes, meta) {
    if (!window.FieldPDF) return Promise.reject(new Error('The PDF maker did not load.'));
    return window.FieldPDF.fromNodes(clones(nodes), { title: meta.title, author: S.settings.name || deviceLabel() });
  }

  /*
   * Shows what is ready and asks how to send it out: save a PDF, share a PDF, or print.
   * meta: { title, file }
   */
  function runPrint(nodes, meta) {
    meta = meta || {};
    var title = meta.title || 'Printout';
    var file = (meta.file || fileBase(cur(), title)) + '.pdf';
    var body = openPanel('Print or save: ' + title);
    var status = h('p', { class: 'hint', id: 'outStatus', role: 'status', text: plural(nodes.length, 'form', 'forms') + ' ready. Save a PDF to keep or send, or print on paper.' });
    body.appendChild(status);
    var row = h('div', { class: 'row wrap' });
    var buttons = [];
    function busy(on, text) {
      buttons.forEach(function (b) { b.disabled = on; });
      if (text) status.textContent = text;
    }
    var save = btn('Save PDF', function () {
      busy(true, 'Making the PDF...');
      makePDF(nodes, { title: title }).then(function (res) {
        download(file, res.blob);
        track('pdfs');
        busy(false, 'Saved ' + file + ' (' + plural(res.pages, 'page', 'pages') + ').');
        toast('PDF saved.');
      }).catch(function (err) {
        busy(false, 'The PDF could not be made: ' + err.message + ' Use Print instead.');
      });
    }, 'btn-primary', { id: 'outPdf' });
    buttons.push(save);
    row.appendChild(save);
    if (canShareFiles()) {
      var share = btn('Share PDF', function () {
        busy(true, 'Making the PDF...');
        makePDF(nodes, { title: title }).then(function (res) {
          var f = new File([res.blob], file, { type: 'application/pdf' });
          return navigator.share({ files: [f], title: title }).then(function () {
            track('pdfs');
            busy(false, 'Shared ' + file + '.');
          }, function (err) {
            busy(false, err && err.name === 'AbortError' ? 'Not shared.' : 'Sharing did not work. Use Save PDF instead.');
          });
        }).catch(function (err) {
          busy(false, 'The PDF could not be made: ' + err.message);
        });
      }, '', { id: 'outShare' });
      buttons.push(share);
      row.appendChild(share);
    }
    var print = btn('Print', function () {
      closePanel();
      sendToPrinter(nodes);
    }, '', { id: 'outPrint' });
    buttons.push(print);
    row.appendChild(print);
    body.appendChild(row);
    var preview = h('div', { class: 'preview out-preview' });
    clones(nodes).forEach(function (n) { preview.appendChild(n); });
    body.appendChild(preview);
  }

  function formNode(inc, g, extra) {
    var opts = {
      period: g.period ? C.periodOf(inc, g.period) : null,
      versionText: versionText(g),
      conflict: g.conflict,
      signoffs: C.signoffsFor(inc, g.rid)
    };
    if (extra) Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
    return P.form(g.type, g.winner.data, printCtx(inc), opts);
  }

  function withPhotos(inc, nodes, which, title) {
    var items = appendixItems(inc, which);
    var app = P.photoAppendix(printCtx(inc), items, title);
    if (app) nodes.push(app);
    return nodes;
  }

  function printSession() {
    var s = S.session;
    if (!s) return;
    commitSession('quiet');
    var inc = cur();
    var g = C.getRecord(inc, s.rid);
    var title = FORMS[s.type].code;
    if (g && !g.deleted) {
      var nodes = [formNode(inc, g)];
      if (s.type === '213RR' && (g.winner.data.photos || []).length) {
        var app = P.photoAppendix(printCtx(inc), (g.winner.data.photos || []).map(function (id, i) { return { id: id, caption: 'ICS 213 RR #' + (g.winner.data.number || '') + ', photo ' + (i + 1) + '.' }; }), 'PHOTOS FOR RESOURCE REQUEST #' + (g.winner.data.number || ''));
        if (app) nodes.push(app);
      }
      runPrint(nodes, { title: title });
      return;
    }
    var data = C.sanitize(s.type, s.data, { lenient: true }).data;
    runPrint([P.form(s.type, data, printCtx(inc), { period: s.period ? C.periodOf(inc, s.period) : null, versionText: 'Not saved.' })], { title: title });
  }

  function printOne(inc, type) {
    commitSession('quiet');
    var g = C.getRecord(inc, C.recordId(type));
    if (!g || g.deleted) {
      runPrint([P.form(type, C.sanitize(type, {}), printCtx(inc), { versionText: 'Blank form.', blank: true })], { title: FORMS[type].code + ' (blank)' });
      toast('No ' + FORMS[type].code + ' saved yet. This is a blank form.');
      return;
    }
    runPrint([formNode(inc, g)], { title: FORMS[type].code });
  }

  /* The incident action plan for one period, in IAP order, page numbered. */
  function iapNodes(inc, n) {
    var nodes = [];
    var page = 1;
    ['202', '203'].forEach(function (t) {
      var g = C.getRecord(inc, C.recordId(t, n));
      if (g && !g.deleted) nodes.push(formNode(inc, g, { iapPage: page++ }));
    });
    C.listRecords(inc, '204', n).sort(function (a, b) {
      return title204(a.winner.data).localeCompare(title204(b.winner.data));
    }).forEach(function (g) { nodes.push(formNode(inc, g, { iapPage: page++ })); });
    var g205 = C.getRecord(inc, C.recordId('205', n));
    if (g205 && !g205.deleted) nodes.push(formNode(inc, g205, { iapPage: page++ }));
    /* The support forms follow, in the order of block 6 on the 202. The 207 is drawn from the 203 when the 202 lists it. */
    var g202 = C.getRecord(inc, C.recordId('202', n));
    var listed = g202 && !g202.deleted ? (g202.winner.data.iapItems || []) : [];
    ['205A', '206', '207', '208'].forEach(function (t) {
      if (t === '207') {
        if (listed.indexOf('ICS 207') === -1) return;
        var chart = A.chartNode(inc, n, page);
        if (chart) {
          nodes.push(chart);
          page++;
        }
        return;
      }
      var g = C.getRecord(inc, C.recordId(t, n));
      if (g && !g.deleted) nodes.push(formNode(inc, g, { iapPage: page++ }));
    });
    return nodes;
  }

  function printIAP(inc, n) {
    commitSession('quiet');
    var nodes = iapNodes(inc, n);
    if (!nodes.length) {
      toast('No IAP forms saved for period ' + n + ' yet.');
      return;
    }
    runPrint(nodes, { title: 'IAP for operational period ' + n, file: fileBase(inc, 'iap-period-' + n) });
  }

  function printMany(inc, type, period) {
    commitSession('quiet');
    var list = C.listRecords(inc, type, period);
    if (type === '204') {
      list.sort(function (a, b) { return title204(a.winner.data).localeCompare(title204(b.winner.data)); });
    } else {
      list.sort(function (a, b) { return (a.winner.data.at || a.created) < (b.winner.data.at || b.created) ? -1 : 1; });
    }
    if (!list.length) {
      toast('Nothing to print yet.');
      return;
    }
    var nodes = list.map(function (g) { return formNode(inc, g); });
    if (type === '213RR') withPhotos(inc, nodes, { requests: true }, 'PHOTOS FOR RESOURCE REQUESTS');
    runPrint(nodes, { title: 'All ' + FORMS[type].code + (type === '204' && period ? ', period ' + period : '') });
  }

  /* ICS 211, one sheet per check-in location, or a blank sheet. */
  function printCheckins(inc, blank) {
    commitSession('quiet');
    var records = blank ? [] : C.listRecords(inc, '211').map(function (g) { return g.winner.data; });
    runPrint([P.checkin211(printCtx(inc), {
      records: records, blank: blank,
      preparedBy: blank ? '' : S.settings.name, preparedPosition: blank ? '' : S.settings.position
    })], { title: blank ? 'ICS 211 (blank)' : 'ICS 211 check-in list' });
  }

  function openLogPrint() {
    var inc = cur();
    if (!inc) return;
    var who = $('lpWho');
    who.textContent = '';
    who.appendChild(h('option', { value: '', text: 'Everyone (combined log)' }));
    C.authors(inc).forEach(function (p) {
      who.appendChild(h('option', { value: p.key, text: p.name, selected: p.key === S.logFilter.author }));
    });
    var per = $('lpPeriod');
    per.textContent = '';
    per.appendChild(h('option', { value: '', text: 'All entries' }));
    C.periods(inc).forEach(function (p) {
      per.appendChild(h('option', { value: String(p.n), text: 'Period ' + periodLabel(p), selected: String(p.n) === S.logFilter.period }));
    });
    $('lpAgency').value = S.settings.agency;
    $('lpBy').value = S.settings.name;
    $('lpByPos').value = S.settings.position;
    $('lpPhotos').checked = inc.entries.some(function (e) { return e.photos && e.photos.length; });
    openDialog($('logPrintDialog'));
  }

  function wireLogPrint() {
    $('lpCancel').addEventListener('click', function () { closeDialog($('logPrintDialog')); });
    $('lpForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var inc = cur();
      var whoKey = $('lpWho').value;
      var period = $('lpPeriod').value ? C.periodOf(inc, +$('lpPeriod').value) : null;
      var people = C.authors(inc);
      var person = whoKey ? people.filter(function (p) { return p.key === whoKey; })[0] || null : null;
      var entries = inc.entries.filter(function (x) {
        if (whoKey && x.author.toLowerCase() !== whoKey) return false;
        if (period && ((period.start && x.ts < period.start) || (period.end && x.ts >= period.end))) return false;
        return true;
      });
      var byId = new Map();
      inc.entries.forEach(function (x) { byId.set(x.id, x); });
      var peopleInRange = [];
      entries.forEach(function (x) {
        if (!peopleInRange.some(function (p) { return p.name.toLowerCase() === x.author.toLowerCase(); })) {
          peopleInRange.push({ name: x.author, position: x.position });
        }
      });
      var photos = $('lpPhotos').checked;
      S.settings.agency = $('lpAgency').value.trim().slice(0, 200);
      persistSettings();
      closeDialog($('logPrintDialog'));
      var nodes = [P.log214(printCtx(inc), {
        entries: entries, person: person, people: peopleInRange, period: period,
        agency: $('lpAgency').value.trim(), preparedBy: $('lpBy').value.trim(), preparedPosition: $('lpByPos').value.trim(),
        corrections: C.correctionMap(inc), byId: byId, photoNote: photos
      })];
      if (photos) withPhotos(inc, nodes, { log: entries }, 'ICS 214 PHOTO APPENDIX');
      runPrint(nodes, { title: 'ICS 214 activity log' + (person ? ', ' + person.name : ''), file: fileBase(inc, 'ics214' + (person ? '-' + person.name : '')) });
    });
  }

  function openCostPrint() {
    var inc = cur();
    if (!inc) return;
    commitSession('quiet');
    var cat = $('cpCategory');
    cat.textContent = '';
    cat.appendChild(h('option', { value: '', text: 'All categories' }));
    F.CATEGORY_LIST.forEach(function (c) {
      cat.appendChild(h('option', { value: c[0], text: c[1], selected: c[0] === S.costFilter.category }));
    });
    var site = $('cpSite');
    site.textContent = '';
    site.appendChild(h('option', { value: '', text: 'All sites' }));
    var sites = [];
    C.costRecords(inc).forEach(function (x) {
      var s = String(x.data.site || '').trim();
      if (s && sites.every(function (y) { return y.toLowerCase() !== s.toLowerCase(); })) sites.push(s);
    });
    sites.sort().forEach(function (s) { site.appendChild(h('option', { value: s, text: s, selected: s === S.costFilter.site })); });
    var types = $('cpTypes');
    types.textContent = '';
    COST_TYPES.forEach(function (t) {
      var id = 'cp-' + t;
      types.appendChild(h('label', { class: 'check', for: id }, h('input', { type: 'checkbox', id: id, value: t, checked: true }), ' ' + FORMS[t].title));
    });
    $('cpBy').value = S.settings.name;
    $('cpTitle').value = S.settings.position;
    $('cpPhotos').checked = C.costRecords(inc).some(function (x) { return (x.data.photos || []).length; });
    openDialog($('costPrintDialog'));
  }

  function wireCostPrint() {
    $('cpCancel').addEventListener('click', function () { closeDialog($('costPrintDialog')); });
    $('cpForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var inc = cur();
      var filter = { category: $('cpCategory').value, site: $('cpSite').value };
      var types = COST_TYPES.filter(function (t) { return $('cp-' + t).checked; });
      if (!types.length) {
        toast('Choose at least one type.');
        return;
      }
      closeDialog($('costPrintDialog'));
      var records = C.costRecords(inc, filter);
      var nodes = [P.costSummary(printCtx(inc), {
        records: records,
        summary: C.costSummary(inc, filter),
        types: types,
        category: filter.category,
        site: filter.site,
        preparedBy: $('cpBy').value.trim(),
        preparedTitle: $('cpTitle').value.trim()
      })];
      if ($('cpPhotos').checked) {
        withPhotos(inc, nodes, { costs: records.filter(function (x) { return types.indexOf(x.type) !== -1; }) }, 'COST DOCUMENTATION PHOTO APPENDIX');
      }
      runPrint(nodes, { title: 'PA cost summary', file: fileBase(inc, 'pa-cost-summary') });
    });
  }

  /* ---------- paper backup kit ---------- */

  function blankIncident() {
    var su = setup();
    return { id: 'blank', name: '', number: '', exercise: false, applicant: su.locality.applicant || '', paId: '', disasterNumber: '', atts: [] };
  }

  function printPaperKit() {
    var inc = blankIncident();
    var ctx = printCtx(inc);
    var blank = function (type) { return P.form(type, C.sanitize(type, {}), ctx, { versionText: 'Blank form.', blank: true }); };
    var contents = [
      'ICS 201 Incident Briefing (4 pages)', 'ICS 202 Incident Objectives', 'ICS 203 Organization Assignment List',
      'ICS 204 Assignment List (2 copies)', 'ICS 205 Incident Radio Communications Plan', 'ICS 205A Communications List',
      'ICS 206 Medical Plan', 'ICS 208 Safety Message/Plan', 'ICS 209 Incident Status Summary', 'ICS 211 Incident Check-In List',
      'ICS 213 General Message (3 copies)', 'ICS 213 RR Resource Request Message (2 copies)', 'ICS 214 Activity Log (2 copies)',
      'ICS 215A Incident Action Plan Safety Analysis', 'ICS 221 Demobilization Check-Out (2 copies)',
      'Home damage assessment (3 copies)', 'Volunteer sign-in sheet',
      'Daily labor sign-in sheet', 'Equipment use log', 'Materials, purchases, and donations log'
    ];
    var nodes = [P.paperCover(ctx, contents), blank('201'), blank('202'), blank('203'), blank('204'), blank('204'), blank('205'),
      blank('205A'), blank('206'), blank('208'), blank('209'), P.checkin211(ctx, { records: [], blank: true })];
    nodes.push(blank('213'), blank('213'), blank('213'), blank('213RR'), blank('213RR'));
    var log = function () {
      return P.log214(ctx, { entries: [], person: null, people: [], period: null, agency: '', preparedBy: '', preparedPosition: '', corrections: new Map(), byId: new Map(), blank: true, blankRows: 24 });
    };
    nodes.push(log(), log());
    nodes.push(blank('215A'), blank('221'), blank('221'), blank('daHome'), blank('daHome'), blank('daHome'));
    nodes.push(P.volunteerSheet(ctx, [], { blank: true }));
    nodes.push(P.blankSheet(ctx, 'labor'), P.blankSheet(ctx, 'equipment'), P.blankSheet(ctx, 'materials'));
    runPrint(nodes, { title: 'Paper backup kit', file: 'fieldics_paper-backup-kit_' + C.slug(setup().locality.name || 'blank') });
  }

  /* ---------- pilot metrics ---------- */

  function metricsReport() {
    var M = window.FieldMetrics;
    var rep = M.report(Array.from(S.incidents.values()), S.events);
    return rep;
  }

  function printMetrics() {
    commitSession('quiet');
    var rep = metricsReport();
    var ctx = printCtx(blankIncident());
    runPrint([P.metricsReport(ctx, rep, { device: deviceLabel() })], { title: 'Pilot metrics', file: 'fieldics_pilot-metrics_' + C.slug(deviceLabel()) + '_' + C.stamp() });
  }

  function downloadMetricsCSV() {
    var rep = metricsReport();
    download('fieldics_pilot-metrics_' + C.slug(deviceLabel()) + '_' + C.stamp() + '.csv', new Blob(['﻿' + window.FieldMetrics.toCSV(rep)], { type: 'text/csv;charset=utf-8' }));
    toast('Metrics CSV saved.');
  }

  /* ---------- exports ---------- */

  /* Printouts can carry photos, so each waits for photos still loading after the app opens. */
  A.runPrint = runPrint;
  A.makePDF = makePDF;
  A.formNode = formNode;
  A.printSession = waitForPhotos(printSession);
  A.printOne = waitForPhotos(printOne);
  A.printIAP = waitForPhotos(printIAP);
  A.iapNodes = iapNodes;
  A.fileBase = fileBase;
  A.printMany = waitForPhotos(printMany);
  A.printCheckins = printCheckins;
  A.openLogPrint = waitForPhotos(openLogPrint);
  A.wireLogPrint = wireLogPrint;
  A.openCostPrint = waitForPhotos(openCostPrint);
  A.wireCostPrint = wireCostPrint;
  A.printPaperKit = printPaperKit;
  A.metricsReport = metricsReport;
  A.printMetrics = printMetrics;
  A.downloadMetricsCSV = downloadMetricsCSV;
})(window.FieldApp);
