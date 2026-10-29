/* FieldICS: App state, settings, saving to the device, editing sessions, routes, labels. */
(function (A) {
  'use strict';

  var afterSave = A.later('afterSave');
  var $ = A.$;
  var C = A.C;
  var COST_NAMES = A.COST_NAMES;
  var COST_TYPES = A.COST_TYPES;
  var F = A.F;
  var FORMS = A.FORMS;
  var ID_PART = A.ID_PART;
  var ROUTE_NAMES = A.ROUTE_NAMES;
  var bannerState = A.bannerState;
  var clone = A.clone;
  var fmtDT = A.fmtDT;
  var fmtDay = A.fmtDay;
  var fmtShort = A.fmtShort;
  var nowMinute = A.nowMinute;
  var openPeriodDialog = A.later('openPeriodDialog');
  var plural = A.plural;
  var render = A.later('render');
  var toast = A.toast;
  var todayInput = A.todayInput;
  var updateBanner = A.updateBanner;

  /* ---------- state ---------- */

  var S = {
    store: null,
    storageKind: '',
    settings: null,
    incidents: new Map(),
    currentId: null,
    session: null,
    route: { name: 'log', sub: null, id: null },
    logDraft: { text: '', time: '', timeTouched: false, correcting: null, author: null, position: null },
    logFilter: { author: '', period: '' },
    costFilter: { category: '', site: '' },
    rrStatus: '',
    showDeleted: false,
    pendingCompare: null,
    swReady: false,
    persisted: null,
    ready: false,
    rawStore: null,
    setup: null,
    events: {},
    lock: { record: null, unlocked: null, locked: false },
    clock: { offsetMs: null, source: '', checkedAt: '' },
    backupSnooze: {},
    checkinFilter: 'here',
    noteFilter: { show: 'all', q: '' },
    prefill: null,
    photosLoading: false,
    photosReady: Promise.resolve(),
    damageLevel: '',
    volunteerFilter: 'here'
  };

  function defaultSettings() {
    return {
      deviceId: C.uid(), deviceName: '', name: '', position: '', agency: '', newestFirst: true, lastIncidentId: null,
      theme: 'system', textSize: 'normal', autoLockMinutes: 10
    };
  }

  function str(v, max) {
    return typeof v === 'string' ? v.slice(0, max) : '';
  }

  function normalizeSettings(raw) {
    var d = defaultSettings();
    if (!raw || typeof raw !== 'object') return d;
    return {
      deviceId: typeof raw.deviceId === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(raw.deviceId) ? raw.deviceId : d.deviceId,
      deviceName: str(raw.deviceName, 120),
      name: str(raw.name, 120),
      position: str(raw.position, 120),
      agency: str(raw.agency, 200),
      newestFirst: raw.newestFirst !== false,
      lastIncidentId: typeof raw.lastIncidentId === 'string' ? raw.lastIncidentId : null,
      theme: ['system', 'light', 'dark'].indexOf(raw.theme) !== -1 ? raw.theme : 'system',
      textSize: ['normal', 'large', 'larger'].indexOf(raw.textSize) !== -1 ? raw.textSize : 'normal',
      autoLockMinutes: [2, 5, 10, 30, 60].indexOf(raw.autoLockMinutes) !== -1 ? raw.autoLockMinutes : 10
    };
  }

  /* Counts kept per incident for the pilot metrics report: exports, imports, prints, PDFs, QR transfers. */
  function track(kind, incId) {
    var id = incId || S.currentId;
    if (!id) return;
    var ev = S.events[id] || (S.events[id] = {});
    ev[kind] = (ev[kind] || 0) + 1;
    var st = S.rawStore || S.store;
    if (st) st.putKV('events', S.events).catch(function () { /* counts are a convenience */ });
  }

  /* The locality setup, or an empty one. */
  function setup() {
    return S.setup || window.FieldSetup.emptySetup();
  }

  function cur() {
    return S.currentId ? S.incidents.get(S.currentId) || null : null;
  }

  function deviceLabel() {
    return S.settings.deviceName || ('Device ' + S.settings.deviceId.slice(0, 4));
  }

  function whoName() {
    return S.settings.name || deviceLabel();
  }

  function sortedIncidents() {
    return Array.from(S.incidents.values()).sort(function (a, b) {
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }

  function currentPeriodNumber(inc) {
    var list = C.periods(inc);
    if (!list.length) return null;
    var n = inc._period;
    if (n && list.some(function (p) { return p.n === n; })) return n;
    return list[list.length - 1].n;
  }

  /* ---------- persistence ---------- */

  /*
   * Runs fn once stored photos have finished loading (they load in the background after
   * the app opens or unlocks), so printouts and package files always carry them.
   */
  function withPhotos(fn) {
    return function () {
      var self = this;
      var args = arguments;
      if (!S.photosLoading) return fn.apply(self, args);
      toast('Loading photos from this device...');
      S.photosReady.then(function () { fn.apply(self, args); });
      return undefined;
    };
  }

  function persist(inc) {
    if (!S.store || !inc) return Promise.resolve();
    return S.store.putIncident(inc).then(function () {
      if (A.syncChanged) A.syncChanged();
      if (bannerState.storage) {
        bannerState.storage = '';
        updateBanner();
      }
    }, function (err) {
      bannerState.storage = 'Could not save to this device (' + ((err && err.message) || 'storage error') +
        '). Save a package file now so you do not lose work.';
      updateBanner();
    });
  }

  /* Settings and counts are never encrypted, so they save even while the device is locked. */
  function persistSettings() {
    var st = S.rawStore || S.store;
    if (!st) return Promise.resolve();
    return st.putKV('settings', S.settings).catch(function () { /* settings are a convenience */ });
  }

  var sessionTimer = null;

  function sessionRecord(s) {
    return {
      incId: s.incId, type: s.type, rid: s.rid, period: s.period,
      baseHeads: s.baseHeads.slice(), data: s.data, isNew: s.isNew, savedAt: C.nowISO()
    };
  }

  function persistSessionSoon() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(function () {
      if (!S.store) return;
      var s = S.session;
      var rec = null;
      try {
        rec = s && s.dirty ? clone(sessionRecord(s)) : null;
      } catch (e) {
        rec = null;
      }
      S.store.putKV('session', rec).catch(function () { /* best effort */ });
    }, 700);
  }

  function clearStoredSession() {
    clearTimeout(sessionTimer);
    if (S.store) S.store.putKV('session', null).catch(function () { /* best effort */ });
  }

  /* ---------- editing sessions ---------- */

  function idOf(x) { return x.id; }

  function headKey(g) {
    return g ? g.heads.map(idOf).join(',') : '';
  }

  function defaultValue(f) {
    if (f.defValue !== undefined) return f.defValue;
    switch (f.def) {
      case 'now': return nowMinute().toISOString();
      case 'today': return todayInput();
      case 'me': return S.settings.name || '';
      case 'myPosition': return S.settings.position || '';
      case 'meAndPosition': return [S.settings.name, S.settings.position].filter(Boolean).join(', ');
      default: return undefined;
    }
  }

  function nextRequestNumber(inc) {
    var max = 0;
    C.listRecords(inc, '213RR', null, true).forEach(function (g) {
      var m = /(\d+)\s*$/.exec(g.winner.data.number || '');
      if (m && +m[1] > max) max = +m[1];
    });
    return String(max + 1);
  }

  function defaultsFor(inc, type) {
    var data = C.sanitize(type, {});
    F.fieldsOf(FORMS[type]).forEach(function (f) {
      var v = defaultValue(f);
      if (v !== undefined) data[f.k] = v;
    });
    if (type === '213RR') {
      data.number = nextRequestNumber(inc);
      data.items = [C.emptyRow(F.fieldByKey('213RR', 'items'))];
    }
    /* A new form started from somewhere else (a note made into a 213, for example). */
    if (S.prefill && S.prefill.type === type) {
      Object.keys(S.prefill.data).forEach(function (k) { data[k] = S.prefill.data[k]; });
      S.prefill = null;
    }
    return data;
  }

  function newSession(inc, type, period, data) {
    return {
      incId: inc.id,
      type: type,
      rid: C.recordId(type, period) || C.uid(),
      period: C.needsPeriod(type) ? period : null,
      baseHeads: [],
      data: data,
      dirty: false,
      isNew: true,
      seen: ''
    };
  }

  /* Returns the editing session for a record, creating it from the saved version. */
  function ensureSession(inc, type, rid, period, isNewRoute) {
    var s = S.session;
    if (s && s.incId === inc.id && s.type === type) {
      if (isNewRoute ? s.isNew : s.rid === rid) return s;
    }
    if (s && s.dirty) commitSession('switch');
    S.session = null;
    if (isNewRoute) {
      S.session = newSession(inc, type, period, defaultsFor(inc, type));
      return S.session;
    }
    var g = C.getRecord(inc, rid);
    S.session = {
      incId: inc.id,
      type: type,
      rid: rid,
      period: C.needsPeriod(type) ? period : null,
      baseHeads: g ? (g.deleted ? g.heads.map(idOf) : [g.winner.id]) : [],
      data: g ? clone(g.winner.data) : defaultsFor(inc, type),
      dirty: false,
      isNew: !g,
      seen: headKey(g)
    };
    return S.session;
  }

  function sessionLabel(s) {
    var def = FORMS[s.type];
    var label = def.code;
    if (def.group === 'cost') label = def.code.toLowerCase();
    if (s.period && def.scope === 'period') label += ' for period ' + s.period;
    return label;
  }

  /*
   * Saves the open form as a new version.
   * reason 'save' checks everything and refuses to save invalid data.
   * Any other reason (leaving, hiding, printing) saves what it can and blanks invalid values.
   */
  function commitSession(reason) {
    var s = S.session;
    if (!s || (!s.dirty && !(reason === 'save' && s.isNew))) return { ok: true, saved: false };
    var inc = S.incidents.get(s.incId);
    if (!inc) {
      S.session = null;
      return { ok: true, saved: false };
    }
    var explicit = reason === 'save';
    var cleaned;
    var problems = [];
    if (explicit) {
      try {
        cleaned = C.sanitize(s.type, s.data);
      } catch (err) {
        return { ok: false, error: err.message };
      }
      var missing = C.missingRequired(s.type, cleaned);
      if (missing.length) return { ok: false, error: 'Fill in: ' + missing.join(', ') + '.' };
    } else {
      var res = C.sanitize(s.type, s.data, { lenient: true });
      cleaned = res.data;
      problems = res.problems;
    }
    var g = C.getRecord(inc, s.rid);
    if (g && !g.deleted && g.heads.length === 1 && s.baseHeads.length === 1 &&
        s.baseHeads[0] === g.winner.id && C.sameData(g.winner.data, cleaned)) {
      s.dirty = false;
      s.data = clone(cleaned);
      clearStoredSession();
      return { ok: true, saved: false, unchanged: true };
    }
    var prevData = g && !g.deleted ? g.winner.data : null;
    var rev;
    try {
      rev = C.saveRecord(inc, {
        rid: s.rid,
        type: s.type,
        period: s.period,
        parents: s.baseHeads,
        data: cleaned,
        by: whoName(),
        deviceId: S.settings.deviceId,
        deviceName: deviceLabel()
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
    var wasNew = s.isNew;
    afterSave(inc, s.type, cleaned, prevData, s.rid);
    s.baseHeads = [rev.id];
    s.dirty = false;
    s.isNew = false;
    s.data = clone(cleaned);
    s.seen = headKey(C.getRecord(inc, s.rid));
    persist(inc);
    clearStoredSession();
    var newHash = routeBase(s.type) + '/new';
    if (wasNew && s === S.session && window.location.hash === newHash) {
      history.replaceState(null, '', routeBase(s.type) + '/' + s.rid);
      S.route = parseRoute();
    }
    if (!explicit && reason !== 'quiet') {
      toast('Saved ' + sessionLabel(s) + '.' + (problems.length ? ' Some values were not valid and were left blank: ' + problems.join(' ') : ''));
    }
    return { ok: true, saved: true, rev: rev, problems: problems };
  }

  function markDirty() {
    var s = S.session;
    if (!s) return;
    s.dirty = true;
    persistSessionSoon();
    var note = $('dirtyNote');
    if (note) note.textContent = 'Unsaved changes';
  }

  function recoverSession(stored) {
    if (!stored || typeof stored !== 'object') return;
    var inc = S.incidents.get(stored.incId);
    if (!inc || typeof stored.type !== 'string' || !Object.prototype.hasOwnProperty.call(FORMS, stored.type)) {
      clearStoredSession();
      return;
    }
    var cleaned = C.sanitize(stored.type, stored.data, { lenient: true }).data;
    var existing = typeof stored.rid === 'string' ? C.getRecord(inc, stored.rid) : null;
    if (existing && existing.heads.some(function (r) { return !r.deleted && C.sameData(r.data, cleaned); })) {
      clearStoredSession();
      return;
    }
    S.session = {
      incId: inc.id,
      type: stored.type,
      rid: stored.rid,
      period: typeof stored.period === 'number' ? stored.period : null,
      baseHeads: Array.isArray(stored.baseHeads) ? stored.baseHeads.filter(function (x) { return typeof x === 'string'; }) : [],
      data: cleaned,
      dirty: true,
      isNew: !!stored.isNew,
      seen: ''
    };
    var res = commitSession('quiet');
    S.session = null;
    clearStoredSession();
    if (res.saved) toast('Recovered unsaved changes to ' + FORMS[stored.type].code + ' from your last session.');
  }

  /* ---------- routing ---------- */

  /* Routes are lower case; a few name a type spelled differently. */
  var ROUTE_TYPE = { '213rr': '213RR', '205a': '205A', '215a': '215A', notes: 'note', volunteers: 'volunteer' };
  /* One form per operational period. */
  var PERIOD_ROUTES = ['202', '203', '205', '205a', '206', '208', '215', '215a', 'hqs', 'h200', 'h202', 'h203', 'h205a', 'h206', 'h215a'];
  /* One form for the whole incident. */
  var INCIDENT_ROUTES = ['201', 'h201', 'h258'];
  /* A list of records, each opened at #/route/id. */
  var LIST_ROUTES = ['204', '209', '211', '213', '213rr', '221', 'notes', 'volunteers',
    'h204', 'h221', 'h251', 'h252', 'h253', 'h254', 'h255', 'h256', 'h257', 'h259', 'h260'];
  var DAMAGE_SUBS = { homes: 'daHome', sites: 'daSite' };

  function routeType(name) {
    return ROUTE_TYPE[name] || name;
  }

  function parseRoute() {
    var parts = (window.location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    var name = ROUTE_NAMES.indexOf(parts[0]) !== -1 ? parts[0] : 'log';
    var r = { name: name, sub: null, id: null };
    if (name === 'costs') {
      r.sub = parts[1] === 'summary' || COST_TYPES.indexOf(parts[1]) !== -1 ? parts[1] : 'summary';
      if (r.sub !== 'summary') r.id = parts[2] || null;
    } else if (name === 'damage') {
      r.sub = DAMAGE_SUBS[parts[1]] ? parts[1] : 'summary';
      if (r.sub !== 'summary') r.id = parts[2] || null;
    } else if (LIST_ROUTES.indexOf(name) !== -1) {
      r.id = parts[1] || null;
    } else if (name === 'jas') {
      r.sub = parts[1] && /^[A-Za-z0-9-]{1,40}$/.test(parts[1]) ? parts[1] : null;
    }
    if (r.id && r.id !== 'new' && !ID_PART.test(r.id)) r.id = null;
    return r;
  }

  function typeForRoute(r) {
    if (r.name === 'costs') return r.sub !== 'summary' && r.id ? r.sub : null;
    if (r.name === 'damage') return r.sub !== 'summary' && r.id ? DAMAGE_SUBS[r.sub] : null;
    if (INCIDENT_ROUTES.indexOf(r.name) !== -1 || PERIOD_ROUTES.indexOf(r.name) !== -1) return routeType(r.name);
    if (LIST_ROUTES.indexOf(r.name) !== -1 && r.id) return routeType(r.name);
    return null;
  }

  function sessionMatchesRoute(s, r) {
    var inc = cur();
    if (!s || !inc || s.incId !== inc.id) return false;
    var type = typeForRoute(r);
    if (type !== s.type) return false;
    var scope = FORMS[type].scope;
    if (scope === 'incident') return true;
    if (scope === 'period') return s.period === currentPeriodNumber(inc);
    if (r.id === 'new') return s.isNew;
    return s.rid === r.id;
  }

  function routeBase(type) {
    if (COST_TYPES.indexOf(type) !== -1) return '#/costs/' + type;
    var damage = Object.keys(DAMAGE_SUBS).filter(function (k) { return DAMAGE_SUBS[k] === type; })[0];
    if (damage) return '#/damage/' + damage;
    var route = Object.keys(ROUTE_TYPE).filter(function (k) { return ROUTE_TYPE[k] === type; })[0];
    return '#/' + (route || String(type).toLowerCase());
  }

  function go(hash) {
    if (window.location.hash === hash) onRoute();
    else window.location.hash = hash;
  }

  function onRoute() {
    var r = parseRoute();
    if (S.session && !sessionMatchesRoute(S.session, r)) {
      commitSession('leave');
      S.session = null;
    }
    S.route = r;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- labels ---------- */

  function title204(d) {
    var parts = [];
    [['Branch', d.branch], ['Division', d.division], ['Group', d.group], ['Staging', d.staging]].forEach(function (x) {
      if (!x[1]) return;
      parts.push(/^(branch|division|div|group|staging)\b/i.test(x[1]) ? x[1] : x[0] + ' ' + x[1]);
    });
    return parts.join(', ') || 'No branch, division, or group yet';
  }

  function itemTitle(type, d) {
    switch (type) {
      case '204': return title204(d);
      case '213': return d.subject || (d.message ? d.message.slice(0, 60) : 'Message without a subject');
      case '213RR': {
        var it = d.items && d.items[0];
        var what = it ? (it.kind || it.type || it.description || '').slice(0, 60) : '';
        return (d.number ? '#' + d.number + ' ' : '') + (what || 'No items yet');
      }
      case 'labor': return d.name || 'Unnamed employee';
      case 'equipment': return d.description || 'Equipment';
      case 'materials': return d.description || 'Material';
      case 'rentals': return d.description || 'Rental';
      case 'contracts': return d.contractor || 'Contract';
      case 'travel': return [d.kind, d.name || d.description].filter(Boolean).join(': ') || 'Travel or other cost';
      case '211': return d.identifier || 'Check-in';
      case 'note': return (d.text || 'Empty note').split('\n')[0].slice(0, 70);
      case '209': return (d.version || 'Status') + ' report' + (d.reportNo ? ' #' + d.reportNo : '') + (d.prepAt ? ', ' + fmtShort(d.prepAt) : '');
      case '221': return d.released || 'Demobilization check-out';
      case 'daHome': return d.address || 'Home';
      case 'daSite': return d.name || 'Damaged facility';
      case 'volunteer': return d.name || 'Volunteer';
      default: return (A.hicsItemTitle && A.hicsItemTitle(type, d)) || FORMS[type].code;
    }
  }

  function recordTitle(g) {
    var def = FORMS[g.type];
    var d = g.winner.data;
    if (g.type === 'period') return 'Operational period ' + g.period;
    if (def.scope === 'incident') return def.code;
    if (def.scope === 'period') return def.code + ', period ' + g.period;
    if (g.type === '204') return def.code + ' ' + title204(d) + ', period ' + g.period;
    if (def.group === 'cost') {
      var date = C.costDate(g.type, d);
      return COST_NAMES[g.type] + ': ' + itemTitle(g.type, d) + (date ? ', ' + fmtDay(date) : '');
    }
    return def.code + ' ' + itemTitle(g.type, d);
  }

  function savedLine(g) {
    if (!g) return 'Not saved yet.';
    var w = g.winner;
    return 'Saved ' + fmtDT(w.at) + (w.by ? ' by ' + w.by : '') + (w.deviceName ? ' on ' + w.deviceName : '') +
      '. ' + plural(g.revs.length, 'version', 'versions') + ' in history.';
  }

  function versionText(g) {
    var idx = g.revs.indexOf(g.winner) + 1;
    return 'Version ' + idx + ' of ' + g.revs.length + ', saved ' + fmtDT(g.winner.at) +
      (g.winner.by ? ' by ' + g.winner.by : '') + (g.winner.deviceName ? ' on ' + g.winner.deviceName : '') + '.';
  }

  function openRecord(inc, g, compare) {
    var def = FORMS[g.type];
    if (g.type === 'period') {
      openPeriodDialog('edit', g.period);
      return;
    }
    if (g.period && g.period !== inc._period) {
      commitSession('leave');
      S.session = null;
      inc._period = g.period;
      persist(inc);
    }
    if (compare) S.pendingCompare = g.rid;
    if (def.scope === 'incident' || def.scope === 'period') go(routeBase(g.type));
    else go(routeBase(g.type) + '/' + g.rid);
  }

  function periodLabel(p) {
    return p.n + ': ' + fmtShort(p.start) + ' to ' + fmtShort(p.end) + (p.conflict ? ' (versions to compare)' : '');
  }

  /* ---------- exports ---------- */

  A.S = S;
  A.defaultSettings = defaultSettings;
  A.track = track;
  A.setup = setup;
  A.str = str;
  A.normalizeSettings = normalizeSettings;
  A.cur = cur;
  A.deviceLabel = deviceLabel;
  A.whoName = whoName;
  A.sortedIncidents = sortedIncidents;
  A.currentPeriodNumber = currentPeriodNumber;
  A.persist = persist;
  A.withPhotos = withPhotos;
  A.persistSettings = persistSettings;
  A.sessionTimer = sessionTimer;
  A.sessionRecord = sessionRecord;
  A.persistSessionSoon = persistSessionSoon;
  A.clearStoredSession = clearStoredSession;
  A.idOf = idOf;
  A.headKey = headKey;
  A.defaultValue = defaultValue;
  A.nextRequestNumber = nextRequestNumber;
  A.defaultsFor = defaultsFor;
  A.newSession = newSession;
  A.ensureSession = ensureSession;
  A.sessionLabel = sessionLabel;
  A.commitSession = commitSession;
  A.markDirty = markDirty;
  A.recoverSession = recoverSession;
  A.parseRoute = parseRoute;
  A.routeType = routeType;
  A.PERIOD_ROUTES = PERIOD_ROUTES;
  A.INCIDENT_ROUTES = INCIDENT_ROUTES;
  A.typeForRoute = typeForRoute;
  A.sessionMatchesRoute = sessionMatchesRoute;
  A.routeBase = routeBase;
  A.go = go;
  A.onRoute = onRoute;
  A.title204 = title204;
  A.itemTitle = itemTitle;
  A.recordTitle = recordTitle;
  A.savedLine = savedLine;
  A.versionText = versionText;
  A.openRecord = openRecord;
  A.periodLabel = periodLabel;
})(window.FieldApp);
