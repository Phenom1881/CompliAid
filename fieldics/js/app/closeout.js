/* FieldICS: Closing out an incident (one archive file, then read only), sign-offs on forms, and the diagnostics file. */
(function (A) {
  'use strict';

  var APP_NAME = A.APP_NAME;
  var C = A.C;
  var P = A.P;
  var S = A.S;
  var btn = A.btn;
  var closePanel = A.closePanel;
  var commitSession = A.commitSession;
  var deviceLabel = A.deviceLabel;
  var download = A.download;
  var fmtDT = A.fmtDT;
  var formNode = A.formNode;
  var h = A.h;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var plural = A.plural;
  var printCtx = A.printCtx;
  var recordTitle = A.recordTitle;
  var render = A.render;
  var showError = A.showError;
  var toast = A.toast;
  var track = A.track;
  var whoName = A.whoName;
  var appendixItems = A.appendixItems;

  /* ---------- errors kept for the diagnostics file ---------- */

  var recentErrors = [];

  function noteError(msg) {
    recentErrors.push({ at: new Date().toISOString(), message: String(msg || 'Unknown error').slice(0, 300) });
    if (recentErrors.length > 25) recentErrors.shift();
  }

  window.addEventListener('error', function (e) { noteError(e && e.message); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    noteError('Unhandled: ' + (r && r.message ? r.message : r));
  });

  /* ---------- a closed incident ---------- */

  function closedBanner(inc) {
    var box = h('div', { class: 'closed-banner', id: 'closedBanner', role: 'note' });
    box.appendChild(h('p', null, h('strong', { text: 'Closed out. ' }),
      'This incident was closed out ' + fmtDT(inc.closedAt) + (inc.closedBy ? ' by ' + inc.closedBy : '') +
      '. It is read only here and on every device that imports it. Printing, PDFs, and package files still work.'));
    box.appendChild(btn('Reopen', function () { reopen(inc); }, 'btn-small', { id: 'reopenBtn' }));
    return box;
  }

  function reopen(inc) {
    if (!window.confirm('Reopen "' + inc.name + '" so it can be changed again?')) return;
    C.setClosed(inc, false, whoName());
    try {
      C.addEntry(inc, { text: 'Incident reopened in FieldICS after close-out.', author: whoName(), position: S.settings.position, source: 'Close-out', deviceId: S.settings.deviceId, deviceName: deviceLabel() });
    } catch (e) { /* the reopen stands either way */ }
    persist(inc);
    render();
    toast('Reopened. The incident can be changed again.');
  }

  /* ---------- the close-out archive ---------- */

  function bytesOf(blob) {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error('A file could not be read.')); };
      r.readAsArrayBuffer(blob);
    });
  }

  function sortedBy(list, key) {
    return list.slice().sort(function (a, b) { return (a.winner.data[key] || a.created) < (b.winner.data[key] || b.created) ? -1 : 1; });
  }

  /* Every printout for the record, as [file name, nodes]. withPhotos adds photo appendices. */
  function printouts(inc, withPhotos) {
    var ctx = printCtx(inc);
    var out = [];
    function add(name, nodes) {
      nodes = nodes.filter(Boolean);
      if (nodes.length) out.push([name, nodes]);
    }
    var g201 = C.getRecord(inc, C.recordId('201'));
    if (g201 && !g201.deleted) add('ICS-201-incident-briefing.pdf', [formNode(inc, g201)]);
    C.periods(inc).forEach(function (p) {
      add('IAP-period-' + p.n + '.pdf', A.iapNodes(inc, p.n));
      ['215', '215A'].forEach(function (t) {
        var g = C.getRecord(inc, C.recordId(t, p.n));
        if (g && !g.deleted) add('ICS-' + t + '-period-' + p.n + '.pdf', [formNode(inc, g)]);
      });
    });
    if (inc.entries.length) {
      var byId = new Map();
      inc.entries.forEach(function (e) { byId.set(e.id, e); });
      var people = [];
      inc.entries.forEach(function (e) {
        if (!people.some(function (p) { return p.name.toLowerCase() === e.author.toLowerCase(); })) people.push({ name: e.author, position: e.position });
      });
      var log = [P.log214(ctx, {
        entries: inc.entries, person: null, people: people, period: null, agency: S.settings.agency,
        preparedBy: S.settings.name, preparedPosition: S.settings.position, corrections: C.correctionMap(inc), byId: byId, photoNote: withPhotos
      })];
      if (withPhotos) log.push(P.photoAppendix(ctx, appendixItems(inc, { log: inc.entries }), 'ICS 214 PHOTO APPENDIX'));
      add('ICS-214-activity-log.pdf', log);
    }
    var checkins = C.listRecords(inc, '211').map(function (g) { return g.winner.data; });
    if (checkins.length) add('ICS-211-check-in-list.pdf', [P.checkin211(ctx, { records: checkins, preparedBy: S.settings.name, preparedPosition: S.settings.position })]);
    [['213', 'ICS-213-messages.pdf', 'at'], ['213RR', 'ICS-213RR-resource-requests.pdf', 'at'], ['209', 'ICS-209-status-summaries.pdf', 'prepAt'], ['221', 'ICS-221-demob-check-outs.pdf', 'plannedRelease']].forEach(function (x) {
      var nodes = sortedBy(C.listRecords(inc, x[0]), x[2]).map(function (g) { return formNode(inc, g); });
      if (x[0] === '213RR' && withPhotos && nodes.length) nodes.push(P.photoAppendix(ctx, appendixItems(inc, { requests: true }), 'PHOTOS FOR RESOURCE REQUESTS'));
      add(x[1], nodes);
    });
    var costs = C.costRecords(inc);
    if (costs.length) {
      var cost = [P.costSummary(ctx, { records: costs, summary: C.costSummary(inc), types: C.COST_TYPES, category: '', site: '', preparedBy: S.settings.name, preparedTitle: S.settings.position })];
      if (withPhotos) cost.push(P.photoAppendix(ctx, appendixItems(inc, { costs: costs }), 'COST DOCUMENTATION PHOTO APPENDIX'));
      add('PA-cost-summary.pdf', cost);
    }
    var homes = C.listRecords(inc, 'daHome').map(function (g) { return g.winner.data; });
    var sites = C.listRecords(inc, 'daSite').map(function (g) { return g.winner.data; });
    if (homes.length || sites.length) add('damage-assessment.pdf', [P.damageSummary(ctx, { homes: homes, sites: sites, totals: window.FieldAssess.damageTotals(inc) })]);
    var vols = C.listRecords(inc, 'volunteer').map(function (g) { return g.winner.data; });
    if (vols.length) add('volunteer-sign-in.pdf', [P.volunteerSheet(ctx, vols, {})]);
    if (C.listRecords(inc, 'note').length) add('notes.pdf', [A.notesNode(inc)]);
    return out;
  }

  function readme(inc, files, now) {
    var lines = [
      'FieldICS close-out archive',
      '',
      'Incident: ' + inc.name + (inc.number ? ' (' + inc.number + ')' : '') + (inc.exercise ? '  [EXERCISE]' : ''),
      'Applicant: ' + (inc.applicant || ''),
      'Disaster number: ' + (inc.disasterNumber || ''),
      'Archive made: ' + now + ' (UTC) by ' + whoName() + ' on ' + deviceLabel() + ', ' + APP_NAME,
      '',
      'What is here:',
      '  package/   The complete incident as a FieldICS package file, with every version of every form,',
      '             the full activity log, and photos. To restore it, open FieldICS and choose',
      '             Import package file. This is the record of the incident.',
      '  pdf/       Printouts of every form, the IAP for each operational period, the activity log,',
      '             the PA cost summary, the damage assessment, and notes.',
      '  spreadsheets/ and csv/   The cost workbook, the damage inventory, and data files.',
      '',
      'Files:'
    ];
    files.forEach(function (f) { lines.push('  ' + f.name + '  (' + Math.max(1, Math.round(f.data.length / 1024)) + ' KB)'); });
    lines.push('', 'Keep this archive with the incident records under your records retention schedule.', '');
    return lines.join('\r\n');
  }

  function openCloseOut(inc) {
    commitSession('quiet');
    var body = openPanel('Close out: ' + inc.name);
    body.appendChild(h('p', { text: 'Makes one archive file with everything for the incident record: the package file with photos, PDFs of every form and the activity log, the cost workbook, and the damage inventory. Then it marks the incident closed out.' }));
    body.appendChild(h('p', { class: 'hint', text: 'A closed incident is read only, here and on every device that imports it. Printing, PDFs, and package files still work, and it can be reopened.' }));
    var photos = h('input', { type: 'checkbox', id: 'coPhotos', checked: inc.atts.length < 150 });
    body.appendChild(h('label', { class: 'check field', for: 'coPhotos' }, photos, ' Put photo appendices in the PDFs (the package file always keeps the photos)'));
    var close = h('input', { type: 'checkbox', id: 'coClose', checked: true });
    body.appendChild(h('label', { class: 'check field', for: 'coClose' }, close, ' Mark the incident closed out after the archive is saved'));
    var pass = h('input', { type: 'password', id: 'coPass', autocomplete: 'new-password' });
    var pass2 = h('input', { type: 'password', id: 'coPass2', autocomplete: 'new-password' });
    body.appendChild(h('div', { class: 'grid two' },
      h('div', { class: 'field' }, h('label', { for: 'coPass', text: 'Passphrase for the package file (optional)' }), pass),
      h('div', { class: 'field' }, h('label', { for: 'coPass2', text: 'Repeat passphrase' }), pass2)));
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    var status = h('p', { class: 'hint', id: 'coStatus', role: 'status' });
    body.appendChild(err);
    body.appendChild(status);
    var go = btn('Make the archive', function () {
      showError(err, '');
      if (pass.value !== pass2.value) {
        showError(err, 'The passphrases do not match.');
        return;
      }
      go.disabled = true;
      makeArchive(inc, { photos: photos.checked, close: close.checked, pass: pass.value }, function (text) { status.textContent = text; }).then(function (res) {
        closePanel();
        render();
        toast('Archive saved: ' + plural(res.files, 'file', 'files') + '.' + (res.closed ? ' The incident is closed out.' : ''));
      }).catch(function (e) {
        go.disabled = false;
        status.textContent = '';
        showError(err, 'The archive could not be made: ' + (e && e.message ? e.message : e));
      });
    }, 'btn-primary', { id: 'coMake' });
    body.appendChild(h('div', { class: 'row end' }, btn('Cancel', closePanel, 'btn-quiet'), go));
  }

  /* opts: { photos, close, pass }. Resolves to { files, closed, name }. */
  function makeArchive(inc, opts, progress) {
    var now = C.nowISO();
    var files = [];
    var base = 'fieldics_' + C.slug(inc.name);
    return S.photosReady.then(function () {
      progress('Writing the package file...');
      var pkg = C.buildPackage(inc, { deviceId: S.settings.deviceId, deviceName: deviceLabel(), now: now });
      return (opts.pass ? C.encryptPackage(pkg, opts.pass) : Promise.resolve(pkg)).then(function (out) {
        files.push({ name: 'package/' + base + '_full' + (opts.pass ? '_locked' : '') + '.json', data: JSON.stringify(out) });
      });
    }).then(function () {
      var list = printouts(inc, opts.photos);
      var chain = Promise.resolve();
      list.forEach(function (item, i) {
        chain = chain.then(function () {
          progress('Making PDF ' + (i + 1) + ' of ' + list.length + ': ' + item[0].replace(/\.pdf$/, '').replace(/-/g, ' ') + '...');
          return A.makePDF(item[1], { title: item[0].replace(/\.pdf$/, '') }).then(function (res) { return bytesOf(res.blob); }).then(function (bytes) {
            files.push({ name: 'pdf/' + item[0], data: bytes });
          });
        });
      });
      return chain;
    }).then(function () {
      progress('Writing the spreadsheets...');
      if (C.costRecords(inc).length) {
        var wb = window.FieldCostbook.workbook(inc, { preparedBy: S.settings.name, preparedTitle: S.settings.position, deviceName: deviceLabel() });
        files.push({ name: 'spreadsheets/PA-costs.xlsx', data: window.FieldXLSX.build(wb.sheets, { title: 'PA costs: ' + inc.name, creator: S.settings.name || 'FieldICS' }) });
        files.push({ name: 'csv/all-costs.csv', data: '﻿' + window.FieldCostbook.allCostsCSV(inc) });
      }
      if (C.listRecords(inc, 'daSite').length) {
        files.push({ name: 'spreadsheets/damage-inventory.xlsx', data: window.FieldXLSX.build(window.FieldAssess.inventorySheets(inc), { title: 'Damage inventory: ' + inc.name }) });
        files.push({ name: 'csv/damage-inventory.csv', data: '﻿' + window.FieldAssess.inventoryCSV(inc) });
      }
      if (C.listRecords(inc, 'daHome').length) files.push({ name: 'csv/home-assessments.csv', data: '﻿' + window.FieldAssess.homesCSV(inc) });
      if (inc.entries.length) files.push({ name: 'csv/ics214-activity-log.csv', data: '﻿' + C.toCSV(inc) });
      var named = files.map(function (f) { return { name: f.name, data: typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data }; });
      named.unshift({ name: 'README.txt', data: new TextEncoder().encode(readme(inc, named, now)) });
      progress('Putting the archive together...');
      var blob = new Blob(window.FieldXLSX.zipParts(named, new Date()), { type: 'application/zip' });
      var name = base + '_close-out_' + C.stamp() + (inc.exercise ? '_exercise' : '') + '.zip';
      download(name, blob);
      C.markExported(inc, now);
      track('exports');
      track('closeouts');
      var closed = false;
      if (opts.close && !C.isClosed(inc)) {
        try {
          C.addEntry(inc, { text: 'Incident closed out in FieldICS. Archive ' + name + ' saved with ' + plural(named.length, 'file', 'files') + '.', author: whoName(), position: S.settings.position, source: 'Close-out', deviceId: S.settings.deviceId, deviceName: deviceLabel() });
        } catch (e) { /* the close-out stands either way */ }
        C.setClosed(inc, true, whoName());
        closed = true;
      }
      return persist(inc).then(function () { return { files: named.length, closed: closed, name: name }; });
    });
  }

  function closeOutCard(inc) {
    var card = h('section', { class: 'card', id: 'closeOutCard' });
    card.appendChild(h('h2', { text: 'Close out' }));
    if (C.isClosed(inc)) {
      card.appendChild(h('p', { text: 'Closed out ' + fmtDT(inc.closedAt) + (inc.closedBy ? ' by ' + inc.closedBy : '') + '.' }));
      card.appendChild(h('div', { class: 'row wrap' },
        btn('Make the archive again', function () { openCloseOut(inc); }, '', { id: 'archiveAgain' }),
        btn('Reopen', function () { reopen(inc); }, 'btn-quiet')));
      return card;
    }
    card.appendChild(h('p', { class: 'hint', text: 'When the incident is over: one archive file with the package, PDFs of every form and the log, and the spreadsheets, for your records. Then the incident becomes read only.' }));
    card.appendChild(btn('Close out the incident', function () { A.openCloseOut(inc); }, '', { id: 'closeOutBtn' }));
    return card;
  }

  /* ---------- sign-offs ---------- */

  function signoffBar(inc, g, s) {
    var box = h('div', { class: 'signoffs', id: 'signoffs' });
    var list = g ? C.signoffsFor(inc, g.rid) : [];
    list.forEach(function (so) {
      box.appendChild(h('p', { class: so.current ? 'signoff is-current' : 'signoff', text: so.role + ' ' + so.name + (so.position ? ', ' + so.position : '') +
        ', ' + fmtDT(so.at) + (so.current ? '. Signed off on this version.' : '. Signed off on an earlier version; the form has changed since.') }));
    });
    if (g && !g.deleted && !g.conflict && !C.isClosed(inc) && !s.dirty) {
      box.appendChild(btn('Sign off', function () { openSignoff(inc, g); }, 'btn-quiet btn-small', { id: 'signoffBtn' }));
    }
    return box;
  }

  function openSignoff(inc, g) {
    var body = openPanel('Sign off: ' + recordTitle(g));
    body.appendChild(h('p', { text: 'Records that you prepared, reviewed, or approved the version saved ' + fmtDT(g.winner.at) + (g.winner.by ? ' by ' + g.winner.by : '') +
      '. The sign-off prints on the form. If the form changes later, the sign-off stays with this version.' }));
    var role = h('select', { id: 'soRole' });
    ['Approved by', 'Reviewed by', 'Prepared by'].forEach(function (r) { role.appendChild(h('option', { value: r, text: r })); });
    var name = h('input', { type: 'text', id: 'soName', maxlength: '120' });
    name.value = S.settings.name || '';
    var pos = h('input', { type: 'text', id: 'soPosition', maxlength: '120', list: 'ics-positions' });
    pos.value = S.settings.position || '';
    var ok = h('input', { type: 'checkbox', id: 'soConfirm' });
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    body.appendChild(h('div', { class: 'grid three' },
      h('div', { class: 'field' }, h('label', { for: 'soRole', text: 'Role' }), role),
      h('div', { class: 'field' }, h('label', { for: 'soName', text: 'Your name' }), name),
      h('div', { class: 'field' }, h('label', { for: 'soPosition', text: 'Position/title' }), pos)));
    body.appendChild(h('label', { class: 'check field', for: 'soConfirm' }, ok, ' I have reviewed this version of the form.'));
    body.appendChild(err);
    body.appendChild(h('p', { class: 'hint', text: 'A record of who signed off and when, kept with the form and shared with it. It is not a legal electronic signature; sign the printed form where one is required.' }));
    body.appendChild(h('div', { class: 'row end' }, btn('Cancel', closePanel, 'btn-quiet'), btn('Sign off', function () {
      if (!ok.checked) { showError(err, 'Tick the box to confirm you reviewed this version.'); return; }
      if (!name.value.trim()) { showError(err, 'Enter your name.'); return; }
      try {
        C.signOff(inc, g.rid, { role: role.value, name: name.value.trim(), position: pos.value.trim(), by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel() });
      } catch (e) {
        showError(err, e.message);
        return;
      }
      persist(inc);
      closePanel();
      render();
      toast('Signed off.');
    }, 'btn-primary', { id: 'soSave' })));
  }

  /* ---------- diagnostics ---------- */

  function supports(test) {
    try { return !!test(); } catch (e) { return false; }
  }

  /* A file for whoever supports the device. Counts and settings only: no names, places, or form contents. */
  function diagnostics() {
    var est = navigator.storage && typeof navigator.storage.estimate === 'function' ? navigator.storage.estimate().catch(function () { return null; }) : Promise.resolve(null);
    return est.then(function (e) {
      var zone = '';
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (x) { zone = ''; }
      return {
        format: 'fieldics-diagnostics',
        version: 1,
        made: C.nowISO(),
        app: APP_NAME,
        device: { name: deviceLabel(), id: S.settings.deviceId.slice(0, 8) },
        page: {
          protocol: window.location.protocol,
          installed: supports(function () { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }),
          serviceWorker: S.swReady === true,
          online: navigator.onLine
        },
        browser: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          timeZone: zone,
          utcOffsetMinutes: -new Date().getTimezoneOffset(),
          screen: (window.screen ? window.screen.width + 'x' + window.screen.height : '') + ' @' + (window.devicePixelRatio || 1),
          touch: supports(function () { return window.matchMedia('(pointer: coarse)').matches; })
        },
        features: {
          indexedDB: supports(function () { return window.indexedDB; }),
          crypto: C.cryptoAvailable(),
          shareFiles: A.canShareFiles(),
          compressionStream: typeof window.CompressionStream === 'function',
          dialog: typeof window.HTMLDialogElement === 'function',
          cssHas: supports(function () { return window.CSS && window.CSS.supports('selector(:has(a))'); }),
          geolocation: !!navigator.geolocation,
          camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
          folderAccess: typeof window.showDirectoryPicker === 'function'
        },
        storage: {
          kind: S.storageKind,
          persisted: S.persisted,
          usedMB: e && e.usage !== undefined ? Math.round(e.usage / 104857.6) / 10 : null,
          quotaMB: e && e.quota ? Math.round(e.quota / 1048576) : null,
          photosLoading: S.photosLoading
        },
        lock: { status: A.lockStatus(), requiredBySetup: A.lockRequired(), autoLockMinutes: S.settings.autoLockMinutes },
        setup: S.setup ? { loaded: true, people: S.setup.people.length, equipment: S.setup.equipment.length, rateSchedules: S.setup.rateSchedules.length } : { loaded: false },
        sync: A.syncStatus ? A.syncStatus() : null,
        clock: { offsetMs: S.clock.offsetMs, source: S.clock.source, checkedAt: S.clock.checkedAt },
        incidents: S.lock.locked ? [] : Array.from(S.incidents.values()).map(function (inc) {
          var p = C.countPending(inc);
          return {
            id: inc.id.slice(0, 8), exercise: inc.exercise === true, closed: C.isClosed(inc), created: inc.createdAt,
            entries: inc.entries.length, versions: inc.revs.length, photos: inc.atts.length,
            conflicts: C.conflictList(inc).length, notBackedUp: p.total, lastPackage: inc.lastExportAt
          };
        }),
        errors: recentErrors.slice()
      };
    });
  }

  function saveDiagnostics() {
    diagnostics().then(function (rep) {
      download('fieldics-diagnostics_' + C.slug(deviceLabel()) + '_' + C.stamp() + '.json', new Blob([JSON.stringify(rep, null, 1)], { type: 'application/json' }));
      toast('Diagnostics file saved. It holds counts and settings only, no incident details.');
    });
  }

  /* ---------- exports ---------- */

  A.closedBanner = closedBanner;
  A.reopenIncident = reopen;
  A.openCloseOut = A.withPhotos(openCloseOut);
  A.makeArchive = makeArchive;
  A.closeOutCard = closeOutCard;
  A.signoffBar = signoffBar;
  A.openSignoff = openSignoff;
  A.diagnostics = diagnostics;
  A.saveDiagnostics = saveDiagnostics;
  A.noteError = noteError;
  A.archivePrintouts = printouts;
})(window.FieldApp);
