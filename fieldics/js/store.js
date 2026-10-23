/*
 * FieldICS device storage.
 *
 * Uses IndexedDB, which holds far more than localStorage and survives better.
 * Falls back to localStorage, then to memory only, when a browser blocks IndexedDB.
 * Moves data saved by version 0.1 (localStorage) into the new store on first run.
 *
 * Photos are stored apart from their incident, one record per photo. Saving an
 * incident writes the incident and only the photos that are not stored yet, so a
 * save stays small however many photos the incident has. Photos never change once
 * taken, so each one is written (and, with the device lock on, encrypted) once.
 *
 * Raw adapter interface (all methods return Promises):
 *   loadIncidents(), putIncident(rec), save(incRec, attRecs), deleteIncident(id),
 *   attIds(), getAtts(ids), putAtts(recs), clearAll(), getKV(key), putKV(key, value|null)
 *   kind: 'indexeddb' | 'localstorage' | 'memory'
 *   notes: messages for the person about what happened at startup
 * A photo record is { id, incId, mime, data, name, at, by, _rx }.
 *
 * split(base) gives the app's view of a raw or encrypting adapter: incidents carry
 * their photos in memory (inc.atts), and the store splits them on the way in.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldStore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var G = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : {});
  var DB_NAME = 'field-ics';
  var DB_VERSION = 2;
  var LEGACY_KEY = 'field-ics:v1';
  var LS_PREFIX = 'field-ics:v2:';
  var BATCH = 6;

  function getLS() {
    try {
      var ls = G.localStorage;
      if (!ls) return null;
      ls.getItem('field-ics:probe');
      return ls;
    } catch (e) {
      return null;
    }
  }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var idb;
      try {
        idb = G.indexedDB;
      } catch (e) {
        reject(e);
        return;
      }
      if (!idb) {
        reject(new Error('IndexedDB is not available.'));
        return;
      }
      var req;
      try {
        req = idb.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('incidents')) db.createObjectStore('incidents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('atts')) {
          var atts = db.createObjectStore('atts', { keyPath: 'id' });
          atts.createIndex('incId', 'incId', { unique: false });
        }
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); };
        resolve(db);
      };
      req.onerror = function () {
        reject(req.error || new Error('IndexedDB could not be opened.'));
      };
    });
  }

  function idbAdapter(db) {
    function tx(names, mode) {
      try {
        return db.transaction(names, mode, { durability: 'strict' });
      } catch (e) {
        return db.transaction(names, mode);
      }
    }

    function done(t) {
      return new Promise(function (resolve, reject) {
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error || new Error('Storage error.')); };
        t.onabort = function () {
          reject(t.error || new Error('The save was cancelled. The device may be out of space.'));
        };
      });
    }

    /* fn(t) queues the writes; resolves when they are all on disk, or none are. */
    function write(names, fn) {
      try {
        var t = tx(names, 'readwrite');
        fn(t);
        return done(t);
      } catch (e) {
        return Promise.reject(e);
      }
    }

    function read(store, fn) {
      return new Promise(function (resolve, reject) {
        try {
          var t = tx(store, 'readonly');
          var r = fn(t.objectStore(store));
          r.onsuccess = function () { resolve(r.result); };
          r.onerror = function () { reject(r.error); };
        } catch (e) {
          reject(e);
        }
      });
    }

    return {
      kind: 'indexeddb',
      notes: [],
      loadIncidents: function () {
        return read('incidents', function (s) { return s.getAll(); }).then(function (list) { return list || []; });
      },
      putIncident: function (rec) {
        return write(['incidents'], function (t) { t.objectStore('incidents').put(rec); });
      },
      save: function (incRec, attRecs) {
        return write(['incidents', 'atts'], function (t) {
          var atts = t.objectStore('atts');
          (attRecs || []).forEach(function (r) { atts.put(r); });
          t.objectStore('incidents').put(incRec);
        });
      },
      deleteIncident: function (id) {
        return write(['incidents', 'atts'], function (t) {
          t.objectStore('incidents').delete(id);
          var atts = t.objectStore('atts');
          var req = atts.index('incId').openKeyCursor(G.IDBKeyRange.only(id));
          req.onsuccess = function () {
            var c = req.result;
            if (!c) return;
            atts.delete(c.primaryKey);
            c.continue();
          };
        });
      },
      attIds: function () {
        return read('atts', function (s) { return s.getAllKeys(); }).then(function (keys) { return keys || []; });
      },
      getAtts: function (ids) {
        return new Promise(function (resolve, reject) {
          var out = new Array(ids.length);
          try {
            var t = tx('atts', 'readonly');
            var s = t.objectStore('atts');
            ids.forEach(function (id, i) {
              var r = s.get(id);
              r.onsuccess = function () { out[i] = r.result || null; };
            });
            t.oncomplete = function () { resolve(out); };
            t.onerror = function () { reject(t.error || new Error('Storage error.')); };
            t.onabort = function () { reject(t.error || new Error('Storage error.')); };
          } catch (e) {
            reject(e);
          }
        });
      },
      putAtts: function (recs) {
        return write(['atts'], function (t) {
          var atts = t.objectStore('atts');
          recs.forEach(function (r) { atts.put(r); });
        });
      },
      clearAll: function () {
        return write(['incidents', 'atts'], function (t) {
          t.objectStore('incidents').clear();
          t.objectStore('atts').clear();
        });
      },
      getKV: function (key) {
        return read('kv', function (s) { return s.get(key); }).then(function (v) { return v === undefined ? null : v; });
      },
      putKV: function (key, value) {
        return write(['kv'], function (t) {
          var s = t.objectStore('kv');
          if (value === null || value === undefined) s.delete(key);
          else s.put(value, key);
        });
      }
    };
  }

  function lsAdapter(ls) {
    var INC = LS_PREFIX + 'inc:';
    var ATT = LS_PREFIX + 'att:';
    function set(key, value) {
      try {
        ls.setItem(key, JSON.stringify(value));
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(new Error('Browser storage is full or blocked.'));
      }
    }
    /* Photo keys hold the incident id too, so an incident's photos can be found without reading them. */
    function attKeys() {
      var out = [];
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i);
        if (k && k.indexOf(ATT) === 0) {
          var rest = k.slice(ATT.length);
          var cut = rest.indexOf(':');
          if (cut > 0) out.push({ key: k, incId: rest.slice(0, cut), id: rest.slice(cut + 1) });
        }
      }
      return out;
    }
    function putAtts(recs) {
      var chain = Promise.resolve();
      recs.forEach(function (r) {
        chain = chain.then(function () { return set(ATT + r.incId + ':' + r.id, r); });
      });
      return chain;
    }
    return {
      kind: 'localstorage',
      notes: [],
      loadIncidents: function () {
        var out = [];
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k && k.indexOf(INC) === 0) {
            try { out.push(JSON.parse(ls.getItem(k))); } catch (e) { /* a damaged item is skipped */ }
          }
        }
        return Promise.resolve(out);
      },
      putIncident: function (rec) { return set(INC + rec.id, rec); },
      save: function (incRec, attRecs) {
        return putAtts(attRecs || []).then(function () { return set(INC + incRec.id, incRec); });
      },
      deleteIncident: function (id) {
        try {
          ls.removeItem(INC + id);
          attKeys().forEach(function (a) { if (a.incId === id) ls.removeItem(a.key); });
        } catch (e) { /* ignore */ }
        return Promise.resolve();
      },
      attIds: function () {
        return Promise.resolve(attKeys().map(function (a) { return a.id; }));
      },
      getAtts: function (ids) {
        var byId = new Map();
        attKeys().forEach(function (a) { byId.set(a.id, a.key); });
        return Promise.resolve(ids.map(function (id) {
          var key = byId.get(id);
          if (!key) return null;
          try { return JSON.parse(ls.getItem(key)); } catch (e) { return null; }
        }));
      },
      putAtts: putAtts,
      clearAll: function () {
        var keys = [];
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k && (k.indexOf(INC) === 0 || k.indexOf(ATT) === 0)) keys.push(k);
        }
        keys.forEach(function (k) { try { ls.removeItem(k); } catch (e) { /* ignore */ } });
        return Promise.resolve();
      },
      getKV: function (key) {
        try {
          var v = ls.getItem(LS_PREFIX + 'kv:' + key);
          return Promise.resolve(v ? JSON.parse(v) : null);
        } catch (e) {
          return Promise.resolve(null);
        }
      },
      putKV: function (key, value) {
        if (value === null || value === undefined) {
          try { ls.removeItem(LS_PREFIX + 'kv:' + key); } catch (e) { /* ignore */ }
          return Promise.resolve();
        }
        return set(LS_PREFIX + 'kv:' + key, value);
      }
    };
  }

  function memoryAdapter() {
    var incidents = new Map();
    var atts = new Map();
    var kv = new Map();
    function copy(x) { return JSON.parse(JSON.stringify(x)); }
    function putAtts(recs) {
      recs.forEach(function (r) { atts.set(r.id, copy(r)); });
      return Promise.resolve();
    }
    return {
      kind: 'memory',
      notes: [],
      loadIncidents: function () { return Promise.resolve(Array.from(incidents.values()).map(copy)); },
      putIncident: function (rec) { incidents.set(rec.id, copy(rec)); return Promise.resolve(); },
      save: function (incRec, attRecs) {
        putAtts(attRecs || []);
        incidents.set(incRec.id, copy(incRec));
        return Promise.resolve();
      },
      deleteIncident: function (id) {
        incidents.delete(id);
        Array.from(atts.values()).forEach(function (r) { if (r.incId === id) atts.delete(r.id); });
        return Promise.resolve();
      },
      attIds: function () { return Promise.resolve(Array.from(atts.keys())); },
      getAtts: function (ids) {
        return Promise.resolve(ids.map(function (id) { return atts.has(id) ? copy(atts.get(id)) : null; }));
      },
      putAtts: putAtts,
      clearAll: function () { incidents.clear(); atts.clear(); return Promise.resolve(); },
      getKV: function (key) { return Promise.resolve(kv.has(key) ? copy(kv.get(key)) : null); },
      putKV: function (key, value) {
        if (value === null || value === undefined) kv.delete(key);
        else kv.set(key, copy(value));
        return Promise.resolve();
      }
    };
  }

  /* ---------- the app's view: incidents with their photos ---------- */

  function stripped(inc) {
    var out = {};
    Object.keys(inc).forEach(function (k) { if (k !== 'atts') out[k] = inc[k]; });
    return out;
  }

  function attRecord(incId, a) {
    return { id: a.id, incId: incId, mime: a.mime, data: a.data, name: a.name || '', at: a.at, by: a.by || '', _rx: a._rx || null };
  }

  function attFromRecord(r) {
    var a = { id: r.id, mime: r.mime, data: r.data, name: r.name || '', at: r.at, by: r.by || '' };
    if (r._rx) a._rx = r._rx;
    return a;
  }

  function byTime(a, b) {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  }

  /*
   * base: a raw adapter or an encrypting one (secure.js). The returned store:
   *   loadIncidents()      incidents, each with atts: [] (or its photos, if it was saved
   *                        by a version that kept photos inside the incident; those move out)
   *   loadAtts(onBatch)    every stored photo, a few at a time; resolves to Map(incId -> [photo]).
 *                        onBatch([{ incId, att }]) sees each batch; returning false stops early.
   *   putIncident(inc)     saves the incident and any of inc.atts not stored yet, together
   *   deleteIncident(id)   removes the incident and its photos
   *   hold() / release(newBase)  pause saves (while the lock turns on or off) and switch base
   *   idle()               resolves when no save is waiting
   *   getKV / putKV        as the base
   */
  function split(base) {
    var known = null;
    var queues = new Map();
    var held = false;
    var heldWait = null;
    var openGate = null;
    var running = new Set();

    /*
     * Runs fn once saves are not on hold. The check and the start happen together,
     * so a hold either waits for this work or this work waits for the hold.
     */
    function whenOpen(fn) {
      return new Promise(function (resolve, reject) {
        function attempt() {
          if (held) {
            heldWait.then(attempt);
            return;
          }
          var p;
          try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
          running.add(p);
          var drop = function () { running.delete(p); };
          p.then(drop, drop);
          p.then(resolve, reject);
        }
        attempt();
      });
    }

    function ensureKnown() {
      if (known) return Promise.resolve(known);
      return base.attIds().then(function (ids) {
        if (!known) known = new Set(ids);
        return known;
      });
    }

    function queue(id) {
      var q = queues.get(id);
      if (!q) {
        q = { tail: Promise.resolve(), pending: null };
        queues.set(id, q);
      }
      return q;
    }

    function write(inc) {
      return ensureKnown().then(function () {
        var fresh = (inc.atts || []).filter(function (a) { return a && typeof a.data === 'string' && !known.has(a.id); });
        fresh.forEach(function (a) { known.add(a.id); });
        var recs = fresh.map(function (a) { return attRecord(inc.id, a); });
        var step = Promise.resolve();
        /* Many new photos at once (an import) go in a few at a time, then the incident with the last few. */
        while (recs.length > BATCH) {
          var chunk = recs.splice(0, BATCH);
          step = step.then(putChunk(chunk));
        }
        return step.then(function () {
          return base.save(stripped(inc), recs);
        }).catch(function (err) {
          fresh.forEach(function (a) { known.delete(a.id); });
          throw err;
        });
      });
    }

    function putChunk(chunk) {
      return function () { return base.putAtts(chunk); };
    }

    /*
     * Saves run one at a time per incident, in order. A save asked for while another
     * is waiting to start takes its place, since it carries the newer state.
     */
    function putIncident(inc) {
      var q = queue(inc.id);
      if (q.pending) {
        q.pending.inc = inc;
        return q.pending.promise;
      }
      var job = { inc: inc, cancelled: false };
      q.pending = job;
      job.promise = q.tail.then(function () {
        return whenOpen(function () {
          if (q.pending === job) q.pending = null;
          if (job.cancelled) return null;
          return write(job.inc);
        });
      });
      q.tail = job.promise.catch(function () { /* the next save still runs */ });
      return job.promise;
    }

    function deleteIncident(id) {
      var q = queue(id);
      if (q.pending) q.pending.cancelled = true;
      q.pending = null;
      var p = q.tail.then(function () {
        return whenOpen(function () { return base.deleteIncident(id); });
      });
      q.tail = p.catch(function () { /* ignore */ });
      return p;
    }

    function idle() {
      return Promise.all(Array.from(queues.values()).map(function (q) { return q.tail; })).then(function () { return undefined; });
    }

    /*
     * Earlier versions kept photos inside the incident. Stores those photos on their own,
     * then the incident without them. Runs once, before the app has the incident, so no
     * save can race it. If it stops part way, the incident still has its photos and this
     * runs again next time.
     */
    function moveInlinePhotos(rec) {
      var list = rec.atts.filter(function (a) { return a && typeof a.id === 'string' && typeof a.data === 'string'; });
      var chain = Promise.resolve();
      for (var i = 0; i < list.length; i += BATCH) {
        chain = chain.then(putChunk(list.slice(i, i + BATCH).filter(function (a) { return !known.has(a.id); }).map(function (a) {
          return attRecord(rec.id, a);
        })));
      }
      return chain.then(function () {
        list.forEach(function (a) { known.add(a.id); });
        return base.save(stripped(rec), []);
      });
    }

    var inMemory = new Set();

    var api = {
      kind: base.kind,
      notes: base.notes,
      encrypted: !!base.encrypted,
      loadIncidents: function () {
        return Promise.all([base.loadIncidents(), base.attIds()]).then(function (res) {
          known = new Set(res[1]);
          var list = res[0].filter(function (rec) { return rec && typeof rec === 'object'; });
          var chain = Promise.resolve();
          list.forEach(function (rec) {
            if (!Array.isArray(rec.atts) || !rec.atts.length) return;
            rec.atts.forEach(function (a) { if (a && a.id) inMemory.add(a.id); });
            chain = chain.then(function () {
              return moveInlinePhotos(rec).catch(function () { /* the photos stay inside the incident until next time */ });
            });
          });
          return chain.then(function () { return list; });
        });
      },
      loadAtts: function (onBatch) {
        return base.attIds().then(function (all) {
          var ids = all.filter(function (id) { return !inMemory.has(id); });
          var out = new Map();
          var at = 0;
          function next() {
            if (at >= ids.length) {
              out.forEach(function (list) { list.sort(byTime); });
              return out;
            }
            var chunk = ids.slice(at, at + BATCH);
            at += BATCH;
            return whenOpen(function () { return base.getAtts(chunk); }).then(function (recs) {
              var got = [];
              recs.forEach(function (r) {
                if (!r || typeof r.incId !== 'string' || typeof r.mime !== 'string' || typeof r.data !== 'string') return;
                var a = attFromRecord(r);
                if (!out.has(r.incId)) out.set(r.incId, []);
                out.get(r.incId).push(a);
                got.push({ incId: r.incId, att: a });
              });
              /* onBatch returning false stops the loading (the app locked or reloaded). */
              if (onBatch && onBatch(got) === false) return out;
              return next();
            });
          }
          return next();
        });
      },
      putIncident: putIncident,
      deleteIncident: deleteIncident,
      idle: idle,
      /* Pauses saves and resolves once the ones already under way are done. */
      hold: function () {
        if (!held) {
          held = true;
          heldWait = new Promise(function (resolve) { openGate = resolve; });
        }
        return Promise.all(Array.from(running).map(function (p) { return p.catch(function () { /* finished */ }); })).then(function () { return undefined; });
      },
      /* Lets saves run again, through newBase when given (the lock turned on or off). */
      release: function (newBase) {
        if (newBase) {
          base = newBase;
          api.encrypted = !!newBase.encrypted;
        }
        held = false;
        var go = openGate;
        openGate = null;
        heldWait = null;
        if (go) go();
      },
      getKV: function (key) {
        return whenOpen(function () { return base.getKV(key); });
      },
      putKV: function (key, value) {
        return whenOpen(function () { return base.putKV(key, value); });
      }
    };
    return api;
  }

  function legacySettings(legacy) {
    return {
      deviceId: legacy.deviceId,
      deviceName: legacy.deviceName || '',
      name: legacy.defaultAuthor || '',
      position: legacy.defaultPosition || '',
      agency: legacy.defaultAgency || '',
      newestFirst: legacy.newestFirst !== false,
      lastIncidentId: legacy.currentId || null
    };
  }

  /* Moves version 0.1 data (and any data saved to the localStorage fallback) into this store. */
  function migrate(adapter, opts) {
    var ls = getLS();
    if (!ls) return Promise.resolve();
    var upgrade = opts.upgradeIncident || function (x) { return x; };

    var raw = null;
    try { raw = ls.getItem(LEGACY_KEY); } catch (e) { raw = null; }

    var fallbackKeys = [];
    if (adapter.kind === 'indexeddb') {
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i);
        if (k && k.indexOf(LS_PREFIX + 'inc:') === 0) fallbackKeys.push(k);
      }
    }
    if (!raw && !fallbackKeys.length) return Promise.resolve();

    var legacy = null;
    if (raw) {
      try {
        legacy = JSON.parse(raw);
      } catch (e) {
        adapter.notes.push('Saved data from version 0.1 could not be read. A copy was left in browser storage.');
        legacy = null;
      }
      if (legacy && (typeof legacy !== 'object' || !legacy.incidents || typeof legacy.incidents !== 'object')) legacy = null;
    }

    return adapter.loadIncidents().then(function (existing) {
      var have = new Set(existing.map(function (x) { return x && x.id; }));
      var jobs = [];
      var moved = 0;
      function take(obj) {
        var up = upgrade(obj);
        if (up && up.id && !have.has(up.id)) {
          have.add(up.id);
          moved++;
          jobs.push(adapter.putIncident(up));
        }
      }
      if (legacy) {
        Object.keys(legacy.incidents).forEach(function (key) { take(legacy.incidents[key]); });
      }
      fallbackKeys.forEach(function (key) {
        try { take(JSON.parse(ls.getItem(key))); } catch (e) { /* a damaged item is skipped */ }
      });
      return Promise.all(jobs).then(function () {
        return adapter.getKV('settings');
      }).then(function (settings) {
        if (!settings && legacy) return adapter.putKV('settings', legacySettings(legacy));
        return null;
      }).then(function () {
        try {
          if (raw && legacy) {
            ls.setItem(LEGACY_KEY + ':backup', raw);
            ls.removeItem(LEGACY_KEY);
          }
          fallbackKeys.forEach(function (key) { ls.removeItem(key); });
        } catch (e) {
          /* Leaving the old copy in place is harmless. */
        }
        if (moved) {
          adapter.notes.push(moved === 1 ? 'An incident saved by an earlier version was moved to the new storage.'
            : moved + ' incidents saved by an earlier version were moved to the new storage.');
        }
      });
    }).catch(function () {
      adapter.notes.push('Data saved by an earlier version could not be moved. It is still in browser storage.');
    });
  }

  /*
   * Opens the best available store (a raw adapter; wrap it with split() for the app).
   * opts.upgradeIncident: converts an older stored incident to the current shape.
   * opts.forceKind: 'localstorage' or 'memory' (for tests).
   */
  function open(opts) {
    opts = opts || {};
    var start;
    if (opts.forceKind === 'memory') start = Promise.resolve(memoryAdapter());
    else if (opts.forceKind === 'localstorage') start = Promise.resolve(getLS() ? lsAdapter(getLS()) : memoryAdapter());
    else {
      start = openIDB().then(idbAdapter, function () {
        var ls = getLS();
        return ls ? lsAdapter(ls) : memoryAdapter();
      });
    }
    return start.then(function (adapter) {
      if (adapter.kind === 'memory') return adapter;
      return migrate(adapter, opts).then(function () { return adapter; });
    });
  }

  return { open: open, split: split, LEGACY_KEY: LEGACY_KEY, BATCH: BATCH };
});
