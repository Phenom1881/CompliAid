/*
 * FieldICS QR transfer framing. Splits a package into a loop of QR codes and
 * puts it back together on the receiving device. No DOM access here; drawing and
 * camera scanning are in the app (js/app/transfer.js) using the vendored libraries.
 *
 * Frame text: FI1|<transfer id>|<part>|<parts>|<crc32 of the whole payload>|<chunk>
 * The payload is base64 of the (compressed) package. Parts can arrive in any order
 * and any number of times; the receiver finishes when it has them all and the
 * checksum matches.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldQR = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PREFIX = 'FI1';
  /* Smaller parts make smaller, easier-to-read codes on a phone screen. */
  var CHUNK = 400;
  var MAX_PARTS = 400;

  var TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(str) {
    var c = 0xffffffff;
    for (var i = 0; i < str.length; i++) c = TABLE[(c ^ str.charCodeAt(i)) & 0xff] ^ (c >>> 8);
    return ((c ^ 0xffffffff) >>> 0).toString(16);
  }

  function transferId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  /* payload: base64 text. Returns frame strings. */
  function frames(payload, opts) {
    var size = (opts && opts.chunk) || CHUNK;
    var parts = Math.max(1, Math.ceil(payload.length / size));
    if (parts > MAX_PARTS) throw new Error('This package is too large to send by QR code. Save a package file instead, or send only changes.');
    var id = (opts && opts.id) || transferId();
    var crc = crc32(payload);
    var out = [];
    for (var i = 0; i < parts; i++) {
      out.push([PREFIX, id, i + 1, parts, crc, payload.slice(i * size, (i + 1) * size)].join('|'));
    }
    return out;
  }

  function parseFrame(text) {
    if (typeof text !== 'string') return null;
    var m = /^FI1\|([A-Z0-9]{6})\|(\d{1,3})\|(\d{1,3})\|([0-9a-f]{1,8})\|([A-Za-z0-9+/=]*)$/.exec(text);
    if (!m) return null;
    var part = +m[2];
    var parts = +m[3];
    if (part < 1 || parts < 1 || part > parts || parts > MAX_PARTS) return null;
    return { id: m[1], part: part, parts: parts, crc: m[4], chunk: m[5] };
  }

  /*
   * Collects frames. add(text) returns { status, have, parts, payload? }:
   * status: 'ignored' (not ours), 'new', 'repeat', 'complete', 'restart' (a different transfer began), 'bad' (checksum failed).
   */
  function Receiver() {
    this.reset();
  }

  Receiver.prototype.reset = function () {
    this.id = null;
    this.parts = 0;
    this.crc = '';
    this.chunks = new Map();
    this.done = false;
  };

  Receiver.prototype.add = function (text) {
    var f = parseFrame(text);
    if (!f) return { status: 'ignored', have: this.chunks.size, parts: this.parts };
    var status = 'new';
    if (this.id !== f.id || this.parts !== f.parts || this.crc !== f.crc) {
      if (this.id) status = 'restart';
      this.reset();
      this.id = f.id;
      this.parts = f.parts;
      this.crc = f.crc;
    }
    if (this.done) return { status: 'repeat', have: this.parts, parts: this.parts };
    if (this.chunks.has(f.part)) status = 'repeat';
    else this.chunks.set(f.part, f.chunk);
    if (this.chunks.size === this.parts) {
      var payload = '';
      for (var i = 1; i <= this.parts; i++) payload += this.chunks.get(i);
      if (crc32(payload) !== this.crc) {
        this.reset();
        return { status: 'bad', have: 0, parts: 0 };
      }
      this.done = true;
      return { status: 'complete', have: this.parts, parts: this.parts, payload: payload };
    }
    return { status: status, have: this.chunks.size, parts: this.parts, missing: this.missing() };
  };

  Receiver.prototype.missing = function () {
    var out = [];
    for (var i = 1; i <= this.parts; i++) if (!this.chunks.has(i)) out.push(i);
    return out;
  };

  return { frames: frames, parseFrame: parseFrame, Receiver: Receiver, crc32: crc32, CHUNK: CHUNK, MAX_PARTS: MAX_PARTS };
});
