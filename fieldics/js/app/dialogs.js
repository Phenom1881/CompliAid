/* FieldICS: Incident, operational period, and settings dialogs. */
(function (A) {
  'use strict';

  var $ = A.$;
  var APP_NAME = A.APP_NAME;
  var C = A.C;
  var S = A.S;
  var clearStoredSession = A.clearStoredSession;
  var closeDialog = A.closeDialog;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var deviceLabel = A.deviceLabel;
  var fmtShort = A.fmtShort;
  var fromLocalInput = A.fromLocalInput;
  var go = A.go;
  var idOf = A.idOf;
  var isoToInput = A.isoToInput;
  var nowMinute = A.nowMinute;
  var openDialog = A.openDialog;
  var persist = A.persist;
  var persistSettings = A.persistSettings;
  var render = A.render;
  var showError = A.showError;
  var sortedIncidents = A.sortedIncidents;
  var toLocalInput = A.toLocalInput;
  var toast = A.toast;
  var whoName = A.whoName;

  /* ---------- incident dialog ---------- */

  var incMode = 'new';

  function openIncidentDialog(mode) {
    var inc = cur();
    if (mode === 'edit' && !inc) return;
    incMode = mode;
    $('incTitle').textContent = mode === 'new' ? 'New incident' : 'Incident details';
    $('incDelete').hidden = mode !== 'edit';
    $('incPeriodBox').hidden = mode !== 'new';
    showError($('incError'), '');
    if (mode === 'edit') {
      $('incName').value = inc.name;
      $('incNumber').value = inc.number || '';
      $('incLocation').value = inc.location || '';
      $('incApplicant').value = inc.applicant || '';
      $('incPaId').value = inc.paId || '';
      $('incDisaster').value = inc.disasterNumber || '';
      $('incExercise').checked = inc.exercise === true;
      $('incAltDebris').checked = inc.altDebris === true;
      $('incSystem').value = inc.hics ? 'hics' : 'ics';
      $('incCostBox').open = !!(inc.applicant || inc.paId || inc.disasterNumber || inc.altDebris);
    } else {
      ['incName', 'incNumber', 'incLocation', 'incApplicant', 'incPaId', 'incDisaster'].forEach(function (id) { $(id).value = ''; });
      $('incApplicant').value = A.setup().locality.applicant || '';
      $('incExercise').checked = false;
      $('incAltDebris').checked = false;
      $('incSystem').value = A.setup().options.hics ? 'hics' : 'ics';
      $('incCostBox').open = false;
      var start = nowMinute();
      start.setMinutes(0);
      var end = new Date(start.getTime() + 12 * 3600 * 1000);
      $('incStart').value = toLocalInput(start);
      $('incEnd').value = toLocalInput(end);
    }
    openDialog($('incidentDialog'));
    $('incName').focus();
  }

  function incFields() {
    return {
      name: $('incName').value,
      number: $('incNumber').value,
      location: $('incLocation').value,
      applicant: $('incApplicant').value,
      paId: $('incPaId').value,
      disasterNumber: $('incDisaster').value,
      exercise: $('incExercise').checked,
      altDebris: $('incAltDebris').checked,
      hics: $('incSystem').value === 'hics'
    };
  }

  function wireIncidentDialog() {
    $('incCancel').addEventListener('click', function () { closeDialog($('incidentDialog')); });
    $('incForm').addEventListener('submit', function (e) {
      e.preventDefault();
      try {
        if (incMode === 'new') {
          var start = fromLocalInput($('incStart').value);
          var end = fromLocalInput($('incEnd').value);
          if (start && end && Date.parse(end) <= Date.parse(start)) throw new Error('The operational period end must be after the start.');
          if (start && !end) end = new Date(Date.parse(start) + 12 * 3600 * 1000).toISOString();
          commitSession('leave');
          S.session = null;
          var inc = C.createIncident(incFields(), deviceLabel());
          if (start) {
            C.saveRecord(inc, { type: 'period', period: 1, data: { start: start, end: end }, by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel() });
            inc._period = 1;
          }
          S.incidents.set(inc.id, inc);
          S.currentId = inc.id;
          S.settings.lastIncidentId = inc.id;
          S.logFilter = { author: '', period: '' };
          S.logDraft.correcting = null;
          persist(inc);
          persistSettings();
          closeDialog($('incidentDialog'));
          go('#/log');
          toast('Incident created.');
          return;
        }
        C.updateIncidentMeta(cur(), incFields(), deviceLabel());
        persist(cur());
      } catch (err) {
        showError($('incError'), err.message);
        return;
      }
      closeDialog($('incidentDialog'));
      render();
    });
    $('incDelete').addEventListener('click', function () {
      var inc = cur();
      if (!inc) return;
      var p = C.countPending(inc);
      var msg = 'Remove "' + inc.name + '" from this device?\n\n' +
        (p.total ? p.total + ' items have not been saved to a package file.\n\n' : '') +
        'Save a package file first if you need a copy. This cannot be undone on this device.';
      if (!window.confirm(msg)) return;
      S.session = null;
      clearStoredSession();
      S.incidents.delete(inc.id);
      if (S.store) S.store.deleteIncident(inc.id).catch(function () { /* removed from view regardless */ });
      if (A.syncStatus && A.syncStatus().on) A.syncForget(inc.id);
      var rest = sortedIncidents();
      S.currentId = rest.length ? rest[0].id : null;
      S.settings.lastIncidentId = S.currentId;
      persistSettings();
      closeDialog($('incidentDialog'));
      go('#/log');
      toast('Incident removed from this device.');
    });
  }


  /* ---------- period dialog ---------- */

  var perState = { mode: 'new', n: 1 };

  function openPeriodDialog(mode, n) {
    var inc = cur();
    if (!inc) return;
    commitSession('leave');
    perState.mode = mode;
    perState.n = mode === 'new' ? C.nextPeriodNumber(inc) : n;
    var g = C.getRecord(inc, C.recordId('period', perState.n));
    $('perTitle').textContent = (mode === 'new' ? 'New operational period ' : 'Operational period ') + perState.n;
    showError($('perError'), '');
    var note = $('perNote');
    note.hidden = true;
    if (mode === 'new') {
      var list = C.periods(inc);
      var last = list[list.length - 1];
      var start = last && last.end ? new Date(last.end) : (function () { var d = nowMinute(); d.setMinutes(0); return d; })();
      $('perStart').value = toLocalInput(start);
      $('perEnd').value = toLocalInput(new Date(start.getTime() + 12 * 3600 * 1000));
      $('perDelete').hidden = true;
    } else {
      if (!g) return;
      $('perStart').value = isoToInput(g.winner.data.start);
      $('perEnd').value = isoToInput(g.winner.data.end);
      $('perDelete').hidden = false;
      if (g.conflict) {
        note.textContent = 'This period was saved separately on two devices: ' + g.heads.map(function (x) {
          return fmtShort(x.data.start) + ' to ' + fmtShort(x.data.end) + ' (' + (x.by || 'someone') + ')';
        }).join('; ') + '. Saving here keeps the times shown below.';
        note.hidden = false;
      }
    }
    openDialog($('periodDialog'));
    $('perStart').focus();
  }

  function wirePeriodDialog() {
    $('perCancel').addEventListener('click', function () { closeDialog($('periodDialog')); });
    $('perForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var inc = cur();
      var start = fromLocalInput($('perStart').value);
      var end = fromLocalInput($('perEnd').value);
      if (!start || !end) {
        showError($('perError'), 'Enter a start and an end.');
        return;
      }
      if (Date.parse(end) <= Date.parse(start)) {
        showError($('perError'), 'The end must be after the start.');
        return;
      }
      var g = C.getRecord(inc, C.recordId('period', perState.n));
      try {
        C.saveRecord(inc, {
          type: 'period', period: perState.n, parents: g ? g.heads.map(idOf) : [],
          data: { start: start, end: end }, by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel()
        });
      } catch (err) {
        showError($('perError'), err.message);
        return;
      }
      S.session = null;
      inc._period = perState.n;
      persist(inc);
      closeDialog($('periodDialog'));
      render();
      toast('Operational period ' + perState.n + ' saved.');
    });
    $('perDelete').addEventListener('click', function () {
      var inc = cur();
      var n = perState.n;
      if (C.formsInPeriod(inc, n).length) {
        showError($('perError'), 'This period has forms in it, so it cannot be removed. Delete its 204s first; the 202, 203, and 205 stay with the period.');
        return;
      }
      if (!window.confirm('Remove operational period ' + n + '?')) return;
      var g = C.getRecord(inc, C.recordId('period', n));
      C.saveRecord(inc, {
        type: 'period', period: n, parents: g.heads.map(idOf), deleted: true,
        by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel()
      });
      inc._period = null;
      persist(inc);
      closeDialog($('periodDialog'));
      render();
    });
  }

  /* ---------- settings ---------- */

  var displayBefore = null;

  function openSettings() {
    displayBefore = { theme: S.settings.theme, textSize: S.settings.textSize };
    $('setDevice').value = S.settings.deviceName;
    $('setAuthor').value = S.settings.name;
    $('setPosition').value = S.settings.position;
    $('setAgency').value = S.settings.agency;
    $('setTheme').value = S.settings.theme;
    $('setText').value = S.settings.textSize;
    $('setLockState').textContent = { off: 'Off', on: 'On', locked: 'Locked' }[A.lockStatus()];
    $('setSetupState').textContent = A.setup().locality.name || (S.setup ? 'Loaded' : 'None loaded');
    $('setSyncState').textContent = A.syncStatus ? A.syncStatus().label : '';
    $('setPracticeBtn').hidden = !S.ready || S.lock.locked;
    var kinds = { indexeddb: 'device storage (IndexedDB)', localstorage: 'basic browser storage', memory: 'memory only (nothing is kept when this page closes)' };
    var info = APP_NAME + '. Device ID ' + S.settings.deviceId.slice(0, 8) + '. Saving to ' + (kinds[S.storageKind] || 'unknown storage') + '. ';
    if (S.persisted === true) info += 'The browser has marked this data as protected from automatic cleanup. ';
    else if (S.persisted === false) info += 'The browser may remove saved data if the device runs low on space, so save package files regularly. ';
    $('setInfo').textContent = info;
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      navigator.storage.estimate().then(function (est) {
        if (est && est.usage !== undefined && est.quota) {
          $('setInfo').textContent = info + 'Using ' + (est.usage / 1048576).toFixed(1) + ' MB of about ' + Math.round(est.quota / 1048576) + ' MB available.';
        }
      }, function () { /* ignore */ });
    }
    openDialog($('settingsDialog'));
  }

  function wireSettings() {
    $('settingsBtn').addEventListener('click', openSettings);
    $('setCancel').addEventListener('click', function () {
      if (displayBefore) {
        S.settings.theme = displayBefore.theme;
        S.settings.textSize = displayBefore.textSize;
        A.applyDisplay();
      }
      closeDialog($('settingsDialog'));
    });
    function fromSettings(fn) {
      return function () {
        closeDialog($('settingsDialog'));
        fn();
      };
    }
    $('setSetupBtn').addEventListener('click', fromSettings(function () { A.openSetup(); }));
    $('setLockBtn').addEventListener('click', fromSettings(function () { A.openLockSettings(); }));
    $('setClockBtn').addEventListener('click', fromSettings(function () { A.openClockCheck(); }));
    $('setSyncBtn').addEventListener('click', fromSettings(function () { A.openSyncSettings(); }));
    $('setPracticeBtn').addEventListener('click', fromSettings(function () { A.loadPractice(); }));
    $('setHelpBtn').addEventListener('click', fromSettings(function () { A.openHelp(); }));
    $('setDiagBtn').addEventListener('click', fromSettings(function () { A.saveDiagnostics(); }));
    ['setTheme', 'setText'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        S.settings.theme = $('setTheme').value;
        S.settings.textSize = $('setText').value;
        A.applyDisplay();
      });
    });
    $('setForm').addEventListener('submit', function (e) {
      e.preventDefault();
      S.settings.deviceName = $('setDevice').value.trim().slice(0, 120);
      S.settings.name = $('setAuthor').value.trim().slice(0, 120);
      S.settings.position = $('setPosition').value.trim().slice(0, 120);
      S.settings.agency = $('setAgency').value.trim().slice(0, 200);
      S.settings.theme = $('setTheme').value;
      S.settings.textSize = $('setText').value;
      A.applyDisplay();
      S.logDraft.author = S.settings.name;
      S.logDraft.position = S.settings.position;
      persistSettings();
      closeDialog($('settingsDialog'));
      render();
      toast('Settings saved.');
    });
  }

  /* ---------- exports ---------- */

  A.incMode = incMode;
  A.openIncidentDialog = openIncidentDialog;
  A.incFields = incFields;
  A.wireIncidentDialog = wireIncidentDialog;
  A.perState = perState;
  A.openPeriodDialog = openPeriodDialog;
  A.wirePeriodDialog = wirePeriodDialog;
  A.openSettings = openSettings;
  A.wireSettings = wireSettings;
})(window.FieldApp);
