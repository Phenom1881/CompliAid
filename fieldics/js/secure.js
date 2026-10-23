/*
 * FieldICS device lock: a passcode that encrypts the data stored on this device.
 *
 * How it works:
 *  - A random 256-bit data key encrypts every incident, photo, and form draft with
 *    AES-GCM. Each photo is sealed once, on its own, when it is first stored.
 *  - The data key is itself encrypted ("wrapped") with a key made from the passcode
 *    by PBKDF2-SHA256. Only the wrapped key, its salt, and the iteration count are
 *    stored in the clear.
 *  - Unlocking re-derives the passcode key and unwraps the data key. A wrong
 *    passcode fails the AES-GCM check. Changing the passcode only rewraps the key.
 *  - Settings (names, theme) and pilot counts stay readable so the lock screen can
 *    show them. Incidents, drafts, and the locality setup are encrypted.
 * A lost passcode cannot be recovered. Package files saved earlier still import.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldSecure = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ITERATIONS = 600000;
  var MIN_LENGTH = 6;
  var PLAIN_KEYS = ['settings', 'lock', 'events', 'lockConvert'];

  function getCrypto() {
    return (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  }

  function available() {
    var c = getCrypto();
    return !!(c && c.subtle && typeof c.getRandomValues === 'function');
  }

  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function fromB64(str) {
    var s = atob(String(str || ''));
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  /* min: a longer minimum the locality setup asks for (never shorter than MIN_LENGTH). */
  function checkPasscode(pin, min) {
    var need = Math.max(MIN_LENGTH, Math.min(64, Math.round(Number(min) || 0)));
    if (typeof pin !== 'string' || pin.length < need) {
      throw new Error('Use a passcode of at least ' + need + ' characters.');
    }
    if (/^(.)\1+$/.test(pin) || (/^\d+$/.test(pin) && isRun(pin)) || WEAK.indexOf(pin.toLowerCase()) !== -1) {
      throw new Error('That passcode is too easy to guess. Choose another.');
    }
  }

  var WEAK = ['password', 'password1', 'passcode', 'qwerty', 'qwerty123', 'qwertyuiop', 'fieldics', 'letmein', 'welcome1', 'abc123', 'abcdef', 'iloveyou'];

  /* True when the digits only count up or down by one (123456, 876543). */
  function isRun(pin) {
    var up = true;
    var down = true;
    for (var i = 1; i < pin.length; i++) {
      var d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
      if (d !== 1 && d !== -9) up = false;
      if (d !== -1 && d !== 9) down = false;
    }
    return up || down;
  }

  function passKey(pin, salt, iterations) {
    var c = getCrypto();
    return c.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return c.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }

  function dataKey(raw) {
    return getCrypto().subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  function wrap(raw, pin, iterations) {
    var c = getCrypto();
    var salt = c.getRandomValues(new Uint8Array(16));
    var iv = c.getRandomValues(new Uint8Array(12));
    return passKey(pin, salt, iterations).then(function (k) {
      return c.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, raw);
    }).then(function (buf) {
      return { v: 1, kdf: 'PBKDF2-SHA256', iterations: iterations, salt: toB64(salt), iv: toB64(iv), wrapped: toB64(new Uint8Array(buf)) };
    });
  }

  /*
   * Unlocked state the app keeps in memory: { raw: Uint8Array, key: CryptoKey }.
   * createLock(pin) -> Promise<{ lock, unlocked }>
   */
  function createLock(pin, opts) {
    try { checkPasscode(pin, opts && opts.min); } catch (e) { return Promise.reject(e); }
    var raw = getCrypto().getRandomValues(new Uint8Array(32));
    var iterations = (opts && opts.iterations) || ITERATIONS;
    return wrap(raw, pin, iterations).then(function (lock) {
      lock.createdAt = new Date().toISOString();
      return dataKey(raw).then(function (key) { return { lock: lock, unlocked: { raw: raw, key: key } }; });
    });
  }

  /*
   * A key from a passphrase, for files kept outside the device (the shared folder).
   * Derived once per session from the folder's own salt, then used for every file.
   * Returns { key } in the shape encryptJSON and decryptJSON take.
   */
  function deriveKey(pass, saltB64, iterations) {
    return passKey(String(pass || ''), fromB64(saltB64), iterations || ITERATIONS).then(function (k) { return { key: k }; });
  }

  function newSalt() {
    return toB64(getCrypto().getRandomValues(new Uint8Array(16)));
  }

  function unlock(lock, pin) {
    if (!lock || lock.v !== 1 || lock.kdf !== 'PBKDF2-SHA256' || typeof lock.iterations !== 'number' ||
        lock.iterations < 1000 || lock.iterations > 5000000) {
      return Promise.reject(new Error('The lock settings on this device are damaged.'));
    }
    return passKey(String(pin || ''), fromB64(lock.salt), lock.iterations).then(function (k) {
      return getCrypto().subtle.decrypt({ name: 'AES-GCM', iv: fromB64(lock.iv) }, k, fromB64(lock.wrapped));
    }).then(function (buf) {
      var raw = new Uint8Array(buf);
      return dataKey(raw).then(function (key) { return { raw: raw, key: key }; });
    }, function () {
      throw new Error('Wrong passcode.');
    });
  }

  function changePasscode(lock, unlocked, pin, min) {
    try { checkPasscode(pin, min); } catch (e) { return Promise.reject(e); }
    return wrap(unlocked.raw, pin, lock.iterations || ITERATIONS).then(function (next) {
      next.createdAt = lock.createdAt;
      next.changedAt = new Date().toISOString();
      return next;
    });
  }

  function encryptJSON(unlocked, obj) {
    var iv = getCrypto().getRandomValues(new Uint8Array(12));
    var plain = new TextEncoder().encode(JSON.stringify(obj));
    return getCrypto().subtle.encrypt({ name: 'AES-GCM', iv: iv }, unlocked.key, plain).then(function (buf) {
      return { enc: 1, iv: toB64(iv), data: toB64(new Uint8Array(buf)) };
    });
  }

  function decryptJSON(unlocked, env) {
    return getCrypto().subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, unlocked.key, fromB64(env.data)).then(function (buf) {
      return JSON.parse(new TextDecoder().decode(buf));
    });
  }

  function isSealed(x) {
    return !!(x && typeof x === 'object' && x.enc === 1 && typeof x.iv === 'string' && typeof x.data === 'string');
  }

  /*
   * Seals one stored record. The ids stay readable so the store can find the
   * record (an incident by id, a photo by id and incident); everything else is sealed.
   */
  function seal(unlocked, rec, clear) {
    return encryptJSON(unlocked, rec).then(function (env) {
      clear.forEach(function (k) { if (rec[k] !== undefined) env[k] = rec[k]; });
      return env;
    });
  }

  /* Opens one stored record. A record that was never sealed passes through. */
  function open(unlocked, rec) {
    if (!isSealed(rec)) return Promise.resolve(rec);
    return decryptJSON(unlocked, rec);
  }

  var INC_CLEAR = ['id'];
  var ATT_CLEAR = ['id', 'incId'];

  /*
   * Wraps a store adapter (store.js) so incidents, photos, and drafts are encrypted on
   * the way in and decrypted on the way out. Each photo is its own sealed record.
   * Settings, the lock record, and counts stay plain. Reading passes through any
   * record that is not sealed, so a store part way through turning the lock on or
   * off still reads.
   */
  function wrapStore(store, unlocked) {
    function sealAll(recs, clear) {
      /* One at a time, so a large batch of photos never sits in memory twice at once. */
      var out = [];
      return recs.reduce(function (p, r) {
        return p.then(function () { return seal(unlocked, r, clear).then(function (env) { out.push(env); }); });
      }, Promise.resolve()).then(function () { return out; });
    }
    return {
      kind: store.kind,
      notes: store.notes,
      encrypted: true,
      raw: store,
      loadIncidents: function () {
        return store.loadIncidents().then(function (list) {
          return Promise.all(list.map(function (x) {
            return open(unlocked, x).catch(function () { return null; });
          }));
        }).then(function (list) { return list.filter(Boolean); });
      },
      putIncident: function (rec) {
        return seal(unlocked, rec, INC_CLEAR).then(function (env) { return store.putIncident(env); });
      },
      save: function (incRec, attRecs) {
        return sealAll(attRecs || [], ATT_CLEAR).then(function (atts) {
          return seal(unlocked, incRec, INC_CLEAR).then(function (env) { return store.save(env, atts); });
        });
      },
      deleteIncident: function (id) { return store.deleteIncident(id); },
      attIds: function () { return store.attIds(); },
      getAtts: function (ids) {
        return store.getAtts(ids).then(function (list) {
          return Promise.all(list.map(function (x) {
            if (!x) return null;
            return open(unlocked, x).then(function (rec) {
              if (rec && x.incId && !rec.incId) rec.incId = x.incId;
              return rec;
            }).catch(function () { return null; });
          }));
        });
      },
      putAtts: function (recs) {
        return sealAll(recs, ATT_CLEAR).then(function (envs) { return store.putAtts(envs); });
      },
      clearAll: function () { return store.clearAll(); },
      getKV: function (key) {
        return store.getKV(key).then(function (v) {
          if (PLAIN_KEYS.indexOf(key) !== -1 || !isSealed(v)) return v;
          return decryptJSON(unlocked, v).catch(function () { return null; });
        });
      },
      putKV: function (key, value) {
        if (PLAIN_KEYS.indexOf(key) !== -1 || value === null || value === undefined) return store.putKV(key, value);
        return encryptJSON(unlocked, value).then(function (env) { return store.putKV(key, env); });
      }
    };
  }

  /*
   * Rewrites a raw store from one form to another: plain to encrypted (from null,
   * to unlocked) or encrypted to plain (from unlocked, to null). Records already in
   * the target form are left alone, so running it again after an interruption
   * finishes the job. Photos go one at a time to keep memory use low.
   * kvKeys: the KV entries to convert. onProgress(done, total) is optional.
   * Resolves to { incidents, photos } (how many the store holds).
   */
  function convertStore(store, from, to, kvKeys, onProgress) {
    var sealing = !!to;
    function needs(rec) {
      return !!rec && (sealing ? !isSealed(rec) : isSealed(rec));
    }
    function plainOf(rec) {
      return sealing ? Promise.resolve(rec) : open(from, rec);
    }
    var done = 0;
    var total = 0;
    function tick() {
      done++;
      if (onProgress) onProgress(done, total);
    }
    var counts = { incidents: 0, photos: 0 };
    return Promise.all([store.loadIncidents(), store.attIds()]).then(function (res) {
      var incs = res[0];
      var ids = res[1];
      counts.incidents = incs.length;
      counts.photos = ids.length;
      total = incs.length + ids.length;
      var chain = Promise.resolve();
      incs.forEach(function (rec) {
        chain = chain.then(function () {
          if (!needs(rec)) return tick();
          return plainOf(rec).then(function (plain) {
            if (sealing) return seal(to, plain, INC_CLEAR).then(function (env) { return store.putIncident(env); });
            return store.putIncident(plain);
          }).then(tick);
        });
      });
      ids.forEach(function (id) {
        chain = chain.then(function () {
          return store.getAtts([id]).then(function (got) {
            var rec = got[0];
            if (!needs(rec)) return tick();
            return plainOf(rec).then(function (plain) {
              if (!plain.incId) plain.incId = rec.incId;
              if (sealing) return seal(to, plain, ATT_CLEAR).then(function (env) { return store.putAtts([env]); });
              return store.putAtts([plain]);
            }).then(tick);
          });
        });
      });
      return chain;
    }).then(function () {
      return (kvKeys || []).reduce(function (p, k) {
        return p.then(function () {
          return store.getKV(k).then(function (v) {
            if (v === null || v === undefined || !needs(v)) return null;
            if (sealing) return encryptJSON(to, v).then(function (env) { return store.putKV(k, env); });
            return decryptJSON(from, v).then(function (plain) { return store.putKV(k, plain); });
          });
        });
      }, Promise.resolve());
    }).then(function () { return counts; });
  }

  return {
    ITERATIONS: ITERATIONS,
    MIN_LENGTH: MIN_LENGTH,
    available: available,
    checkPasscode: checkPasscode,
    createLock: createLock,
    unlock: unlock,
    changePasscode: changePasscode,
    encryptJSON: encryptJSON,
    decryptJSON: decryptJSON,
    deriveKey: deriveKey,
    newSalt: newSalt,
    isSealed: isSealed,
    wrapStore: wrapStore,
    convertStore: convertStore
  };
});
