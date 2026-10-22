/*
 * FieldICS PA cost workbook and the all-entries cost CSV.
 * No DOM access, so it runs in Node tests too.
 *
 * workbook(inc, opts) -> sheets for FieldXLSX.build:
 *   Summary, then one sheet per cost type (applicant costs only), then Donated.
 * Each cost sheet computes its line costs and the "rate or amount missing" flag with
 * formulas, so finance can fill in a rate in Excel and every total updates. The
 * Summary sheet pulls each type's total and the category of work totals from those
 * sheets by formula. Values the app calculated are stored beside each formula, so
 * a viewer that does not recalculate still shows the right numbers.
 *
 * allCostsCSV(inc, opts) -> one CSV, one row per cost entry of every type.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./forms.js'), require('./core.js'), require('./xlsx.js'));
  } else {
    root.FieldCostbook = factory(root.FieldICSForms, root.FieldICS, root.FieldXLSX);
  }
})(typeof self !== 'undefined' ? self : this, function (Forms, C, X) {
  'use strict';

  var FORMS = Forms.FORMS;
  var FIRST = 5; /* first data row: title, details, blank, header above it */

  var SHEETS = {
    labor: 'Labor',
    equipment: 'Equipment',
    materials: 'Materials',
    rentals: 'Rentals',
    contracts: 'Contracts',
    travel: 'Travel and other'
  };

  /*
   * Columns per cost type. k: a form field. c: a computed column with a formula
   * builder f(col) that gets column letters by field key, and a cached value v(x).
   */
  function columns(type) {
    var tail = [
      { k: 'category', w: 30 }, { k: 'site', w: 24 }, { k: 'project', w: 14 }, { k: 'rrNumber', w: 12 }
    ];
    var work = [{ k: 'work', w: 40, wrap: true }];
    var idCol = [{ c: 'id', h: 'Record id', w: 16 }];
    var list;
    if (type === 'labor') {
      list = [
        { k: 'date', w: 12 }, { k: 'name', w: 24 }, { k: 'jobTitle', w: 22 }, { k: 'department', w: 20 },
        { k: 'personType', w: 20 }, { k: 'budgeted', w: 10 },
        { k: 'regHours', w: 10, sum: true }, { k: 'otHours', w: 10, sum: true },
        { k: 'regRate', w: 11 }, { k: 'otRate', w: 11 }, { k: 'fringeReg', w: 11 }, { k: 'fringeOt', w: 11 },
        { c: 'reg', h: 'Regular cost', w: 13, money: true, sum: true,
          f: function (L, r) { return 'ROUND(N(' + L.regHours + r + ')*N(' + L.regRate + r + ')*(1+N(' + L.fringeReg + r + ')/100),2)'; },
          v: function (x) { return x.cost.reg; } },
        { c: 'ot', h: 'Overtime cost', w: 13, money: true, sum: true,
          f: function (L, r) { return 'ROUND(N(' + L.otHours + r + ')*N(' + L.otRate + r + ')*(1+N(' + L.fringeOt + r + ')/100),2)'; },
          v: function (x) { return x.cost.ot; } },
        { c: 'total', h: 'Total cost', w: 14, money: true, sum: true,
          f: function (L, r) { return L.reg + r + '+' + L.ot + r; },
          v: function (x) { return x.cost.total; } },
        { c: 'missing', h: 'Rate missing', w: 10,
          f: function (L, r) { return 'IF(OR(AND(N(' + L.regHours + r + ')>0,' + L.regRate + r + '=""),AND(N(' + L.otHours + r + ')>0,' + L.otRate + r + '="")),"Yes","")'; },
          v: function (x) { return x.cost.missingRate ? 'Yes' : ''; } }
      ].concat(tail, work, idCol);
    } else if (type === 'equipment') {
      list = [
        { k: 'date', w: 12 }, { k: 'description', w: 30 }, { k: 'unitId', w: 10 }, { k: 'code', w: 10 },
        { k: 'operator', w: 20 }, { k: 'usage', w: 11, sum: true }, { k: 'usageUnit', w: 9 },
        { k: 'rate', w: 11 }, { k: 'rateSource', w: 15 }, { k: 'rateSchedule', w: 28 },
        { c: 'total', h: 'Total cost', w: 14, money: true, sum: true,
          f: function (L, r) { return 'ROUND(N(' + L.usage + r + ')*N(' + L.rate + r + '),2)'; },
          v: function (x) { return x.cost.total; } },
        { c: 'missing', h: 'Rate missing', w: 10,
          f: function (L, r) { return 'IF(AND(N(' + L.usage + r + ')>0,' + L.rate + r + '=""),"Yes","")'; },
          v: function (x) { return x.cost.missingRate ? 'Yes' : ''; } }
      ].concat(tail, work, idCol);
    } else if (type === 'materials') {
      list = [
        { k: 'description', w: 30 }, { k: 'obtained', w: 13 }, { k: 'vendor', w: 22 },
        { k: 'qtyPurchased', w: 11 }, { k: 'qtyUsed', w: 11 }, { k: 'unit', w: 9 }, { k: 'unitPrice', w: 11 },
        { k: 'purchaseDate', w: 12 }, { k: 'usedDate', w: 12 }, { k: 'invoice', w: 14 },
        { c: 'total', h: 'Total cost', w: 14, money: true, sum: true,
          f: function (L, r) { return 'ROUND(IF(' + L.qtyUsed + r + '="",N(' + L.qtyPurchased + r + '),N(' + L.qtyUsed + r + '))*N(' + L.unitPrice + r + '),2)'; },
          v: function (x) { return x.cost.total; } },
        { c: 'missing', h: 'Price missing', w: 10,
          f: function (L, r) { return 'IF(AND(IF(' + L.qtyUsed + r + '="",N(' + L.qtyPurchased + r + '),N(' + L.qtyUsed + r + '))>0,' + L.unitPrice + r + '=""),"Yes","")'; },
          v: function (x) { return x.cost.missingRate ? 'Yes' : ''; } }
      ].concat(tail, work, idCol);
    } else if (type === 'rentals') {
      list = [
        { k: 'description', w: 28 }, { k: 'vendor', w: 22 }, { k: 'code', w: 10 }, { k: 'startDate', w: 12 }, { k: 'endDate', w: 12 },
        { k: 'hours', w: 9, sum: true }, { k: 'rate', w: 16 }, { k: 'withOperator', w: 10 }, { k: 'operator', w: 18 },
        { k: 'amount', w: 13 }, { k: 'invoice', w: 14 }, { k: 'datePaid', w: 12 },
        { c: 'total', h: 'Total cost', w: 14, money: true, sum: true,
          f: function (L, r) { return 'ROUND(N(' + L.amount + r + '),2)'; },
          v: function (x) { return x.cost.total; } },
        { c: 'missing', h: 'Amount missing', w: 10,
          f: function (L, r) { return 'IF(' + L.amount + r + '="","Yes","")'; },
          v: function (x) { return x.cost.missingRate ? 'Yes' : ''; } }
      ].concat(tail, work, idCol);
    } else if (type === 'contracts') {
      list = [
        { k: 'contractor', w: 24 }, { k: 'description', w: 36, wrap: true }, { k: 'contractNumber', w: 14 }, { k: 'procurement', w: 22 },
        { k: 'startDate', w: 12 }, { k: 'endDate', w: 12 }, { k: 'amount', w: 14 }, { k: 'invoice', w: 14 }, { k: 'datePaid', w: 12 },
        { c: 'total', h: 'Total cost', w: 14, money: true, sum: true,
          f: function (L, r) { return 'ROUND(N(' + L.amount + r + '),2)'; },
          v: function (x) { return x.cost.total; } },
        { c: 'missing', h: 'Amount missing', w: 10,
          f: function (L, r) { return 'IF(' + L.amount + r + '="","Yes","")'; },
          v: function (x) { return x.cost.missingRate ? 'Yes' : ''; } }
      ].concat(tail, idCol);
    } else {
      list = [
        { k: 'date', w: 12 }, { k: 'kind', w: 14 }, { k: 'name', w: 22 }, { k: 'department', w: 18 }, { k: 'description', w: 30 },
        { k: 'vendor', w: 20 }, { k: 'qty', w: 9 }, { k: 'unit', w: 9 }, { k: 'rate', w: 11 }, { k: 'amount', w: 13 },
        { k: 'receipt', w: 14 }, { k: 'datePaid', w: 12 },
        { c: 'total', h: 'Total cost', w: 14, money: true, sum: true,
          f: function (L, r) { return 'IF(' + L.amount + r + '="",ROUND(N(' + L.qty + r + ')*N(' + L.rate + r + '),2),ROUND(N(' + L.amount + r + '),2))'; },
          v: function (x) { return x.cost.total; } },
        { c: 'missing', h: 'Amount missing', w: 10,
          f: function (L, r) { return 'IF(AND(' + L.amount + r + '="",OR(' + L.qty + r + '="",' + L.rate + r + '="")),"Yes","")'; },
          v: function (x) { return x.cost.missingRate ? 'Yes' : ''; } }
      ].concat(tail, idCol);
    }
    list.forEach(function (col, i) {
      col.L = X.colName(i);
      if (col.k) {
        var f = Forms.fieldByKey(type, col.k);
        col.field = f;
        col.h = f ? f.label : col.k;
      }
    });
    return list;
  }

  function letters(cols) {
    var L = {};
    cols.forEach(function (c) { L[c.k || c.c] = c.L; });
    return L;
  }

  /* A form value as a spreadsheet cell. */
  function valueCell(f, v) {
    if (v === null || v === undefined || v === '') return null;
    if (!f) return String(v);
    if (f.kind === 'date') {
      var serial = X.dateSerial(v);
      return serial === null ? String(v) : { v: serial, s: 'date' };
    }
    if (f.kind === 'money') return typeof v === 'number' ? { v: v, s: 'money' } : String(v);
    if (f.kind === 'percent') return typeof v === 'number' ? { v: v, s: 'pct' } : String(v);
    if (f.kind === 'number') return typeof v === 'number' ? { v: v, s: 'num' } : String(v);
    if (f.kind === 'int') return typeof v === 'number' ? { v: v, s: 'int' } : String(v);
    if (f.kind === 'bool') return v ? 'Yes' : null;
    if (f.kind === 'select') {
      var o = (f.options || []).filter(function (x) { return x.v === v; })[0];
      return o ? o.t : String(v);
    }
    if (f.kind === 'textarea') return { v: String(v), s: 'wrap' };
    if (Array.isArray(v)) return v.join('; ');
    return String(v);
  }

  function details(inc) {
    var bits = [];
    if (inc.applicant) bits.push('Applicant: ' + inc.applicant);
    if (inc.paId) bits.push('FEMA PA ID: ' + inc.paId);
    if (inc.disasterNumber) bits.push('Disaster: ' + inc.disasterNumber);
    bits.push('Incident: ' + inc.name + (inc.number ? ' (' + inc.number + ')' : ''));
    return bits.join('    ');
  }

  function exerciseTitle(inc, title) {
    return (inc.exercise ? 'EXERCISE: ' : '') + title;
  }

  /* One cost type sheet. Returns { sheet, cols, first, last, totalRow }. */
  function typeSheet(inc, type, filter) {
    var cols = columns(type);
    var L = letters(cols);
    var f2 = {};
    Object.keys(filter || {}).forEach(function (k) { f2[k] = filter[k]; });
    f2.type = type;
    f2.donated = false;
    var list = C.costRecords(inc, f2);
    var rows = [
      [{ v: exerciseTitle(inc, FORMS[type].summaryTitle || FORMS[type].title), s: 'title' }],
      [{ v: details(inc), s: 'note' }],
      [],
      cols.map(function (c) { return { v: c.h, s: 'head' }; })
    ];
    list.forEach(function (x, i) {
      var r = FIRST + i;
      rows.push(cols.map(function (c) {
        if (c.k) return valueCell(c.field, x.data[c.k]);
        if (c.c === 'id') return x.rec.rid;
        var cached = c.v(x);
        return { f: c.f(L, r), v: cached, s: c.money ? 'money' : undefined };
      }));
    });
    var last = FIRST + list.length - 1;
    var totalRow = FIRST + list.length;
    var totals = cols.map(function (c, i) {
      if (i === 0) return { v: 'Total', s: 'totalLabel' };
      if (!c.sum) return { v: '', s: 'totalLabel' };
      var cached = list.reduce(function (n, x) {
        if (c.k) return n + (typeof x.data[c.k] === 'number' ? x.data[c.k] : 0);
        return n + (c.v(x) || 0);
      }, 0);
      cached = Math.round(cached * 100) / 100;
      if (!list.length) return { v: 0, s: c.money ? 'moneyBold' : 'totalLabel' };
      return { f: 'SUM(' + c.L + FIRST + ':' + c.L + last + ')', v: cached, s: c.money ? 'moneyBold' : 'totalLabel' };
    });
    if (!list.length) rows.push([{ v: 'No entries.', s: 'note' }]);
    rows.push(totals);
    var sheet = {
      name: SHEETS[type],
      cols: cols.map(function (c) { return c.w; }),
      freeze: 4,
      rows: rows
    };
    if (list.length) sheet.autoFilter = 'A4:' + cols[cols.length - 1].L + last;
    return { sheet: sheet, cols: cols, L: L, count: list.length, first: FIRST, last: last, totalRow: list.length ? totalRow : totalRow + 1, list: list };
  }

  function donatedSheet(inc, filter) {
    var f2 = {};
    Object.keys(filter || {}).forEach(function (k) { f2[k] = filter[k]; });
    f2.donated = true;
    var list = C.costRecords(inc, f2);
    var head = ['Date', 'Kind', 'Resource', 'Donor', 'FEMA category of work', 'Location or site', 'Work performed', 'Basis', 'Value'];
    var rows = [
      [{ v: exerciseTitle(inc, 'Donated Resources'), s: 'title' }],
      [{ v: details(inc), s: 'note' }],
      [{ v: 'Not included in the cost totals. Donated resources used for eligible emergency work can be credited toward the non-federal share; FEMA and the state decide. Volunteer labor is valued at straight time plus fringe benefits for similar work.', s: 'note' }],
      head.map(function (h) { return { v: h, s: 'head' }; })
    ];
    var cat = function (v) { var o = Forms.fieldByKey('labor', 'category').options.filter(function (x) { return x.v === v; })[0]; return o ? o.t : (v || null); };
    list.forEach(function (x) {
      var d = x.data;
      var kind = x.type === 'labor' ? 'Volunteer labor' : x.type === 'equipment' ? 'Donated equipment' : 'Donated materials';
      var what = x.type === 'labor' ? d.name : d.description;
      var basis = '';
      if (x.type === 'labor') basis = (Number(d.regHours || 0) + Number(d.otHours || 0)) + ' hours at ' + (d.regRate === null || d.regRate === undefined ? 'rate needed' : '$' + Number(d.regRate).toFixed(2)) + ', straight time';
      else if (x.type === 'equipment') basis = (d.usage || 0) + ' ' + (d.usageUnit || 'Hours').toLowerCase() + ' at ' + (d.rate === null || d.rate === undefined ? 'rate needed' : '$' + Number(d.rate).toFixed(2));
      else {
        var q = d.qtyUsed !== null && d.qtyUsed !== undefined ? d.qtyUsed : d.qtyPurchased;
        basis = (q === null || q === undefined ? '' : q + (d.unit ? ' ' + d.unit : '')) + (d.unitPrice === null || d.unitPrice === undefined ? ', value needed' : ' at $' + Number(d.unitPrice).toFixed(2));
      }
      rows.push([
        valueCell({ kind: 'date' }, x.date), kind, what || null, d.donor || null, cat(d.category), d.site || null,
        d.work ? { v: d.work, s: 'wrap' } : null, basis, { v: x.cost.total, s: 'money' }
      ]);
    });
    var last = FIRST + list.length - 1;
    if (!list.length) rows.push([{ v: 'No donated resources recorded.', s: 'note' }]);
    var total = list.reduce(function (n, x) { return n + x.cost.totalCents; }, 0) / 100;
    var row = head.map(function () { return { v: '', s: 'totalLabel' }; });
    row[0] = { v: 'Total donated value', s: 'totalLabel' };
    row[8] = list.length ? { f: 'SUM(I' + FIRST + ':I' + last + ')', v: total, s: 'moneyBold' } : { v: 0, s: 'moneyBold' };
    rows.push(row);
    return {
      sheet: { name: 'Donated', cols: [12, 20, 28, 22, 30, 22, 36, 34, 13], freeze: 4, rows: rows },
      totalRow: rows.length,
      total: total
    };
  }

  function fmtDay(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    if (!m) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return +m[3] + ' ' + months[+m[2] - 1] + ' ' + m[1];
  }

  /*
   * opts: { filter, preparedBy, preparedTitle, printedAt (Date), deviceName }
   * Returns { sheets, summary } where summary is the app's own cost summary.
   */
  function workbook(inc, opts) {
    opts = opts || {};
    var filter = opts.filter || {};
    var summary = C.costSummary(inc, filter);
    var parts = {};
    C.COST_TYPES.forEach(function (t) { parts[t] = typeSheet(inc, t, filter); });
    var don = donatedSheet(inc, filter);

    var rows = [];
    rows.push([{ v: exerciseTitle(inc, 'Public Assistance Cost Documentation Summary'), s: 'title' }]);
    if (inc.exercise) rows.push([{ v: 'EXERCISE. This is not a real incident.', s: 'bold' }]);
    var info = [
      ['Applicant', inc.applicant || ''],
      ['FEMA PA ID', inc.paId || ''],
      ['Disaster number', inc.disasterNumber || ''],
      ['Incident', inc.name + (inc.number ? ' (' + inc.number + ')' : '')],
      ['Category of work', filter.category ? (Forms.fieldByKey('labor', 'category').options.filter(function (o) { return o.v === filter.category; })[0] || { t: filter.category }).t : 'All categories'],
      ['Location or site', filter.site || 'All sites'],
      ['Period covering', summary.firstDate ? fmtDay(summary.firstDate) + ' to ' + fmtDay(summary.lastDate) : 'No dated entries']
    ];
    info.forEach(function (p) { rows.push([{ v: p[0], s: 'bold' }, p[1]]); });
    rows.push([]);
    var headRow = rows.length + 1;
    rows.push([{ v: 'Type', s: 'head' }, { v: 'Entries', s: 'head' }, { v: 'Missing a rate or amount', s: 'head' }, { v: 'Total', s: 'head' }]);
    var firstType = rows.length + 1;
    C.COST_TYPES.forEach(function (t) {
      var p = parts[t];
      var sref = X.sheetRef(SHEETS[t]);
      var totalCol = p.L.total;
      var missingCol = p.L.missing;
      var t2 = summary.types[t];
      rows.push([
        FORMS[t].title,
        { v: p.count, s: 'int' },
        p.count ? { f: 'COUNTIF(' + sref + '!' + missingCol + FIRST + ':' + missingCol + p.last + ',"Yes")', v: t2.missing, s: 'int' } : { v: 0, s: 'int' },
        { f: sref + '!' + totalCol + p.totalRow, v: t2.total, s: 'money' }
      ]);
    });
    var lastType = rows.length;
    rows.push([
      { v: 'Total documented', s: 'totalLabel' },
      { f: 'SUM(B' + firstType + ':B' + lastType + ')', v: C.COST_TYPES.reduce(function (n, t) { return n + parts[t].count; }, 0), s: 'totalLabel' },
      { f: 'SUM(C' + firstType + ':C' + lastType + ')', v: C.COST_TYPES.reduce(function (n, t) { return n + summary.types[t].missing; }, 0), s: 'totalLabel' },
      { f: 'SUM(D' + firstType + ':D' + lastType + ')', v: summary.total, s: 'moneyBold' }
    ]);
    rows.push([]);
    rows.push([{ v: 'FEMA category of work', s: 'head' }, { v: '', s: 'head' }, { v: '', s: 'head' }, { v: 'Total', s: 'head' }]);
    var cats = Forms.fieldByKey('labor', 'category').options.map(function (o) { return { v: o.v, t: o.t }; }).concat([{ v: '', t: 'Category not set' }]);
    var catCached = {};
    summary.categories.forEach(function (c) { catCached[c.category] = c.total; });
    cats.forEach(function (c) {
      var terms = [];
      C.COST_TYPES.forEach(function (t) {
        var p = parts[t];
        if (!p.count) return;
        var sref = X.sheetRef(SHEETS[t]);
        terms.push('SUMIF(' + sref + '!' + p.L.category + FIRST + ':' + p.L.category + p.last + ',"' + (c.v ? c.t.replace(/"/g, '""') : '') + '",' + sref + '!' + p.L.total + FIRST + ':' + p.L.total + p.last + ')');
      });
      rows.push([c.t, null, null, terms.length ? { f: terms.join('+'), v: catCached[c.v] || 0, s: 'money' } : { v: 0, s: 'money' }]);
    });
    rows.push([]);
    rows.push([{ v: 'Donated resources (not in the totals above)', s: 'bold' }, null, null,
      { f: X.sheetRef('Donated') + '!I' + don.totalRow, v: don.total, s: 'money' }]);
    rows.push([]);
    rows.push([{ v: 'Certification', s: 'bold' }]);
    rows.push(['I certify that the information in this workbook was obtained from payroll records, invoices, or other documents that are available for audit.']);
    rows.push([{ v: 'Certified by', s: 'bold' }, opts.preparedBy || '']);
    rows.push([{ v: 'Title', s: 'bold' }, opts.preparedTitle || '']);
    rows.push([{ v: 'Signature', s: 'bold' }, '']);
    rows.push([{ v: 'Date', s: 'bold' }, '']);
    rows.push([]);
    rows.push([{ v: 'Prepared to organize cost documentation. Eligibility is determined under the FEMA Public Assistance Program and Policy Guide.', s: 'note' }]);
    var made = opts.printedAt || new Date();
    rows.push([{ v: 'Exported ' + made.toISOString().slice(0, 16).replace('T', ' ') + ' UTC from FieldICS' + (opts.deviceName ? ' on ' + opts.deviceName : '') + '. Rates can be filled in on each sheet; totals update.', s: 'note' }]);

    var sheets = [{ name: 'Summary', cols: [44, 12, 22, 16], rows: rows, freeze: 0, headRow: headRow, portrait: true }];
    C.COST_TYPES.forEach(function (t) { sheets.push(parts[t].sheet); });
    sheets.push(don.sheet);
    return { sheets: sheets, summary: summary, parts: parts, donated: don };
  }

  /* ---------- one CSV for every cost entry ---------- */

  function cell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function describe(x) {
    var d = x.data;
    if (x.type === 'labor') return d.name;
    if (x.type === 'contracts') return [d.contractor, d.description].filter(Boolean).join(': ');
    if (x.type === 'travel') return [d.kind, d.description].filter(Boolean).join(': ');
    if (x.type === 'equipment') return d.description + (d.unitId ? ' (' + d.unitId + ')' : '');
    return d.description;
  }

  function quantity(x) {
    var d = x.data;
    if (x.type === 'labor') return [(d.regHours || 0) + (d.otHours || 0), 'hours'];
    if (x.type === 'equipment') return [d.usage, (d.usageUnit || 'Hours').toLowerCase()];
    if (x.type === 'materials') return [d.qtyUsed !== null && d.qtyUsed !== undefined ? d.qtyUsed : d.qtyPurchased, d.unit];
    if (x.type === 'rentals') return [d.hours, d.hours ? 'hours' : ''];
    if (x.type === 'travel') return [d.qty, d.unit];
    return ['', ''];
  }

  function allCostsCSV(inc, opts) {
    opts = opts || {};
    var header = ['Type', 'Date', 'Description', 'Quantity', 'Unit', 'FEMA category of work', 'Location or site', 'Project number',
      '213 RR number', 'Regular cost', 'Overtime cost', 'Total cost or donated value', 'Donated', 'Rate or amount missing', 'Record id'];
    var rows = [header.join(',')];
    var catField = Forms.fieldByKey('labor', 'category');
    C.costRecords(inc, opts.filter || {}).forEach(function (x) {
      var q = quantity(x);
      var cat = catField.options.filter(function (o) { return o.v === x.data.category; })[0];
      rows.push([
        cell(FORMS[x.type].title), cell(x.date), cell(describe(x)), cell(q[0] === null || q[0] === undefined ? '' : q[0]), cell(q[1] || ''),
        cell(cat ? cat.t : ''), cell(x.data.site), cell(x.data.project), cell(x.data.rrNumber),
        x.type === 'labor' ? x.cost.reg.toFixed(2) : '', x.type === 'labor' ? x.cost.ot.toFixed(2) : '',
        x.cost.total.toFixed(2), x.cost.donated ? 'yes' : '', x.cost.missingRate ? 'yes' : '', cell(x.rec.rid)
      ].join(','));
    });
    return rows.join('\r\n') + '\r\n';
  }

  return { workbook: workbook, allCostsCSV: allCostsCSV, SHEETS: SHEETS, columns: columns };
});
