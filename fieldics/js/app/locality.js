/* FieldICS: Locality setup files, people and equipment lists, and equipment rate schedules. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var S = A.S;
  var btn = A.btn;
  var closePanel = A.closePanel;
  var download = A.download;
  var fmtDT = A.fmtDT;
  var fmtRate = A.fmtRate;
  var h = A.h;
  var markDirty = A.markDirty;
  var openPanel = A.openPanel;
  var persistSettings = A.persistSettings;
  var plural = A.plural;
  var readFileText = A.readFileText;
  var render = A.render;
  var setup = A.setup;
  var showMessage = A.showMessage;
  var toast = A.toast;

  var Setup = window.FieldSetup;

  function saveSetup(next) {
    S.setup = next;
    if (S.store) return S.store.putKV('setup', next).catch(function () { toast('The setup could not be saved on this device.'); });
    return Promise.resolve();
  }

  function setupCopy() {
    return JSON.parse(JSON.stringify(setup()));
  }

  /* Every rate schedule available: the built-in FEMA schedule, then any loaded ones. */
  function schedules() {
    var list = [];
    var built = Setup.builtInSchedule(window.FIELD_FEMA_RATES);
    if (built) list.push(built);
    return list.concat(setup().rateSchedules);
  }

  /* ---------- loading setup files ---------- */

  function chooseSetupFile() {
    var input = $('setupFile');
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (file) loadSetupFile(file);
    };
    input.click();
  }

  function loadSetupFile(file) {
    return readFileText(file).then(function (text) {
      var obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error('This file is not a FieldICS setup file.'); }
      return applySetupObject(obj, file.name);
    }).catch(function (err) {
      showMessage('Setup file not loaded', [file.name + ': ' + err.message]);
    });
  }

  function applySetupObject(obj, name) {
    var next = Setup.parseSetup(obj);
    var cur = setup();
    if ((cur.people.length || cur.equipment.length || cur.locality.name) &&
        !window.confirm('Replace the current locality setup' + (cur.locality.name ? ' for ' + cur.locality.name : '') + ' with ' + name + '?')) return null;
    return saveSetup(next).then(function () {
      if (!S.settings.agency && next.locality.agency) {
        S.settings.agency = next.locality.agency;
        persistSettings();
      }
      render();
      showMessage('Setup loaded', [
        (next.locality.name || 'Locality setup') + ' from ' + name + '.',
        plural(next.people.length, 'person', 'people') + ', ' + plural(next.equipment.length, 'piece of equipment', 'pieces of equipment') + ', ' +
          plural(next.sites.length, 'site', 'sites') + ', ' + plural(next.rateSchedules.length, 'local rate schedule', 'local rate schedules') + '.',
        'Names, job titles, and rates now fill in on labor and equipment entries.'
      ]);
      return next;
    });
  }

  function saveSetupFile() {
    var s = setupCopy();
    s.savedAt = C.nowISO();
    var name = 'fieldics-setup_' + C.slug(s.locality.name || 'locality') + '_' + C.stamp() + '.json';
    download(name, new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }));
    toast('Setup file saved. Load it on each device.');
  }

  function chooseCSV(onText) {
    var input = $('csvFile');
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      readFileText(file).then(function (text) { onText(text, file.name); }).catch(function (err) { toast(err.message); });
    };
    input.click();
  }

  /* ---------- the setup panel ---------- */

  function field(id, label, value, extra) {
    var input = h('input', { type: 'text', id: id, maxlength: String((extra && extra.max) || 200), inputmode: extra && extra.numeric ? 'decimal' : null });
    input.value = value === null || value === undefined ? '' : String(value);
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), input);
  }

  function openSetup() {
    var body = openPanel('Locality setup');
    var s = setup();
    body.appendChild(h('p', { text: 'A locality setup is prepared once by the emergency management office and loaded on every device. It fills in names, job titles, pay rates, equipment, sites, and local equipment rates. It stays on this device and is not part of package files.' }));
    if (s.savedAt) body.appendChild(h('p', { class: 'hint', text: 'Loaded setup saved ' + fmtDT(s.savedAt) + '.' }));

    var form = h('form', { id: 'setupForm' });
    form.appendChild(h('div', { class: 'grid two' },
      field('suName', 'Locality name', s.locality.name),
      field('suAgency', 'Agency (fills Home agency)', s.locality.agency),
      field('suApplicant', 'PA applicant name (fills new incidents)', s.locality.applicant),
      field('suState', 'State', s.locality.state, { max: 40 }),
      field('suRegular', 'Regular hours per day before overtime', s.options.regularDay, { numeric: true, max: 5 }),
      field('suBackup', 'Remind to save a package file after (hours)', s.options.backupHours, { numeric: true, max: 5 })));
    var logBox = h('input', { type: 'checkbox', id: 'suLog', checked: s.options.checkinsToLog !== false });
    form.appendChild(h('label', { class: 'check', for: 'suLog' }, logBox, ' Add ICS 211 check-ins and check-outs to the activity log'));
    form.appendChild(h('div', { class: 'row end' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'suSave', text: 'Save setup' })));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var next = setupCopy();
      next.format = Setup.FORMAT;
      next.version = Setup.VERSION;
      next.locality = { name: $('suName').value, agency: $('suAgency').value, applicant: $('suApplicant').value, state: $('suState').value };
      next.options = { regularDay: $('suRegular').value, backupHours: $('suBackup').value, checkinsToLog: logBox.checked };
      try {
        next = Setup.parseSetup(next);
      } catch (err) {
        toast(err.message);
        return;
      }
      saveSetup(next).then(function () {
        toast('Setup saved.');
        openSetup();
      });
    });
    body.appendChild(form);

    var lists = h('section', { class: 'subcard' });
    lists.appendChild(h('h3', { class: 'small-title', text: 'Lists' }));
    lists.appendChild(h('p', { class: 'hint', text: plural(s.people.length, 'person', 'people') + ', ' + plural(s.equipment.length, 'piece of equipment', 'pieces of equipment') + ', ' +
      plural(s.sites.length, 'site', 'sites') + ', ' + plural(s.places.length, 'check-in place', 'check-in places') + '. Lists load from spreadsheets saved as CSV. Download a template, fill it in, and load it back.' }));
    lists.appendChild(h('div', { class: 'row wrap' },
      btn('Load people (CSV)', function () { importList('people'); }, '', { id: 'suPeopleCsv' }),
      btn('People template', function () { download('fieldics-people.csv', new Blob(['﻿' + Setup.peopleTemplate(s.people)], { type: 'text/csv;charset=utf-8' })); }, 'btn-quiet'),
      btn('Load equipment (CSV)', function () { importList('equipment'); }, '', { id: 'suEquipCsv' }),
      btn('Equipment template', function () { download('fieldics-equipment.csv', new Blob(['﻿' + Setup.equipmentTemplate(s.equipment)], { type: 'text/csv;charset=utf-8' })); }, 'btn-quiet')));
    var sites = h('textarea', { id: 'suSites', rows: '3', 'aria-label': 'Sites, one per line' });
    sites.value = s.sites.join('\n');
    var places = h('textarea', { id: 'suPlaces', rows: '2', 'aria-label': 'Check-in places, one per line' });
    places.value = s.places.join('\n');
    lists.appendChild(h('div', { class: 'grid two' },
      h('div', { class: 'field' }, h('label', { for: 'suSites', text: 'Work sites, one per line' }), sites),
      h('div', { class: 'field' }, h('label', { for: 'suPlaces', text: 'Check-in places, one per line' }), places)));
    lists.appendChild(btn('Save sites and places', function () {
      var next = setupCopy();
      next.sites = sites.value.split('\n');
      next.places = places.value.split('\n');
      saveSetup(Setup.parseSetup(next)).then(function () { toast('Sites and places saved.'); });
    }, 'btn-quiet'));
    body.appendChild(lists);

    var rates = h('section', { class: 'subcard' });
    rates.appendChild(h('h3', { class: 'small-title', text: 'Equipment rate schedules' }));
    var built = Setup.builtInSchedule(window.FIELD_FEMA_RATES);
    rates.appendChild(h('p', { class: 'hint', text: (built ? 'Built in: ' + built.title + ' (' + built.rows.length + ' items). ' : '') +
      'Add a newer FEMA schedule or your local rates from a CSV with columns Cost Code, Equipment, Unit, and Rate. Manufacturer, Specification, Capacity or Size, HP, and Notes are used when present.' }));
    var ul = h('ul', { class: 'plain-list' });
    s.rateSchedules.forEach(function (sc, i) {
      ul.appendChild(h('li', null, sc.title + ' (' + sc.rows.length + ' items) ',
        btn('Remove', function () {
          if (!window.confirm('Remove the rate schedule ' + sc.title + '?')) return;
          var next = setupCopy();
          next.rateSchedules.splice(i, 1);
          saveSetup(Setup.parseSetup(next)).then(openSetup);
        }, 'btn-quiet btn-small')));
    });
    rates.appendChild(ul);
    var title = h('input', { type: 'text', id: 'suRateTitle', maxlength: '120', placeholder: 'Example: Smyth County local rates 2026' });
    rates.appendChild(h('div', { class: 'field' }, h('label', { for: 'suRateTitle', text: 'Name for the new schedule' }), title));
    rates.appendChild(btn('Load rate schedule (CSV)', function () {
      var t = title.value.trim();
      if (!t) {
        toast('Enter a name for the schedule first.');
        title.focus();
        return;
      }
      chooseCSV(function (text, name) {
        try {
          var sc = Setup.scheduleFromCSV(text, { id: C.slug(t), title: t, source: name });
          var next = setupCopy();
          next.rateSchedules = next.rateSchedules.filter(function (x) { return x.title !== t; }).concat([sc]);
          saveSetup(Setup.parseSetup(next)).then(function () {
            toast('Loaded ' + plural(sc.rows.length, 'rate', 'rates') + ' into ' + t + '.');
            openSetup();
          });
        } catch (err) {
          showMessage('Rate schedule not loaded', [name + ': ' + err.message]);
        }
      });
    }, '', { id: 'suRateCsv' }));
    body.appendChild(rates);

    body.appendChild(h('div', { class: 'row space' },
      btn('Remove setup from this device', function () {
        if (!window.confirm('Remove the locality setup from this device? Incidents are not affected.')) return;
        saveSetup(null).then(function () {
          S.setup = null;
          if (S.store) S.store.putKV('setup', null);
          openSetup();
        });
      }, 'btn-danger'),
      h('span', { class: 'row wrap' },
        btn('Load setup file', chooseSetupFile, '', { id: 'suLoad' }),
        btn('Save setup file', saveSetupFile, 'btn-primary', { id: 'suExport' }))));
  }

  function importList(kind) {
    chooseCSV(function (text, name) {
      var list;
      try {
        list = kind === 'people' ? Setup.peopleFromCSV(text) : Setup.equipmentFromCSV(text);
      } catch (err) {
        showMessage('List not loaded', [name + ': ' + err.message]);
        return;
      }
      if (!list.length) {
        showMessage('List not loaded', [name + ': no rows with a ' + (kind === 'people' ? 'name' : 'description') + '.']);
        return;
      }
      var next = setupCopy();
      next.format = Setup.FORMAT;
      next.version = Setup.VERSION;
      next[kind] = list;
      saveSetup(Setup.parseSetup(next)).then(function () {
        toast('Loaded ' + plural(list.length, kind === 'people' ? 'person' : 'piece of equipment', kind === 'people' ? 'people' : 'pieces of equipment') + '.');
        openSetup();
      });
    });
  }

  /* ---------- filling forms from the setup ---------- */

  function fill(s, ctx, src, keys) {
    var n = 0;
    keys.forEach(function (k) {
      if (src[k] === null || src[k] === undefined || src[k] === '') return;
      if (!C.isEmptyValue(s.data[k])) return;
      s.data[k] = src[k];
      if (ctx.controls[k]) ctx.controls[k].set(src[k]);
      n++;
    });
    return n;
  }

  /* Called when a name or equipment type was typed that has no earlier entry. */
  function setupAutofill(def, s, ctx) {
    var su = setup();
    var key = String(s.data[def.autofill.key] || '').trim().toLowerCase();
    if (!key) return;
    var n = 0;
    if (def.type === 'labor' || def.type === 'travel') {
      var p = su.people.filter(function (x) { return x.name.toLowerCase() === key; })[0];
      if (p) n = fill(s, ctx, p, def.type === 'labor' ? ['jobTitle', 'department', 'personType', 'budgeted', 'regRate', 'otRate', 'fringeReg', 'fringeOt'] : ['department']);
    } else if (def.type === 'equipment') {
      var e = su.equipment.filter(function (x) { return x.description.toLowerCase() === key || (x.unitId && x.unitId.toLowerCase() === key); })[0];
      if (e) {
        if (e.unitId && s.data.description.toLowerCase() === e.unitId.toLowerCase()) {
          s.data.description = e.description;
          if (ctx.controls.description) ctx.controls.description.set(e.description);
        }
        n = fill(s, ctx, e, ['unitId', 'code', 'usageUnit', 'rate', 'rateSource', 'rateSchedule']);
      }
    }
    if (n) {
      markDirty();
      toast('Filled ' + plural(n, 'field', 'fields') + ' from the locality setup.');
    }
  }

  /* Suggestion lists from the setup, added to the ones built from incident data. */
  function setupNames() { return setup().people.map(function (p) { return p.name; }); }
  function setupSites() { return setup().sites; }
  function setupEquipment() {
    var out = [];
    setup().equipment.forEach(function (e) { out.push(e.description); if (e.unitId) out.push(e.unitId); });
    return out;
  }

  /* ---------- rate lookup on equipment entries ---------- */

  function unitOf(u) {
    return /mile/i.test(u || '') ? 'Miles' : 'Hours';
  }

  function rateTools(inc, s) {
    return [['Find a rate', function () { openRatePicker(s); }]];
  }

  function openRatePicker(s) {
    var body = openPanel('Find an equipment rate');
    var all = schedules();
    body.appendChild(h('p', { class: 'hint', text: 'Search ' + all.map(function (x) { return x.title; }).join(' and ') + (setup().equipment.length ? ', and your equipment list' : '') +
      ' by cost code, equipment type, make, or size. Picking one fills in the code, rate, and how use is measured. FEMA rates include fuel and maintenance but not the operator, whose time is a labor entry.' }));
    var q = h('input', { type: 'search', id: 'rateQuery', placeholder: 'Example: dump truck, 8010, chain saw', autocomplete: 'off' });
    q.value = s.data.code || s.data.description || '';
    body.appendChild(h('div', { class: 'field' }, h('label', { for: 'rateQuery', text: 'Search' }), q));
    var results = h('div', { id: 'rateResults' });
    body.appendChild(results);
    function use(r) {
      var d = s.data;
      d.code = r.code.slice(0, 20);
      d.rate = r.rate;
      d.usageUnit = unitOf(r.unit);
      d.rateSource = r.local ? 'Local rate' : (/fema/i.test(r.schedule) ? 'FEMA schedule' : 'Local rate');
      d.rateSchedule = r.schedule.slice(0, 120);
      if (!d.description) d.description = [r.equipment, r.manufacturer, r.capacity].filter(Boolean).join(', ').slice(0, 200);
      markDirty();
      closePanel();
      render();
      toast(r.unit
        ? 'Rate set: ' + fmtRate(r.rate) + ' per ' + (unitOf(r.unit) === 'Miles' ? 'mile' : 'hour') + ' (' + r.code + ').'
        : 'Rate set: ' + fmtRate(r.rate) + ' (' + r.code + '). The schedule does not list a unit for this item, so check hours or miles.');
    }
    function search() {
      results.textContent = '';
      var text = q.value.trim();
      if (!text) {
        results.appendChild(h('p', { class: 'hint', text: 'Type to search.' }));
        return;
      }
      var hits = [];
      var low = text.toLowerCase();
      setup().equipment.forEach(function (e) {
        if (e.rate === null) return;
        var hay = (e.description + ' ' + e.unitId + ' ' + e.code).toLowerCase();
        if (low.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; })) {
          hits.push({ local: true, schedule: e.rateSchedule || 'Your equipment list', code: e.code || e.unitId || '', equipment: e.description, manufacturer: e.unitId ? 'Unit ' + e.unitId : '', spec: '', capacity: '', hp: '', notes: '', unit: e.usageUnit === 'Miles' ? 'mile' : 'hour', rate: e.rate });
        }
      });
      hits = hits.concat(Setup.searchRates(all, text, 40));
      if (!hits.length) {
        results.appendChild(h('p', { class: 'hint', text: 'No matches. Try fewer words, or the cost code.' }));
        return;
      }
      var ul = h('ul', { class: 'items rate-list' });
      hits.forEach(function (r) {
        var detail = [r.manufacturer, r.capacity, r.hp ? r.hp + ' HP' : '', r.notes].filter(Boolean).join(' | ');
        ul.appendChild(h('li', null, h('button', { type: 'button', class: 'item rate-item', onclick: function () { use(r); } },
          h('span', { class: 'item-top' },
            h('span', { class: 'item-title', text: (r.code ? r.code + '  ' : '') + r.equipment }),
            h('span', { class: 'tag', text: fmtRate(r.rate) + (r.unit ? ' / ' + (unitOf(r.unit) === 'Miles' ? 'mile' : 'hour') : ', unit not listed') })),
          detail ? h('span', { class: 'item-line', text: detail }) : null,
          h('span', { class: 'item-line', text: r.schedule }))));
      });
      results.appendChild(ul);
    }
    var timer = null;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 150); });
    search();
    q.focus();
  }

  /* ---------- exports ---------- */

  A.schedules = schedules;
  A.chooseSetupFile = chooseSetupFile;
  A.loadSetupFile = loadSetupFile;
  A.applySetupObject = applySetupObject;
  A.openSetup = openSetup;
  A.setupAutofill = setupAutofill;
  A.setupNames = setupNames;
  A.setupSites = setupSites;
  A.setupEquipment = setupEquipment;
  A.rateTools = rateTools;
  A.openRatePicker = openRatePicker;
})(window.FieldApp);
