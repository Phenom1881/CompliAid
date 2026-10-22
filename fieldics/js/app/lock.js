/* FieldICS: Device lock. A passcode that encrypts this device's copy of the data, with auto-lock. */
(function (A) {
  'use strict';

  var S = A.S;
  var btn = A.btn;
  var closePanel = A.closePanel;
  var commitSession = A.commitSession;
  var clearStoredSession = A.clearStoredSession;
  var h = A.h;
  var openPanel = A.openPanel;
  var persistSettings = A.persistSettings;
  var render = A.render;
  var showError = A.showError;
  var toast = A.toast;
  var loadData = A.later('loadData');

  var Secure = window.FieldSecure;
  var KV_KEYS = ['session', 'setup'];
  var fails = 0;
  var waitUntil = 0;
  var lastActive = Date.now();
  var hiddenAt = 0;

  function enabled() { return !!S.lock.record; }

  /* ---------- the lock screen ---------- */

  function lockView() {
    var card = h('section', { class: 'card lock-card' });
    card.appendChild(h('h2', { text: 'FieldICS is locked' }));
    card.appendChild(h('p', { text: 'Enter the passcode for this device.' + (S.settings.name ? ' Last used by ' + S.settings.name + '.' : '') }));
    var form = h('form', { id: 'unlockForm', autocomplete: 'off' });
    var input = h('input', { type: 'password', id: 'unlockPass', autocomplete: 'current-password', 'aria-label': 'Passcode' });
    var err = h('p', { class: 'error', id: 'unlockError', role: 'alert', hidden: true });
    var go = h('button', { type: 'submit', class: 'btn btn-primary', id: 'unlockBtn', text: 'Unlock' });
    form.appendChild(h('div', { class: 'field' }, h('label', { for: 'unlockPass', text: 'Passcode' }), input));
    form.appendChild(err);
    form.appendChild(h('div', { class: 'row wrap' }, go));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var wait = waitUntil - Date.now();
      if (wait > 0) {
        showError(err, 'Too many wrong tries. Wait ' + Math.ceil(wait / 1000) + ' seconds.');
        return;
      }
      go.disabled = true;
      showError(err, '');
      go.textContent = 'Unlocking...';
      Secure.unlock(S.lock.record, input.value).then(function (keys) {
        fails = 0;
        S.lock.unlocked = keys;
        S.lock.locked = false;
        lastActive = Date.now();
        return loadData(Secure.wrapStore(S.rawStore, keys));
      }).catch(function (e2) {
        fails++;
        if (fails >= 5) waitUntil = Date.now() + Math.min(300000, 30000 * Math.pow(2, fails - 5));
        go.disabled = false;
        go.textContent = 'Unlock';
        showError(err, e2.message + (fails >= 5 ? ' Wait before trying again.' : ''));
        input.select();
      });
    });
    card.appendChild(form);
    card.appendChild(h('details', { class: 'field' },
      h('summary', { text: 'Forgot the passcode?' }),
      h('p', { text: 'The passcode cannot be recovered, and the data on this device cannot be read without it. If the incidents were shared, import the latest package file on another device. To use this device again, erase its FieldICS data.' }),
      btn('Erase FieldICS data on this device', eraseAll, 'btn-danger', { id: 'eraseBtn' })));
    setTimeout(function () { input.focus(); }, 0);
    return card;
  }

  function eraseAll() {
    if (!window.confirm('Erase every incident, form, and photo stored by FieldICS on this device? This cannot be undone.')) return;
    var typed = window.prompt('Type ERASE to confirm.');
    if (typed !== 'ERASE') return;
    var raw = S.rawStore;
    raw.loadIncidents().then(function (list) {
      return Promise.all(list.map(function (x) { return raw.deleteIncident(x.id); }));
    }).then(function () {
      return Promise.all(['lock', 'session', 'setup'].map(function (k) { return raw.putKV(k, null); }));
    }).then(function () {
      S.lock = { record: null, unlocked: null, locked: false };
      fails = 0;
      return loadData(raw);
    }).then(function () {
      toast('FieldICS data on this device was erased.');
    });
  }

  /* Saves open work, forgets the decrypted data, and shows the lock screen. */
  function lockNow() {
    if (!enabled() || S.lock.locked) return;
    if (S.session && S.session.dirty) commitSession('quiet');
    S.session = null;
    S.incidents = new Map();
    S.currentId = null;
    S.setup = null;
    S.store = null;
    S.lock.unlocked = null;
    S.lock.locked = true;
    closePanel();
    Array.prototype.forEach.call(document.querySelectorAll('dialog[open]'), function (d) { if (typeof d.close === 'function') d.close(); });
    document.getElementById('printArea').textContent = '';
    render();
  }

  /* ---------- auto-lock ---------- */

  function wireAutoLock() {
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && enabled() && Date.now() - hiddenAt > minutes() * 60000) lockNow();
    });
    setInterval(function () {
      if (enabled() && !S.lock.locked && Date.now() - lastActive > minutes() * 60000) lockNow();
    }, 15000);
  }

  function minutes() {
    return S.settings.autoLockMinutes || 10;
  }

  /* ---------- turning the lock on and off ---------- */

  function openLockSettings() {
    var body = openPanel('Device lock');
    if (!Secure.available()) {
      body.appendChild(h('p', { text: 'This browser cannot encrypt data on this page. Open FieldICS from its HTTPS address (or as an installed app) to use the device lock.' }));
      return;
    }
    body.appendChild(h('p', { text: 'The device lock encrypts incidents, forms, photos, and drafts stored on this device with a passcode, and locks the app when it is not in use. Keep the phone or computer\'s own screen lock on too.' }));
    body.appendChild(h('p', { class: 'hint', text: 'The passcode cannot be recovered. Save a package file before turning the lock on, and keep the passcode where your agency keeps other system passwords. A passcode of 10 or more characters with letters is far harder to break than six digits if a device is lost. Names and display settings stay readable so the lock screen can show them.' }));
    var auto = h('select', { id: 'lockMinutes', 'aria-label': 'Lock after' });
    [2, 5, 10, 30, 60].forEach(function (m) { auto.appendChild(h('option', { value: String(m), text: m + ' minutes', selected: m === minutes() })); });
    auto.addEventListener('change', function () {
      S.settings.autoLockMinutes = +auto.value;
      persistSettings();
      toast('The app locks after ' + auto.value + ' minutes without use.');
    });
    var autoRow = h('div', { class: 'field' }, h('label', { for: 'lockMinutes', text: 'Lock after this long without use, or when the app is in the background this long' }), auto);
    var err = h('p', { class: 'error', role: 'alert', hidden: true, id: 'lockError' });

    function passFields() {
      var a = h('input', { type: 'password', id: 'lockPass', autocomplete: 'new-password' });
      var b = h('input', { type: 'password', id: 'lockPass2', autocomplete: 'new-password' });
      return {
        a: a, b: b,
        el: h('div', { class: 'grid two' },
          h('div', { class: 'field' }, h('label', { for: 'lockPass', text: 'Passcode (at least ' + Secure.MIN_LENGTH + ' characters)' }), a),
          h('div', { class: 'field' }, h('label', { for: 'lockPass2', text: 'Repeat passcode' }), b))
      };
    }

    if (!enabled()) {
      var p = passFields();
      body.appendChild(p.el);
      body.appendChild(autoRow);
      body.appendChild(err);
      var on = btn('Turn on device lock', function () {
        if (p.a.value !== p.b.value) { showError(err, 'The passcodes do not match.'); return; }
        try { Secure.checkPasscode(p.a.value); } catch (e) { showError(err, e.message); return; }
        on.disabled = true;
        showError(err, '');
        on.textContent = 'Encrypting...';
        commitSession('quiet');
        var raw = S.rawStore;
        Secure.createLock(p.a.value).then(function (made) {
          return raw.putKV('lock', made.lock).then(function () {
            return Secure.convertStore(raw, null, made.unlocked, KV_KEYS);
          }).then(function (count) {
            S.lock.record = made.lock;
            S.lock.unlocked = made.unlocked;
            S.store = Secure.wrapStore(raw, made.unlocked);
            closePanel();
            toast('Device lock is on. ' + count + (count === 1 ? ' incident' : ' incidents') + ' encrypted.');
            render();
          });
        }).catch(function (e) {
          on.disabled = false;
          on.textContent = 'Turn on device lock';
          showError(err, e.message);
        });
      }, 'btn-primary', { id: 'lockOn' });
      body.appendChild(h('div', { class: 'row end' }, on));
      return;
    }

    body.appendChild(h('p', { class: 'ok-note', text: 'The device lock is on' + (S.lock.record.createdAt ? ' (since ' + A.fmtDT(S.lock.record.createdAt) + ')' : '') + '.' }));
    body.appendChild(autoRow);
    body.appendChild(h('div', { class: 'row wrap' }, btn('Lock now', function () { lockNow(); }, 'btn-primary', { id: 'lockNowBtn' })));
    var change = passFields();
    body.appendChild(h('h3', { class: 'small-title', text: 'Change the passcode' }));
    body.appendChild(change.el);
    body.appendChild(err);
    body.appendChild(btn('Change passcode', function () {
      if (change.a.value !== change.b.value) { showError(err, 'The passcodes do not match.'); return; }
      Secure.changePasscode(S.lock.record, S.lock.unlocked, change.a.value).then(function (next) {
        return S.rawStore.putKV('lock', next).then(function () {
          S.lock.record = next;
          closePanel();
          toast('Passcode changed.');
        });
      }).catch(function (e) { showError(err, e.message); });
    }, '', { id: 'lockChange' }));
    body.appendChild(h('h3', { class: 'small-title', text: 'Turn off' }));
    var cur = h('input', { type: 'password', id: 'lockOffPass', autocomplete: 'current-password' });
    body.appendChild(h('div', { class: 'field' }, h('label', { for: 'lockOffPass', text: 'Current passcode' }), cur));
    body.appendChild(btn('Turn off device lock', function () {
      Secure.unlock(S.lock.record, cur.value).then(function () {
        commitSession('quiet');
        var raw = S.rawStore;
        return Secure.convertStore(raw, S.lock.unlocked, null, KV_KEYS).then(function () {
          return raw.putKV('lock', null);
        }).then(function () {
          S.lock = { record: null, unlocked: null, locked: false };
          S.store = raw;
          clearStoredSession();
          closePanel();
          toast('Device lock is off. Data on this device is no longer encrypted.');
          render();
        });
      }).catch(function (e) { showError(err, e.message); });
    }, 'btn-danger', { id: 'lockOff' }));
  }

  /* 'off', 'on', or 'locked', for the settings screen. */
  function lockStatus() {
    return enabled() ? (S.lock.locked ? 'locked' : 'on') : 'off';
  }

  /* ---------- exports ---------- */

  A.lockView = lockView;
  A.lockNow = lockNow;
  A.wireAutoLock = wireAutoLock;
  A.openLockSettings = openLockSettings;
  A.lockStatus = lockStatus;
  A.lockEnabled = enabled;
})(window.FieldApp);
