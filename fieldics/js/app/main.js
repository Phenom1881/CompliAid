/* FieldICS: Startup: wiring, service worker, and init. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var F = A.F;
  var S = A.S;
  var Store = A.Store;
  var bannerState = A.bannerState;
  var closePanel = A.closePanel;
  var commitSession = A.commitSession;
  var defaultSettings = A.defaultSettings;
  var fillDatalist = A.fillDatalist;
  var importFiles = A.importFiles;
  var normalizeSettings = A.normalizeSettings;
  var onRoute = A.onRoute;
  var parseRoute = A.parseRoute;
  var persistSettings = A.persistSettings;
  var recoverSession = A.recoverSession;
  var render = A.render;
  var renderStatus = A.renderStatus;
  var sortedIncidents = A.sortedIncidents;
  var toLocalInput = A.toLocalInput;
  var toast = A.toast;
  var updateBanner = A.updateBanner;
  var wireCostPrint = A.wireCostPrint;
  var wireExport = A.wireExport;
  var wireIncidentDialog = A.wireIncidentDialog;
  var wireLogPrint = A.wireLogPrint;
  var wirePeriodDialog = A.wirePeriodDialog;
  var wireSettings = A.wireSettings;
  var applyDisplay = A.applyDisplay;
  var wireQuickLog = A.wireQuickLog;
  var wireAutoLock = A.wireAutoLock;
  var renderNotices = A.renderNotices;
  var checkServerClock = A.checkServerClock;
  var stopQR = A.stopQR;
  var cur = A.cur;

  /* ---------- startup ---------- */

  function wireStatic() {
    wireIncidentDialog();
    wirePeriodDialog();
    wireSettings();
    wireExport();
    wireLogPrint();
    wireCostPrint();
    wireQuickLog();
    wireAutoLock();
    $('panelClose').addEventListener('click', closePanel);
    $('panelDialog').addEventListener('close', function () { stopQR(); });
    $('importFile').addEventListener('change', function () {
      importFiles(Array.prototype.slice.call(this.files || []));
    });
    fillDatalist('ics-positions', F.POSITIONS);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('online', renderStatus);
    window.addEventListener('offline', renderStatus);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && S.session && S.session.dirty) {
        var res = commitSession('hide');
        if (res.saved && res.problems && res.problems.length) render();
      }
    });
    window.addEventListener('pagehide', function () {
      if (S.session && S.session.dirty) commitSession('quiet');
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', applyDisplay);
    }
    /* Backup reminders come due with time, not only with edits. */
    setInterval(function () {
      if (S.ready && !S.lock.locked) renderNotices(cur());
    }, 60000);
    window.addEventListener('online', function () { checkServerClock(); });
    setInterval(function () {
      var t = $('entryTime');
      if (t && S.route.name === 'log' && !S.logDraft.timeTouched && !S.logDraft.text && document.activeElement !== t) {
        t.value = toLocalInput(new Date());
      }
    }, 30000);
  }

  function registerServiceWorker() {
    var secure = window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!('serviceWorker' in navigator) || !secure) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return;
      bannerState.startup = 'FieldICS was updated. Close and reopen it, or reload this page, to use the new version.';
      updateBanner();
    });
    navigator.serviceWorker.register('sw.js').then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () {
      S.swReady = true;
      renderStatus();
    }).catch(function () {
      renderStatus();
    });
  }

  var loadGen = 0;

  /*
   * Loads incidents, drafts, and the locality setup from a store (encrypted or not) and
   * shows the app. base: a raw store or an encrypting one. Photos load in the background
   * afterward, so opening or unlocking does not wait on them.
   */
  function loadData(base) {
    var store = Store.split(base);
    S.store = store;
    var gen = ++loadGen;
    S.photosLoading = true;
    return Promise.all([store.loadIncidents(), store.getKV('session'), store.getKV('setup')]).then(function (res) {
      S.incidents = new Map();
      res[0].forEach(function (raw) {
        var inc = C.upgradeIncident(raw);
        if (inc) S.incidents.set(inc.id, inc);
      });
      S.setup = null;
      if (res[2]) {
        try { S.setup = window.FieldSetup.parseSetup(res[2]); } catch (e) { S.setup = null; }
      }
      if (S.settings.lastIncidentId && S.incidents.has(S.settings.lastIncidentId)) S.currentId = S.settings.lastIncidentId;
      else S.currentId = sortedIncidents().length ? sortedIncidents()[0].id : null;
      S.ready = true;
      recoverSession(res[1]);
      S.route = parseRoute();
      render();
      loadPhotos(store, gen);
      S.photosReady.then(function () { if (gen === loadGen) A.syncLoad(); });
    }, function (err) {
      S.photosLoading = false;
      S.photosReady = Promise.resolve();
      throw err;
    });
  }

  function addPhoto(incId, att) {
    var inc = S.incidents.get(incId);
    if (!inc || C.getAttachment(inc, att.id)) return;
    inc.atts.push(att);
  }

  function loadPhotos(store, gen) {
    S.photosLoading = true;
    S.photosReady = store.loadAtts(function (batch) {
      if (gen !== loadGen) return false;
      batch.forEach(function (x) { addPhoto(x.incId, x.att); });
      if (batch.length) A.fillPhotos(false);
      return true;
    }).catch(function () {
      if (gen !== loadGen) return;
      bannerState.storage = 'Some photos could not be read from this device. Import a package file with photos to restore them.';
      updateBanner();
    }).then(function () {
      if (gen !== loadGen) return;
      S.photosLoading = false;
      A.fillPhotos(true);
      if (S.ready && !S.lock.locked) renderNotices(cur());
    });
  }

  /* Stops a background photo load (the app locked). */
  function stopPhotoLoad() {
    loadGen++;
    S.photosLoading = false;
    S.photosReady = Promise.resolve();
  }

  function init() {
    S.settings = defaultSettings();
    wireStatic();
    applyDisplay();
    A.startClock();
    S.route = parseRoute();
    render();
    Store.open({ upgradeIncident: function (raw) { return C.upgradeIncident(raw); } }).then(function (raw) {
      S.rawStore = raw;
      S.storageKind = raw.kind;
      return Promise.all([raw.getKV('settings'), raw.getKV('lock'), raw.getKV('events'), raw.getKV('lockConvert')]).then(function (res) {
        S.settings = normalizeSettings(res[0]);
        if (!res[0]) persistSettings();
        /* A flag left from turning the lock on that stopped before the lock was saved. */
        if (!res[1] && res[3]) raw.putKV('lockConvert', null).catch(function () { /* harmless */ });
        S.events = res[2] && typeof res[2] === 'object' ? res[2] : {};
        applyDisplay();
        if (raw.kind === 'memory') {
          bannerState.startup = 'This browser is blocking storage, so nothing you enter will be kept after this page closes. Allow site data, or turn off private browsing, and save package files often.';
        } else if (raw.kind === 'localstorage') {
          bannerState.startup = 'This browser only allows basic storage, which holds less. Save package files often.';
        }
        updateBanner();
        if (res[1]) {
          S.lock.record = res[1];
          S.lock.locked = true;
          S.ready = true;
          render();
          return null;
        }
        return loadData(raw);
      }).then(function () {
        if (raw.notes && raw.notes.length) toast(raw.notes.join(' '));
        checkServerClock();
      });
    }).catch(function (err) {
      bannerState.storage = 'FieldICS could not open its storage: ' + ((err && err.message) || 'unknown error') + '.';
      updateBanner();
    });
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().then(function (granted) { S.persisted = granted; }, function () { /* ignore */ });
    }
    registerServiceWorker();
  }

  /* ---------- exports ---------- */

  A.wireStatic = wireStatic;
  A.registerServiceWorker = registerServiceWorker;
  A.init = init;
  A.loadData = loadData;
  A.stopPhotoLoad = stopPhotoLoad;

  init();
})(window.FieldApp);
