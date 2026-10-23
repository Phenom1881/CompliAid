/*
 * FieldICS print layouts.
 * Builds printable pages that follow the ICS form block order and the FEMA PA
 * summary record columns. Everything is written with textContent, never as HTML.
 * The same output is used on screen for previews of older versions.
 *
 * ctx (from the app): {
 *   incident, attachment(id) -> {data} | null,
 *   fmt: { dt(iso), day('YYYY-MM-DD'), money(n), rate(n) },
 *   printedAt (ISO), appName, locality (optional, from the setup file)
 * }
 * Pages are built from block elements, tables, text, and images only, so the
 * built-in PDF maker (pdf.js) can draw them the same way the browser prints them.
 */
(function (root) {
  'use strict';

  var Forms = root.FieldICSForms;
  var FORMS = Forms.FORMS;

  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }

  function add(node, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) {
      c.forEach(function (x) { add(node, x); });
      return;
    }
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }

  var NBSP = ' ';

  function optionText(f, v) {
    for (var i = 0; i < f.options.length; i++) {
      if (f.options[i].v === v) return f.options[i].t;
    }
    return v || '';
  }

  function valueText(f, v, ctx) {
    if (v === null || v === undefined || v === '') return '';
    switch (f.kind) {
      case 'datetime': return ctx.fmt.dt(v);
      case 'date': return ctx.fmt.day(v);
      case 'money': return ctx.fmt.rate(v);
      case 'percent': return v + '%';
      case 'select': return f.k === 'mode' || f.k === 'placedBy' ? v : optionText(f, v);
      case 'bool': return v ? 'Yes' : '';
      case 'checks': return v.join(', ');
      case 'images': return v.length ? v.length + (v.length === 1 ? ' photo' : ' photos') : '';
      default: return String(v);
    }
  }

  function periodText(p, ctx) {
    if (!p) return '';
    return 'From ' + (p.start ? ctx.fmt.dt(p.start) : '________') + '  to  ' + (p.end ? ctx.fmt.dt(p.end) : '________');
  }

  function incidentName(ctx, withNumber) {
    var inc = ctx.incident;
    return inc.name + (withNumber && inc.number ? ' (' + inc.number + ')' : '');
  }

  /* A header cell: small label above the value. */
  function hcell(label, value, span) {
    return h('td', { colspan: span ? String(span) : null },
      h('span', { class: 'p-lbl', text: label }),
      h('span', { class: 'p-val', text: value || NBSP }));
  }

  /* Marks every page of an exercise incident, top and bottom, so it cannot be mistaken for a real incident. */
  function exerciseMark(ctx) {
    if (!ctx.incident || ctx.incident.exercise !== true) return null;
    return h('div', { class: 'p-exercise', text: 'EXERCISE  EXERCISE  EXERCISE' });
  }

  function page(ctx, cls) {
    var pg = h('div', { class: 'p-page' + (cls ? ' ' + cls : '') });
    var mark = exerciseMark(ctx);
    if (mark) pg.appendChild(mark);
    return pg;
  }

  function headerTable(cells) {
    return h('table', { class: 'p-head' }, h('tbody', null, h('tr', null, cells)));
  }

  function blockBox(title, body) {
    return h('div', { class: 'p-block' }, h('div', { class: 'p-bh', text: title }), body);
  }

  /* Label and value pairs, `cols` pairs per row. */
  function kvTable(pairs, cols) {
    cols = cols || 2;
    var tbody = h('tbody');
    for (var i = 0; i < pairs.length; i += cols) {
      var tr = h('tr');
      for (var j = 0; j < cols; j++) {
        var p = pairs[i + j];
        if (p) {
          tr.appendChild(h('td', { class: 'p-k', text: p.label }));
          tr.appendChild(h('td', { class: 'p-v' + (p.sig ? ' p-sig' : ''), text: p.value || NBSP }));
        } else {
          tr.appendChild(h('td', { class: 'p-k', text: NBSP }));
          tr.appendChild(h('td', { class: 'p-v', text: NBSP }));
        }
      }
      tbody.appendChild(tr);
    }
    return h('table', { class: 'p-kv' }, tbody);
  }

  function gridTable(columns, list, ctx, minRows) {
    var head = h('tr');
    columns.forEach(function (c) { head.appendChild(h('th', { text: c.printLabel || c.label })); });
    var body = h('tbody');
    list.forEach(function (row) {
      var tr = h('tr');
      columns.forEach(function (c) {
        var v = row[c.k];
        var text = c.kind === 'bool' ? (v ? 'X' : '') : valueText(c, v, ctx);
        tr.appendChild(h('td', { class: 'p-c-' + c.kind, text: text || NBSP }));
      });
      body.appendChild(tr);
    });
    for (var i = list.length; i < (minRows || 0); i++) {
      var blank = h('tr', { class: 'p-blank' });
      columns.forEach(function () { blank.appendChild(h('td', { text: NBSP })); });
      body.appendChild(blank);
    }
    return h('table', { class: 'p-grid' }, h('thead', null, head), body);
  }

  function checkList(f, values) {
    var box = h('div', { class: 'p-checks' });
    f.options.forEach(function (o) {
      box.appendChild(h('span', { class: 'p-check', text: (values.indexOf(o.v) !== -1 ? '[X] ' : '[  ] ') + o.t }));
    });
    return box;
  }

  /* Small photos inside a form printout. Large copies go in the photo appendix. */
  function photoGrid(ids, ctx, label) {
    var box = h('div', { class: 'p-photos' });
    if (!ids.length) {
      box.appendChild(h('div', { class: 'p-line', text: 'None' }));
      return box;
    }
    ids.forEach(function (id, i) {
      var att = ctx.attachment(id);
      if (att) box.appendChild(h('img', { class: 'p-thumb', src: att.data, alt: label + ' ' + (i + 1) }));
      else box.appendChild(h('div', { class: 'p-thumb p-missing', text: 'Photo ' + (i + 1) + ' is not on this device.' }));
    });
    return box;
  }

  /* ICS 201 block 9 drawn as an organization chart, like the paper form. */
  function orgChart(b, data, ctx) {
    var body = h('div', { class: 'p-bb' });
    function box(label, value) {
      return h('div', { class: 'p-org-box' }, h('span', { class: 'p-lbl', text: label }), h('span', { class: 'p-val', text: value || NBSP }));
    }
    var chart = h('div', { class: 'p-org' });
    chart.appendChild(h('div', { class: 'p-org-row p-org-top' }, box('Incident Commander(s)', data.ic)));
    chart.appendChild(h('div', { class: 'p-org-row p-org-staff' },
      box('Liaison Officer', data.liaison), box('Safety Officer', data.safety), box('Public Information Officer', data.pio)));
    chart.appendChild(h('div', { class: 'p-org-row p-org-sections' },
      box('Operations Section Chief', data.ops), box('Planning Section Chief', data.plans),
      box('Logistics Section Chief', data.logs), box('Finance/Admin Section Chief', data.finance)));
    body.appendChild(chart);
    b.fields.forEach(function (f) {
      if (f.kind !== 'rows') return;
      body.appendChild(h('div', { class: 'p-sub', text: f.label }));
      body.appendChild(gridTable(f.columns, data[f.k] || [], ctx, f.printMin || 3));
    });
    return blockBox((b.n ? b.n + '. ' : '') + b.title, body);
  }

  /* A fixed table block (ICS 209 blocks 30 to 32, ICS 221 block 6). */
  function matrixTable(m, data, ctx) {
    var head = h('tr', null, h('th', { text: NBSP }));
    m.cols.forEach(function (c) { head.appendChild(h('th', { text: c[1] })); });
    var body = h('tbody');
    m.rows.forEach(function (r) {
      var tr = h('tr', null, h('td', { class: 'p-rowhead', text: r[1] }));
      m.cols.forEach(function (c) {
        var v = data[m.prefix + r[0] + c[0]];
        var kind = c[2] || 'int';
        var text = kind === 'bool' ? (v ? 'X' : '') : (v === null || v === undefined ? '' : String(v));
        tr.appendChild(h('td', { class: 'p-c-' + kind, text: text || NBSP }));
      });
      body.appendChild(tr);
    });
    return h('table', { class: 'p-grid p-matrix' }, h('thead', null, head), body);
  }

  function matrixKeys(m) {
    var keys = [];
    m.rows.forEach(function (r) { m.cols.forEach(function (c) { keys.push(m.prefix + r[0] + c[0]); }); });
    return keys;
  }

  function geoText(data) {
    if (data.lat === null || data.lat === undefined || data.lon === null || data.lon === undefined) return '';
    return data.lat.toFixed(6) + ', ' + data.lon.toFixed(6) + (data.gpsAcc ? ' (within ' + data.gpsAcc + ' m)' : '');
  }

  /* ICS 215 assignments: each line prints as required, have, and need rows, as on the form. Totals are blocks 11 to 13. */
  function planning215(f, data, ctx) {
    var slots = [];
    for (var i = 1; i <= 6; i++) {
      if (String(data[f.slots + i] || '').trim() || (data[f.k] || []).some(function (r) { return r['r' + i + 'Req'] !== null || r['r' + i + 'Have'] !== null; })) slots.push(i);
    }
    var head = h('tr', null, h('th', { text: '3. Branch' }), h('th', { text: '4. Division, group, or other' }), h('th', { text: '5. Work assignment and special instructions' }), h('th', { text: NBSP }));
    slots.forEach(function (i) { head.appendChild(h('th', { class: 'p-num', text: String(data[f.slots + i] || 'Resource ' + i) })); });
    ['7. Overhead position(s)', '8. Special equipment and supplies', '9. Reporting location', '10. Requested arrival time'].forEach(function (t) { head.appendChild(h('th', { text: t })); });
    var body = h('tbody');
    var totals = { req: {}, have: {}, need: {} };
    slots.forEach(function (i) { totals.req[i] = 0; totals.have[i] = 0; totals.need[i] = 0; });
    var lines = data[f.k] || [];
    function n(v) { return typeof v === 'number' ? v : 0; }
    lines.forEach(function (r) {
      ['req', 'have', 'need'].forEach(function (part, j) {
        var tr = h('tr', { class: j === 0 ? 'p-215-first' : 'p-215-sub' });
        if (j === 0) {
          [r.branch, r.division, r.work].forEach(function (t) { tr.appendChild(h('td', { rowspan: '3', text: t || NBSP })); });
        }
        tr.appendChild(h('td', { class: 'p-rowhead', text: part === 'req' ? 'Req.' : part === 'have' ? 'Have' : 'Need' }));
        slots.forEach(function (i) {
          var req = r['r' + i + 'Req'];
          var have = r['r' + i + 'Have'];
          var v;
          if (part === 'req') v = req;
          else if (part === 'have') v = have;
          else v = req === null && have === null ? null : Math.max(0, n(req) - n(have));
          if (v !== null && v !== undefined) totals[part][i] += v;
          tr.appendChild(h('td', { class: 'p-num', text: v === null || v === undefined ? NBSP : String(v) }));
        });
        if (j === 0) {
          [r.overhead, r.equipment, r.reporting, r.arrival].forEach(function (t) { tr.appendChild(h('td', { rowspan: '3', text: t || NBSP })); });
        }
        body.appendChild(tr);
      });
    });
    if (!lines.length) {
      var none = h('tr');
      none.appendChild(h('td', { colspan: String(8 + slots.length), text: 'No assignments.' }));
      body.appendChild(none);
    }
    [['req', '11. Total resources required'], ['have', '12. Total resources have on hand'], ['need', '13. Total resources need to order']].forEach(function (t) {
      var tr = h('tr', { class: 'p-sum' }, h('td', { colspan: '4', text: t[1] }));
      slots.forEach(function (i) { tr.appendChild(h('td', { class: 'p-num', text: String(totals[t[0]][i]) })); });
      tr.appendChild(h('td', { colspan: '4', text: NBSP }));
      body.appendChild(tr);
    });
    return h('table', { class: 'p-grid p-215' }, h('thead', null, head), body);
  }

  /* ICS 209 blocks 48 to 52, with the totals worked out. */
  function commitment209(f, data, ctx) {
    var rows = (data[f.k] || []).map(function (r) {
      var people = (r.resourcePeople || 0) + (r.additional || 0);
      return { cells: [r.agency, r.resources, r.resourceCount === null ? '' : String(r.resourceCount), r.resourcePeople === null ? '' : String(r.resourcePeople), r.additional === null ? '' : String(r.additional), String(people)] };
    });
    var res = (data[f.k] || []).reduce(function (s, r) { return s + (r.resourceCount || 0); }, 0);
    var ppl = (data[f.k] || []).reduce(function (s, r) { return s + (r.resourcePeople || 0) + (r.additional || 0); }, 0);
    var table = h('table', { class: 'p-grid' });
    var head = h('tr');
    ['48. Agency or organization', '49. Resources', '# of resources', '# of personnel with resources', '50. Additional personnel', '51. Total personnel'].forEach(function (t, i) {
      head.appendChild(h('th', { class: i >= 2 ? 'p-num' : null, text: t }));
    });
    table.appendChild(h('thead', null, head));
    var body = h('tbody');
    rows.forEach(function (r) {
      var tr = h('tr');
      r.cells.forEach(function (c, i) { tr.appendChild(h('td', { class: i >= 2 ? 'p-num' : null, text: c || NBSP })); });
      body.appendChild(tr);
    });
    for (var i = rows.length; i < (f.printMin || 4); i++) {
      var blank = h('tr', { class: 'p-blank' });
      for (var j = 0; j < 6; j++) blank.appendChild(h('td', { text: NBSP }));
      body.appendChild(blank);
    }
    var total = h('tr', { class: 'p-sum' }, h('td', { colspan: '2', text: '52. Total resources and personnel' }),
      h('td', { class: 'p-num', text: String(res) }), h('td', { text: NBSP }), h('td', { text: NBSP }), h('td', { class: 'p-num', text: String(ppl) }));
    body.appendChild(total);
    table.appendChild(body);
    return table;
  }

  function renderBlock(b, data, ctx, narrow) {
    if (b.chart) return orgChart(b, data, ctx);
    var title = (b.n ? b.n + '. ' : '') + b.title;
    var body = h('div', { class: 'p-bb' });
    var pairs = [];
    function flush() {
      if (!pairs.length) return;
      body.appendChild(kvTable(pairs, narrow ? 1 : (b.cols || 2)));
      pairs = [];
    }
    var skip = b.matrix ? matrixKeys(b.matrix) : [];
    if (b.geo) {
      skip = skip.concat(['lat', 'lon', 'gpsAcc', 'gpsAt']);
      pairs.push({ label: 'Latitude, longitude (decimal degrees)', value: geoText(data) });
      if (data.gpsAt) pairs.push({ label: 'Location taken', value: valueText({ kind: 'datetime' }, data.gpsAt, ctx) });
    }
    var single = b.fields.length === 1;
    b.fields.forEach(function (f) {
      var v = data[f.k];
      if (skip.indexOf(f.k) !== -1) return;
      if (f.kind === 'rows' && f.slots) {
        flush();
        body.appendChild(planning215(f, data, ctx));
      } else if (f.kind === 'rows' && f.k === 'commitment') {
        flush();
        body.appendChild(commitment209(f, data, ctx));
      } else if (f.kind === 'rows') {
        flush();
        if (!f.hideLabel && !single) body.appendChild(h('div', { class: 'p-sub', text: f.label }));
        var list = v || [];
        if (f.printSort) {
          list = list.slice().sort(function (a, c) { return String(a[f.printSort] || '').localeCompare(String(c[f.printSort] || '')); });
        }
        var cols = f.printLabels ? f.columns.map(function (c) {
          if (!f.printLabels[c.k]) return c;
          var copy = {};
          Object.keys(c).forEach(function (k) { copy[k] = c[k]; });
          copy.printLabel = f.printLabels[c.k];
          return copy;
        }) : f.columns;
        body.appendChild(gridTable(cols, list, ctx, f.printMin || 3));
      } else if (f.kind === 'textarea') {
        flush();
        if (!f.hideLabel) body.appendChild(h('div', { class: 'p-sub', text: f.label }));
        body.appendChild(h('div', { class: 'p-text' + ((f.rows || 3) >= 6 ? ' p-tall' : ''), text: v || NBSP }));
      } else if (f.kind === 'checks') {
        flush();
        body.appendChild(checkList(f, v || []));
      } else if (f.kind === 'images') {
        flush();
        body.appendChild(photoGrid(v || [], ctx, f.label));
      } else if (f.kind === 'image') {
        flush();
        var att = v ? ctx.attachment(v) : null;
        if (att) body.appendChild(h('img', { class: 'p-img', src: att.data, alt: f.label }));
        else if (v) body.appendChild(h('p', { class: 'p-note', text: '[The image for this form is not on this device.]' }));
        else body.appendChild(h('div', { class: 'p-sketch', text: NBSP }));
      } else if (single && f.hideLabel) {
        body.appendChild(h('div', { class: 'p-line', text: valueText(f, v, ctx) || NBSP }));
      } else {
        pairs.push({ label: f.label, value: valueText(f, v, ctx) });
      }
    });
    if (b.signature) pairs.push({ label: 'Signature', value: '', sig: true });
    flush();
    if (b.matrix) body.appendChild(matrixTable(b.matrix, data, ctx));
    return blockBox(title, body);
  }

  function headerFor(type, data, ctx, opts) {
    var p = opts.period;
    switch (type) {
      case '201':
        return headerTable([
          hcell('1. Incident name', incidentName(ctx, false), 2),
          hcell('2. Incident number', ctx.incident.number),
          hcell('3. Date/time initiated', valueText({ kind: 'datetime' }, data.initiated, ctx))
        ]);
      case '202':
      case '203':
      case '204':
      case '205A':
      case '206':
      case '208':
      case '215':
        return headerTable([
          hcell('1. Incident name', incidentName(ctx, true)),
          hcell('2. Operational period', periodText(p, ctx))
        ]);
      case '215A':
        return headerTable([
          hcell('1. Incident name', incidentName(ctx, false)),
          hcell('2. Incident number', ctx.incident.number),
          hcell('3. Date/time prepared', valueText({ kind: 'datetime' }, data.preparedAt, ctx)),
          hcell('4. Operational period', periodText(p, ctx))
        ]);
      case '209':
      case '221':
        return headerTable([
          hcell('1. Incident name', incidentName(ctx, false), 2),
          hcell('2. Incident number', ctx.incident.number)
        ]);
      case '205':
        return headerTable([
          hcell('1. Incident name', incidentName(ctx, true)),
          hcell('2. Date/time prepared', valueText({ kind: 'datetime' }, data.preparedAt, ctx)),
          hcell('3. Operational period', periodText(p, ctx))
        ]);
      case '213':
        return headerTable([hcell('1. Incident name (optional)', incidentName(ctx, true))]);
      case '213RR':
        return headerTable([
          hcell('1. Incident name', incidentName(ctx, true)),
          hcell('2. Date/time', valueText({ kind: 'datetime' }, data.at, ctx)),
          hcell('3. Resource request number', data.number)
        ]);
      default:
        return headerTable([hcell('Incident', incidentName(ctx, true))]);
    }
  }

  function footer(def, opts, ctx, pageNo, pages) {
    var parts = [def.code];
    if (opts.iapPage) parts.push('IAP page ' + opts.iapPage);
    if (pages > 1) parts.push('Page ' + pageNo + ' of ' + pages);
    var box = h('div', { class: 'p-foot' });
    box.appendChild(h('div', { class: 'p-foot-main', text: parts.join(' | ') }));
    var audit = [];
    if (opts.versionText) audit.push(opts.versionText);
    audit.push('Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.');
    box.appendChild(h('div', { class: 'p-audit', text: audit.join(' ') }));
    (opts.signoffs || []).forEach(function (so) {
      box.appendChild(h('div', { class: 'p-audit p-signoff', text: 'Signed off in FieldICS: ' + so.role + ' ' + so.name + (so.position ? ', ' + so.position : '') +
        ', ' + ctx.fmt.dt(so.at) + (so.current ? ', for this version.' : ', for an earlier version.') }));
    });
    if (opts.conflict) {
      box.appendChild(h('div', { class: 'p-warn', text: 'This form has separate versions that have not been compared yet. This printout shows the most recent one.' }));
    }
    if (ctx.incident && ctx.incident.exercise) box.appendChild(h('div', { class: 'p-warn', text: 'EXERCISE. This is not a real incident.' }));
    return box;
  }

  function titleText(def) {
    if (!/^ICS /.test(def.code)) return def.title.toUpperCase();
    return def.title.toUpperCase() + ' (' + def.code + ')';
  }

  /*
   * One ICS form. opts: { period, iapPage, versionText, conflict, preview }
   * Returns a <section class="p-doc">.
   */
  function form(type, data, ctx, opts) {
    opts = opts || {};
    var def = FORMS[type];
    var doc = h('section', { class: 'p-doc' + (def.wide ? ' p-wide' : '') });
    var blocks = def.blocks.filter(function (b) { return !b.header && !b.noPrint && !(b.photos && opts.blank); });

    if (type === '201') {
      var prep = blocks.filter(function (b) { return b.prepared; })[0];
      var body = blocks.filter(function (b) { return !b.prepared; });
      var pageNos = [];
      body.forEach(function (b) { if (pageNos.indexOf(b.page || 1) === -1) pageNos.push(b.page || 1); });
      pageNos.sort();
      pageNos.forEach(function (pn, i) {
        var one = page(ctx, i > 0 ? 'p-break' : '');
        one.appendChild(h('div', { class: 'p-title', text: titleText(def) }));
        one.appendChild(headerFor(type, data, ctx, opts));
        body.filter(function (b) { return (b.page || 1) === pn; }).forEach(function (b) {
          one.appendChild(renderBlock(b, data, ctx));
        });
        if (prep) one.appendChild(renderBlock(prep, data, ctx));
        one.appendChild(footer(def, opts, ctx, i + 1, pageNos.length));
        doc.appendChild(one);
      });
      return doc;
    }

    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: titleText(def) }));
    pg.appendChild(headerFor(type, data, ctx, opts));

    if (def.twoColumn) {
      var cols = h('div', { class: 'p-cols' });
      var left = h('div', { class: 'p-col' });
      var right = h('div', { class: 'p-col' });
      blocks.forEach(function (b) {
        if (b.col === 'left') left.appendChild(renderBlock(b, data, ctx, true));
        else if (b.col === 'right') right.appendChild(renderBlock(b, data, ctx, true));
      });
      cols.appendChild(left);
      cols.appendChild(right);
      pg.appendChild(cols);
      blocks.filter(function (b) { return !b.col; }).forEach(function (b) {
        pg.appendChild(renderBlock(b, data, ctx));
      });
    } else {
      var section = null;
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        /* Long forms (ICS 209) start some blocks on a new page, as the paper form does. */
        if (b.pageBreak) pg.appendChild(h('div', { class: 'p-break p-pagebreak' }));
        if (b.section && b.section !== section) {
          section = b.section;
          if (section !== 'Requestor') pg.appendChild(h('div', { class: 'p-section', text: section.toUpperCase() }));
        }
        var next = blocks[i + 1];
        if (b.w === 'half' && next && next.w === 'half' && !next.section) {
          pg.appendChild(h('div', { class: 'p-pair' }, renderBlock(b, data, ctx, true), renderBlock(next, data, ctx, true)));
          i++;
        } else {
          pg.appendChild(renderBlock(b, data, ctx));
        }
      }
    }
    pg.appendChild(footer(def, opts, ctx, 1, 1));
    doc.appendChild(pg);
    return doc;
  }

  /*
   * ICS 214 activity log.
   * opts: { entries, person: {name, position} | null, period: {start, end} | null,
   *         agency, preparedBy, preparedPosition, corrections: Map, byId: Map }
   */
  function log214(ctx, opts) {
    var doc = h('section', { class: 'p-doc' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: 'ACTIVITY LOG (ICS 214)' }));
    var list = opts.entries;
    var rangeText;
    if (opts.period) {
      rangeText = periodText(opts.period, ctx);
    } else if (list.length) {
      rangeText = 'From ' + ctx.fmt.dt(list[0].ts) + '  to  ' + ctx.fmt.dt(list[list.length - 1].ts) + ' (all entries)';
    } else {
      rangeText = '';
    }
    pg.appendChild(headerTable([
      hcell('1. Incident name', incidentName(ctx, true)),
      hcell('2. Operational period', rangeText)
    ]));
    pg.appendChild(headerTable([
      hcell('3. Name', opts.person ? opts.person.name : 'All personnel (combined log)'),
      hcell('4. ICS position', opts.person ? opts.person.position : ''),
      hcell('5. Home agency (and unit)', opts.agency)
    ]));

    var resources = h('div', { class: 'p-bb' });
    resources.appendChild(gridTable([
      { k: 'name', label: 'Name', kind: 'text' },
      { k: 'position', label: 'ICS position', kind: 'text' },
      { k: 'agency', label: 'Home agency (and unit)', kind: 'text' }
    ], opts.person ? [] : (opts.people || []).map(function (p) {
      return { name: p.name, position: p.position, agency: '' };
    }), ctx, opts.person ? 4 : 0));
    pg.appendChild(blockBox('6. Resources assigned', resources));

    var columns = [{ k: 'when', label: 'Date/time', kind: 'text' }];
    if (!opts.person) columns.push({ k: 'who', label: 'Name', kind: 'text' });
    columns.push({ k: 'what', label: 'Notable activities', kind: 'text' });
    var rows = list.map(function (e) {
      var text = e.text;
      if (e.corrects) {
        var o = opts.byId.get(e.corrects);
        text = 'CORRECTION' + (o ? ' of entry at ' + ctx.fmt.dt(o.ts) + ' by ' + o.author : '') + ':\n' + text;
      }
      if (opts.corrections.get(e.id)) text += '\n[Corrected by a later entry]';
      if (e.photos && e.photos.length) text += '\n[' + e.photos.length + (e.photos.length === 1 ? ' photo' : ' photos') + (opts.photoNote ? ', see photo appendix' : '') + ']';
      return { when: ctx.fmt.dt(e.ts), who: e.author + (e.position ? ', ' + e.position : ''), what: text };
    });
    var log = h('div', { class: 'p-bb' });
    var table = gridTable(columns, rows, ctx, rows.length ? 0 : (opts.blankRows || 12));
    table.classList.add('p-log');
    log.appendChild(table);
    pg.appendChild(blockBox('7. Activity log', log));

    var prep = h('div', { class: 'p-bb' });
    prep.appendChild(kvTable([
      { label: 'Name', value: opts.preparedBy },
      { label: 'Position/title', value: opts.preparedPosition },
      { label: 'Signature', value: '', sig: true },
      { label: 'Date/time', value: ctx.fmt.dt(ctx.printedAt) }
    ], 2));
    pg.appendChild(blockBox('8. Prepared by', prep));
    var box = h('div', { class: 'p-foot' });
    box.appendChild(h('div', { class: 'p-foot-main', text: opts.blank ? 'ICS 214' : 'ICS 214 | ' + list.length + ' entr' + (list.length === 1 ? 'y' : 'ies') }));
    if (ctx.incident && ctx.incident.exercise) box.appendChild(h('div', { class: 'p-warn', text: 'EXERCISE. This is not a real incident.' }));
    box.appendChild(h('div', { class: 'p-audit', text: 'Times are local to the device that printed this. Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.' }));
    pg.appendChild(box);
    doc.appendChild(pg);
    return doc;
  }

  /* ---------- PA cost summary ---------- */

  function money(ctx, n) {
    return ctx.fmt.money(n);
  }

  function sumRow(label, span, value, cols) {
    var tr = h('tr', { class: 'p-sum' });
    tr.appendChild(h('td', { colspan: String(span), text: label }));
    tr.appendChild(h('td', { class: 'p-num', text: value }));
    for (var i = span + 1; i < cols; i++) tr.appendChild(h('td', { text: '' }));
    return tr;
  }

  function costTable(headers, rows, numericFrom) {
    var head = h('tr');
    headers.forEach(function (x, i) { head.appendChild(h('th', { class: i >= numericFrom ? 'p-num' : null, text: x })); });
    var body = h('tbody');
    rows.forEach(function (r) {
      if (r.nodeType) {
        body.appendChild(r);
        return;
      }
      var tr = h('tr', { class: [r.flag ? 'p-flag' : '', r.cls || ''].join(' ').trim() || null });
      r.cells.forEach(function (c, i) { tr.appendChild(h('td', { class: i >= numericFrom ? 'p-num' : null, text: c || '' })); });
      body.appendChild(tr);
    });
    if (!rows.length) {
      var none = h('tr');
      none.appendChild(h('td', { colspan: String(headers.length), text: 'No entries.' }));
      body.appendChild(none);
    }
    return h('table', { class: 'p-grid p-cost' }, h('thead', null, head), body);
  }

  function catLabel(c) {
    return c ? c : '';
  }

  function laborSection(items, ctx) {
    var rows = [];
    var byName = new Map();
    items.forEach(function (x) {
      var key = (x.data.name || '').toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(x);
    });
    var names = Array.from(byName.keys()).sort();
    var regT = 0;
    var otT = 0;
    var flaggedT = 0;
    names.forEach(function (key) {
      var group = byName.get(key);
      var reg = 0;
      var ot = 0;
      var hours = 0;
      group.forEach(function (x) {
        var d = x.data;
        reg += x.cost.regCents;
        ot += x.cost.otCents;
        hours += x.cost.hours;
        if (x.cost.flagged) flaggedT += x.cost.flaggedCents;
        rows.push({
          flag: x.cost.missingRate,
          cells: [
            ctx.fmt.day(d.date), d.name, d.jobTitle, [d.personType, d.budgeted ? 'Budgeted: ' + d.budgeted : ''].filter(Boolean).join(', '),
            catLabel(d.category), d.site,
            d.regHours === null ? '' : String(d.regHours), d.otHours === null ? '' : String(d.otHours),
            d.regRate === null ? (d.regHours ? 'needed' : '') : ctx.fmt.rate(d.regRate),
            d.otRate === null ? (d.otHours ? 'needed' : '') : ctx.fmt.rate(d.otRate),
            d.fringeReg === null ? '' : d.fringeReg + '%', d.fringeOt === null ? '' : d.fringeOt + '%',
            money(ctx, x.cost.reg) + (x.cost.flagged ? ' *' : ''), money(ctx, x.cost.ot), money(ctx, x.cost.total)
          ]
        });
      });
      regT += reg;
      otT += ot;
      var sub = h('tr', { class: 'p-sum' });
      sub.appendChild(h('td', { colspan: '6', text: 'Subtotal: ' + group[0].data.name + ' (' + hours + ' hours)' }));
      for (var i = 0; i < 6; i++) sub.appendChild(h('td', { text: '' }));
      sub.appendChild(h('td', { class: 'p-num', text: money(ctx, reg / 100) }));
      sub.appendChild(h('td', { class: 'p-num', text: money(ctx, ot / 100) }));
      sub.appendChild(h('td', { class: 'p-num', text: money(ctx, (reg + ot) / 100) }));
      rows.push(sub);
    });
    var total = h('tr', { class: 'p-sum p-total' });
    total.appendChild(h('td', { colspan: '12', text: 'Total cost for force account labor (regular time, overtime, total)' }));
    total.appendChild(h('td', { class: 'p-num', text: money(ctx, regT / 100) }));
    total.appendChild(h('td', { class: 'p-num', text: money(ctx, otT / 100) }));
    total.appendChild(h('td', { class: 'p-num', text: money(ctx, (regT + otT) / 100) }));
    if (items.length) rows.push(total);
    var table = costTable(['Date', 'Name', 'Job title', 'Type', 'Cat.', 'Site', 'Reg hrs', 'OT hrs', 'Reg rate', 'OT rate', 'Fringe reg', 'Fringe OT', 'Regular cost', 'Overtime cost', 'Total'], rows, 6);
    if (!flaggedT) return table;
    var box = h('div');
    box.appendChild(table);
    box.appendChild(h('p', { class: 'p-cert p-flagnote', text: '* Straight time of budgeted employees on Category A or B (emergency) work: ' + money(ctx, flaggedT / 100) +
      '. FEMA generally reimburses only overtime for budgeted employees on emergency work. It is included in the totals so the full cost is documented.' }));
    return box;
  }

  function simpleSection(type, items, ctx) {
    var rows = [];
    var totalCents = 0;
    var headers;
    var numericFrom;
    items.forEach(function (x) {
      var d = x.data;
      totalCents += x.cost.totalCents;
      var cells;
      if (type === 'equipment') {
        cells = [ctx.fmt.day(d.date), d.description, d.code, d.unitId, d.operator, catLabel(d.category), d.site,
          d.usage === null ? '' : d.usage + ' ' + (d.usageUnit || 'Hours').toLowerCase(),
          d.rate === null ? (d.usage ? 'needed' : '') : ctx.fmt.rate(d.rate) + (d.rateSource ? ' (' + d.rateSource + ')' : ''),
          money(ctx, x.cost.total)];
      } else if (type === 'materials') {
        cells = [d.description, d.vendor, d.obtained, catLabel(d.category), d.site,
          ctx.fmt.day(d.purchaseDate), ctx.fmt.day(d.usedDate), d.invoice,
          d.qtyPurchased === null ? '' : String(d.qtyPurchased), d.qtyUsed === null ? '' : String(d.qtyUsed),
          d.unitPrice === null ? 'needed' : ctx.fmt.rate(d.unitPrice) + (d.unit ? '/' + d.unit : ''),
          money(ctx, x.cost.total)];
      } else if (type === 'rentals') {
        cells = [d.description, d.vendor, d.code, catLabel(d.category), d.site,
          [ctx.fmt.day(d.startDate), ctx.fmt.day(d.endDate)].filter(Boolean).join(' to '),
          d.withOperator ? 'Operator: ' + d.withOperator + (d.operator ? ' (' + d.operator + ')' : '') : d.operator,
          d.invoice, ctx.fmt.day(d.datePaid),
          d.hours === null ? '' : String(d.hours), d.rate,
          d.amount === null ? 'needed' : money(ctx, x.cost.total)];
      } else if (type === 'travel') {
        cells = [ctx.fmt.day(d.date), d.kind, d.name, d.description, d.vendor, catLabel(d.category), d.site, d.receipt,
          d.qty === null ? '' : d.qty + (d.unit ? ' ' + d.unit : ''),
          d.rate === null ? '' : ctx.fmt.rate(d.rate),
          x.cost.missingRate ? 'needed' : money(ctx, x.cost.total)];
      } else {
        var file = (d.procChecks || []).length;
        cells = [d.contractor, d.description, d.contractNumber,
          [d.procurement, d.contractType, file ? 'File checklist: ' + file + ' of ' + Forms.PROC_CHECKS.length : ''].filter(Boolean).join('; '),
          catLabel(d.category), d.site,
          [ctx.fmt.day(d.startDate), ctx.fmt.day(d.endDate)].filter(Boolean).join(' to '),
          d.invoice, ctx.fmt.day(d.datePaid),
          d.amount === null ? 'needed' : money(ctx, x.cost.total)];
      }
      rows.push({ flag: x.cost.missingRate, cells: cells });
    });
    if (type === 'equipment') {
      headers = ['Date', 'Type of equipment', 'FEMA code', 'Unit', 'Operator', 'Cat.', 'Site', 'Used', 'Rate', 'Total'];
      numericFrom = 7;
    } else if (type === 'materials') {
      headers = ['Description', 'Vendor', 'Obtained', 'Cat.', 'Site', 'Purchased', 'Used', 'Invoice', 'Qty bought', 'Qty used', 'Unit price', 'Total'];
      numericFrom = 8;
    } else if (type === 'rentals') {
      headers = ['Type of equipment', 'Vendor', 'Code', 'Cat.', 'Site', 'Dates used', 'Operator', 'Invoice', 'Date paid', 'Hours', 'Rate', 'Amount'];
      numericFrom = 9;
    } else if (type === 'travel') {
      headers = ['Date', 'Kind', 'Person or crew', 'Description', 'Vendor', 'Cat.', 'Site', 'Receipt', 'Quantity', 'Rate', 'Amount'];
      numericFrom = 8;
    } else {
      headers = ['Contractor', 'Description of work', 'Contract/PO', 'Procurement and type', 'Cat.', 'Site', 'Dates worked', 'Invoice', 'Date paid', 'Amount'];
      numericFrom = 9;
    }
    if (items.length) rows.push(sumRow('Total', headers.length - 1, money(ctx, totalCents / 100), headers.length));
    return costTable(headers, rows, numericFrom);
  }

  /* Donated resources, valued separately. Not included in the cost totals above. */
  function donatedSection(items, totals, ctx) {
    var rows = items.map(function (x) {
      var d = x.data;
      var what;
      var basis;
      if (x.type === 'labor') {
        what = 'Volunteer labor: ' + d.name + (d.jobTitle ? ' (' + d.jobTitle + ')' : '');
        basis = x.cost.hours + ' hrs at ' + (d.regRate === null ? 'rate needed' : ctx.fmt.rate(d.regRate) + (d.fringeReg ? ' + ' + d.fringeReg + '% fringe' : '') + ', straight time');
      } else if (x.type === 'equipment') {
        what = 'Equipment: ' + d.description + (d.donor ? ', donated by ' + d.donor : '');
        basis = (d.usage === null ? '' : d.usage + ' ' + (d.usageUnit || 'Hours').toLowerCase()) + (d.rate === null ? ', rate needed' : ' at ' + ctx.fmt.rate(d.rate) + (d.rateSource ? ' (' + d.rateSource + ')' : ''));
      } else {
        var q = d.qtyUsed !== null ? d.qtyUsed : d.qtyPurchased;
        what = 'Materials: ' + d.description + (d.donor ? ', donated by ' + d.donor : '');
        basis = (q === null ? '' : q + (d.unit ? ' ' + d.unit : '')) + (d.unitPrice === null ? ', value needed' : ' at ' + ctx.fmt.rate(d.unitPrice));
      }
      return { flag: x.cost.missingRate, cells: [ctx.fmt.day(x.date), what, catLabel(d.category), d.site, d.work || '', basis, money(ctx, x.cost.total)] };
    });
    rows.push(sumRow('Total donated value', 6, money(ctx, totals.total), 7));
    var body = h('div', { class: 'p-bb' });
    body.appendChild(h('p', { class: 'p-cert', text: 'Not included in the totals above. Donated resources used for eligible emergency work can be credited toward the non-federal share. FEMA and the state decide. Volunteer labor is valued at straight time plus fringe benefits for similar work.' }));
    body.appendChild(costTable(['Date', 'Resource', 'Cat.', 'Site', 'Work performed', 'Basis', 'Value'], rows, 6));
    return blockBox('Donated resources', body);
  }

  /*
   * Photos printed large, two to a row, with a caption saying what each belongs to.
   * items: [{ id, caption }]. Returns a <section class="p-doc"> or null when empty.
   */
  function photoAppendix(ctx, items, title) {
    if (!items.length) return null;
    var doc = h('section', { class: 'p-doc' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: (title || 'PHOTO APPENDIX') }));
    pg.appendChild(headerTable([hcell('Incident', incidentName(ctx, true)), hcell('Photos', String(items.length))]));
    var grid = h('div', { class: 'p-appendix' });
    items.forEach(function (it, i) {
      var att = ctx.attachment(it.id);
      var cell = h('figure', { class: 'p-fig' });
      if (att) cell.appendChild(h('img', { class: 'p-figimg', src: att.data, alt: it.caption }));
      else cell.appendChild(h('div', { class: 'p-figimg p-missing', text: 'This photo is not on this device. Import a package that includes photos.' }));
      cell.appendChild(h('figcaption', { class: 'p-cap', text: (i + 1) + '. ' + it.caption + (att && att.at ? ' Added ' + ctx.fmt.dt(att.at) + (att.by ? ' by ' + att.by : '') + '.' : '') }));
      grid.appendChild(cell);
    });
    pg.appendChild(grid);
    var foot = h('div', { class: 'p-foot' });
    foot.appendChild(h('div', { class: 'p-audit', text: 'Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.' }));
    pg.appendChild(foot);
    doc.appendChild(pg);
    return doc;
  }

  /*
   * Working notes, for a shift handoff or briefing. Not an ICS form.
   * rows: [{ time, by, kind, text, status }]; opts.filtered: the list is a filtered view.
   */
  function notesList(ctx, rows, opts) {
    opts = opts || {};
    var doc = h('section', { class: 'p-doc' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: 'INCIDENT NOTES' }));
    pg.appendChild(headerTable([
      hcell('Incident', incidentName(ctx, true)),
      hcell('Notes', String(rows.length) + (opts.filtered ? ' (filtered view)' : '')),
      hcell('Printed', ctx.fmt.dt(ctx.printedAt))
    ]));
    var body = h('div', { class: 'p-bb' });
    body.appendChild(h('p', { class: 'p-cert', text: 'Working notes. Only entries added to the ICS 214 are part of the activity log.' }));
    body.appendChild(costTable(['Time', 'By', 'Kind', 'Note', 'Status'], rows.map(function (r) {
      return { cells: [ctx.fmt.dt(r.time), r.by, r.kind, r.text, r.status] };
    }), 99));
    pg.appendChild(blockBox('Notes, pinned first, then newest first', body));
    var foot = h('div', { class: 'p-foot' });
    foot.appendChild(h('div', { class: 'p-audit', text: 'Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.' }));
    pg.appendChild(foot);
    doc.appendChild(pg);
    return doc;
  }

  /*
   * PA cost summary.
   * opts: { records: [{type, data, cost, date}], summary (core.costSummary), types: [..],
   *         category, site, preparedBy, preparedTitle }
   */
  function costSummary(ctx, opts) {
    var inc = ctx.incident;
    var doc = h('section', { class: 'p-doc p-wide' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: 'PUBLIC ASSISTANCE COST DOCUMENTATION SUMMARY' }));
    var s = opts.summary;
    pg.appendChild(headerTable([
      hcell('Applicant', inc.applicant),
      hcell('FEMA PA ID', inc.paId),
      hcell('Disaster number', inc.disasterNumber),
      hcell('Incident', incidentName(ctx, true))
    ]));
    var catOpt = opts.category ? Forms.CATEGORY_LIST.filter(function (c) { return c[0] === opts.category; })[0] : null;
    pg.appendChild(headerTable([
      hcell('Category of work', catOpt ? catOpt[1] : 'All categories'),
      hcell('Location or site', opts.site || 'All sites'),
      hcell('Period covering', s.firstDate ? ctx.fmt.day(s.firstDate) + ' to ' + ctx.fmt.day(s.lastDate) : ''),
      hcell('Total documented', money(ctx, s.total))
    ]));

    var totals = [];
    opts.types.forEach(function (t) {
      var x = s.types[t];
      totals.push({ cells: [FORMS[t].title, String(x.count), x.missing ? x.missing + ' need a rate or amount' : '', money(ctx, x.total)], flag: x.missing > 0 });
    });
    var totalsBox = h('div', { class: 'p-bb' }, costTable(['Type', 'Entries', 'Missing', 'Total'], totals, 3));
    if (s.budgetedST && s.budgetedST.count && opts.types.indexOf('labor') !== -1) {
      totalsBox.appendChild(kvTable([
        { label: 'Included above: straight time of budgeted employees on Category A or B work (generally not eligible)', value: money(ctx, s.budgetedST.total) },
        { label: 'Total documented without that straight time', value: money(ctx, s.totalLessBudgetedST) }
      ], 2));
    }
    if (s.altDebris) {
      totalsBox.appendChild(h('p', { class: 'p-cert', text: 'The applicant elected the PA alternative procedures for debris removal, so straight time of budgeted employees on Category A work is not set apart.' }));
    }
    pg.appendChild(blockBox('Totals by type', totalsBox));

    opts.types.forEach(function (t) {
      var items = opts.records.filter(function (x) { return x.type === t && !x.cost.donated; });
      var body = h('div', { class: 'p-bb' });
      body.appendChild(t === 'labor' ? laborSection(items, ctx) : simpleSection(t, items, ctx));
      pg.appendChild(blockBox(FORMS[t].summaryTitle || FORMS[t].title, body));
    });

    var gifts = opts.records.filter(function (x) { return x.cost.donated && opts.types.indexOf(x.type) !== -1; });
    if (gifts.length) pg.appendChild(donatedSection(gifts, s.donated, ctx));

    var cert = h('div', { class: 'p-bb' });
    cert.appendChild(h('p', { class: 'p-cert', text: 'I certify that the information above was obtained from payroll records, invoices, or other documents that are available for audit.' }));
    cert.appendChild(kvTable([
      { label: 'Certified by', value: opts.preparedBy },
      { label: 'Title', value: opts.preparedTitle },
      { label: 'Signature', value: '', sig: true },
      { label: 'Date', value: '' }
    ], 2));
    pg.appendChild(blockBox('Certification', cert));
    var foot = h('div', { class: 'p-foot' });
    foot.appendChild(h('div', { class: 'p-foot-main', text: 'Cost documentation summary | rows marked with a left bar need a rate or amount' }));
    foot.appendChild(h('div', { class: 'p-audit', text: 'Prepared to organize cost documentation. Eligibility is determined under the FEMA Public Assistance Program and Policy Guide. Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.' }));
    pg.appendChild(foot);
    doc.appendChild(pg);
    return doc;
  }

  /* ---------- ICS 211 check-in list ---------- */

  var COLS_211 = [
    { k: 'state', label: 'State', kind: 'text' },
    { k: 'agency', label: 'Agency', kind: 'text' },
    { k: 'category', label: 'Category', kind: 'text' },
    { k: 'kind', label: 'Kind', kind: 'text' },
    { k: 'type', label: 'Type', kind: 'text' },
    { k: 'identifier', label: 'Resource name or identifier', kind: 'text' },
    { k: 'stTf', label: 'ST or TF', kind: 'text' },
    { k: 'orderNumber', label: '6. Order request #', kind: 'text' },
    { k: 'checkIn', label: '7. Date/time check-in', kind: 'datetime' },
    { k: 'leader', label: "8. Leader's name", kind: 'text' },
    { k: 'persons', label: '9. Total # of personnel', kind: 'int' },
    { k: 'contact', label: '10. Incident contact information', kind: 'text' },
    { k: 'homeUnit', label: '11. Home unit or agency', kind: 'text' },
    { k: 'departure', label: '12. Departure point, date and time', kind: 'text' },
    { k: 'travel', label: '13. Method of travel', kind: 'text' },
    { k: 'assignment', label: '14. Incident assignment', kind: 'text' },
    { k: 'qualifications', label: '15. Other qualifications', kind: 'text' },
    { k: 'toRU', label: '16. Data provided to Resources Unit', kind: 'text' }
  ];

  /*
   * ICS 211 Incident Check-In List. One sheet per check-in location.
   * opts: { records: [data], preparedBy, preparedPosition, blank, blankRows }
   */
  function checkin211(ctx, opts) {
    var groups = new Map();
    (opts.records || []).forEach(function (d) {
      var key = (d.location || '') + '|' + (d.locationName || '').toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    if (!groups.size) groups.set('|', []);
    var doc = h('section', { class: 'p-doc p-wide' });
    var first = true;
    groups.forEach(function (list) {
      list.sort(function (a, b) { return (a.checkIn || '') < (b.checkIn || '') ? -1 : 1; });
      var pg = page(ctx, first ? '' : 'p-break');
      first = false;
      var loc = list[0] || {};
      pg.appendChild(h('div', { class: 'p-title', text: 'INCIDENT CHECK-IN LIST (ICS 211)' }));
      var boxes = Forms.CHECKIN_LOCATIONS.map(function (l) {
        return (loc.location === l ? '[X] ' : '[  ] ') + l;
      }).join('   ') + (loc.locationName ? '   ' + loc.locationName : '');
      pg.appendChild(headerTable([
        hcell('1. Incident name', incidentName(ctx, false)),
        hcell('2. Incident number', opts.blank ? '' : ctx.incident.number),
        hcell('3. Check-in location', opts.blank ? Forms.CHECKIN_LOCATIONS.map(function (l) { return '[  ] ' + l; }).join('   ') : boxes, 2),
        hcell('4. Start date/time', list.length ? ctx.fmt.dt(list[0].checkIn) : '')
      ]));
      var body = h('div', { class: 'p-bb' });
      body.appendChild(h('div', { class: 'p-sub', text: '5. List single resource personnel (overhead) by agency and name, or list resources by the following format' }));
      var table = gridTable(COLS_211, list, ctx, opts.blank ? (opts.blankRows || 14) : Math.max(0, 6 - list.length));
      table.classList.add('p-211');
      body.appendChild(table);
      pg.appendChild(blockBox('Check-in information', body));
      var prep = h('div', { class: 'p-bb' });
      prep.appendChild(kvTable([
        { label: 'Name', value: opts.preparedBy },
        { label: 'Position/title', value: opts.preparedPosition },
        { label: 'Signature', value: '', sig: true },
        { label: 'Date/time', value: opts.blank ? '' : ctx.fmt.dt(ctx.printedAt) }
      ], 4));
      pg.appendChild(blockBox('17. Prepared by', prep));
      var foot = h('div', { class: 'p-foot' });
      foot.appendChild(h('div', { class: 'p-foot-main', text: 'ICS 211' + (opts.blank ? '' : ' | ' + list.length + (list.length === 1 ? ' check-in' : ' check-ins')) }));
      if (!opts.blank) foot.appendChild(h('div', { class: 'p-audit', text: 'Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.' }));
      pg.appendChild(foot);
      doc.appendChild(pg);
    });
    return doc;
  }

  /* ---------- paper backup kit ---------- */

  var SHEETS = {
    labor: {
      title: 'DAILY LABOR SIGN-IN SHEET (FORCE ACCOUNT LABOR)',
      note: 'One line per person per day. Volunteers sign here too: mark Type V. Rates are filled in later by finance.',
      cols: ['Date', 'Name (print)', 'Job title', 'Department or agency', 'Type (E, MA, V)', 'Time in', 'Time out', 'Reg hrs', 'OT hrs', 'Work performed and site', 'Cat.', 'Signature']
    },
    equipment: {
      title: 'EQUIPMENT USE LOG (FORCE ACCOUNT EQUIPMENT)',
      note: 'One line per piece of equipment per day. Record hours actually used, or miles for vehicles. Mark donated equipment and the donor.',
      cols: ['Date', 'Type of equipment (size, make, model)', 'Unit #', 'FEMA code', 'Operator', 'Meter start', 'Meter end', 'Hours or miles', 'Work performed and site', 'Cat.', 'Donated by']
    },
    materials: {
      title: 'MATERIALS, PURCHASES, AND DONATIONS LOG',
      note: 'Keep every receipt and invoice with this sheet. Mark how each item was obtained: P purchased, S from stock, D donated.',
      cols: ['Date', 'Description', 'Vendor or donor', 'P / S / D', 'Qty', 'Unit', 'Unit price', 'Total', 'Invoice or receipt #', 'Used at (site)', 'Cat.']
    }
  };

  /* A blank log sheet for writing by hand when the app is not available. */
  function blankSheet(ctx, kind, rows) {
    var def = SHEETS[kind];
    var doc = h('section', { class: 'p-doc p-wide' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: def.title }));
    var loc = ctx.locality || {};
    pg.appendChild(headerTable([
      hcell('Incident name', ctx.incident && ctx.incident.name !== '' ? ctx.incident.name : ''),
      hcell('Applicant', loc.applicant || loc.name || ''),
      hcell('Location or site', ''),
      hcell('Category of work', 'A  B  C  D  E  F  G'),
      hcell('Page', '____ of ____')
    ]));
    var body = h('div', { class: 'p-bb' });
    body.appendChild(h('p', { class: 'p-note', text: def.note }));
    body.appendChild(gridTable(def.cols.map(function (c, i) { return { k: 'c' + i, label: c, kind: 'text' }; }), [], ctx, rows || 16));
    pg.appendChild(blockBox('Entries', body));
    var cert = h('div', { class: 'p-bb' });
    cert.appendChild(kvTable([
      { label: 'Recorded by', value: '' }, { label: 'Position/title', value: '' },
      { label: 'Signature', value: '', sig: true }, { label: 'Date', value: '' }
    ], 4));
    pg.appendChild(blockBox('Recorded by', cert));
    pg.appendChild(h('div', { class: 'p-foot' }, h('div', { class: 'p-audit', text: 'FieldICS paper backup kit. Enter these records into FieldICS when it is available, and keep the original sheet.' })));
    doc.appendChild(pg);
    return doc;
  }

  /* Cover page for the paper backup kit. contents: [string] */
  function paperCover(ctx, contents) {
    var doc = h('section', { class: 'p-doc' });
    var pg = page(ctx);
    var loc = ctx.locality || {};
    pg.appendChild(h('div', { class: 'p-title p-cover-title', text: 'PAPER BACKUP KIT' }));
    pg.appendChild(h('p', { class: 'p-cover-sub', text: [loc.name, loc.agency].filter(Boolean).join(' | ') || 'FieldICS' }));
    var how = h('div', { class: 'p-bb' });
    [
      'Use these forms when phones or laptops are down, out of battery, or not allowed. They follow the same ICS block numbers as FieldICS, so the paper and the app match.',
      'Write the incident name and operational period on every page. Use 24-hour time.',
      'Each person keeps their own ICS 214 activity log. Never erase: draw one line through a mistake, write the correction, and initial it.',
      'Sign people and equipment in and out on the ICS 211 and the daily labor and equipment sheets. FEMA Public Assistance needs hours by person and by piece of equipment, by day.',
      'Keep every receipt, invoice, and delivery ticket with the materials log.',
      'When the app is back, the Documentation Unit enters the paper records or photographs each page into the matching entry. File the originals with the incident records.'
    ].forEach(function (t, i) { how.appendChild(h('p', { class: 'p-step', text: (i + 1) + '. ' + t })); });
    pg.appendChild(blockBox('How to use this kit', how));
    var list = h('div', { class: 'p-bb' });
    contents.forEach(function (c) { list.appendChild(h('p', { class: 'p-step', text: '[  ]  ' + c })); });
    pg.appendChild(blockBox('In this kit', list));
    pg.appendChild(h('div', { class: 'p-foot' }, h('div', { class: 'p-audit', text: 'Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '. Print a fresh kit after changing the locality setup.' })));
    doc.appendChild(pg);
    return doc;
  }

  /* ---------- pilot metrics ---------- */

  /* rep: FieldMetrics.report(). opts: { title, device, period } */
  function metricsReport(ctx, rep, opts) {
    opts = opts || {};
    var doc = h('section', { class: 'p-doc p-wide' });
    var pg = h('div', { class: 'p-page' });
    pg.appendChild(h('div', { class: 'p-title', text: 'FIELDICS PILOT METRICS' }));
    pg.appendChild(headerTable([
      hcell('Locality', (ctx.locality && (ctx.locality.name || ctx.locality.agency)) || ''),
      hcell('Device', opts.device || ''),
      hcell('Report date', ctx.fmt.dt(ctx.printedAt)),
      hcell('Incidents on this device', String(rep.rows.length))
    ]));
    function totalsTable(t, label) {
      var rows = [
        ['Incidents', t.count], ['ICS 214 entries', t.logEntries], ['Forms', t.formsTotal], ['Form versions saved', t.versions],
        ['Operational periods', t.periods], ['Periods with 202, 203, and 204s', t.iapComplete], ['Check-ins', t.checkIns],
        ['Separate edits combined', t.conflictsResolved], ['Cost entries', t.costEntries],
        ['Cost entries with a rate or amount', t.costEntries ? t.costEntriesComplete + ' (' + Math.round(100 * t.costEntriesComplete / t.costEntries) + '%)' : '0'],
        ['Costs documented', ctx.fmt.money(t.costTotal)], ['Budgeted straight time set apart', ctx.fmt.money(t.budgetedST || 0)],
        ['Donated resources documented', ctx.fmt.money(t.donatedValue)], ['Photos', t.photos], ['Notes', t.notes || 0],
        ['Homes / public facilities assessed', (t.homesAssessed || 0) + ' / ' + (t.sitesAssessed || 0)],
        ['Volunteer sign-ins / hours', (t.volunteers || 0) + ' / ' + (t.volunteerHours || 0)], ['Sign-offs', t.signoffs || 0],
        ['Package files saved / imported', t.exports + ' / ' + t.imports], ['QR transfers sent / received', t.qrSent + ' / ' + t.qrReceived],
        ['Print jobs / PDFs saved', t.prints + ' / ' + t.pdfs], ['Closed out / archives made', (t.closedOut || 0) + ' / ' + (t.closeouts || 0)]
      ].map(function (r) { return { label: r[0], value: String(r[1]) }; });
      return blockBox(label, h('div', { class: 'p-bb p-metrics' }, kvTable(rows, 2)));
    }
    pg.appendChild(h('div', { class: 'p-pair' }, totalsTable(rep.real, 'Real incidents'), totalsTable(rep.exercise, 'Exercises')));
    var cols = ['Incident', 'Kind', 'Created', 'Hours active', '214 entries', 'Forms', 'Periods', 'Full IAPs', 'Min. to 201', 'Min. to 202', 'Check-ins', 'Cost entries', 'Complete', 'Costs', 'Donated', 'People', 'Devices', 'Shared'];
    var rows = rep.rows.map(function (r) {
      return { cells: [r.name, r.exercise ? 'Exercise' : 'Real', ctx.fmt.dt(r.createdAt), String(r.activeHours), String(r.logEntries), String(r.formsTotal),
        String(r.periods), String(r.iapComplete), r.minutesTo201 === null ? '' : String(r.minutesTo201), r.minutesTo202 === null ? '' : String(r.minutesTo202),
        String(r.checkIns), String(r.costEntries), r.costEntries ? Math.round(100 * r.costEntriesComplete / r.costEntries) + '%' : '',
        ctx.fmt.money(r.costTotal), ctx.fmt.money(r.donatedValue), String(r.people), String(r.devices), String(r.exports + r.imports + r.qrSent + r.qrReceived)] };
    });
    pg.appendChild(blockBox('By incident', h('div', { class: 'p-bb' }, costTable(cols, rows, 3))));
    pg.appendChild(h('div', { class: 'p-foot' },
      h('div', { class: 'p-audit', text: 'Counts only. No names, messages, or form contents are included. Counts cover what is on this device; combine reports from each device, or import packages to one device first. "Shared" counts package files and QR transfers sent and received by this device.' })));
    doc.appendChild(pg);
    return doc;
  }

  /*
   * ICS 207 Incident Organization Chart, drawn from the 203 for the same period.
   * d: the 203's data. opts: { period, iapPage, versionText }
   */
  function chart207(ctx, d, opts) {
    opts = opts || {};
    var doc = h('section', { class: 'p-doc p-wide' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: 'INCIDENT ORGANIZATION CHART (ICS 207)' }));
    pg.appendChild(headerTable([hcell('1. Incident name', incidentName(ctx, true)), hcell('2. Operational period', periodText(opts.period, ctx))]));
    function box(label, value, cls) {
      return h('div', { class: 'p-org-box' + (cls ? ' ' + cls : '') }, h('span', { class: 'p-lbl', text: label }), h('span', { class: 'p-val', text: value || NBSP }));
    }
    function column(chief, items) {
      var col = h('div', { class: 'p-org-col' });
      col.appendChild(chief);
      items.forEach(function (x) { if (x) col.appendChild(x); });
      return col;
    }
    var chart = h('div', { class: 'p-org p-org-207' });
    chart.appendChild(h('div', { class: 'p-org-row p-org-top' }, box('Incident Commander(s)', [d.icuc, d.icDeputy ? 'Deputy: ' + d.icDeputy : ''].filter(Boolean).join('\n'))));
    chart.appendChild(h('div', { class: 'p-org-row p-org-staff' },
      box('Liaison Officer', d.liaison), box('Safety Officer', d.safety), box('Public Information Officer', d.pio)));
    var ops = [];
    if (d.opsDeputy) ops.push(box('Deputy', d.opsDeputy, 'p-org-sub'));
    (d.staging || []).forEach(function (s) { ops.push(box('Staging area: ' + (s.area || ''), s.name, 'p-org-sub')); });
    (d.branches || []).forEach(function (b) {
      ops.push(box([b.branch ? 'Branch ' + b.branch : '', b.unit, b.role].filter(Boolean).join(', ') || 'Branch position', b.name, 'p-org-sub'));
    });
    if (d.airOpsDirector) ops.push(box('Air Operations Branch Director', d.airOpsDirector, 'p-org-sub'));
    var plans = [box('Resources Unit', d.resourcesUnit, 'p-org-sub'), box('Situation Unit', d.situationUnit, 'p-org-sub'),
      box('Documentation Unit', d.documentationUnit, 'p-org-sub'), box('Demobilization Unit', d.demobUnit, 'p-org-sub')];
    (d.techSpecs || []).forEach(function (t) { plans.push(box('Technical specialist: ' + (t.specialty || ''), t.name, 'p-org-sub')); });
    var logs = [box('Support Branch Director', d.supportDirector, 'p-org-sub'), box('Supply Unit', d.supplyUnit, 'p-org-sub p-org-unit'),
      box('Facilities Unit', d.facilitiesUnit, 'p-org-sub p-org-unit'), box('Ground Support Unit', d.groundUnit, 'p-org-sub p-org-unit'),
      box('Service Branch Director', d.serviceDirector, 'p-org-sub'), box('Communications Unit', d.commsUnit, 'p-org-sub p-org-unit'),
      box('Medical Unit', d.medicalUnit, 'p-org-sub p-org-unit'), box('Food Unit', d.foodUnit, 'p-org-sub p-org-unit')];
    var fin = [box('Time Unit', d.timeUnit, 'p-org-sub'), box('Procurement Unit', d.procurementUnit, 'p-org-sub'),
      box('Compensation/Claims Unit', d.compClaimsUnit, 'p-org-sub'), box('Cost Unit', d.costUnit, 'p-org-sub')];
    chart.appendChild(h('div', { class: 'p-org-row p-org-sections' },
      column(box('Operations Section Chief', d.opsChief), ops),
      column(box('Planning Section Chief', [d.planChief, d.planDeputy ? 'Deputy: ' + d.planDeputy : ''].filter(Boolean).join('\n')), plans),
      column(box('Logistics Section Chief', [d.logChief, d.logDeputy ? 'Deputy: ' + d.logDeputy : ''].filter(Boolean).join('\n')), logs),
      column(box('Finance/Admin Section Chief', [d.finChief, d.finDeputy ? 'Deputy: ' + d.finDeputy : ''].filter(Boolean).join('\n')), fin)));
    pg.appendChild(blockBox('3. Organization chart', h('div', { class: 'p-bb' }, chart)));
    if ((d.agencyReps || []).length) {
      pg.appendChild(blockBox('Agency/organization representatives', h('div', { class: 'p-bb' },
        gridTable([{ k: 'agency', label: 'Agency/organization', kind: 'text' }, { k: 'name', label: 'Name', kind: 'text' }], d.agencyReps, ctx, 0))));
    }
    var prep = h('div', { class: 'p-bb' });
    prep.appendChild(kvTable([
      { label: 'Name', value: d.prepName }, { label: 'Position/title', value: d.prepPosition },
      { label: 'Signature', value: '', sig: true }, { label: 'Date/time', value: valueText({ kind: 'datetime' }, d.prepAt, ctx) }
    ], 2));
    pg.appendChild(blockBox('4. Prepared by', prep));
    pg.appendChild(footer({ code: 'ICS 207' }, { iapPage: opts.iapPage, versionText: opts.versionText ? 'Drawn from the ICS 203. ' + opts.versionText : 'Drawn from the ICS 203.' }, ctx, 1, 1));
    doc.appendChild(pg);
    return doc;
  }

  /*
   * Damage assessment summary: counts of homes by damage level, the home list, and the
   * public facility list with approximate costs. opts: { homes: [data], sites: [data], preparedBy }
   */
  function damageSummary(ctx, opts) {
    var doc = h('section', { class: 'p-doc p-wide' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: 'DAMAGE ASSESSMENT SUMMARY' }));
    pg.appendChild(headerTable([
      hcell('Incident', incidentName(ctx, true)),
      hcell('Homes assessed', String(opts.homes.length)),
      hcell('Public facilities', String(opts.sites.length)),
      hcell('Printed', ctx.fmt.dt(ctx.printedAt))
    ]));
    var t = opts.totals;
    var counts = ['Destroyed', 'Major', 'Minor', 'Affected', 'Inaccessible'].map(function (lvl) {
      return { cells: [lvl, String(t.levels[lvl] || 0), String(t.insured[lvl] || 0), String(t.uninsured[lvl] || 0), String(t.renters[lvl] || 0), String(t.primary[lvl] || 0)] };
    });
    counts.push({ cls: 'p-sum', cells: ['Total dwellings', String(t.total), String(t.insuredAll), String(t.uninsuredAll), String(t.rentersAll), String(t.primaryAll)] });
    pg.appendChild(blockBox('Individual Assistance: dwellings by damage level', h('div', { class: 'p-bb' },
      h('p', { class: 'p-cert', text: 'Multi-family buildings count each unit. "With insurance" counts homeowner\'s, renter\'s, or flood coverage; "No insurance" counts confirmed none.' }),
      costTable(['Damage level', 'Dwellings', 'With insurance', 'No insurance', 'Renters', 'Primary residences'], counts, 1))));
    var homes = opts.homes.map(function (d) {
      return {
        flag: d.review,
        cells: [d.address + (d.city ? ', ' + d.city : ''), d.dwelling + (d.dwelling === 'Multi-family' && d.units ? ' (' + d.units + ' units)' : ''), d.level,
          d.waterInches === null || d.waterInches === undefined ? '' : d.waterInches + ' in', [d.tenure, d.primary === 'Yes' ? 'primary' : ''].filter(Boolean).join(', '),
          (d.insurance || []).join(', '), geoText(d), d.assessedBy, valueText({ kind: 'datetime' }, d.assessedAt, ctx)]
      };
    });
    pg.appendChild(blockBox('Homes assessed', h('div', { class: 'p-bb' },
      costTable(['Address', 'Dwelling', 'Level', 'Water', 'Occupant', 'Insurance', 'Location', 'Assessed by', 'When'], homes, 99))));
    var total = 0;
    var sites = opts.sites.map(function (d) {
      total += typeof d.cost === 'number' ? d.cost : 0;
      return {
        cells: [d.category || '', d.name, [d.address1, d.city].filter(Boolean).join(', '), d.damage, d.cause, d.labor, d.priority,
          d.complete === null || d.complete === undefined ? '' : d.complete + '%', d.cost === null || d.cost === undefined ? 'needed' : money(ctx, d.cost)]
      };
    });
    if (opts.sites.length) sites.push(sumRow('Total approximate cost', 8, money(ctx, total), 9));
    pg.appendChild(blockBox('Public Assistance: damaged facilities and sites', h('div', { class: 'p-bb' },
      costTable(['Cat.', 'Name of damage or facility', 'Address', 'Damage', 'Cause', 'Labor', 'Priority', 'Complete', 'Approx. cost'], sites, 7))));
    var foot = h('div', { class: 'p-foot' });
    foot.appendChild(h('div', { class: 'p-foot-main', text: 'Damage assessment summary | rows marked with a left bar need a second look' }));
    foot.appendChild(h('div', { class: 'p-audit', text: 'Initial damage assessment for situational awareness and requests for assistance. Damage levels follow the FEMA damage assessment guidelines; FEMA and the state verify them. Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.' }));
    pg.appendChild(foot);
    doc.appendChild(pg);
    return doc;
  }

  /* Volunteer sign-in sheet. rows: [data]; opts.blank prints empty lines. */
  function volunteerSheet(ctx, rows, opts) {
    opts = opts || {};
    var doc = h('section', { class: 'p-doc p-wide' });
    var pg = page(ctx);
    pg.appendChild(h('div', { class: 'p-title', text: 'VOLUNTEER SIGN-IN SHEET' }));
    pg.appendChild(headerTable([hcell('Incident', opts.blank ? '' : incidentName(ctx, true)), hcell('Location', opts.site || ''), hcell('Date', opts.blank ? '' : ctx.fmt.dt(ctx.printedAt).slice(0, 11))]));
    var list = rows.map(function (d) {
      var hours = d.signIn && d.signOut ? Math.round((Date.parse(d.signOut) - Date.parse(d.signIn)) / 360000) / 10 : null;
      return { cells: [d.name, d.organization, d.phone, d.skills, d.waiver ? 'Yes' : '', d.briefed ? 'Yes' : '', valueText({ kind: 'datetime' }, d.signIn, ctx), valueText({ kind: 'datetime' }, d.signOut, ctx), hours === null ? '' : String(hours), d.work] };
    });
    var lines = opts.blank ? 22 : Math.max(list.length, 8);
    while (list.length < lines) list.push({ cls: 'p-blank', cells: ['', '', '', '', '', '', '', '', '', ''] });
    var table = costTable(['Name', 'Organization', 'Phone', 'Skills', 'Waiver', 'Safety brief', 'Time in', 'Time out', 'Hours', 'Work performed'], list, 99);
    var bodyBox = h('div', { class: 'p-bb' });
    bodyBox.appendChild(h('p', { class: 'p-cert', text: 'Every volunteer signs in and out. Hours on eligible emergency work can count toward the non-federal share of FEMA Public Assistance, valued at the rate the agency pays for similar work.' }));
    bodyBox.appendChild(table);
    pg.appendChild(blockBox('Volunteers', bodyBox));
    var foot = h('div', { class: 'p-foot' });
    foot.appendChild(h('div', { class: 'p-audit', text: 'Printed ' + ctx.fmt.dt(ctx.printedAt) + ' from ' + (ctx.appName || 'FieldICS') + '.' }));
    pg.appendChild(foot);
    doc.appendChild(pg);
    return doc;
  }

  root.FieldPrint = {
    form: form,
    chart207: chart207,
    damageSummary: damageSummary,
    volunteerSheet: volunteerSheet,
    geoText: geoText,
    log214: log214,
    costSummary: costSummary,
    photoAppendix: photoAppendix,
    notesList: notesList,
    checkin211: checkin211,
    blankSheet: blankSheet,
    paperCover: paperCover,
    metricsReport: metricsReport,
    valueText: valueText,
    optionText: optionText
  };
})(typeof self !== 'undefined' ? self : this);
