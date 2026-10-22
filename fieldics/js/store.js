/*
 * FieldICS device storage.
 *
 * Uses IndexedDB, which holds far more than localStorage and survives better.
 * Falls back to localStorage, then to memory only, when a browser blocks IndexedDB.
 * Moves data saved by version 0.1 (localStorage) into the new store on first run.
 *
 * Adapter interface (all methods return Promises):
 *   loadIncidents(), putIncident(inc), deleteIncident(id), getKV(key), putKV(key, value|null)
 *   kind: 'indexeddb' | 'localstorage' | 'memory'
 *   notes: messages for the person about what happened at startup
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
  var DB_VERSION = 1;
  var LEGACY_KEY = 'field-ics:v1';
  var LS_PREFIX = 'field-ics:v2:';

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
    function tx(store, mode) {
      try {
        return db.transaction(store, mode, { durability: 'strict' });
      } catch (e) {
        return db.transaction(store, mode);
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

    function write(store, fn) {
      try {
        var t = tx(store, 'readwrite');
        fn(t.objectStore(store));
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
      putIncident: function (inc) {
        return write('incidents', function (s) { s.put(inc); });
      },
      deleteIncident: function (id) {
        return write('incidents', function (s) { s.delete(id); });
      },
      getKV: function (key) {
        return read('kv', function (s) { return s.get(key); }).then(function (v) { return v === undefined ? null : v; });
      },
      putKV: function (key, value) {
        return write('kv', function (s) {
          if (value === null || value === undefined) s.delete(key);
          else s.put(value, key);
        });
      }
    };
  }

  function lsAdapter(ls) {
    function set(key, value) {
      try {
        ls.setItem(key, JSON.stringify(value));
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(new Error('Browser storage is full or blocked.'));
      }
    }
    return {
      kind: 'localstorage',
      notes: [],
      loadIncidents: function () {
        var out = [];
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k && k.indexOf(LS_PREFIX + 'inc:') === 0) {
            try { out.push(JSON.parse(ls.getItem(k))); } catch (e) { /* a damaged item is skipped */ }
          }
        }
        return Promise.resolve(out);
      },
      putIncident: function (inc) { return set(LS_PREFIX + 'inc:' + inc.id, inc); },
      deleteIncident: function (id) {
        try { ls.removeItem(LS_PREFIX + 'inc:' + id); } catch (e) { /* ignore */ }
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
    var kv = new Map();
    function copy(x) { return JSON.parse(JSON.stringify(x)); }
    return {
      kind: 'memory',
      notes: [],
      loadIncidents: function () { return Promise.resolve(Array.from(incidents.values()).map(copy)); },
      putIncident: function (inc) { incidents.set(inc.id, copy(inc)); return Promise.resolve(); },
      deleteIncident: function (id) { incidents.delete(id); return Promise.resolve(); },
      getKV: function (key) { return Promise.resolve(kv.has(key) ? copy(kv.get(key)) : null); },
      putKV: function (key, value) {
        if (value === null || value === undefined) kv.delete(key);
        else kv.set(key, copy(value));
        return Promise.resolve();
      }
    };
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
   * Opens the best available store.
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

  return { open: open, LEGACY_KEY: LEGACY_KEY };
});
