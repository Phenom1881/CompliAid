/*
 * FieldICS: A shared folder that EOC computers use to stay in step: a county network
 * drive, or a folder kept in sync by OneDrive, Google Drive, or Dropbox. Each computer
 * writes its own copy of each incident into the folder and reads everyone else's,
 * merging them the same way package files merge. Nothing is ever deleted from the folder.
 *
 * Folder layout:
 *   fieldics-shared.json              folder settings: whether files are locked, and the key salt
 *   incidents/<incident id>/<device id>.json         that device's copy (no photos)
 *   incidents/<incident id>/photos/<photo id>.json   each photo, written once
 *
 * Needs a browser that can open folders (Chrome or Edge on a computer). Phones and
 * iPads keep using package files and QR codes.
 */
(function (A) {
  'use strict';

  var C = A.C;
  var S = A.S;
  var btn = A.btn;
  var closePanel = A.closePanel;
  var deviceLabel = A.deviceLabel;
  var fmtDT = A.fmtDT;
  var h = A.h;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var plural = A.plural;
  var render = A.render;
  var renderStatus = A.renderStatus;
  var showError = A.showError;
  var toast = A.toast;
  var renderNotices = A.later('renderNotices');

  var Secure = window.FieldSecure;
  var FOLDER_FILE = 'fieldics-shared.json';
  var FOLDER_FORMAT = 'fieldics-shared-folder';
  var LOCKED_FORMAT = 'fieldics-shared-locked';
  var PHOTO_FORMAT = 'fieldics-shared-photo';
  var INTERVAL = 30000;
  var PHOTOS_PER_RUN = 12;
  var ID_RE = /^[A-Za-z0-9-]{8,80}$/;

  var state = {
    handle: null,
    permission: 'none',
    folder: null,
    key: null,
    running: false,
    lastRunAt: '',
    lastOkAt: '',
    lastError: '',
    timer: null,
    soon: null,
    saved: { enabled: false, name: '', seen: {}, written: {}, ignored: [], shareExercises: false, passphrase: '' },
    /* Some browsers cannot keep a folder between visits; the folder is then chosen again after a restart. */
    notKept: false
  };

  function supported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function usable() {
    return supported() && S.storageKind === 'indexeddb';
  }

  /* ---------- small helpers over the folder API ---------- */

  function entries(dir) {
    var out = [];
    var it = dir.entries();
    function next() {
      return it.next().then(function (r) {
        if (r.done) return out;
        out.push({ name: r.value[0], handle: r.value[1] });
        return next();
      });
    }
    return next();
  }

  function subdir(dir, name, create) {
    return dir.getDirectoryHandle(name, { create: !!create }).catch(function (e) {
      if (!create && e && e.name === 'NotFoundError') return null;
      throw e;
    });
  }

  function writeText(dir, name, text) {
    return dir.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      return w.write(text).then(function () { return w.close(); });
    });
  }

  function readJSON(fileHandle) {
    return fileHandle.getFile().then(function (f) {
      return f.text().then(function (t) { return { file: f, obj: JSON.parse(t) }; });
    });
  }

  /* Files are locked with the folder key when the folder has a passphrase. */
  function seal(obj) {
    if (!state.key) return Promise.resolve(JSON.stringify(obj));
    return Secure.encryptJSON(state.key, obj).then(function (env) {
      return JSON.stringify({ format: LOCKED_FORMAT, version: 1, iv: env.iv, data: env.data });
    });
  }

  function open(obj) {
    if (obj && obj.format === LOCKED_FORMAT) {
      if (!state.key) return Promise.reject(new Error('This shared folder is locked. Enter its passphrase under Settings, Shared folder.'));
      return Secure.decryptJSON(state.key, { iv: obj.iv, data: obj.data });
    }
    return Promise.resolve(obj);
  }

  /* ---------- saved settings ---------- */

  function saveSettings() {
    var st = S.store;
    if (!st) return Promise.resolve();
    return st.putKV('sync', state.saved).catch(function () { /* best effort */ });
  }

  function loadSettings() {
    var st = S.store;
    var raw = S.rawStore;
    if (!st || !raw || !usable()) return Promise.resolve();
    return Promise.all([st.getKV('sync'), raw.getKV('syncHandle')]).then(function (res) {
      var v = res[0];
      if (v && typeof v === 'object') {
        state.saved = {
          enabled: v.enabled === true, name: String(v.name || ''), seen: v.seen && typeof v.seen === 'object' ? v.seen : {},
          written: v.written && typeof v.written === 'object' ? v.written : {}, ignored: Array.isArray(v.ignored) ? v.ignored : [],
          shareExercises: v.shareExercises === true, passphrase: typeof v.passphrase === 'string' ? v.passphrase : ''
        };
      }
      var kept = res[1] && typeof res[1].queryPermission === 'function' ? res[1] : null;
      state.handle = kept || (state.notKept ? state.handle : null);
      if (!state.saved.enabled || !state.handle) return null;
      return state.handle.queryPermission({ mode: 'readwrite' }).then(function (p) {
        state.permission = p;
        if (p === 'granted') return start();
        renderNotices(A.cur());
        return null;
      });
    }).catch(function (e) {
      state.lastError = e.message;
    });
  }

  /* ---------- the folder file and its key ---------- */

  /* Reads (or, for a new folder, writes) the folder settings, and derives the key when locked. pass: for a locked folder. */
  function prepareFolder(pass, create) {
    return state.handle.getFileHandle(FOLDER_FILE).then(readJSON, function (e) {
      if (e && e.name === 'NotFoundError' && create) return null;
      throw e;
    }).then(function (res) {
      if (!res) {
        var folder = { format: FOLDER_FORMAT, version: 1, created: C.nowISO(), createdBy: deviceLabel(), locked: !!pass };
        if (!pass) return writeText(state.handle, FOLDER_FILE, JSON.stringify(folder, null, 1)).then(function () { return folder; });
        folder.salt = Secure.newSalt();
        folder.iterations = Secure.ITERATIONS;
        return Secure.deriveKey(pass, folder.salt, folder.iterations).then(function (k) {
          state.key = k;
          return Secure.encryptJSON(k, { check: 'fieldics' });
        }).then(function (env) {
          folder.check = env;
          return writeText(state.handle, FOLDER_FILE, JSON.stringify(folder, null, 1)).then(function () { return folder; });
        });
      }
      var f = res.obj;
      if (!f || f.format !== FOLDER_FORMAT) throw new Error('This folder has a ' + FOLDER_FILE + ' file that FieldICS cannot read.');
      if (!f.locked) {
        state.key = null;
        return f;
      }
      if (!pass) throw new Error('This shared folder is locked with a passphrase. Enter it to connect.');
      if (typeof f.iterations !== 'number' || f.iterations < 100000 || f.iterations > 5000000) throw new Error('The folder settings are damaged.');
      return Secure.deriveKey(pass, f.salt, f.iterations).then(function (k) {
        return Secure.decryptJSON(k, f.check).then(function (v) {
          if (!v || v.check !== 'fieldics') throw new Error('Wrong passphrase for this shared folder.');
          state.key = k;
          return f;
        }, function () {
          throw new Error('Wrong passphrase for this shared folder.');
        });
      });
    }).then(function (f) {
      state.folder = f;
      return f;
    });
  }

  /* ---------- one round of syncing ---------- */

  function signature(inc) {
    return [inc.entries.length, inc.revs.length, inc.atts.length, inc.metaUpdatedAt || '', inc.closedAt || ''].join(':');
  }

  function shared(inc) {
    if (state.saved.ignored.indexOf(inc.id) !== -1) return false;
    return !inc.exercise || state.saved.shareExercises;
  }

  function myFile() {
    return S.settings.deviceId + '.json';
  }

  function writeOut(root) {
    var list = Array.from(S.incidents.values()).filter(shared);
    var wrote = 0;
    var photos = 0;
    return list.reduce(function (p, inc) {
      return p.then(function () {
        var sig = signature(inc);
        return subdir(root, inc.id, true).then(function (dir) {
          var step = Promise.resolve();
          if (state.saved.written[inc.id] !== sig) {
            var pkg = C.buildPackage(inc, { noPhotos: true, deviceId: S.settings.deviceId, deviceName: deviceLabel() });
            step = seal(pkg).then(function (text) { return writeText(dir, myFile(), text); }).then(function () {
              state.saved.written[inc.id] = sig;
              wrote++;
            });
          }
          if (!inc.atts.length) return step;
          return step.then(function () { return subdir(dir, 'photos', true); }).then(function (pd) {
            return entries(pd).then(function (have) {
              var names = new Set(have.map(function (e) { return e.name; }));
              var todo = inc.atts.filter(function (a) { return !names.has(a.id + '.json'); }).slice(0, PHOTOS_PER_RUN);
              return todo.reduce(function (q, a) {
                return q.then(function () {
                  return seal({ format: PHOTO_FORMAT, version: 1, incidentId: inc.id, att: { id: a.id, mime: a.mime, data: a.data, name: a.name, at: a.at, by: a.by } }).then(function (text) {
                    return writeText(pd, a.id + '.json', text);
                  }).then(function () { photos++; });
                });
              }, Promise.resolve());
            });
          });
        });
      });
    }, Promise.resolve()).then(function () { return { wrote: wrote, photos: photos }; });
  }

  function readIn(root) {
    var result = { added: 0, created: 0, photos: 0, touched: new Set() };
    return entries(root).then(function (list) {
      return list.filter(function (e) { return e.handle.kind === 'directory' && ID_RE.test(e.name) && state.saved.ignored.indexOf(e.name) === -1; })
        .reduce(function (p, e) {
          return p.then(function () { return readIncident(e.name, e.handle, result); });
        }, Promise.resolve());
    }).then(function () { return result; });
  }

  function readIncident(incId, dir, result) {
    return entries(dir).then(function (files) {
      var chain = Promise.resolve();
      files.forEach(function (f) {
        if (f.handle.kind !== 'file' || !/\.json$/.test(f.name) || f.name === myFile()) return;
        chain = chain.then(function () {
          return f.handle.getFile().then(function (file) {
            var key = incId + '/' + f.name;
            if (state.saved.seen[key] === file.lastModified) return null;
            return file.text().then(function (t) {
              return open(JSON.parse(t));
            }).then(function (pkg) {
              var target = S.incidents.get(incId) || null;
              if (!target) {
                if (pkg.incident && pkg.incident.exercise === true && !state.saved.shareExercises) {
                  state.saved.seen[key] = file.lastModified;
                  return null;
                }
                var res = C.mergePackage(null, pkg);
                S.incidents.set(res.incident.id, res.incident);
                result.created++;
                result.touched.add(res.incident.id);
              } else {
                var rep = C.mergeInto(target, pkg);
                var n = rep.added + rep.formsAdded + (rep.metaChanged ? 1 : 0);
                if (n) {
                  result.added += n;
                  result.touched.add(target.id);
                }
              }
              state.saved.seen[key] = file.lastModified;
              return null;
            }).catch(function (e) {
              /* A file still being copied in by a sync service is tried again next round. */
              if (e instanceof SyntaxError) return null;
              throw e;
            });
          });
        });
      });
      var photos = files.filter(function (f) { return f.name === 'photos' && f.handle.kind === 'directory'; })[0];
      if (!photos) return chain;
      return chain.then(function () { return readPhotos(incId, photos.handle, result); });
    });
  }

  function readPhotos(incId, dir, result) {
    var inc = S.incidents.get(incId);
    if (!inc) return Promise.resolve();
    return entries(dir).then(function (list) {
      var have = new Set(inc.atts.map(function (a) { return a.id + '.json'; }));
      var todo = list.filter(function (e) { return e.handle.kind === 'file' && !have.has(e.name); }).slice(0, PHOTOS_PER_RUN);
      if (!todo.length) return null;
      var atts = [];
      return todo.reduce(function (p, e) {
        return p.then(function () {
          return readJSON(e.handle).then(function (r) { return open(r.obj); }).then(function (o) {
            if (o && o.format === PHOTO_FORMAT && o.incidentId === incId && o.att) atts.push(o.att);
          }).catch(function () { /* tried again next round */ });
        });
      }, Promise.resolve()).then(function () {
        if (!atts.length) return;
        var pkg = { format: C.FORMAT, version: 3, exportedAt: C.nowISO(), incident: C.incidentMeta(inc), entries: [], revs: [], atts: atts, photos: 'included' };
        var rep = C.mergeInto(inc, pkg);
        if (rep.imagesAdded) {
          result.photos += rep.imagesAdded;
          result.touched.add(incId);
        }
      });
    });
  }

  function editing() {
    var el = document.activeElement;
    return (S.session && S.session.dirty) || (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.closest('dialog'));
  }

  function run() {
    if (state.running || !state.handle || !state.folder || !S.ready || S.lock.locked || !S.store || S.photosLoading) return Promise.resolve(null);
    state.running = true;
    state.lastRunAt = C.nowISO();
    var report = null;
    return subdir(state.handle, 'incidents', true).then(function (root) {
      return writeOut(root).then(function (out) {
        return readIn(root).then(function (got) {
          report = { wrote: out.wrote, photosOut: out.photos, added: got.added, created: got.created, photosIn: got.photos };
          got.touched.forEach(function (id) { persist(S.incidents.get(id)); });
          if (got.touched.size) {
            if (!S.currentId) S.currentId = Array.from(got.touched)[0];
            if (editing()) toast('Updates from the shared folder arrived. They show when you leave this form.');
            else render();
          }
        });
      });
    }).then(function () {
      state.lastOkAt = C.nowISO();
      state.saved.lastOkAt = state.lastOkAt;
      state.lastError = '';
    }, function (e) {
      state.lastError = e && e.name === 'NotAllowedError' ? 'Permission to the folder was withdrawn. Reconnect it under Settings.' : ((e && e.message) || 'The shared folder could not be reached.');
      if (e && e.name === 'NotAllowedError') state.permission = 'prompt';
    }).then(function () {
      state.running = false;
      saveSettings();
      renderStatus();
      return report;
    });
  }

  function start() {
    return prepareFolder(state.saved.passphrase, false).then(function () {
      state.permission = 'granted';
      clearInterval(state.timer);
      state.timer = setInterval(function () {
        if (document.visibilityState !== 'hidden') run();
      }, INTERVAL);
      return run();
    }).catch(function (e) {
      state.lastError = e.message;
      renderStatus();
    });
  }

  function stop() {
    clearInterval(state.timer);
    clearTimeout(state.soon);
    state.timer = null;
  }

  /* The device locked: stop, and drop the folder key and passphrase from memory until it unlocks. */
  function lockStop() {
    stop();
    state.key = null;
    state.folder = null;
    state.saved = { enabled: false, name: '', seen: {}, written: {}, ignored: [], shareExercises: false, passphrase: '' };
  }

  /* After a local save: write soon, so others see it within a minute. */
  function changed() {
    if (!state.timer) return;
    clearTimeout(state.soon);
    state.soon = setTimeout(run, 4000);
  }

  /* ---------- the settings panel ---------- */

  function statusText() {
    if (!state.saved.enabled) return 'Not set up.';
    if (state.permission !== 'granted') return 'Needs your OK to use the folder again.';
    if (state.lastError) return 'Problem: ' + state.lastError;
    return state.lastOkAt ? 'In step as of ' + fmtDT(state.lastOkAt) + '.' : 'Connecting...';
  }

  function openSyncSettings() {
    var body = openPanel('Shared folder');
    body.appendChild(h('p', { text: 'EOC computers can stay in step through a shared folder: a county network drive, or a folder that OneDrive, Google Drive, or Dropbox keeps in sync. Each computer writes its own copy of each incident there and merges everyone else\'s every 30 seconds, the same way package files merge. Nothing in the folder is ever deleted.' }));
    if (!supported()) {
      body.appendChild(h('p', { class: 'warn-note', text: 'This browser cannot open folders. Shared folders work in Chrome or Edge on a Windows or Mac computer. On phones and iPads, use package files or QR codes.' }));
      return;
    }
    if (S.storageKind !== 'indexeddb') {
      body.appendChild(h('p', { class: 'warn-note', text: 'This browser is not letting FieldICS keep data, so it cannot remember a shared folder.' }));
      return;
    }
    var status = h('p', { class: 'hint', id: 'syncStatusText', role: 'status', text: statusText() });
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    if (state.saved.enabled && state.handle) {
      body.appendChild(h('p', { class: 'ok-note', text: 'Folder: ' + (state.saved.name || state.handle.name) + (state.folder && state.folder.locked ? ' (locked with a passphrase)' : '') }));
      body.appendChild(status);
      if (state.notKept) body.appendChild(h('p', { class: 'warn-note', text: 'This browser could not remember the folder. After FieldICS restarts, choose the folder again here.' }));
      var row = h('div', { class: 'row wrap' });
      if (state.permission !== 'granted') {
        row.appendChild(btn('Reconnect the folder', function () { reconnect(err, status); }, 'btn-primary', { id: 'syncReconnect' }));
      } else {
        row.appendChild(btn('Sync now', function () {
          status.textContent = 'Syncing...';
          run().then(function (rep) {
            status.textContent = statusText() + (rep ? ' Wrote ' + plural(rep.wrote, 'incident', 'incidents') + ', ' + plural(rep.photosOut, 'photo', 'photos') +
              '; received ' + plural(rep.added, 'change', 'changes') + ', ' + plural(rep.created, 'new incident', 'new incidents') + ', ' + plural(rep.photosIn, 'photo', 'photos') + '.' : '');
          });
        }, 'btn-primary', { id: 'syncNow' }));
      }
      row.appendChild(btn('Stop using this folder', function () {
        stop();
        state.saved.enabled = false;
        state.folder = null;
        state.key = null;
        saveSettings();
        if (S.rawStore) S.rawStore.putKV('syncHandle', null).catch(function () { /* ignore */ });
        state.handle = null;
        closePanel();
        renderStatus();
        toast('This device no longer uses the shared folder. The files in it stay there.');
      }, 'btn-quiet', { id: 'syncStop' }));
      body.appendChild(row);
      var ex = h('input', { type: 'checkbox', id: 'syncExercises', checked: state.saved.shareExercises });
      ex.addEventListener('change', function () {
        state.saved.shareExercises = ex.checked;
        saveSettings();
        changed();
      });
      body.appendChild(h('label', { class: 'check field', for: 'syncExercises' }, ex, ' Share exercise and practice incidents too'));
      body.appendChild(err);
      return;
    }
    body.appendChild(h('p', { class: 'hint', text: 'Choose the same folder on every EOC computer. The first computer can lock the folder\'s files with a passphrase; the others then enter it to join. Use a passphrase for any cloud folder.' }));
    var pass = h('input', { type: 'password', id: 'syncPass', autocomplete: 'new-password' });
    body.appendChild(h('div', { class: 'field' }, h('label', { for: 'syncPass', text: 'Folder passphrase (optional; needed to join a locked folder)' }), pass));
    body.appendChild(err);
    body.appendChild(status);
    body.appendChild(h('div', { class: 'row end' }, btn('Choose the shared folder', function () {
      showError(err, '');
      if (pass.value && pass.value.length < C.MIN_PASSPHRASE) {
        showError(err, 'Use a passphrase of at least ' + C.MIN_PASSPHRASE + ' characters, or none.');
        return;
      }
      window.showDirectoryPicker({ id: 'fieldics-shared', mode: 'readwrite' }).then(function (handle) {
        state.handle = handle;
        status.textContent = 'Checking the folder...';
        return prepareFolder(pass.value, true).then(function () {
          state.permission = 'granted';
          state.saved.enabled = true;
          state.saved.name = handle.name;
          state.saved.passphrase = state.folder.locked ? pass.value : '';
          state.saved.seen = {};
          state.saved.written = {};
          state.notKept = false;
          return S.rawStore.putKV('syncHandle', handle).catch(function () {
            state.notKept = true;
          });
        }).then(function () {
          saveSettings();
          return start();
        }).then(function () {
          closePanel();
          toast('Shared folder connected: ' + handle.name + '.' + (state.notKept ? ' This browser cannot remember it, so choose it again after FieldICS restarts.' : ''));
        });
      }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        state.handle = null;
        showError(err, (e && e.message) || 'The folder could not be used.');
      });
    }, 'btn-primary', { id: 'syncChoose' })));
  }

  function reconnect(err, status) {
    state.handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
      state.permission = p;
      if (p !== 'granted') throw new Error('The folder was not allowed.');
      return start();
    }).then(function () {
      if (status) status.textContent = statusText();
      renderNotices(A.cur());
      toast('Shared folder reconnected.');
    }).catch(function (e) {
      if (err) showError(err, e.message);
      else toast(e.message);
    });
  }

  /* For the status chip, the settings button, and the notices. */
  function syncStatus() {
    return {
      on: state.saved.enabled && !!state.handle,
      needsOk: state.saved.enabled && !!state.handle && state.permission !== 'granted',
      ok: !!state.lastOkAt && !state.lastError,
      lastOkAt: state.lastOkAt,
      error: state.lastError,
      label: !state.saved.enabled ? 'Off' : (state.permission !== 'granted' ? 'Needs OK' : (state.lastError ? 'Problem' : 'On'))
    };
  }

  /* True when this incident's latest state is in the shared folder, so the backup reminder can rest. */
  function covers(inc) {
    return !!(state.saved.enabled && state.permission === 'granted' && !state.lastError && shared(inc) && state.saved.written[inc.id] === signature(inc));
  }

  /* An incident removed from this device stays in the folder; this device stops bringing it back. */
  function forget(incId) {
    if (state.saved.ignored.indexOf(incId) === -1) state.saved.ignored.push(incId);
    saveSettings();
  }

  /* ---------- exports ---------- */

  A.openSyncSettings = openSyncSettings;
  A.syncStatus = syncStatus;
  A.syncCovers = covers;
  A.syncChanged = changed;
  A.syncForget = forget;
  A.syncRun = run;
  A.syncLoad = loadSettings;
  A.syncStop = lockStop;
  A.syncReconnect = function () { reconnect(null, null); };
})(window.FieldApp);
