/*
 * FieldICS locality setup files, CSV reading, and equipment rate schedules.
 * No DOM access, so this runs in Node tests too.
 *
 * A setup file is JSON a county prepares once and loads on every device:
 * {
 *   format: 'field-ics-setup', version: 1,
 *   locality: { name, agency, applicant, state },
 *   options: { regularDay, backupHours, checkinsToLog, requireLock, minPasscode, hics },
 *   people: [{ name, position, jobTitle, department, personType, budgeted, regRate, otRate, fringeReg, fringeOt, phone, email }],
 *   equipment: [{ description, unitId, code, usageUnit, rate, rateSource, rateSchedule }],
 *   sites: ['...'], places: ['...'],
 *   rateSchedules: [{ id, title, effective, source, rows: [[code, equipment, manufacturer, spec, capacity, hp, notes, unit, rate]] }],
 *   jas: [{ id, position, section, reportsTo, mission, phases: { immediate, intermediate, extended, demob: ['action', ...] } }]
 * }
 * jas: a hospital's own HICS Job Action Sheets, used in place of the built-in ones.
 * Every value is checked and trimmed. Nothing in a setup file is ever treated as code or markup.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldSetup = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 'field-ics-setup';
  var VERSION = 1;
  var RATE_COLUMNS = ['code', 'equipment', 'manufacturer', 'spec', 'capacity', 'hp', 'notes', 'unit', 'rate'];
  var MAX = { people: 2000, equipment: 2000, sites: 500, places: 100, schedules: 10, rows: 5000, jas: 120, actions: 60 };
  var JAS_PHASES = ['immediate', 'intermediate', 'extended', 'demob'];
  var PERSON_TYPES = ['Applicant employee', 'Mutual aid', 'EMAC', 'Donated labor', 'Other'];
  var CTRL_RE = /[\u0000-\u001F\u007F]/g;

  function txt(v, max) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') return '';
    return v.replace(CTRL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
  }

  function num(v, max) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
    if (!isFinite(n) || n < 0 || n > (max || 1000000000)) return null;
    return Math.round(n * 10000) / 10000;
  }

  function oneOf(v, list, fallback) {
    var s = txt(v, 80);
    for (var i = 0; i < list.length; i++) {
      if (list[i].toLowerCase() === s.toLowerCase()) return list[i];
    }
    return fallback === undefined ? '' : fallback;
  }

  function list(v, max) {
    return Array.isArray(v) ? v.slice(0, max) : [];
  }

  function uniqueText(v, max, len) {
    var seen = new Set();
    var out = [];
    list(v, max).forEach(function (x) {
      var s = txt(x, len || 200);
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        out.push(s);
      }
    });
    return out;
  }

  function cleanPerson(p) {
    if (!p || typeof p !== 'object') return null;
    var name = txt(p.name, 120);
    if (!name) return null;
    var type = oneOf(p.personType, PERSON_TYPES, 'Applicant employee');
    if (/volunteer/i.test(String(p.personType || ''))) type = 'Donated labor';
    return {
      name: name,
      position: txt(p.position, 120),
      jobTitle: txt(p.jobTitle, 200),
      department: txt(p.department, 200),
      personType: type,
      budgeted: oneOf(p.budgeted, ['Yes', 'No']),
      regRate: num(p.regRate, 100000),
      otRate: num(p.otRate, 100000),
      fringeReg: num(p.fringeReg, 1000),
      fringeOt: num(p.fringeOt, 1000),
      phone: txt(p.phone, 40),
      email: txt(p.email, 120)
    };
  }

  function cleanEquipment(e) {
    if (!e || typeof e !== 'object') return null;
    var description = txt(e.description, 200);
    if (!description) return null;
    return {
      description: description,
      unitId: txt(e.unitId, 60),
      code: txt(e.code, 20),
      usageUnit: oneOf(e.usageUnit, ['Hours', 'Miles'], 'Hours'),
      rate: num(e.rate, 100000),
      rateSource: oneOf(e.rateSource, ['FEMA schedule', 'Local rate']),
      rateSchedule: txt(e.rateSchedule, 120)
    };
  }

  function cleanSchedule(s, i) {
    if (!s || typeof s !== 'object') throw new Error('Rate schedule ' + (i + 1) + ' is not valid.');
    var title = txt(s.title, 120);
    if (!title) throw new Error('Rate schedule ' + (i + 1) + ' has no title.');
    var id = txt(s.id, 60).replace(/[^A-Za-z0-9-]/g, '') || ('schedule-' + (i + 1));
    var rows = [];
    list(s.rows, MAX.rows).forEach(function (r) {
      if (!Array.isArray(r)) return;
      var row = RATE_COLUMNS.map(function (c, j) { return c === 'rate' ? '' : txt(r[j], j === 3 ? 600 : 200); });
      var rate = num(r[8], 1000000);
      if (rate === null || !(row[0] || row[1])) return;
      row[7] = row[7].toLowerCase();
      row[8] = rate.toFixed(2);
      rows.push(row);
    });
    if (!rows.length) throw new Error('Rate schedule "' + title + '" has no usable rows.');
    return { id: id, title: title, effective: txt(s.effective, 40), source: txt(s.source, 300), rows: rows };
  }

  /* Validates a setup object and returns a clean copy. Throws a readable Error. */
  function parseSetup(obj) {
    if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) throw new Error('This file is not a FieldICS setup file.');
    if (typeof obj.version !== 'number' || obj.version > VERSION) throw new Error('This setup file was made by a newer version of FieldICS.');
    var loc = obj.locality && typeof obj.locality === 'object' ? obj.locality : {};
    var opt = obj.options && typeof obj.options === 'object' ? obj.options : {};
    var people = [];
    var seen = new Set();
    list(obj.people, MAX.people).forEach(function (p) {
      var c = cleanPerson(p);
      if (c && !seen.has(c.name.toLowerCase())) {
        seen.add(c.name.toLowerCase());
        people.push(c);
      }
    });
    var equipment = [];
    list(obj.equipment, MAX.equipment).forEach(function (e) {
      var c = cleanEquipment(e);
      if (c) equipment.push(c);
    });
    var schedules = list(obj.rateSchedules, MAX.schedules).map(cleanSchedule);
    var regularDay = num(opt.regularDay, 24);
    var backupHours = num(opt.backupHours, 72);
    var minPasscode = num(opt.minPasscode, 64);
    return {
      format: FORMAT,
      version: VERSION,
      savedAt: typeof obj.savedAt === 'string' ? obj.savedAt.slice(0, 40) : '',
      locality: {
        name: txt(loc.name, 160),
        agency: txt(loc.agency, 200),
        applicant: txt(loc.applicant, 200),
        state: txt(loc.state, 40)
      },
      options: {
        regularDay: regularDay && regularDay >= 1 ? regularDay : 8,
        backupHours: backupHours && backupHours >= 0.5 ? backupHours : 4,
        checkinsToLog: opt.checkinsToLog !== false,
        /* The office can require the device lock on every device that loads this setup. */
        requireLock: opt.requireLock === true,
        /* A hospital's setup: new incidents start on HICS. */
        hics: opt.hics === true,
        minPasscode: minPasscode && minPasscode >= 6 ? Math.round(minPasscode) : 6
      },
      people: people,
      equipment: equipment,
      sites: uniqueText(obj.sites, MAX.sites),
      places: uniqueText(obj.places, MAX.places, 120),
      rateSchedules: schedules,
      jas: list(obj.jas, MAX.jas).map(cleanJas).filter(Boolean)
    };
  }

  /* One Job Action Sheet from a setup file, or null when it has no position or no actions. */
  function cleanJas(raw, i) {
    if (!raw || typeof raw !== 'object') return null;
    var position = txt(raw.position, 120);
    if (!position) return null;
    var out = {
      id: txt(raw.id, 40).replace(/[^A-Za-z0-9-]/g, '') || 'jas' + (i + 1),
      position: position, section: txt(raw.section, 60), reportsTo: txt(raw.reportsTo, 120), mission: txt(raw.mission, 1000), phases: {}
    };
    var any = false;
    JAS_PHASES.forEach(function (p) {
      var src = raw.phases && typeof raw.phases === 'object' ? raw.phases[p] : null;
      out.phases[p] = list(src, MAX.actions).map(function (x) { return txt(x, 400); }).filter(Boolean);
      if (out.phases[p].length) any = true;
    });
    return any ? out : null;
  }

  function emptySetup() {
    return parseSetup({ format: FORMAT, version: VERSION });
  }

  /* ---------- CSV ---------- */

  /* Reads CSV text (RFC 4180, comma or semicolon) into rows of strings. */
  function parseCSV(text) {
    var s = String(text || '').replace(/^﻿/, '');
    var firstLine = s.split(/\r?\n/, 1)[0] || '';
    var sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (quoted) {
        if (ch === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === sep) {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else cell += ch;
      if (rows.length > 20000) throw new Error('This file has too many rows.');
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function norm(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim(); }

  /* Finds which column holds each wanted field, using a list of accepted header names. */
  function mapColumns(header, wanted) {
    var heads = header.map(norm);
    var out = {};
    Object.keys(wanted).forEach(function (k) {
      var names = wanted[k];
      for (var i = 0; i < heads.length; i++) {
        if (names.some(function (n) { return typeof n === 'string' ? heads[i] === n : n.test(heads[i]); })) {
          out[k] = i;
          return;
        }
      }
    });
    return out;
  }

  function rowsToObjects(text, wanted, required) {
    var rows = parseCSV(text);
    if (rows.length < 2) throw new Error('The CSV file has no rows under its header.');
    var cols = mapColumns(rows[0], wanted);
    required.forEach(function (k) {
      if (cols[k] === undefined) {
        var label = String(wanted[k][0]);
        throw new Error('The CSV file needs a column named "' + label.charAt(0).toUpperCase() + label.slice(1) + '".');
      }
    });
    return rows.slice(1).map(function (r) {
      var o = {};
      Object.keys(cols).forEach(function (k) { o[k] = r[cols[k]] === undefined ? '' : r[cols[k]]; });
      return o;
    });
  }

  var PEOPLE_COLUMNS = {
    name: ['name', 'employee name', 'employee'],
    position: ['ics position', 'position'],
    jobTitle: ['job title', 'title'],
    department: ['department', 'department or agency', 'agency'],
    personType: ['type', 'type of individual'],
    budgeted: ['budgeted', 'budgeted employee'],
    regRate: ['regular rate', 'regular rate per hour', 'reg rate', 'hourly rate'],
    otRate: ['overtime rate', 'overtime rate per hour', 'ot rate'],
    fringeReg: ['fringe regular %', 'fringe regular', 'fringe benefits regular time %', 'fringe reg'],
    fringeOt: ['fringe overtime %', 'fringe overtime', 'fringe benefits overtime %', 'fringe ot'],
    phone: ['phone', 'cell', 'cell phone', 'mobile', 'phone number', 'work phone'],
    email: ['email', 'e mail', 'email address']
  };

  var EQUIPMENT_COLUMNS = {
    description: ['description', 'type of equipment', 'equipment'],
    unitId: ['unit id', 'unit', 'unit number', 'id'],
    code: ['fema code', 'cost code', 'code', 'fema equipment code'],
    usageUnit: ['measured in', 'use measured in', 'rate unit'],
    rate: ['rate', 'rate per hour', 'hourly rate'],
    rateSource: ['rate source', 'source']
  };

  var RATE_CSV_COLUMNS = {
    code: ['cost code', 'code', 'fema code'],
    equipment: ['equipment', 'description', 'type of equipment'],
    manufacturer: ['manufacturer', 'make', 'make and model'],
    spec: ['specification', 'specifications'],
    capacity: ['capacity or size', 'capacity', 'size'],
    hp: ['hp', 'horsepower'],
    notes: ['notes'],
    unit: ['unit'],
    rate: ['rate', 'rates', 'rate per hour', /^\d{4} rates?$/]
  };

  function peopleFromCSV(text) {
    return rowsToObjects(text, PEOPLE_COLUMNS, ['name']).map(cleanPerson).filter(Boolean);
  }

  function equipmentFromCSV(text) {
    return rowsToObjects(text, EQUIPMENT_COLUMNS, ['description']).map(cleanEquipment).filter(Boolean);
  }

  /* A rate schedule from CSV. meta: { id, title, effective, source }. */
  function scheduleFromCSV(text, meta) {
    var objs = rowsToObjects(text, RATE_CSV_COLUMNS, ['rate']);
    var rows = objs.map(function (o) { return RATE_COLUMNS.map(function (c) { return o[c] || ''; }); });
    return cleanSchedule({ id: meta.id, title: meta.title, effective: meta.effective, source: meta.source, rows: rows }, 0);
  }

  function csvLine(cells) {
    return cells.map(function (c) {
      var s = c === null || c === undefined ? '' : String(c);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }

  function peopleTemplate(people) {
    var lines = [csvLine(['Name', 'ICS position', 'Job title', 'Department', 'Type', 'Budgeted', 'Regular rate', 'Overtime rate', 'Fringe regular %', 'Fringe overtime %', 'Phone', 'Email'])];
    (people && people.length ? people : [{ name: 'Example Person', position: 'Planning Section Chief', jobTitle: 'Emergency Management Coordinator', department: 'Emergency Management', personType: 'Applicant employee', budgeted: 'Yes', regRate: 28.5, otRate: 42.75, fringeReg: 31.2, fringeOt: 7.65, phone: '276-555-0100', email: 'example@county.gov' }]).forEach(function (p) {
      lines.push(csvLine([p.name, p.position, p.jobTitle, p.department, p.personType === 'Donated labor' ? 'Volunteer' : p.personType, p.budgeted, p.regRate, p.otRate, p.fringeReg, p.fringeOt, p.phone || '', p.email || '']));
    });
    return lines.join('\r\n') + '\r\n';
  }

  function equipmentTemplate(list) {
    var lines = [csvLine(['Description', 'Unit ID', 'FEMA code', 'Measured in', 'Rate', 'Rate source'])];
    (list && list.length ? list : [{ description: 'Pickup truck, 3/4 ton, 4x4', unitId: 'T-12', code: '8071', usageUnit: 'Hours', rate: null, rateSource: 'FEMA schedule' }]).forEach(function (e) {
      lines.push(csvLine([e.description, e.unitId, e.code, e.usageUnit, e.rate === null ? '' : e.rate, e.rateSource]));
    });
    return lines.join('\r\n') + '\r\n';
  }

  /* ---------- rate lookup ---------- */

  /*
   * Searches rate schedules. schedules: [{ id, title, rows }]. Returns up to `limit`
   * matches: { schedule, code, equipment, manufacturer, spec, capacity, hp, notes, unit, rate }.
   * Every word typed must appear somewhere in the row. An exact cost code match comes first.
   */
  function searchRates(schedules, query, limit) {
    var q = String(query || '').toLowerCase().trim();
    limit = limit || 40;
    if (!q) return [];
    var words = q.split(/\s+/).filter(Boolean);
    var hits = [];
    schedules.forEach(function (s) {
      s.rows.forEach(function (r) {
        var hay = (r[0] + ' ' + r[1] + ' ' + r[2] + ' ' + r[3] + ' ' + r[4] + ' ' + r[6]).toLowerCase();
        if (!words.every(function (w) { return hay.indexOf(w) !== -1; })) return;
        var score = 0;
        if (r[0].toLowerCase() === q) score += 100;
        if (r[1].toLowerCase().indexOf(words[0]) === 0) score += 10;
        words.forEach(function (w) { if (r[1].toLowerCase().indexOf(w) !== -1) score += 3; });
        hits.push({ score: score, row: r, schedule: s });
      });
    });
    hits.sort(function (a, b) { return b.score - a.score || (a.row[0] < b.row[0] ? -1 : 1); });
    return hits.slice(0, limit).map(function (x) {
      var o = { schedule: x.schedule.title, scheduleId: x.schedule.id };
      RATE_COLUMNS.forEach(function (c, i) { o[c] = x.row[i]; });
      o.rate = Number(o.rate);
      return o;
    });
  }

  /* The built-in FEMA schedule (js/data) in the same shape as an imported one. */
  function builtInSchedule(data) {
    if (!data || !Array.isArray(data.rows)) return null;
    return { id: data.id, title: data.title, effective: data.effective, source: data.source, rows: data.rows, builtIn: true };
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    RATE_COLUMNS: RATE_COLUMNS,
    parseSetup: parseSetup,
    emptySetup: emptySetup,
    parseCSV: parseCSV,
    peopleFromCSV: peopleFromCSV,
    equipmentFromCSV: equipmentFromCSV,
    scheduleFromCSV: scheduleFromCSV,
    peopleTemplate: peopleTemplate,
    equipmentTemplate: equipmentTemplate,
    searchRates: searchRates,
    builtInSchedule: builtInSchedule
  };
});
