/* FieldICS: Share screen, package export and import, CSV files, and reports. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var COST_NAMES = A.COST_NAMES;
  var COST_TYPES = A.COST_TYPES;
  var MAX_IMPORT_BYTES = A.MAX_IMPORT_BYTES;
  var S = A.S;
  var btn = A.btn;
  var canShareFiles = A.canShareFiles;
  var closeDialog = A.closeDialog;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var currentPeriodNumber = A.currentPeriodNumber;
  var deviceLabel = A.deviceLabel;
  var download = A.download;
  var fmtDT = A.fmtDT;
  var h = A.h;
  var openDialog = A.openDialog;
  var periodLabel = A.periodLabel;
  var persist = A.persist;
  var persistSettings = A.persistSettings;
  var plural = A.plural;
  var readFileText = A.readFileText;
  var recordTitle = A.recordTitle;
  var render = A.render;
  var showError = A.showError;
  var showMessage = A.showMessage;
  var toast = A.toast;
  var track = A.track;
  var openCostPrint = A.later('openCostPrint');
  var openLogPrint = A.later('openLogPrint');
  var printIAP = A.later('printIAP');
  var printMany = A.later('printMany');
  var printOne = A.later('printOne');
  var printCheckins = A.later('printCheckins');
  var printPaperKit = A.later('printPaperKit');
  var printMetrics = A.later('printMetrics');
  var downloadMetricsCSV = A.later('downloadMetricsCSV');
  var openIAPCheck = A.later('openIAPCheck');
  var openCostCheck = A.later('openCostCheck');
  var openQRSend = A.later('openQRSend');
  var openQRReceive = A.later('openQRReceive');
  var applySetupObject = A.later('applySetupObject');
  var clockFromPackage = A.later('clockFromPackage');

  /* ---------- share ---------- */

  function pendingText(inc) {
    var p = C.countPending(inc);
    var parts = [];
    if (p.entries) parts.push(plural(p.entries, 'log entry', 'log entries'));
    if (p.revs) parts.push(plural(p.revs, 'form change', 'form changes'));
    if (p.atts) parts.push(plural(p.atts, 'photo', 'photos'));
    if (!inc.lastExportAt) return 'You have not saved a package file for this incident yet.';
    if (!parts.length) return 'Nothing new since you last saved a package file (' + fmtDT(inc.lastExportAt) + ').';
    return parts.join(', ') + ' since you last saved a package file (' + fmtDT(inc.lastExportAt) + ').';
  }

  function shareView(inc) {
    var root = h('div');
    var share = h('section', { class: 'card' });
    share.appendChild(h('h2', { text: 'Share between devices' }));
    share.appendChild(h('p', { text: 'Save a package file, move it any way you can (USB drive, email, text, AirDrop or Nearby Share, a shared folder), then import it on the other device. Everything merges: the log, every form, cost entries, and photos.' }));
    share.appendChild(h('p', { id: 'pendingNote', class: 'hint', text: pendingText(inc) }));
    share.appendChild(h('div', { class: 'row wrap' },
      btn('Save package file', function () { openExport(); }, 'btn-primary', { id: 'exportBtn' }),
      btn('Import package file', function () { chooseImport(); }, '', { id: 'importBtn' })));
    share.appendChild(h('h3', { class: 'small-title', text: 'Phone to phone with no signal' }));
    share.appendChild(h('p', { class: 'hint', text: 'Show a moving QR code on this device and point the other device\'s camera at it. Sends the log and forms without photos. Works best for changes since the last transfer.' }));
    share.appendChild(h('div', { class: 'row wrap' },
      btn('Send by QR code', function () { openQRSend(); }, '', { id: 'qrSendBtn' }),
      btn('Receive by QR code', function () { openQRReceive(); }, '', { id: 'qrReceiveBtn' })));
    root.appendChild(share);

    var printCard = h('section', { class: 'card' });
    printCard.appendChild(h('h2', { text: 'Print or save as PDF' }));
    printCard.appendChild(h('p', { class: 'hint', text: 'Each button shows the forms ready to go. Save a PDF on the device, share it, or print it. Forms follow ICS block order with the incident name and operational period filled in.' }));
    var list = C.periods(inc);
    var n = currentPeriodNumber(inc);
    var iapRow = h('div', { class: 'row wrap' });
    if (list.length) {
      var ps = h('select', { id: 'iapPeriod', 'aria-label': 'Operational period for the IAP' });
      list.forEach(function (p) { ps.appendChild(h('option', { value: String(p.n), text: 'Period ' + periodLabel(p), selected: p.n === n })); });
      iapRow.appendChild(ps);
      iapRow.appendChild(btn('IAP (202, 203, 204s, 205)', function () { printIAP(inc, +ps.value); }, 'btn-primary', { id: 'printIap' }));
      iapRow.appendChild(btn('Check the IAP', function () { openIAPCheck(inc, +ps.value); }, 'btn-quiet', { id: 'checkIapShare' }));
    } else {
      iapRow.appendChild(h('span', { class: 'hint', text: 'Create an operational period to print an incident action plan.' }));
    }
    printCard.appendChild(iapRow);
    printCard.appendChild(h('div', { class: 'row wrap' },
      btn('ICS 214 activity log', function () { openLogPrint(); }),
      btn('ICS 201 briefing', function () { printOne(inc, '201'); }),
      btn('ICS 211 check-in list', function () { printCheckins(inc, false); }),
      btn('All ICS 213 messages', function () { printMany(inc, '213'); }),
      btn('All ICS 213 RR requests', function () { printMany(inc, '213RR'); }),
      btn('PA cost summary', function () { openCostPrint(); }),
      btn('Check cost documentation', function () { openCostCheck(inc); }, 'btn-quiet', { id: 'checkCostsShare' })));
    printCard.appendChild(h('h3', { class: 'small-title', text: 'Paper backup kit' }));
    printCard.appendChild(h('p', { class: 'hint', text: 'Blank forms and sign-in sheets to keep in the EOC and vehicles for when devices are down: 201 to 214, plus daily labor, equipment, and materials logs.' }));
    printCard.appendChild(btn('Paper backup kit', function () { printPaperKit(); }, '', { id: 'paperKitBtn' }));
    root.appendChild(printCard);

    var csv = h('section', { class: 'card' });
    csv.appendChild(h('h2', { text: 'Spreadsheets (CSV)' }));
    var csvRow = h('div', { class: 'row wrap' }, btn('ICS 214 log', function () { downloadLogCSV(); }, 'btn-quiet'));
    COST_TYPES.forEach(function (t) { csvRow.appendChild(btn(COST_NAMES[t], function () { downloadCostCSV(inc, t); }, 'btn-quiet')); });
    csv.appendChild(csvRow);
    root.appendChild(csv);

    var rep = h('section', { class: 'card' });
    rep.appendChild(h('h2', { text: 'Pilot metrics' }));
    rep.appendChild(h('p', { class: 'hint', text: 'Counts of what this device documented, for grant and pilot reports: incidents and exercises, log entries, forms, check-ins, costs, and sharing. No names or form contents.' }));
    rep.appendChild(h('div', { class: 'row wrap' },
      btn('Metrics report', function () { printMetrics(); }, '', { id: 'metricsBtn' }),
      btn('Metrics CSV', function () { downloadMetricsCSV(); }, 'btn-quiet')));
    root.appendChild(rep);
    return root;
  }

  function sizeText(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function photoBytes(inc, since) {
    var n = 0;
    inc.atts.forEach(function (a) { if (!since || (a._rx && a._rx > since)) n += a.data.length * 0.75; });
    return n;
  }

  function openExport() {
    var inc = cur();
    if (!inc) return;
    commitSession('leave');
    var p = C.countPending(inc);
    document.getElementsByName('expScope')[0].checked = true;
    $('expChanges').disabled = !inc.lastExportAt;
    $('expChangesCount').textContent = inc.lastExportAt ? '(' + plural(p.total, 'item', 'items') + ' now)' : '(available after your first export)';
    $('expPass').value = '';
    $('expPass2').value = '';
    var bytes = photoBytes(inc, null);
    $('expNoPhotos').checked = false;
    $('expPhotosNote').textContent = inc.atts.length
      ? plural(inc.atts.length, 'photo', 'photos') + ', about ' + sizeText(bytes) + '. Leave them out to send a small file by email or text, and send them later with a full package.'
      : 'This incident has no photos.';
    $('expNoPhotos').disabled = !inc.atts.length;
    showError($('expError'), '');
    var enc = C.cryptoAvailable();
    $('expPass').disabled = !enc;
    $('expPass2').disabled = !enc;
    if (!enc) $('expPassHint').textContent = 'Passphrase protection is not available in this browser or page. Serve the app over HTTPS to turn it on.';
    $('expShare').hidden = !canShareFiles();
    openDialog($('exportDialog'));
  }

  function makeExport() {
    var inc = cur();
    var scope = 'full';
    var radios = document.getElementsByName('expScope');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) scope = radios[i].value;
    var pass = $('expPass').value;
    var pass2 = $('expPass2').value;
    if ((pass || pass2) && pass !== pass2) return Promise.reject(new Error('The passphrases do not match.'));
    var noPhotos = $('expNoPhotos').checked;
    var now = C.nowISO();
    var pkg = C.buildPackage(inc, { changesOnly: scope === 'changes', noPhotos: noPhotos, deviceId: S.settings.deviceId, deviceName: deviceLabel(), now: now });
    var count = pkg.entries.length + pkg.revs.length + pkg.atts.length;
    if (!count && pkg.scope === 'changes') return Promise.reject(new Error('Nothing new to export since your last export.'));
    var locked = !!pass;
    var step = locked ? C.encryptPackage(pkg, pass) : Promise.resolve(pkg);
    return step.then(function (out) {
      var text = JSON.stringify(out, null, locked ? 0 : 1);
      var name = 'fieldics_' + C.slug(inc.name) + '_' + C.stamp() + '_' + C.slug(deviceLabel()) + (pkg.scope === 'changes' ? '_changes' : '') +
        (noPhotos ? '_no-photos' : '') + (inc.exercise ? '_exercise' : '') + (locked ? '_locked' : '') + '.json';
      return { text: text, filename: name, count: count, exportedAt: now, locked: locked, noPhotos: noPhotos && inc.atts.length > 0 };
    });
  }

  function finishExport(result, verb) {
    var inc = cur();
    /* A file without photos covers the log and forms; the photos stay pending. */
    C.markExported(inc, result.exportedAt, { noPhotos: result.noPhotos });
    persist(inc);
    track('exports');
    closeDialog($('exportDialog'));
    render();
    toast(verb + ' ' + plural(result.count, 'item', 'items') + (result.locked ? ' (locked)' : '') + (result.noPhotos ? ', without photos.' : '.'));
  }

  function wireExport() {
    $('expCancel').addEventListener('click', function () { closeDialog($('exportDialog')); });
    $('expForm').addEventListener('submit', function (e) {
      e.preventDefault();
      showError($('expError'), '');
      $('expSave').disabled = true;
      makeExport().then(function (result) {
        download(result.filename, new Blob([result.text], { type: 'application/json' }));
        finishExport(result, 'Saved');
      }).catch(function (err) {
        showError($('expError'), err.message);
      }).then(function () {
        $('expSave').disabled = false;
      });
    });
    $('expShare').addEventListener('click', function () {
      showError($('expError'), '');
      $('expShare').disabled = true;
      makeExport().then(function (result) {
        var file = new File([result.text], result.filename, { type: 'application/json' });
        return navigator.share({ files: [file], title: 'FieldICS: ' + cur().name }).then(function () {
          finishExport(result, 'Shared');
        }, function (err) {
          if (err && err.name === 'AbortError') return;
          throw err;
        });
      }).catch(function (err) {
        showError($('expError'), err.message || 'Sharing did not work. Use Save file instead.');
      }).then(function () {
        $('expShare').disabled = false;
      });
    });
  }

  /* ---------- import ---------- */

  function askPassphrase(opts) {
    return new Promise(function (resolve) {
      var d = $('passDialog');
      var form = $('passForm');
      var input = $('passInput');
      var finished = false;
      $('passTitle').textContent = opts.title || 'Passphrase';
      $('passMessage').textContent = opts.message || '';
      showError($('passError'), opts.error || '');
      input.value = '';
      function finish(value) {
        if (finished) return;
        finished = true;
        form.removeEventListener('submit', onSubmit);
        $('passCancel').removeEventListener('click', onCancel);
        d.removeEventListener('cancel', onCancel);
        closeDialog(d);
        resolve(value);
      }
      function onSubmit(e) { e.preventDefault(); finish(input.value); }
      function onCancel() { finish(null); }
      form.addEventListener('submit', onSubmit);
      $('passCancel').addEventListener('click', onCancel);
      d.addEventListener('cancel', onCancel);
      openDialog(d);
      input.focus();
    });
  }

  function unlock(envelope, filename, errorText) {
    return askPassphrase({ title: 'Locked file', message: 'Enter the passphrase for ' + filename + '.', error: errorText }).then(function (pass) {
      if (pass === null) return null;
      return C.decryptPackage(envelope, pass).catch(function (err) {
        return unlock(envelope, filename, err.message);
      });
    });
  }

  /* Merges one package object and adds what happened to `lines`. */
  function mergeOne(pkg, name, lines) {
    var id = pkg.incident && typeof pkg.incident.id === 'string' ? pkg.incident.id : '';
    var target = id && S.incidents.has(id) ? S.incidents.get(id) : null;
    var res = C.mergePackage(target, pkg);
    if (target && target._period) res.incident._period = target._period;
    S.incidents.set(res.incident.id, res.incident);
    S.currentId = res.incident.id;
    S.settings.lastIncidentId = res.incident.id;
    persist(res.incident);
    track('imports', res.incident.id);
    var r = res.report;
    var from = r.fromDevice ? ' from ' + r.fromDevice : '';
    var counts = plural(r.added, 'log entry', 'log entries') + ', ' + plural(r.formsAdded, 'form version', 'form versions') + ', ' + plural(r.imagesAdded, 'photo', 'photos');
    if (r.createdIncident) {
      lines.push(name + ': opened "' + r.incidentName + '"' + from + ' with ' + counts + '.' + (res.incident.exercise ? ' It is marked as an exercise.' : ''));
    } else {
      var dup = r.duplicates + r.formsDuplicate + r.imagesDuplicate;
      lines.push(name + ': merged into "' + r.incidentName + '"' + from + '. New: ' + counts + '. Already here: ' + dup + '.');
    }
    if (r.photosLeftOut) lines.push('This file was saved without photos. Forms that have photos will show them once a package with photos is imported.');
    if (r.metaChanged) lines.push('The incident name or details were updated from this file.');
    var clash = r.conflicts.length + r.formsConflicts.length + r.imagesConflicts.length;
    if (clash) lines.push(plural(clash, 'item has', 'items have') + ' the same id as something on this device but different content. Your copy was kept. Check with whoever sent the file.');
    if (r.formsRejected) lines.push(plural(r.formsRejected, 'form version', 'form versions') + ' did not match the form already on this device and were skipped.');
    if (r.newConflicts.length) {
      var names = r.newConflicts.map(function (rid) { return recordTitle(C.getRecord(res.incident, rid)); });
      lines.push(plural(names.length, 'form now has', 'forms now have') + ' versions saved separately on different devices: ' + names.join('; ') + '. Use the yellow bar at the top to compare them.');
    }
    var clock = clockFromPackage(r);
    if (clock) lines.push(clock);
    return res;
  }

  /* Imports text from a file or a QR transfer: a package, a locked package, or a setup file. */
  function importText(text, name, lines) {
    var obj = null;
    try { obj = JSON.parse(text); } catch (e) { obj = null; }
    if (obj && obj.format === 'field-ics-setup') {
      return Promise.resolve(applySetupObject(obj, name)).then(function (done) {
        lines.push(name + ': ' + (done ? 'locality setup loaded.' : 'setup not loaded.'));
      });
    }
    var kind = C.parseFileText(text);
    var step;
    if (kind.kind === 'invalid') {
      lines.push(name + ': ' + kind.error);
      return Promise.resolve();
    }
    if (kind.kind === 'encrypted') {
      if (!C.cryptoAvailable()) {
        lines.push(name + ': this file is locked, and unlocking is not available in this browser or page.');
        return Promise.resolve();
      }
      step = unlock(kind.data, name, '').then(function (pkg) {
        if (pkg === null) lines.push(name + ': skipped.');
        return pkg;
      });
    } else {
      step = Promise.resolve(kind.data);
    }
    return step.then(function (pkg) {
      if (pkg) mergeOne(pkg, name, lines);
    }).catch(function (err) {
      lines.push(name + ': ' + err.message);
    });
  }

  function importOne(file, lines) {
    if (file.size > MAX_IMPORT_BYTES) {
      lines.push(file.name + ': this file is too large to import.');
      return Promise.resolve();
    }
    return readFileText(file).then(function (text) {
      return importText(text, file.name, lines);
    }).catch(function (err) {
      lines.push(file.name + ': ' + err.message);
    });
  }

  function finishImport(lines) {
    if (S.session && !S.session.dirty) S.session = null;
    S.logDraft.correcting = null;
    persistSettings();
    render();
    showMessage('Import finished', lines);
  }

  function importFiles(files) {
    if (!files.length) return;
    commitSession('leave');
    var lines = [];
    var chain = Promise.resolve();
    files.forEach(function (f) { chain = chain.then(function () { return importOne(f, lines); }); });
    chain.then(function () { finishImport(lines); });
  }

  function chooseImport() {
    $('importFile').value = '';
    $('importFile').click();
  }

  /* ---------- CSV ---------- */

  function downloadLogCSV() {
    var inc = cur();
    if (!inc) return;
    download('fieldics_' + C.slug(inc.name) + '_' + C.stamp() + '_ics214.csv', new Blob(['﻿' + C.toCSV(inc)], { type: 'text/csv;charset=utf-8' }));
    toast('CSV saved. Times in the CSV are UTC.');
  }

  function downloadCostCSV(inc, type) {
    commitSession('leave');
    var csv = '﻿' + C.costCSV(inc, type, { category: S.costFilter.category, site: S.costFilter.site });
    download('fieldics_' + C.slug(inc.name) + '_' + C.stamp() + '_' + type + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    toast(COST_NAMES[type] + ' CSV saved.');
  }

  /* ---------- exports ---------- */

  A.pendingText = pendingText;
  A.shareView = shareView;
  A.openExport = openExport;
  A.makeExport = makeExport;
  A.finishExport = finishExport;
  A.wireExport = wireExport;
  A.askPassphrase = askPassphrase;
  A.unlock = unlock;
  A.importText = importText;
  A.importOne = importOne;
  A.importFiles = importFiles;
  A.finishImport = finishImport;
  A.chooseImport = chooseImport;
  A.downloadLogCSV = downloadLogCSV;
  A.downloadCostCSV = downloadCostCSV;
})(window.FieldApp);
