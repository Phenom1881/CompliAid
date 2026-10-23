/* FieldICS: Quick "Log it" entry, backup reminders, exercise mode notice, clock check, and display settings. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var S = A.S;
  var btn = A.btn;
  var closeDialog = A.closeDialog;
  var cur = A.cur;
  var deviceLabel = A.deviceLabel;
  var fmtDT = A.fmtDT;
  var fromLocalInput = A.fromLocalInput;
  var h = A.h;
  var openDialog = A.openDialog;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var persistSettings = A.persistSettings;
  var plural = A.plural;
  var render = A.render;
  var setup = A.setup;
  var showError = A.showError;
  var toLocalInput = A.toLocalInput;
  var toast = A.toast;
  var openExport = A.openExport;
  var pickPhotos = A.pickPhotos;
  var currentPeriodNumber = A.currentPeriodNumber;
  var lockRequired = A.later('lockRequired');
  var lockEnabled = A.later('lockEnabled');
  var openLockSettings = A.later('openLockSettings');

  /* ---------- display ---------- */

  function applyDisplay() {
    var root = document.documentElement;
    var set = S.settings || {};
    if (set.theme === 'light' || set.theme === 'dark') root.setAttribute('data-theme', set.theme);
    else root.removeAttribute('data-theme');
    if (set.textSize === 'large' || set.textSize === 'larger') root.setAttribute('data-text', set.textSize);
    else root.removeAttribute('data-text');
    var dark = set.theme === 'dark' || (set.theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#12171b' : '#1c2329');
  }

  /* ---------- the incident strip clock ---------- */

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function hhmm(d) { return two(d.getHours()) + ':' + two(d.getMinutes()); }

  function span(ms) {
    var mins = Math.round(ms / 60000);
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h ? h + 'h ' + two(m) + 'm' : m + 'm';
  }

  /* The live 24-hour clock, with where the current operational period stands. */
  function updateClock() {
    var t = $('opsTime');
    var sub = $('opsSub');
    if (!t || !sub) return;
    var now = new Date();
    t.textContent = hhmm(now) + ':' + two(now.getSeconds());
    var text = DAYS[now.getDay()] + ' ' + now.getDate() + ' ' + MONTHS[now.getMonth()];
    var inc = S.ready && !S.lock.locked ? cur() : null;
    var n = inc ? currentPeriodNumber(inc) : null;
    var p = n ? C.periodOf(inc, n) : null;
    if (p) {
      var start = new Date(p.start);
      var end = new Date(p.end);
      if (!isNaN(start) && now < start) text += ' | OP ' + n + ' starts in ' + span(start - now);
      else if (!isNaN(end) && now < end) text += ' | OP ' + n + ' ends ' + hhmm(end) + ', ' + span(end - now) + ' left';
      else if (!isNaN(end)) text += ' | OP ' + n + ' ended ' + hhmm(end);
    }
    if (sub.textContent !== text) sub.textContent = text;
  }

  function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
  }

  /* ---------- notices: exercise, backup reminder, clock ---------- */

  function hoursSince(iso) {
    var t = Date.parse(iso);
    return isNaN(t) ? Infinity : (Date.now() - t) / 3600000;
  }

  function backupDue(inc) {
    if (!inc) return null;
    /* An incident kept in step through the shared folder is already off this device. */
    if (A.syncCovers && A.syncCovers(inc)) return null;
    var pending = C.countPending(inc);
    if (!pending.total) return null;
    var limit = setup().options.backupHours || 4;
    var since = inc.lastExportAt ? hoursSince(inc.lastExportAt) : hoursSince(inc.createdAt);
    if (since < limit && !(pending.total >= 50 && since >= limit / 2)) return null;
    var snooze = S.backupSnooze[inc.id];
    if (snooze && snooze > Date.now()) return null;
    return { pending: pending, since: since };
  }

  function ago(hours) {
    if (!isFinite(hours)) return '';
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + ' minutes ago';
    if (hours < 48) return Math.round(hours) + (Math.round(hours) === 1 ? ' hour ago' : ' hours ago');
    return Math.round(hours / 24) + ' days ago';
  }

  function renderNotices(inc) {
    var bar = $('noticeBar');
    if (!bar) return;
    bar.textContent = '';
    var parts = [];
    if (S.ready && !S.lock.locked && lockRequired() && !lockEnabled()) {
      parts.push(h('div', { class: 'notice notice-lock', id: 'lockRequiredNotice' },
        h('span', { text: 'Your locality setup requires the device lock on this device. Turn it on before entering incident information. ' }),
        btn('Turn on device lock', function () { openLockSettings(); }, 'btn-primary btn-small', { id: 'lockRequiredBtn' })));
    }
    var sync = A.syncStatus ? A.syncStatus() : null;
    if (S.ready && !S.lock.locked && sync && sync.needsOk) {
      parts.push(h('div', { class: 'notice notice-sync', id: 'syncNotice' },
        h('span', { text: 'The shared folder needs your OK again after FieldICS restarted. ' }),
        btn('Reconnect', function () { A.syncReconnect(); }, 'btn-primary btn-small', { id: 'syncNoticeBtn' })));
    }
    if (inc && inc.exercise) {
      parts.push(h('div', { class: 'notice notice-exercise', id: 'exerciseNotice' },
        h('strong', { text: 'EXERCISE. ' }), 'This incident is marked as an exercise. Every printout and PDF says so.'));
    }
    var due = backupDue(inc);
    if (due) {
      parts.push(h('div', { class: 'notice notice-backup', id: 'backupNotice' },
        h('span', { text: (due.pending.total === due.pending.atts
          ? plural(due.pending.atts, 'photo is', 'photos are') + ' only on this device. Save a package file with photos to back them up. '
          : plural(due.pending.total, 'change is', 'changes are') + ' only on this device. ') +
          (inc.lastExportAt ? 'The last package file was saved ' + ago(due.since) + '.' : 'No package file has been saved for this incident yet.') + ' ' }),
        h('span', { class: 'row wrap' },
          btn('Save package file', function () { openExport(); }, 'btn-primary btn-small', { id: 'backupNow' }),
          btn('Remind me in an hour', function () {
            S.backupSnooze[inc.id] = Date.now() + 3600000;
            renderNotices(inc);
          }, 'btn-quiet btn-small'))));
    }
    var c = S.clock;
    if (c.offsetMs !== null && Math.abs(c.offsetMs) > 5 * 60000) {
      var mins = Math.round(Math.abs(c.offsetMs) / 60000);
      parts.push(h('div', { class: 'notice notice-clock', id: 'clockNotice' },
        h('span', { text: "This device's clock looks " + plural(mins, 'minute', 'minutes') + (c.offsetMs > 0 ? ' behind ' : ' ahead of ') + c.source +
          '. Times in the log and on forms come from this clock. Set the date and time in the device settings. ' }),
        btn('Clock check', openClockCheck, 'btn-quiet btn-small')));
    }
    parts.forEach(function (p) { bar.appendChild(p); });
    bar.hidden = !parts.length;
  }

  /* ---------- clock check ---------- */

  /* Compares this device's clock with the web server's, when there is a connection. */
  function checkServerClock() {
    if (!/^https?:$/.test(window.location.protocol) || (typeof navigator.onLine === 'boolean' && !navigator.onLine)) {
      return Promise.resolve(null);
    }
    var sent = Date.now();
    return fetch(window.location.href.split('#')[0], { method: 'HEAD', cache: 'no-store' }).then(function (res) {
      var date = res.headers.get('Date');
      var got = Date.now();
      var server = Date.parse(date || '');
      if (isNaN(server)) return null;
      /* The Date header has one-second precision; allow for the round trip. */
      var offset = server - (sent + got) / 2;
      noteClock(Math.abs(offset) < 90000 ? 0 : offset, 'the web server');
      return offset;
    }).catch(function () { return null; });
  }

  function noteClock(offsetMs, source) {
    S.clock = { offsetMs: offsetMs, source: source, checkedAt: C.nowISO() };
    renderNotices(cur());
  }

  /* After an import: a package saved "in the future" means one of the two clocks is off. */
  function clockFromPackage(report) {
    if (!report || !report.exportedAt) return '';
    var ahead = Date.parse(report.exportedAt) - Date.now();
    if (ahead > 10 * 60000) {
      noteClock(ahead, report.fromDevice || 'the device that sent the file');
      return 'This file was saved ' + Math.round(ahead / 60000) + ' minutes in the future by this device\'s clock. One of the two clocks is off. Check the time on both devices.';
    }
    return '';
  }

  function openClockCheck() {
    var body = openPanel('Clock check');
    var now = new Date();
    var zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { zone = ''; }
    body.appendChild(h('p', { class: 'clock-big', text: fmtDT(now.toISOString()) }));
    body.appendChild(h('p', { text: 'Time zone: ' + (zone || 'not known') + ' (UTC' + offsetText(-now.getTimezoneOffset()) + ').' }));
    body.appendChild(h('p', { class: 'hint', text: 'Every log entry and form version is stamped with this device\'s clock. Compare the time above with a radio, a phone with signal, or the dispatch clock. If it is off, fix it in the device settings, then add a correction to any log entries made with the wrong time.' }));
    var result = h('p', { id: 'clockResult', role: 'status' });
    var c = S.clock;
    if (c.offsetMs !== null) result.textContent = 'Last check (' + fmtDT(c.checkedAt) + ', against ' + c.source + '): ' + describeOffset(c.offsetMs);
    body.appendChild(result);
    body.appendChild(btn('Check against the web server', function () {
      result.textContent = 'Checking...';
      checkServerClock().then(function (off) {
        result.textContent = off === null ? 'There is no connection to the web server right now, so compare by hand.' : 'Checked against the web server: ' + describeOffset(Math.abs(off) < 90000 ? 0 : off);
      });
    }, '', { id: 'clockCheckNow' }));
  }

  function offsetText(mins) {
    var sign = mins >= 0 ? '+' : '-';
    var a = Math.abs(mins);
    return sign + Math.floor(a / 60) + (a % 60 ? ':' + (a % 60 < 10 ? '0' : '') + (a % 60) : '');
  }

  function describeOffset(ms) {
    if (Math.abs(ms) < 90000) return 'this clock is right to within a minute or two.';
    var mins = Math.round(Math.abs(ms) / 60000);
    return 'this clock is ' + plural(mins, 'minute', 'minutes') + (ms > 0 ? ' behind.' : ' ahead.');
  }

  /* ---------- Log it ---------- */

  var quickPhotos = [];
  var quickMode = 'log';

  /* Log it adds either a 214 entry or a working note. */
  function applyQuickMode() {
    var note = quickMode === 'note';
    $('qlModeLog').checked = !note;
    $('qlModeNote').checked = note;
    $('qlTitle').textContent = note ? 'Add a note' : 'Log it';
    $('qlHint').textContent = note
      ? 'Saves a working note for this incident. It stays out of the ICS 214 until you add it from Notes.'
      : 'Adds an entry to the ICS 214 activity log without leaving this screen.';
    $('qlTextLabel').textContent = note ? 'Note' : 'What happened';
    $('qlTimeBox').hidden = note;
    $('qlKindBox').hidden = !note;
    $('qlAdd').textContent = note ? 'Add note' : 'Add to log';
  }

  function renderQuickLog(inc) {
    var b = $('quickLogBtn');
    if (!b) return;
    b.hidden = !inc || S.lock.locked || S.route.name === 'log' || C.isClosed(inc);
  }

  function openQuickLog(mode) {
    var inc = cur();
    if (!inc) return;
    if (mode === 'log' || mode === 'note') quickMode = mode;
    applyQuickMode();
    quickPhotos = [];
    $('qlText').value = '';
    $('qlTime').value = toLocalInput(new Date());
    $('qlName').value = S.settings.name;
    $('qlNameBox').hidden = !!S.settings.name;
    $('qlPhotoNote').textContent = '';
    showError($('qlError'), '');
    openDialog($('quickLogDialog'));
    $('qlText').focus();
  }

  function wireQuickLog() {
    $('quickLogBtn').addEventListener('click', function () { openQuickLog(); });
    var kinds = $('qlKind');
    A.F.NOTE_KINDS.forEach(function (k) { kinds.appendChild(h('option', { value: k, text: k })); });
    ['qlModeLog', 'qlModeNote'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        quickMode = $('qlModeNote').checked ? 'note' : 'log';
        applyQuickMode();
      });
    });
    $('qlCancel').addEventListener('click', function () { closeDialog($('quickLogDialog')); });
    $('qlPhoto').addEventListener('click', function () {
      pickPhotos(C.LIMITS.entryPhotos - quickPhotos.length).then(function (ids) {
        quickPhotos = quickPhotos.concat(ids);
        $('qlPhotoNote').textContent = quickPhotos.length ? plural(quickPhotos.length, 'photo', 'photos') + ' attached.' : '';
      });
    });
    $('qlForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var inc = cur();
      var name = S.settings.name || $('qlName').value.trim();
      var ts = fromLocalInput($('qlTime').value) || C.nowISO();
      try {
        if (quickMode === 'note') {
          if (!$('qlText').value.trim()) throw new Error('Type the note first.');
          if (!name) throw new Error('Enter your name.');
          if (!S.settings.name) {
            S.settings.name = name.slice(0, 120);
            persistSettings();
          }
          A.addNote(inc, { text: $('qlText').value, kind: $('qlKind').value, photos: quickPhotos });
        } else C.addEntry(inc, {
          text: $('qlText').value, author: name, position: S.settings.position, ts: ts, photos: quickPhotos,
          deviceId: S.settings.deviceId, deviceName: deviceLabel()
        });
      } catch (err) {
        showError($('qlError'), err.message);
        return;
      }
      if (!S.settings.name && name) {
        S.settings.name = name.slice(0, 120);
        persistSettings();
      }
      quickPhotos = [];
      persist(inc);
      closeDialog($('quickLogDialog'));
      toast(quickMode === 'note' ? 'Note saved.' : 'Added to the activity log.');
      $('qlKind').value = 'Info';
      if (S.route.name === 'notes' || S.route.name === 'log') render();
      renderNotices(inc);
    });
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'L' || ev.key === 'l') && cur() && !S.lock.locked) {
        ev.preventDefault();
        openQuickLog();
      }
    });
  }

  /* ---------- exports ---------- */

  A.applyDisplay = applyDisplay;
  A.startClock = startClock;
  A.updateClock = updateClock;
  A.renderNotices = renderNotices;
  A.backupDue = backupDue;
  A.checkServerClock = checkServerClock;
  A.clockFromPackage = clockFromPackage;
  A.openClockCheck = openClockCheck;
  A.renderQuickLog = renderQuickLog;
  A.openQuickLog = openQuickLog;
  A.wireQuickLog = wireQuickLog;
})(window.FieldApp);
