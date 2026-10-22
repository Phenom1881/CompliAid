/*
 * FieldICS device lock: a passcode that encrypts the data stored on this device.
 *
 * How it works:
 *  - A random 256-bit data key encrypts every incident and form draft with AES-GCM.
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
  var PLAIN_KEYS = ['settings', 'lock', 'events'];

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

  function checkPasscode(pin) {
    if (typeof pin !== 'string' || pin.length < MIN_LENGTH) {
      throw new Error('Use a passcode of at least ' + MIN_LENGTH + ' characters.');
    }
    if (/^(\d)\1+$/.test(pin) || pin === '123456' || pin === '1234567' || pin === '12345678' || pin === '654321') {
      throw new Error('That passcode is too easy to guess. Choose another.');
    }
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
    try { checkPasscode(pin); } catch (e) { return Promise.reject(e); }
    var raw = getCrypto().getRandomValues(new Uint8Array(32));
    var iterations = (opts && opts.iterations) || ITERATIONS;
    return wrap(raw, pin, iterations).then(function (lock) {
      lock.createdAt = new Date().toISOString();
      return dataKey(raw).then(function (key) { return { lock: lock, unlocked: { raw: raw, key: key } }; });
    });
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

  function changePasscode(lock, unlocked, pin) {
    try { checkPasscode(pin); } catch (e) { return Promise.reject(e); }
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
   * Wraps a store adapter (store.js) so incidents and drafts are encrypted on the way
   * in and decrypted on the way out. Settings, the lock record, and counts stay plain.
   */
  function wrapStore(store, unlocked) {
    return {
      kind: store.kind,
      notes: store.notes,
      encrypted: true,
      raw: store,
      loadIncidents: function () {
        return store.loadIncidents().then(function (list) {
          return Promise.all(list.map(function (x) {
            if (!isSealed(x)) return Promise.resolve(x);
            return decryptJSON(unlocked, x).catch(function () { return null; });
          }));
        }).then(function (list) { return list.filter(Boolean); });
      },
      putIncident: function (inc) {
        return encryptJSON(unlocked, inc).then(function (env) {
          env.id = inc.id;
          return store.putIncident(env);
        });
      },
      deleteIncident: function (id) { return store.deleteIncident(id); },
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
   * Rewrites everything in a store from one form to another: plain to encrypted
   * (from null, to unlocked) or encrypted to plain (from unlocked, to null).
   * kvKeys: the KV entries to convert.
   */
  function convertStore(store, from, to, kvKeys) {
    var src = from ? wrapStore(store, from) : store;
    var dst = to ? wrapStore(store, to) : store;
    return src.loadIncidents().then(function (list) {
      return list.reduce(function (p, inc) {
        return p.then(function () { return dst.putIncident(inc); });
      }, Promise.resolve()).then(function () { return list.length; });
    }).then(function (count) {
      return (kvKeys || []).reduce(function (p, k) {
        return p.then(function () {
          return src.getKV(k).then(function (v) { return v === null || v === undefined ? null : dst.putKV(k, v); });
        });
      }, Promise.resolve()).then(function () { return count; });
    });
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
    isSealed: isSealed,
    wrapStore: wrapStore,
    convertStore: convertStore
  };
});
