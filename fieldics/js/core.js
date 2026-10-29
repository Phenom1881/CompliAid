/*
 * FieldICS core logic, data format version 3.
 * No DOM access. Runs in browsers (as window.FieldICS) and in Node 18+ (for tests).
 *
 * Data rules:
 *  - The ICS 214 activity log is append only. Entries are never edited or deleted.
 *    A fix is a new entry that points at the original through "corrects".
 *  - Every other form is a record with a version history. Saving adds a version
 *    (a "revision") that names the version or versions it replaces. Versions are
 *    never changed or removed, so merging two devices is a union of versions.
 *  - When two devices edit the same record separately, the record ends up with
 *    two current versions. That is a conflict. The app shows both, and a person
 *    resolves it by saving a version that replaces both.
 *  - Ids are random, except one-per-period forms, whose ids come from the form and
 *    period. Importing the same file twice never creates duplicates, and the order
 *    of imports never changes the result.
 *  - Every lookup keyed by an id uses Map, so ids can never collide with built-in
 *    object properties.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./forms.js'));
  } else {
    root.FieldICS = factory(root.FieldICSForms);
  }
})(typeof self !== 'undefined' ? self : this, function (Forms) {
  'use strict';

  var FORMAT = 'field-ics-package';
  var ENC_FORMAT = 'field-ics-encrypted';
  /*
   * Package format 4 adds form types (ICS 205A, 206, 208, 209, 215, 215A, 221, damage
   * assessments, volunteers). A package that holds only types version 3 knew is still
   * written as version 3, so devices not yet updated keep sharing. A device on version 3
   * that gets a version 4 file is told to update instead of failing on an unknown form.
   */
  var VERSION = 4;
  var V3_TYPES = ['period', '201', '202', '203', '204', '205', '213', '213RR', '211', 'labor', 'equipment', 'materials', 'rentals', 'contracts', 'note', 'travel'];
  var PBKDF2_ITERATIONS = 600000;
  var MAX_ITERATIONS = 2000000;
  var MIN_PASSPHRASE = 8;

  /* Ids become map keys and file names, so only letters, digits and hyphens. */
  var ID_RE = /^[A-Za-z0-9-]{8,80}$/;
  var RID_RE = /^[A-Za-z0-9-]{2,80}$/;
  var ATT_RE = /^att-[A-Za-z0-9-]{8,76}$/;
  var IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
  var SKIP_KEYS = ['__proto__', 'constructor', 'prototype'];

  var LIMITS = {
    text: 5000,
    name: 120,
    position: 120,
    incidentName: 160,
    field: 200,
    entries: 50000,
    revs: 100000,
    atts: 5000,
    parents: 50,
    attChars: 4000000,
    photos: 12,
    entryPhotos: 6
  };

  var FORMS = Forms.FORMS;
  var COST_TYPES = Forms.COST_TYPES;
  var hasOwn = Object.prototype.hasOwnProperty;

  function own(obj, key) {
    return obj !== null && typeof obj === 'object' && hasOwn.call(obj, key);
  }

  function isType(type) {
    return typeof type === 'string' && own(FORMS, type);
  }

  /* ---------- small helpers ---------- */

  function getCrypto() {
    return (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  }

  function cryptoAvailable() {
    var c = getCrypto();
    return !!(c && c.subtle && typeof c.getRandomValues === 'function');
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function uid() {
    var c = getCrypto();
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function') {
      c.getRandomValues(b);
    } else {
      for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var hex = [];
    for (var j = 0; j < 16; j++) hex.push((b[j] + 0x100).toString(16).slice(1));
    return (
      hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }

  function copyOwn(src) {
    var out = {};
    Object.keys(src).forEach(function (k) {
      if (SKIP_KEYS.indexOf(k) === -1) out[k] = src[k];
    });
    return out;
  }

  var MIN_TIME = Date.UTC(1900, 0, 1);
  var MAX_TIME = Date.UTC(2200, 0, 1);

  function toISO(value, label) {
    var t = typeof value === 'string' ? Date.parse(value) : NaN;
    if (isNaN(t) || t < MIN_TIME || t >= MAX_TIME) {
      throw new Error((label || 'Date') + ' is not a valid date and time.');
    }
    return new Date(t).toISOString();
  }

  function cleanText(value, max, label, multiline) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new Error(label + ' must be text.');
    var v = value.replace(CTRL_RE, '');
    v = multiline ? v.replace(/\r\n?/g, '\n') : v.replace(/[\r\n\t]+/g, ' ');
    v = v.trim();
    if (v.length > max) throw new Error(label + ' is too long (limit ' + max + ' characters).');
    return v;
  }

  function validDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    var y = +m[1];
    var mo = +m[2];
    var d = +m[3];
    if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
  }

  function slug(text) {
    var s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s.slice(0, 40) || 'incident';
  }

  function stamp(date) {
    var d = date || new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function compareEntries(a, b) {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
    if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  }

  function sortEntries(list) {
    list.sort(compareEntries);
    return list;
  }

  function cmpRev(a, b) {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  }

  /* ---------- field values ---------- */

  function emptyValue(f) {
    switch (f.kind) {
      case 'number':
      case 'money':
      case 'percent':
      case 'int':
        return null;
      case 'bool':
        return false;
      case 'checks':
      case 'rows':
      case 'images':
        return [];
      default:
        return '';
    }
  }

  function isEmptyValue(v) {
    return v === '' || v === null || v === undefined || v === false || (Array.isArray(v) && v.length === 0);
  }

  function emptyRow(f) {
    var row = {};
    f.columns.forEach(function (c) { row[c.k] = emptyValue(c); });
    return row;
  }

  function maxFor(f) {
    if (f.max) return f.max;
    if (f.kind === 'percent') return 1000;
    if (f.kind === 'money') return 1000000000;
    if (f.kind === 'int') return 100000;
    return 10000000;
  }

  /* f.min allows negative numbers (longitude); f.decimals sets the precision kept (default 4). */
  function parseNumber(v, f, label) {
    if (v === null || v === undefined || v === '') return null;
    var n;
    var min = typeof f.min === 'number' ? f.min : 0;
    if (typeof v === 'number') {
      n = v;
    } else if (typeof v === 'string') {
      var s = v.trim().replace(/[$,%\s]/g, '');
      if (s === '') return null;
      var re = min < 0 ? /^-?(\d+\.?\d*|\.\d+)$/ : /^(\d+\.?\d*|\.\d+)$/;
      if (!re.test(s)) throw new Error(label + ' must be a number.');
      n = Number(s);
    } else {
      throw new Error(label + ' must be a number.');
    }
    if (!isFinite(n)) throw new Error(label + ' must be a number.');
    if (n < min) throw new Error(min === 0 ? label + ' must be zero or more.' : label + ' must be ' + min + ' or more.');
    if (n > maxFor(f)) throw new Error(label + ' is too large (limit ' + maxFor(f) + ').');
    if (f.kind === 'int') {
      if (Math.floor(n) !== n) throw new Error(label + ' must be a whole number.');
      return n;
    }
    var scale = Math.pow(10, typeof f.decimals === 'number' ? f.decimals : 4);
    return Math.round(n * scale) / scale;
  }

  function cleanValue(f, v, label) {
    switch (f.kind) {
      case 'text':
        return cleanText(v, f.max || LIMITS.field, label, false);
      case 'textarea':
        return cleanText(v, f.max || 8000, label, true);
      case 'datetime':
        if (v === undefined || v === null || v === '') return '';
        return toISO(v, label);
      case 'date':
        if (v === undefined || v === null || v === '') return '';
        if (typeof v !== 'string' || !validDay(v)) throw new Error(label + ' is not a valid date.');
        return v;
      case 'number':
      case 'money':
      case 'percent':
      case 'int':
        return parseNumber(v, f, label);
      case 'select':
        if (v === undefined || v === null || v === '') return '';
        if (typeof v !== 'string' || !f.options.some(function (o) { return o.v === v; })) {
          throw new Error(label + ' is not one of the choices.');
        }
        return v;
      case 'checks':
        if (v === undefined || v === null) return [];
        if (!Array.isArray(v)) throw new Error(label + ' is not valid.');
        return f.options.filter(function (o) { return v.indexOf(o.v) !== -1; }).map(function (o) { return o.v; });
      case 'bool':
        if (v === undefined || v === null) return false;
        if (typeof v !== 'boolean') throw new Error(label + ' must be yes or no.');
        return v;
      case 'image':
        if (v === undefined || v === null || v === '') return '';
        if (typeof v !== 'string' || !ATT_RE.test(v)) throw new Error(label + ' is not a valid image reference.');
        return v;
      case 'images':
        return cleanPhotoList(v, f.maxPhotos || LIMITS.photos, label);
      default:
        throw new Error(label + ' has an unknown field type.');
    }
  }

  function cleanPhotoList(v, max, label) {
    if (v === undefined || v === null || v === '') return [];
    if (!Array.isArray(v)) throw new Error(label + ' is not a valid list of photos.');
    var out = [];
    v.forEach(function (x) {
      if (typeof x !== 'string' || !ATT_RE.test(x)) throw new Error(label + ' has an invalid photo reference.');
      if (out.indexOf(x) === -1) out.push(x);
    });
    if (out.length > max) throw new Error(label + ' has too many photos (limit ' + max + ').');
    return out;
  }

  function cleanLeaf(f, v, label, problems) {
    try {
      return cleanValue(f, v, label);
    } catch (err) {
      if (!problems) throw err;
      problems.push(err.message);
      return emptyValue(f);
    }
  }

  function cleanRows(f, v, label, problems) {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      if (problems) { problems.push(label + ' is not a list.'); return []; }
      throw new Error(label + ' is not a list.');
    }
    var max = f.maxRows || 200;
    var list = v;
    if (list.length > max) {
      if (!problems) throw new Error(label + ' has too many rows (limit ' + max + ').');
      problems.push(label + ' has too many rows (limit ' + max + '). Extra rows were left out.');
      list = list.slice(0, max);
    }
    var out = [];
    list.forEach(function (row, i) {
      var where = label + ', row ' + (i + 1);
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        if (problems) { problems.push(where + ' is not valid.'); return; }
        throw new Error(where + ' is not valid.');
      }
      var clean = {};
      var empty = true;
      f.columns.forEach(function (c) {
        var val = cleanLeaf(c, own(row, c.k) ? row[c.k] : undefined, where + ', ' + c.label, problems);
        clean[c.k] = val;
        if (!isEmptyValue(val)) empty = false;
      });
      if (!empty) out.push(clean);
    });
    return out;
  }

  /*
   * Validates form data against its definition and returns a clean copy that has
   * every field, in definition order. Strict mode throws a readable Error.
   * Lenient mode ({ lenient: true }) blanks invalid values and returns
   * { data, problems } so autosave never loses valid work.
   */
  function sanitize(type, raw, opts) {
    if (!isType(type)) throw new Error('Unknown form type.');
    var def = FORMS[type];
    var problems = opts && opts.lenient ? [] : null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      if (!problems) throw new Error(def.code + ' data is not valid.');
      raw = {};
    }
    var out = {};
    Forms.fieldsOf(def).forEach(function (f) {
      var v = own(raw, f.k) ? raw[f.k] : undefined;
      out[f.k] = f.kind === 'rows' ? cleanRows(f, v, f.label, problems) : cleanLeaf(f, v, f.label, problems);
    });
    if (problems) return { data: out, problems: problems };
    return out;
  }

  /* Returns an error message for one value, or an empty string when it is fine. */
  function checkValue(f, v) {
    try {
      cleanValue(f, v, f.label);
      return '';
    } catch (err) {
      return err.message;
    }
  }

  function missingRequired(type, data) {
    return Forms.fieldsOf(FORMS[type]).filter(function (f) {
      return f.required && isEmptyValue(data[f.k]);
    }).map(function (f) { return f.label; });
  }

  function sameValue(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  }

  function sameData(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function diffFields(type, a, b) {
    return Forms.fieldsOf(FORMS[type]).filter(function (f) {
      return !sameValue(a[f.k], b[f.k]);
    }).map(function (f) { return f.k; });
  }

  /* ---------- incidents ---------- */

  function metaFields(fields) {
    var name = cleanText(fields.name, LIMITS.incidentName, 'Incident name', false);
    if (!name) throw new Error('Enter an incident name.');
    return {
      exercise: fields.exercise === true,
      name: name,
      number: cleanText(fields.number, 60, 'Incident number', false),
      location: cleanText(fields.location, LIMITS.field, 'Location', false),
      applicant: cleanText(fields.applicant, LIMITS.field, 'Applicant', false),
      paId: cleanText(fields.paId, 60, 'FEMA PA ID', false),
      disasterNumber: cleanText(fields.disasterNumber, 60, 'Disaster number', false),
      altDebris: fields.altDebris === true,
      hics: fields.hics === true,
      closedAt: fields.closedAt ? toISO(fields.closedAt, 'Closed time') : '',
      closedBy: fields.closedAt ? cleanText(fields.closedBy, LIMITS.name, 'Closed by', false) : ''
    };
  }

  /*
   * altDebris: the applicant elected the FEMA PA alternative procedures for debris
   * removal, under which straight time for budgeted employees on Category A is eligible.
   * closedAt, closedBy: the incident was closed out; the app shows it read-only.
   * hics: a hospital incident, run with the Hospital Incident Command System forms.
   */
  var META_KEYS = ['name', 'number', 'location', 'applicant', 'paId', 'disasterNumber', 'exercise', 'altDebris', 'hics', 'closedAt', 'closedBy'];
  var META_FLAGS = ['exercise', 'altDebris', 'hics'];

  function metaValue(obj, k) {
    if (META_FLAGS.indexOf(k) !== -1) return obj[k] === true;
    return obj[k] || '';
  }

  function createIncident(fields, who, now) {
    now = now || nowISO();
    var m = metaFields(fields || {});
    return {
      id: uid(),
      version: 3,
      exercise: m.exercise,
      name: m.name,
      number: m.number,
      location: m.location,
      applicant: m.applicant,
      paId: m.paId,
      disasterNumber: m.disasterNumber,
      altDebris: m.altDebris,
      hics: m.hics,
      closedAt: '',
      closedBy: '',
      createdAt: now,
      metaUpdatedAt: now,
      metaUpdatedBy: cleanText(who, LIMITS.name, 'Device name', false),
      lastExportAt: null,
      entries: [],
      revs: [],
      atts: []
    };
  }

  /* fields without closedAt keep the incident's close-out as it is. */
  function updateIncidentMeta(incident, fields, who, now) {
    now = now || nowISO();
    var f = {};
    Object.keys(fields || {}).forEach(function (k) { f[k] = fields[k]; });
    if (!('closedAt' in f)) {
      f.closedAt = incident.closedAt || '';
      f.closedBy = incident.closedBy || '';
    }
    var m = metaFields(f);
    META_KEYS.forEach(function (k) { incident[k] = m[k]; });
    incident.metaUpdatedAt = now;
    incident.metaUpdatedBy = cleanText(who, LIMITS.name, 'Device name', false);
    return incident;
  }

  /* Closes an incident out (read-only in the app) or reopens it. Travels in package files. */
  function setClosed(incident, closed, who, now) {
    now = now || nowISO();
    var f = incidentMeta(incident);
    f.closedAt = closed ? now : '';
    f.closedBy = closed ? who : '';
    return updateIncidentMeta(incident, f, who, now);
  }

  function isClosed(incident) {
    return !!(incident && incident.closedAt);
  }

  function incidentMeta(inc) {
    return {
      id: inc.id,
      name: inc.name,
      number: inc.number || '',
      location: inc.location || '',
      applicant: inc.applicant || '',
      paId: inc.paId || '',
      disasterNumber: inc.disasterNumber || '',
      exercise: inc.exercise === true,
      altDebris: inc.altDebris === true,
      hics: inc.hics === true,
      closedAt: inc.closedAt || '',
      closedBy: inc.closedBy || '',
      createdAt: inc.createdAt,
      metaUpdatedAt: inc.metaUpdatedAt,
      metaUpdatedBy: inc.metaUpdatedBy || ''
    };
  }

  function legacyPeriodRev(incId, opStart, opEnd, meta) {
    var data = sanitize('period', { start: opStart || '', end: opEnd || '' });
    return {
      id: 'v1p-' + incId,
      rid: 'op-1',
      type: 'period',
      period: 1,
      parents: [],
      at: meta.metaUpdatedAt || meta.createdAt || nowISO(),
      by: cleanText(meta.metaUpdatedBy, LIMITS.name, 'Name', false),
      deviceId: '',
      deviceName: cleanText(meta.metaUpdatedBy, LIMITS.name, 'Device name', false),
      deleted: false,
      data: data
    };
  }

  /*
   * Brings an incident stored by any earlier version up to the current shape.
   * Safe to run on current incidents. Returns null for unusable data.
   */
  function upgradeIncident(raw, now) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
    now = now || nowISO();
    var inc = copyOwn(raw);
    ['name', 'number', 'location', 'applicant', 'paId', 'disasterNumber', 'metaUpdatedBy', 'closedAt', 'closedBy'].forEach(function (k) {
      if (typeof inc[k] !== 'string') inc[k] = '';
    });
    if (!inc.name) inc.name = 'Untitled incident';
    inc.exercise = inc.exercise === true;
    inc.altDebris = inc.altDebris === true;
    inc.hics = inc.hics === true;
    if (typeof inc.createdAt !== 'string') inc.createdAt = now;
    if (typeof inc.metaUpdatedAt !== 'string') inc.metaUpdatedAt = inc.createdAt;
    if (inc.lastExportAt !== null && typeof inc.lastExportAt !== 'string') inc.lastExportAt = null;
    if (inc.lastPhotoExportAt !== undefined && inc.lastPhotoExportAt !== null && typeof inc.lastPhotoExportAt !== 'string') inc.lastPhotoExportAt = null;
    inc.entries = Array.isArray(inc.entries) ? inc.entries.slice() : [];
    inc.revs = Array.isArray(inc.revs) ? inc.revs.slice() : [];
    inc.atts = Array.isArray(inc.atts) ? inc.atts.slice() : [];
    if ((inc.opStart || inc.opEnd) && !inc.revs.some(function (r) { return r && r.rid === 'op-1'; })) {
      try {
        var rev = legacyPeriodRev(inc.id, inc.opStart, inc.opEnd, inc);
        rev._rx = now;
        inc.revs.push(rev);
      } catch (e) {
        /* An unreadable old operational period is skipped. */
      }
    }
    delete inc.opStart;
    delete inc.opEnd;
    inc.version = 3;
    return inc;
  }

  /* ---------- ICS 214 entries ---------- */

  var CLOSED_TEXT = 'This incident is closed out. Reopen it under Share and print to make changes.';

  function addEntry(incident, fields, now) {
    now = now || nowISO();
    if (isClosed(incident)) throw new Error(CLOSED_TEXT);
    var text = cleanText(fields.text, LIMITS.text, 'Activity', true);
    if (!text) throw new Error('Enter what happened.');
    var author = cleanText(fields.author, LIMITS.name, 'Name', false);
    if (!author) throw new Error('Enter your name.');
    var corrects = fields.corrects || null;
    if (corrects && !incident.entries.some(function (e) { return e.id === corrects; })) {
      throw new Error('The entry being corrected was not found.');
    }
    var photos = cleanPhotoList(fields.photos, LIMITS.entryPhotos, 'Photos');
    var entry = {
      id: uid(),
      incidentId: incident.id,
      ts: fields.ts ? toISO(fields.ts, 'Activity time') : now,
      recordedAt: now,
      author: author,
      position: cleanText(fields.position, LIMITS.position, 'Position', false),
      text: text,
      corrects: corrects,
      deviceId: cleanText(fields.deviceId, LIMITS.field, 'Device id', false),
      deviceName: cleanText(fields.deviceName, LIMITS.name, 'Device name', false),
      _rx: now
    };
    if (photos.length) entry.photos = photos;
    if (fields.source) entry.source = cleanText(fields.source, 40, 'Source', false);
    incident.entries.push(entry);
    sortEntries(incident.entries);
    return entry;
  }

  /* Map from an original entry id to the corrections that point at it. */
  function correctionMap(incident) {
    var map = new Map();
    incident.entries.forEach(function (e) {
      if (e.corrects) {
        var list = map.get(e.corrects);
        if (!list) {
          list = [];
          map.set(e.corrects, list);
        }
        list.push(e);
      }
    });
    return map;
  }

  /* People who have logged entries, with the position they used most recently. */
  function authors(incident) {
    var seen = new Map();
    incident.entries.forEach(function (e) {
      var key = e.author.toLowerCase();
      var cur = seen.get(key);
      if (!cur || e.recordedAt >= cur.recordedAt) {
        seen.set(key, { key: key, name: e.author, position: e.position, recordedAt: e.recordedAt });
      }
    });
    return Array.from(seen.values()).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function entriesInRange(incident, start, end) {
    return incident.entries.filter(function (e) {
      return (!start || e.ts >= start) && (!end || e.ts < end);
    });
  }

  /* ---------- records and versions ---------- */

  function needsPeriod(type) {
    var scope = FORMS[type].scope;
    return scope === 'period' || scope === 'period-many';
  }

  /* Fixed record id for one-per-incident and one-per-period forms, otherwise null. */
  function recordId(type, period) {
    if (!isType(type)) return null;
    if (type === 'period') return 'op-' + period;
    var scope = FORMS[type].scope;
    if (scope === 'incident') return 'ics' + type.toLowerCase();
    if (scope === 'period') return 'op-' + period + '-ics' + type.toLowerCase();
    return null;
  }

  function checkEnvelope(rid, type, period, where) {
    if (!isType(type)) throw new Error(where + ' has an unknown form type.');
    if (typeof rid !== 'string' || !RID_RE.test(rid)) throw new Error(where + ' has an invalid record id.');
    if (needsPeriod(type)) {
      if (typeof period !== 'number' || Math.floor(period) !== period || period < 1 || period > 9999) {
        throw new Error(where + ' has an invalid operational period.');
      }
    } else if (period !== null && period !== undefined) {
      throw new Error(where + ' should not have an operational period.');
    }
    var fixed = recordId(type, period);
    if (fixed) {
      if (rid !== fixed) throw new Error(where + ' has a record id that does not match its form.');
    } else if (!ID_RE.test(rid) || /^op-/.test(rid) || /^ics/.test(rid)) {
      throw new Error(where + ' has an invalid record id.');
    }
  }

  var indexCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  /*
   * Groups versions by record and works out the current version(s).
   * A version is current (a "head") when no other version of the same record
   * replaces it. More than one live head means the record has a conflict.
   * Versions are only ever added, so the cache is valid while the count holds.
   */
  function index(inc) {
    var cached = indexCache && indexCache.get(inc);
    if (cached && cached.revs === inc.revs && cached.n === inc.revs.length) return cached;
    var byRid = new Map();
    inc.revs.forEach(function (r) {
      var g = byRid.get(r.rid);
      if (!g) {
        g = { rid: r.rid, type: r.type, period: r.period, revs: [] };
        byRid.set(r.rid, g);
      }
      g.revs.push(r);
    });
    byRid.forEach(function (g) {
      var replaced = new Set();
      g.revs.forEach(function (r) {
        r.parents.forEach(function (p) { replaced.add(p); });
      });
      g.revs.sort(cmpRev);
      var heads = g.revs.filter(function (r) { return !replaced.has(r.id); });
      if (!heads.length) heads = [g.revs[g.revs.length - 1]];
      heads.sort(function (a, b) { return cmpRev(b, a); });
      var live = heads.filter(function (r) { return !r.deleted; });
      g.heads = heads;
      g.winner = live.length ? live[0] : heads[0];
      g.deleted = live.length === 0;
      g.conflict = !g.deleted && heads.length > 1;
      g.created = g.revs[0].at;
    });
    var result = { revs: inc.revs, n: inc.revs.length, byRid: byRid };
    if (indexCache) indexCache.set(inc, result);
    return result;
  }

  function getRecord(inc, rid) {
    return index(inc).byRid.get(rid) || null;
  }

  function listRecords(inc, type, period, includeDeleted) {
    var out = [];
    index(inc).byRid.forEach(function (g) {
      if (g.type !== type) return;
      if (g.deleted && !includeDeleted) return;
      if (period !== undefined && period !== null && g.period !== period) return;
      out.push(g);
    });
    return out;
  }

  function conflictList(inc) {
    var order = Forms.RECORD_TYPES;
    var out = [];
    index(inc).byRid.forEach(function (g) { if (g.conflict) out.push(g); });
    out.sort(function (a, b) {
      var d = order.indexOf(a.type) - order.indexOf(b.type);
      if (d) return d;
      if (a.period !== b.period) return (a.period || 0) - (b.period || 0);
      return a.created < b.created ? -1 : 1;
    });
    return out;
  }

  /*
   * Adds a version. o: { rid?, type, period, parents, data, deleted, by, deviceId, deviceName }.
   * parents are the versions this one replaces: the version that was being edited,
   * or every current version when resolving a conflict.
   */
  function saveRecord(inc, o, now) {
    now = now || nowISO();
    if (isClosed(inc)) throw new Error(CLOSED_TEXT);
    if (!isType(o.type)) throw new Error('Unknown form type.');
    var period = o.period === undefined ? null : o.period;
    var rid = o.rid || recordId(o.type, period) || uid();
    checkEnvelope(rid, o.type, period, 'This form');
    var g = getRecord(inc, rid);
    if (g && (g.type !== o.type || g.period !== period)) throw new Error('This record belongs to a different form.');
    var parents = [];
    (o.parents || []).forEach(function (p) {
      if (!g || !g.revs.some(function (r) { return r.id === p; })) {
        throw new Error('A version being replaced was not found.');
      }
      if (parents.indexOf(p) === -1) parents.push(p);
    });
    var data;
    if (o.deleted && o.data === undefined) {
      data = g ? g.winner.data : sanitize(o.type, {});
    } else {
      data = sanitize(o.type, o.data || {});
    }
    var rev = {
      id: uid(),
      rid: rid,
      type: o.type,
      period: period,
      parents: parents,
      at: now,
      by: cleanText(o.by, LIMITS.name, 'Name', false),
      deviceId: cleanText(o.deviceId, LIMITS.field, 'Device id', false),
      deviceName: cleanText(o.deviceName, LIMITS.name, 'Device name', false),
      deleted: !!o.deleted,
      data: data,
      _rx: now
    };
    inc.revs.push(rev);
    return rev;
  }

  function periods(inc) {
    var out = [];
    index(inc).byRid.forEach(function (g) {
      if (g.type !== 'period' || g.deleted) return;
      out.push({ n: g.period, rid: g.rid, start: g.winner.data.start, end: g.winner.data.end, conflict: g.conflict, rec: g });
    });
    out.sort(function (a, b) { return a.n - b.n; });
    return out;
  }

  function periodOf(inc, n) {
    var list = periods(inc);
    for (var i = 0; i < list.length; i++) {
      if (list[i].n === n) return list[i];
    }
    return null;
  }

  function nextPeriodNumber(inc) {
    var max = 0;
    periods(inc).forEach(function (p) { if (p.n > max) max = p.n; });
    return max + 1;
  }

  function formsInPeriod(inc, n) {
    var out = [];
    index(inc).byRid.forEach(function (g) {
      if (g.type !== 'period' && g.period === n && !g.deleted) out.push(g);
    });
    return out;
  }

  /* ---------- sign-offs ---------- */

  /*
   * Sign-offs on a form record, oldest first: { rid, role, name, position, at, version,
   * current }. current is true when the sign-off is for the version shown now; a later
   * edit leaves earlier sign-offs on the earlier version.
   */
  function signoffsFor(inc, rid) {
    var g = getRecord(inc, rid);
    var current = g ? g.winner.id : '';
    return listRecords(inc, 'signoff').filter(function (s) { return s.winner.data.target === rid; }).map(function (s) {
      var d = s.winner.data;
      return { rid: s.rid, role: d.role, name: d.name, position: d.position, at: d.at, version: d.version, current: d.version === current };
    }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }

  function signOff(inc, target, o, now) {
    now = now || nowISO();
    var g = getRecord(inc, target);
    if (!g || g.deleted) throw new Error('Save the form before signing off.');
    if (g.conflict) throw new Error('This form has versions to compare. Settle them before signing off.');
    return saveRecord(inc, {
      type: 'signoff',
      data: { target: target, version: g.winner.id, role: o.role, name: o.name, position: o.position || '', at: now },
      by: o.by || o.name, deviceId: o.deviceId || '', deviceName: o.deviceName || ''
    }, now);
  }

  /* ---------- attachments (images) ---------- */

  function cleanAttachment(raw, where) {
    if (!raw || typeof raw !== 'object') throw new Error(where + ' is not valid.');
    if (typeof raw.id !== 'string' || !ATT_RE.test(raw.id)) throw new Error(where + ' has no valid id.');
    if (IMAGE_TYPES.indexOf(raw.mime) === -1) throw new Error(where + ' is not a supported image type.');
    if (typeof raw.data !== 'string' || raw.data.length > LIMITS.attChars) throw new Error(where + ' is too large or damaged.');
    var prefix = 'data:' + raw.mime + ';base64,';
    var body = raw.data.slice(prefix.length);
    if (raw.data.slice(0, prefix.length) !== prefix || !body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
      throw new Error(where + ' is damaged.');
    }
    return {
      id: raw.id,
      mime: raw.mime,
      data: raw.data,
      name: cleanText(raw.name, LIMITS.field, where + ' name', false),
      at: toISO(raw.at, where + ' time'),
      by: cleanText(raw.by, LIMITS.name, where + ' name', false)
    };
  }

  function addAttachment(inc, o, now) {
    now = now || nowISO();
    if (isClosed(inc)) throw new Error(CLOSED_TEXT);
    var att = cleanAttachment({
      id: 'att-' + uid(),
      mime: o.mime,
      data: o.data,
      name: o.name || '',
      at: now,
      by: o.by || ''
    }, 'Image');
    att._rx = now;
    inc.atts.push(att);
    return att.id;
  }

  function getAttachment(inc, id) {
    if (!id) return null;
    for (var i = 0; i < inc.atts.length; i++) {
      if (inc.atts[i].id === id) return inc.atts[i];
    }
    return null;
  }

  /* ---------- packages ---------- */

  function publicEntry(e) {
    var out = {
      id: e.id,
      incidentId: e.incidentId,
      ts: e.ts,
      recordedAt: e.recordedAt,
      author: e.author,
      position: e.position,
      text: e.text,
      corrects: e.corrects || null,
      deviceId: e.deviceId,
      deviceName: e.deviceName
    };
    if (e.photos && e.photos.length) out.photos = e.photos.slice();
    if (e.source) out.source = e.source;
    return out;
  }

  function publicRev(r) {
    return {
      id: r.id,
      rid: r.rid,
      type: r.type,
      period: r.period,
      parents: r.parents.slice(),
      at: r.at,
      by: r.by,
      deviceId: r.deviceId,
      deviceName: r.deviceName,
      deleted: !!r.deleted,
      data: r.data
    };
  }

  function publicAtt(a) {
    return { id: a.id, mime: a.mime, data: a.data, name: a.name, at: a.at, by: a.by };
  }

  /*
   * Builds the object that gets saved to a file.
   * opts.changesOnly: only items this device received since its last export.
   * opts.noPhotos: leave images out to keep the file small. Forms keep their
   *   references, and the images arrive later with any package that has them.
   * A full package is always safe to send, because import never duplicates.
   */
  function buildPackage(inc, opts) {
    opts = opts || {};
    var now = opts.now || nowISO();
    var since = opts.changesOnly ? inc.lastExportAt : null;
    var photoSince = opts.changesOnly ? photoExportAt(inc) : null;
    function fresh(x) { return !since || (x._rx && x._rx > since); }
    function freshPhoto(x) { return !photoSince || (x._rx && x._rx > photoSince); }
    /* noPatients leaves out the forms that hold patient information (HICS 254, 255, 260). */
    var revs = inc.revs.filter(fresh).filter(function (r) { return !(opts.noPatients && isPhiType(r.type)); }).map(publicRev);
    var newer = inc.hics === true || revs.some(function (r) { return V3_TYPES.indexOf(r.type) === -1; });
    return {
      photos: opts.noPhotos ? 'left-out' : 'included',
      patients: opts.noPatients && hasPatientRecords(inc) ? 'left-out' : 'included',
      format: FORMAT,
      version: newer ? VERSION : 3,
      exportedAt: now,
      deviceId: opts.deviceId || '',
      deviceName: opts.deviceName || '',
      scope: since ? 'changes' : 'full',
      since: since || null,
      incident: incidentMeta(inc),
      entries: inc.entries.filter(fresh).map(publicEntry),
      revs: revs,
      atts: opts.noPhotos ? [] : inc.atts.filter(freshPhoto).map(publicAtt)
    };
  }

  /*
   * Records a saved package. A file saved without photos counts for the log and
   * forms, but the photos stay pending until a file that carries them is saved.
   */
  function markExported(incident, iso, opts) {
    var before = photoExportAt(incident);
    incident.lastExportAt = iso;
    incident.lastPhotoExportAt = opts && opts.noPhotos ? before : iso;
    return incident;
  }

  /* When photos were last included in a saved package. Older incidents tracked one time for both. */
  function photoExportAt(inc) {
    return inc.lastPhotoExportAt === undefined ? inc.lastExportAt : inc.lastPhotoExportAt;
  }

  function isPhiType(type) {
    return !!(FORMS[type] && FORMS[type].phi);
  }

  /* True when the incident holds any form with patient information. */
  function hasPatientRecords(inc) {
    return inc.revs.some(function (r) { return isPhiType(r.type); });
  }

  function countPending(inc) {
    var since = inc.lastExportAt;
    function n(list) {
      if (!since) return list.length;
      return list.filter(function (x) { return x._rx && x._rx > since; }).length;
    }
    var photoSince = photoExportAt(inc);
    var r = {
      entries: n(inc.entries),
      revs: n(inc.revs),
      atts: photoSince ? inc.atts.filter(function (x) { return x._rx && x._rx > photoSince; }).length : inc.atts.length
    };
    r.total = r.entries + r.revs + r.atts;
    return r;
  }

  function cleanEntry(raw, incidentId, index) {
    var where = 'Log entry ' + (index + 1);
    if (!raw || typeof raw !== 'object') throw new Error(where + ' is not valid.');
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) throw new Error(where + ' has no valid id.');
    if (raw.incidentId !== incidentId) throw new Error(where + ' belongs to a different incident.');
    var text = cleanText(raw.text, LIMITS.text, where + ' text', true);
    if (!text) throw new Error(where + ' has no text.');
    var author = cleanText(raw.author, LIMITS.name, where + ' name', false);
    if (!author) throw new Error(where + ' has no name.');
    var corrects = raw.corrects;
    if (corrects !== null && corrects !== undefined && corrects !== '' &&
        (typeof corrects !== 'string' || !ID_RE.test(corrects))) {
      throw new Error(where + ' has an invalid correction link.');
    }
    var out = {
      id: raw.id,
      incidentId: incidentId,
      ts: toISO(raw.ts, where + ' time'),
      recordedAt: toISO(raw.recordedAt, where + ' recorded time'),
      author: author,
      position: cleanText(raw.position, LIMITS.position, where + ' position', false),
      text: text,
      corrects: corrects || null,
      deviceId: cleanText(raw.deviceId, LIMITS.field, where + ' device id', false),
      deviceName: cleanText(raw.deviceName, LIMITS.name, where + ' device name', false)
    };
    var photos = cleanPhotoList(raw.photos, LIMITS.entryPhotos, where + ' photos');
    if (photos.length) out.photos = photos;
    if (raw.source !== undefined && raw.source !== null && raw.source !== '') out.source = cleanText(raw.source, 40, where + ' source', false);
    return out;
  }

  function cleanRev(raw, i) {
    var where = 'Form version ' + (i + 1);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(where + ' is not valid.');
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) throw new Error(where + ' has no valid id.');
    var type = raw.type;
    if (!isType(type)) throw new Error(where + ' has an unknown form type.');
    var period = raw.period === undefined ? null : raw.period;
    checkEnvelope(raw.rid, type, period, where);
    if (!Array.isArray(raw.parents) || raw.parents.length > LIMITS.parents) {
      throw new Error(where + ' has an invalid list of earlier versions.');
    }
    var parents = [];
    raw.parents.forEach(function (p) {
      if (typeof p !== 'string' || !ID_RE.test(p) || p === raw.id) {
        throw new Error(where + ' has an invalid earlier version.');
      }
      if (parents.indexOf(p) === -1) parents.push(p);
    });
    if (raw.deleted !== undefined && typeof raw.deleted !== 'boolean') throw new Error(where + ' is not valid.');
    var data;
    try {
      data = sanitize(type, raw.data);
    } catch (err) {
      throw new Error(where + ' (' + FORMS[type].code + '): ' + err.message);
    }
    return {
      id: raw.id,
      rid: raw.rid,
      type: type,
      period: needsPeriod(type) ? period : null,
      parents: parents,
      at: toISO(raw.at, where + ' time'),
      by: cleanText(raw.by, LIMITS.name, where + ' name', false),
      deviceId: cleanText(raw.deviceId, LIMITS.field, where + ' device id', false),
      deviceName: cleanText(raw.deviceName, LIMITS.name, where + ' device name', false),
      deleted: raw.deleted === true,
      data: data
    };
  }

  /* Validates a package object and returns a cleaned copy. Throws a readable Error. */
  function parsePackage(pkg) {
    if (!pkg || typeof pkg !== 'object' || pkg.format !== FORMAT) {
      throw new Error('This file is not a FieldICS package.');
    }
    if (typeof pkg.version !== 'number' || pkg.version > VERSION) {
      throw new Error('This file was made by a newer version of FieldICS. Update the app and try again.');
    }
    if (pkg.version < 1) throw new Error('This file is not a FieldICS package.');
    var inc = pkg.incident;
    if (!inc || typeof inc !== 'object' || typeof inc.id !== 'string' || !ID_RE.test(inc.id)) {
      throw new Error('The package has no valid incident.');
    }
    var name = cleanText(inc.name, LIMITS.incidentName, 'Incident name', false);
    if (!name) throw new Error('The package incident has no name.');
    if (!Array.isArray(pkg.entries)) throw new Error('The package has no entry list.');
    if (pkg.entries.length > LIMITS.entries) throw new Error('The package has too many log entries.');
    var revsRaw = pkg.version >= 2 ? pkg.revs : [];
    var attsRaw = pkg.version >= 2 ? pkg.atts : [];
    if (!Array.isArray(revsRaw) || !Array.isArray(attsRaw)) throw new Error('The package is missing its form lists.');
    if (revsRaw.length > LIMITS.revs) throw new Error('The package has too many form versions.');
    if (attsRaw.length > LIMITS.atts) throw new Error('The package has too many images.');
    var now = nowISO();
    if (inc.exercise !== undefined && typeof inc.exercise !== 'boolean') throw new Error('The package incident is not valid.');
    if (inc.altDebris !== undefined && typeof inc.altDebris !== 'boolean') throw new Error('The package incident is not valid.');
    if (inc.hics !== undefined && typeof inc.hics !== 'boolean') throw new Error('The package incident is not valid.');
    var meta = {
      id: inc.id,
      exercise: inc.exercise === true,
      altDebris: inc.altDebris === true,
      hics: inc.hics === true,
      closedAt: inc.closedAt ? toISO(inc.closedAt, 'Closed time') : '',
      closedBy: inc.closedAt ? cleanText(inc.closedBy, LIMITS.name, 'Closed by', false) : '',
      name: name,
      number: cleanText(inc.number, 60, 'Incident number', false),
      location: cleanText(inc.location, LIMITS.field, 'Location', false),
      applicant: cleanText(inc.applicant, LIMITS.field, 'Applicant', false),
      paId: cleanText(inc.paId, 60, 'FEMA PA ID', false),
      disasterNumber: cleanText(inc.disasterNumber, 60, 'Disaster number', false),
      createdAt: inc.createdAt ? toISO(inc.createdAt, 'Incident created time') : now,
      metaUpdatedAt: inc.metaUpdatedAt ? toISO(inc.metaUpdatedAt, 'Incident updated time') : '',
      metaUpdatedBy: cleanText(inc.metaUpdatedBy, LIMITS.name, 'Updated by', false)
    };
    var entries = pkg.entries.map(function (raw, i) { return cleanEntry(raw, inc.id, i); });
    /* Forms from a newer version of FieldICS are skipped and counted, not refused. */
    var skipped = 0;
    var known = revsRaw.filter(function (raw) {
      if (raw && typeof raw === 'object' && typeof raw.type === 'string' && !isType(raw.type) && /^[A-Za-z0-9]{1,40}$/.test(raw.type)) {
        skipped++;
        return false;
      }
      return true;
    });
    var revs = known.map(function (raw, i) { return cleanRev(raw, i); });
    var shape = new Map();
    revs.forEach(function (r) {
      var s = shape.get(r.rid);
      if (s && (s.type !== r.type || s.period !== r.period)) {
        throw new Error('The package has two different forms using the same record id.');
      }
      shape.set(r.rid, r);
    });
    if (pkg.version === 1 && (inc.opStart || inc.opEnd)) {
      var op = legacyPeriodRev(inc.id, inc.opStart ? toISO(inc.opStart, 'Operational period start') : '',
        inc.opEnd ? toISO(inc.opEnd, 'Operational period end') : '', meta);
      revs.push(op);
    }
    var atts = attsRaw.map(function (raw, i) { return cleanAttachment(raw, 'Image ' + (i + 1)); });
    return {
      version: pkg.version,
      incident: meta,
      entries: entries,
      revs: revs,
      atts: atts,
      exportedAt: pkg.exportedAt ? toISO(pkg.exportedAt, 'Export time') : '',
      deviceName: cleanText(pkg.deviceName, LIMITS.name, 'Device name', false),
      deviceId: cleanText(pkg.deviceId, LIMITS.field, 'Device id', false),
      scope: pkg.scope === 'changes' ? 'changes' : 'full',
      photosLeftOut: pkg.photos === 'left-out',
      formsSkipped: skipped
    };
  }

  function entriesMatch(a, b) {
    return a.ts === b.ts && a.author === b.author && a.position === b.position &&
      a.text === b.text && (a.corrects || null) === (b.corrects || null) &&
      (a.photos || []).join(',') === (b.photos || []).join(',');
  }

  function revSignature(r) {
    var p = publicRev(r);
    p.data = sanitize(r.type, r.data, { lenient: true }).data;
    return JSON.stringify(p);
  }

  function sameRev(a, b) {
    return revSignature(a) === revSignature(b);
  }

  function copyIncident(target) {
    var inc = copyOwn(target);
    inc.entries = target.entries.slice();
    inc.revs = target.revs.slice();
    inc.atts = target.atts.slice();
    return inc;
  }

  /*
   * Merges a package into a local incident (or creates one when target is null).
   * Never changes the target. Returns { incident, report }.
   */
  function mergePackage(target, pkg, opts) {
    var now = (opts && opts.now) || nowISO();
    var parsed = parsePackage(pkg);
    var report = {
      incidentName: parsed.incident.name,
      createdIncident: false,
      added: 0,
      duplicates: 0,
      conflicts: [],
      formsAdded: 0,
      formsDuplicate: 0,
      formsConflicts: [],
      formsRejected: 0,
      imagesAdded: 0,
      imagesDuplicate: 0,
      imagesConflicts: [],
      metaChanged: false,
      fromDevice: parsed.deviceName,
      fromDeviceId: parsed.deviceId,
      exportedAt: parsed.exportedAt,
      scope: parsed.scope,
      photosLeftOut: parsed.photosLeftOut,
      formsSkipped: parsed.formsSkipped,
      newConflicts: []
    };
    var before = new Set();
    var inc;
    if (!target) {
      inc = {
        id: parsed.incident.id,
        version: 3,
        lastExportAt: null,
        entries: [],
        revs: [],
        atts: []
      };
      META_KEYS.concat(['createdAt', 'metaUpdatedAt', 'metaUpdatedBy']).forEach(function (k) {
        inc[k] = parsed.incident[k];
      });
      report.createdIncident = true;
    } else {
      if (target.id !== parsed.incident.id) throw new Error('This file is for a different incident.');
      conflictList(target).forEach(function (g) { before.add(g.rid); });
      inc = copyIncident(target);
      if (parsed.incident.createdAt < inc.createdAt) inc.createdAt = parsed.incident.createdAt;
      if (parsed.incident.metaUpdatedAt > (inc.metaUpdatedAt || '')) {
        report.metaChanged = META_KEYS.some(function (k) { return metaValue(inc, k) !== metaValue(parsed.incident, k); });
        META_KEYS.concat(['metaUpdatedAt', 'metaUpdatedBy']).forEach(function (k) {
          inc[k] = parsed.incident[k];
        });
      }
    }

    var entryById = new Map();
    inc.entries.forEach(function (e) { entryById.set(e.id, e); });
    parsed.entries.forEach(function (e) {
      var existing = entryById.get(e.id);
      if (existing) {
        if (entriesMatch(existing, e)) report.duplicates++;
        else report.conflicts.push(e.id);
        return;
      }
      var copy = copyOwn(e);
      copy._rx = now;
      inc.entries.push(copy);
      entryById.set(copy.id, copy);
      report.added++;
    });

    var revById = new Map();
    var shape = new Map();
    inc.revs.forEach(function (r) {
      revById.set(r.id, r);
      if (!shape.has(r.rid)) shape.set(r.rid, r);
    });
    parsed.revs.forEach(function (r) {
      var existing = revById.get(r.id);
      if (existing) {
        if (sameRev(existing, r)) report.formsDuplicate++;
        else report.formsConflicts.push(r.id);
        return;
      }
      var s = shape.get(r.rid);
      if (s && (s.type !== r.type || s.period !== r.period)) {
        report.formsRejected++;
        return;
      }
      var copy = copyOwn(r);
      copy._rx = now;
      inc.revs.push(copy);
      revById.set(copy.id, copy);
      if (!s) shape.set(copy.rid, copy);
      report.formsAdded++;
    });

    var attById = new Map();
    inc.atts.forEach(function (a) { attById.set(a.id, a); });
    parsed.atts.forEach(function (a) {
      var existing = attById.get(a.id);
      if (existing) {
        if (existing.data === a.data && existing.mime === a.mime) report.imagesDuplicate++;
        else report.imagesConflicts.push(a.id);
        return;
      }
      var copy = copyOwn(a);
      copy._rx = now;
      inc.atts.push(copy);
      attById.set(copy.id, copy);
      report.imagesAdded++;
    });

    sortEntries(inc.entries);
    conflictList(inc).forEach(function (g) {
      if (!before.has(g.rid)) report.newConflicts.push(g.rid);
    });
    return { incident: inc, report: report };
  }

  /*
   * Merges a package into an incident in place, so screens and code holding the
   * incident keep working with it. Returns the merge report.
   */
  function mergeInto(target, pkg, opts) {
    var res = mergePackage(target, pkg, opts);
    Object.keys(res.incident).forEach(function (k) { target[k] = res.incident[k]; });
    return res.report;
  }

  /* ---------- encryption ---------- */

  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function fromB64(str) {
    if (typeof str !== 'string') throw new Error('The file is damaged.');
    var s;
    try { s = atob(str); } catch (e) { throw new Error('The file is damaged.'); }
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function deriveKey(passphrase, salt, iterations) {
    var c = getCrypto();
    return c.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return c.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function encryptPackage(pkg, passphrase) {
    if (!cryptoAvailable()) {
      return Promise.reject(new Error('Encryption is not available in this browser or page.'));
    }
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) {
      return Promise.reject(new Error('Use a passphrase of at least ' + MIN_PASSPHRASE + ' characters.'));
    }
    var c = getCrypto();
    var salt = c.getRandomValues(new Uint8Array(16));
    var iv = c.getRandomValues(new Uint8Array(12));
    var plain = new TextEncoder().encode(JSON.stringify(pkg));
    return deriveKey(passphrase, salt, PBKDF2_ITERATIONS).then(function (key) {
      return c.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plain);
    }).then(function (buf) {
      return {
        format: ENC_FORMAT,
        version: VERSION,
        kdf: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        salt: toB64(salt),
        iv: toB64(iv),
        data: toB64(new Uint8Array(buf))
      };
    });
  }

  function decryptPackage(envelope, passphrase) {
    if (!cryptoAvailable()) {
      return Promise.reject(new Error('Decryption is not available in this browser or page.'));
    }
    try {
      if (!envelope || envelope.format !== ENC_FORMAT) throw new Error('This file is not an encrypted FieldICS package.');
      if (typeof envelope.version !== 'number' || envelope.version > VERSION) {
        throw new Error('This file was made by a newer version of FieldICS.');
      }
      if (envelope.kdf !== 'PBKDF2-SHA256' || typeof envelope.iterations !== 'number' ||
          envelope.iterations < 1000 || envelope.iterations > MAX_ITERATIONS) {
        throw new Error('The file uses settings this version does not support.');
      }
    } catch (err) {
      return Promise.reject(err);
    }
    var c = getCrypto();
    var salt, iv, data;
    try {
      salt = fromB64(envelope.salt);
      iv = fromB64(envelope.iv);
      data = fromB64(envelope.data);
    } catch (err) {
      return Promise.reject(err);
    }
    return deriveKey(String(passphrase || ''), salt, envelope.iterations).then(function (key) {
      return c.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
    }).then(function (buf) {
      try {
        return JSON.parse(new TextDecoder().decode(buf));
      } catch (e) {
        throw new Error('The file is damaged.');
      }
    }, function () {
      throw new Error('Wrong passphrase, or the file was damaged.');
    });
  }

  /* Reads file text and says what it is: plain package, encrypted package, or invalid. */
  function parseFileText(text) {
    var obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { kind: 'invalid', error: 'This file is not a FieldICS package.' };
    }
    if (obj && obj.format === ENC_FORMAT) return { kind: 'encrypted', data: obj };
    if (obj && obj.format === FORMAT) return { kind: 'plain', data: obj };
    return { kind: 'invalid', error: 'This file is not a FieldICS package.' };
  }

  /* ---------- costs ---------- */

  function n0(v) {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  function cents(x) {
    return Math.round(x * 100);
  }

  /*
   * Donated resources (volunteer labor, donated equipment, donated materials) are
   * not an applicant expense. They are kept out of cost totals and valued
   * separately, because FEMA can credit their value toward the non-federal share
   * of eligible emergency work. Volunteer labor is valued at straight time plus
   * fringe benefits, never overtime.
   */
  function isDonated(type, d) {
    if (type === 'labor') return d.personType === 'Donated labor';
    if (type === 'equipment') return d.donated === true;
    if (type === 'materials') return d.obtained === 'Donated';
    return false;
  }

  /*
   * FEMA Public Assistance labor rule: for Emergency Work (Categories A and B), only
   * overtime is eligible for an applicant's budgeted employees. Straight time is eligible
   * for unbudgeted employees, and for everyone on Permanent Work (C to G). An applicant
   * that elected the alternative procedures for debris removal can claim budgeted
   * straight time on Category A. (FEMA IS-1000, Public Assistance Program and Policy Guide.)
   * True when an entry's straight time falls under that rule. opts.altDebris: the
   * applicant elected the alternative procedures.
   */
  function budgetedStraightTime(type, d, opts) {
    if (type !== 'labor' || !d) return false;
    if (d.personType && d.personType !== 'Applicant employee') return false;
    if (d.budgeted !== 'Yes') return false;
    if (d.category === 'B') return true;
    if (d.category === 'A') return !(opts && opts.altDebris);
    return false;
  }

  /*
   * Computes the cost (or donated value) of one entry. Amounts are rounded to the cent.
   * opts.altDebris: see budgetedStraightTime. The result's flaggedCents is the budgeted
   * straight time that is generally not eligible; it stays in the documented total.
   */
  function costOf(type, d, opts) {
    var reg = 0;
    var ot = 0;
    var total = 0;
    var missing = false;
    var qty;
    var donated = isDonated(type, d);
    if (type === 'labor') {
      if (donated) {
        reg = cents((n0(d.regHours) + n0(d.otHours)) * n0(d.regRate) * (1 + n0(d.fringeReg) / 100));
        missing = n0(d.regHours) + n0(d.otHours) > 0 && d.regRate === null;
      } else {
        reg = cents(n0(d.regHours) * n0(d.regRate) * (1 + n0(d.fringeReg) / 100));
        ot = cents(n0(d.otHours) * n0(d.otRate) * (1 + n0(d.fringeOt) / 100));
        missing = (n0(d.regHours) > 0 && d.regRate === null) || (n0(d.otHours) > 0 && d.otRate === null);
      }
      total = reg + ot;
    } else if (type === 'equipment') {
      total = cents(n0(d.usage) * n0(d.rate));
      missing = n0(d.usage) > 0 && d.rate === null;
    } else if (type === 'materials') {
      qty = d.qtyUsed !== null && d.qtyUsed !== undefined ? d.qtyUsed : n0(d.qtyPurchased);
      total = cents(n0(qty) * n0(d.unitPrice));
      missing = n0(qty) > 0 && d.unitPrice === null;
    } else if (type === 'rentals' || type === 'contracts') {
      total = cents(n0(d.amount));
      missing = d.amount === null || d.amount === undefined;
    } else if (type === 'travel') {
      if (d.amount !== null && d.amount !== undefined) {
        total = cents(n0(d.amount));
      } else {
        total = cents(n0(d.qty) * n0(d.rate));
        missing = d.rate === null || d.rate === undefined || d.qty === null || d.qty === undefined;
      }
    }
    var flagged = !donated && budgetedStraightTime(type, d, opts) && n0(d.regHours) > 0;
    return {
      reg: reg / 100,
      ot: ot / 100,
      total: total / 100,
      totalCents: total,
      regCents: reg,
      otCents: ot,
      hours: type === 'labor' ? n0(d.regHours) + n0(d.otHours) : (type === 'equipment' && d.usageUnit !== 'Miles' ? n0(d.usage) : 0),
      missingRate: missing,
      donated: donated,
      flagged: flagged,
      flaggedCents: flagged ? reg : 0,
      flaggedHours: flagged ? n0(d.regHours) : 0
    };
  }

  function costOpts(inc) {
    return { altDebris: !!(inc && inc.altDebris === true) };
  }

  function costDate(type, d) {
    if (type === 'labor' || type === 'equipment' || type === 'travel') return d.date || '';
    if (type === 'materials') return d.usedDate || d.purchaseDate || '';
    return d.startDate || d.endDate || d.datePaid || '';
  }

  /*
   * Live cost entries, optionally filtered by type, category, site, and
   * donated: true (only donated) or false (only applicant costs).
   */
  function costRecords(inc, filter) {
    filter = filter || {};
    var site = filter.site ? String(filter.site).trim().toLowerCase() : '';
    var out = [];
    var opts = costOpts(inc);
    index(inc).byRid.forEach(function (g) {
      if (g.deleted || COST_TYPES.indexOf(g.type) === -1) return;
      if (filter.type && g.type !== filter.type) return;
      var d = g.winner.data;
      if (filter.category && d.category !== filter.category) return;
      if (site && String(d.site || '').trim().toLowerCase() !== site) return;
      var cost = costOf(g.type, d, opts);
      if (filter.donated === true && !cost.donated) return;
      if (filter.donated === false && cost.donated) return;
      out.push({ rec: g, type: g.type, data: d, cost: cost, date: costDate(g.type, d) });
    });
    out.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.rec.created < b.rec.created ? -1 : 1;
    });
    return out;
  }

  /* Totals for applicant costs. Donated resources are summed separately under `donated`. */
  function costSummary(inc, filter) {
    var types = {};
    COST_TYPES.forEach(function (t) {
      types[t] = { count: 0, totalCents: 0, regCents: 0, otCents: 0, hours: 0, missing: 0 };
    });
    var donated = { count: 0, totalCents: 0, hours: 0, missing: 0, labor: 0, equipment: 0, materials: 0 };
    var flagged = { count: 0, totalCents: 0, hours: 0, byCategory: {} };
    var byCategory = new Map();
    var grand = 0;
    var first = '';
    var last = '';
    var f2 = {};
    Object.keys(filter || {}).forEach(function (k) { f2[k] = filter[k]; });
    delete f2.donated;
    costRecords(inc, f2).forEach(function (x) {
      if (x.cost.donated) {
        donated.count++;
        donated.totalCents += x.cost.totalCents;
        donated[x.type] += x.cost.totalCents;
        if (x.type === 'labor') donated.hours += x.cost.hours;
        if (x.cost.missingRate) donated.missing++;
        return;
      }
      var t = types[x.type];
      t.count++;
      t.totalCents += x.cost.totalCents;
      t.regCents += x.cost.regCents;
      t.otCents += x.cost.otCents;
      t.hours += x.cost.hours;
      if (x.cost.missingRate) t.missing++;
      var key = x.data.category || '';
      byCategory.set(key, (byCategory.get(key) || 0) + x.cost.totalCents);
      grand += x.cost.totalCents;
      if (x.cost.flagged) {
        flagged.count++;
        flagged.totalCents += x.cost.flaggedCents;
        flagged.hours += x.cost.flaggedHours;
        flagged.byCategory[key] = (flagged.byCategory[key] || 0) + x.cost.flaggedCents / 100;
      }
      if (x.date && (!first || x.date < first)) first = x.date;
      if (x.date && (!last || x.date > last)) last = x.date;
    });
    var cats = [];
    byCategory.forEach(function (v, k) { cats.push({ category: k, total: v / 100 }); });
    cats.sort(function (a, b) { return a.category < b.category ? -1 : 1; });
    COST_TYPES.forEach(function (k) {
      var t = types[k];
      t.total = t.totalCents / 100;
      t.reg = t.regCents / 100;
      t.ot = t.otCents / 100;
    });
    donated.total = donated.totalCents / 100;
    flagged.total = flagged.totalCents / 100;
    return {
      types: types, categories: cats, total: grand / 100, firstDate: first, lastDate: last, donated: donated,
      /* Straight time of budgeted employees on Categories A and B: documented, generally not eligible. */
      budgetedST: flagged,
      totalLessBudgetedST: (grand - flagged.totalCents) / 100,
      altDebris: inc.altDebris === true
    };
  }

  /* ---------- check-ins and resource requests to cost entries ---------- */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function localDay(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function nextLocalMidnight(t) {
    var d = new Date(t);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  /*
   * Hours on the incident between check-in and check-out, split by local calendar day.
   * Returns [{ date: 'YYYY-MM-DD', hours }]. Time zone is the device's.
   */
  function hoursByDay(checkIn, checkOut) {
    var a = Date.parse(checkIn);
    var b = Date.parse(checkOut);
    if (isNaN(a) || isNaN(b) || b <= a) return [];
    var out = [];
    var t = a;
    while (t < b && out.length < 400) {
      var stop = Math.min(nextLocalMidnight(t), b);
      out.push({ date: localDay(t), hours: round2((stop - t) / 3600000) });
      t = stop;
    }
    return out.filter(function (x) { return x.hours > 0; });
  }

  /*
   * Cost entry data made from one ICS 211 check-in. opts.regularDay: hours per day
   * counted as regular time before the rest counts as overtime (default 8).
   * Returns [{ type, data }]. People become labor entries; equipment with an
   * operator becomes an equipment entry. Crews need a name per person, so none.
   */
  function costsFromCheckin(d, opts) {
    opts = opts || {};
    var regular = typeof opts.regularDay === 'number' && opts.regularDay > 0 ? opts.regularDay : 8;
    var days = hoursByDay(d.checkIn, d.checkOut);
    var source = 'ICS 211 check-in: ' + d.identifier;
    var where = (d.location || '') + (d.locationName ? ' (' + d.locationName + ')' : '');
    var out = [];
    if (d.resourceKind === 'Equipment with operator') {
      days.forEach(function (x) {
        out.push({ type: 'equipment', data: {
          date: x.date, description: [d.kind, d.type].filter(Boolean).join(', ') || d.identifier,
          unitId: d.identifier.slice(0, 60), operator: d.leader, usage: x.hours, usageUnit: 'Hours',
          site: where.slice(0, 200), work: d.assignment, source: source.slice(0, 200)
        } });
      });
    } else if (d.resourceKind !== 'Crew, strike team, or task force') {
      days.forEach(function (x) {
        var reg = Math.min(x.hours, regular);
        var ot = round2(x.hours - reg);
        out.push({ type: 'labor', data: {
          date: x.date, name: d.identifier.slice(0, 200), department: d.department || d.agency || d.homeUnit,
          regHours: round2(reg), otHours: ot || null,
          site: where.slice(0, 200), work: d.assignment, source: source.slice(0, 200)
        } });
      });
    }
    return out;
  }

  /*
   * Cost entry data made from the items on an ICS 213 RR.
   * kind: 'materials' | 'rentals' | 'contracts'. The 213 RR "Cost" is treated as
   * the cost for the whole line.
   */
  function costsFromRequest(rr, kind, itemIndexes) {
    var out = [];
    (rr.items || []).forEach(function (it, i) {
      if (itemIndexes && itemIndexes.indexOf(i) === -1) return;
      var what = [it.kind, it.type].filter(Boolean).join(', ');
      var desc = [what, it.description].filter(Boolean).join(': ').replace(/\s+/g, ' ').slice(0, 200) || 'Item ' + (i + 1);
      var day = it.arrivalEstimated || it.arrivalRequested || rr.at;
      var date = day ? localDay(Date.parse(day)) : '';
      var base = { rrNumber: (rr.number || '').slice(0, 60), source: ('ICS 213 RR #' + (rr.number || '') + ', item ' + (i + 1)).slice(0, 200) };
      var data;
      if (kind === 'materials') {
        data = { description: desc, obtained: 'Purchased', vendor: rr.supplierName, qtyPurchased: it.qty,
          unitPrice: it.cost !== null && it.qty ? round2(it.cost / it.qty) : (it.qty ? null : it.cost),
          qtyUsed: null, purchaseDate: date, usedDate: date };
        if (!it.qty && it.cost !== null) { data.qtyPurchased = 1; data.unitPrice = it.cost; }
      } else if (kind === 'rentals') {
        data = { description: desc, vendor: rr.supplierName, startDate: date, amount: it.cost };
      } else {
        data = { contractor: rr.supplierName || 'Contractor', description: desc, contractNumber: rr.orderNumber, startDate: date, amount: it.cost };
      }
      Object.keys(base).forEach(function (k) { data[k] = base[k]; });
      out.push({ type: kind, data: data });
    });
    return out;
  }

  /* Every photo reference in an incident, with what it belongs to. */
  function photoRefs(inc) {
    var out = [];
    inc.entries.forEach(function (e) {
      (e.photos || []).forEach(function (id) { out.push({ id: id, kind: 'entry', entry: e }); });
    });
    index(inc).byRid.forEach(function (g) {
      if (g.deleted) return;
      Forms.fieldsOf(FORMS[g.type]).forEach(function (f) {
        var v = g.winner.data[f.k];
        if (f.kind === 'images') (v || []).forEach(function (id) { out.push({ id: id, kind: 'record', rec: g, field: f.k }); });
        else if (f.kind === 'image' && v) out.push({ id: v, kind: 'record', rec: g, field: f.k });
      });
    });
    return out;
  }

  /* ---------- CSV ---------- */

  function csvCell(value, guard) {
    var s = value === null || value === undefined ? '' : String(value);
    if (guard && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /* ICS 214 log, one row per entry. Text cells are guarded against spreadsheet formula injection. */
  function toCSV(incident, opts) {
    opts = opts || {};
    var header = ['incident', 'activity_time_utc', 'recorded_time_utc', 'name', 'position',
      'activity', 'corrects_entry', 'entry_id', 'recorded_on_device'];
    var rows = [header.join(',')];
    incident.entries.forEach(function (e) {
      if (opts.author && e.author.toLowerCase() !== opts.author.toLowerCase()) return;
      if (opts.start && e.ts < opts.start) return;
      if (opts.end && e.ts >= opts.end) return;
      rows.push([
        csvCell(incident.name, true),
        csvCell(e.ts, false),
        csvCell(e.recordedAt, false),
        csvCell(e.author, true),
        csvCell(e.position, true),
        csvCell(e.text, true),
        csvCell(e.corrects || '', false),
        csvCell(e.id, false),
        csvCell(e.deviceName, true)
      ].join(','));
    });
    return rows.join('\r\n') + '\r\n';
  }

  function csvValue(f, v) {
    if (v === null || v === undefined) return '';
    if (f.kind === 'images') return v.length ? String(v.length) : '';
    if (typeof v === 'number') return csvCell(String(v), false);
    if (typeof v === 'boolean') return v ? 'yes' : '';
    if (Array.isArray(v)) return csvCell(v.join('; '), true);
    return csvCell(v, true);
  }

  /* One cost type, one row per entry, with computed costs. */
  function costCSV(inc, type, filter) {
    var def = FORMS[type];
    var fields = Forms.fieldsOf(def);
    var header = fields.map(function (f) { return f.label; });
    if (type === 'labor') header.push('Regular cost', 'Overtime cost', 'Budgeted straight time on emergency work (generally not eligible)');
    header.push('Total cost or donated value', 'Donated', 'Rate or amount missing', 'Record id', 'Last saved by', 'Last saved (UTC)');
    var rows = [header.map(function (x) { return csvCell(x, true); }).join(',')];
    var f2 = {};
    if (filter) Object.keys(filter).forEach(function (k) { f2[k] = filter[k]; });
    f2.type = type;
    costRecords(inc, f2).forEach(function (x) {
      var cells = fields.map(function (f) { return csvValue(f, x.data[f.k]); });
      if (type === 'labor') cells.push(csvCell(x.cost.reg.toFixed(2)), csvCell(x.cost.ot.toFixed(2)), x.cost.flagged ? csvCell((x.cost.flaggedCents / 100).toFixed(2)) : '');
      cells.push(
        csvCell(x.cost.total.toFixed(2)),
        x.cost.donated ? 'yes' : '',
        x.cost.missingRate ? 'yes' : '',
        csvCell(x.rec.rid),
        csvCell(x.rec.winner.by, true),
        csvCell(x.rec.winner.at)
      );
      rows.push(cells.join(','));
    });
    return rows.join('\r\n') + '\r\n';
  }

  return {
    FORMAT: FORMAT,
    ENC_FORMAT: ENC_FORMAT,
    VERSION: VERSION,
    LIMITS: LIMITS,
    MIN_PASSPHRASE: MIN_PASSPHRASE,
    COST_TYPES: COST_TYPES,
    uid: uid,
    nowISO: nowISO,
    slug: slug,
    stamp: stamp,
    cryptoAvailable: cryptoAvailable,
    sanitize: sanitize,
    checkValue: checkValue,
    missingRequired: missingRequired,
    emptyRow: emptyRow,
    emptyValue: emptyValue,
    isEmptyValue: isEmptyValue,
    sameValue: sameValue,
    sameData: sameData,
    diffFields: diffFields,
    createIncident: createIncident,
    updateIncidentMeta: updateIncidentMeta,
    setClosed: setClosed,
    isClosed: isClosed,
    incidentMeta: incidentMeta,
    upgradeIncident: upgradeIncident,
    addEntry: addEntry,
    correctionMap: correctionMap,
    authors: authors,
    entriesInRange: entriesInRange,
    sortEntries: sortEntries,
    recordId: recordId,
    needsPeriod: needsPeriod,
    getRecord: getRecord,
    listRecords: listRecords,
    conflictList: conflictList,
    saveRecord: saveRecord,
    periods: periods,
    periodOf: periodOf,
    nextPeriodNumber: nextPeriodNumber,
    formsInPeriod: formsInPeriod,
    addAttachment: addAttachment,
    getAttachment: getAttachment,
    signoffsFor: signoffsFor,
    isPhiType: isPhiType,
    hasPatientRecords: hasPatientRecords,
    signOff: signOff,
    buildPackage: buildPackage,
    markExported: markExported,
    countPending: countPending,
    parsePackage: parsePackage,
    mergePackage: mergePackage,
    mergeInto: mergeInto,
    encryptPackage: encryptPackage,
    decryptPackage: decryptPackage,
    parseFileText: parseFileText,
    costOf: costOf,
    costOpts: costOpts,
    budgetedStraightTime: budgetedStraightTime,
    isDonated: isDonated,
    costDate: costDate,
    hoursByDay: hoursByDay,
    costsFromCheckin: costsFromCheckin,
    costsFromRequest: costsFromRequest,
    photoRefs: photoRefs,
    costRecords: costRecords,
    costSummary: costSummary,
    costCSV: costCSV,
    csvCell: csvCell,
    toCSV: toCSV
  };
});
