/* FieldICS: The form editor used by every form and cost entry. */
(function (A) {
  'use strict';

  var setupNames = A.later('setupNames');
  var setupSites = A.later('setupSites');
  var setupEquipment = A.later('setupEquipment');
  var photoStrip = A.later('photoStrip');
  var photoImg = A.later('photoImg');
  var signoffBar = A.later('signoffBar');
  var formCheckBar = A.later('formCheckBar');
  var extraTools = A.later('extraTools');
  var setupAutofill = A.later('setupAutofill');
  var $ = A.$;
  var C = A.C;
  var COST_NAMES = A.COST_NAMES;
  var F = A.F;
  var FORMS = A.FORMS;
  var S = A.S;
  var btn = A.btn;
  var clearStoredSession = A.clearStoredSession;
  var clone = A.clone;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var currentPeriodNumber = A.currentPeriodNumber;
  var defaultValue = A.defaultValue;
  var defaultsFor = A.defaultsFor;
  var deviceLabel = A.deviceLabel;
  var ensureSession = A.ensureSession;
  var fillDatalist = A.fillDatalist;
  var fmtDT = A.fmtDT;
  var fmtMoney = A.fmtMoney;
  var fmtShort = A.fmtShort;
  var fromLocalInput = A.fromLocalInput;
  var go = A.go;
  var h = A.h;
  var headKey = A.headKey;
  var idOf = A.idOf;
  var isoToInput = A.isoToInput;
  var markDirty = A.markDirty;
  var newSession = A.newSession;
  var nowMinute = A.nowMinute;
  var openCompare = A.later('openCompare');
  var openHistory = A.later('openHistory');
  var openPeriodDialog = A.later('openPeriodDialog');
  var parseRoute = A.parseRoute;
  var persist = A.persist;
  var plural = A.plural;
  var printSession = A.later('printSession');
  var render = A.render;
  var routeBase = A.routeBase;
  var savedLine = A.savedLine;
  var showError = A.showError;
  var toLocalInput = A.toLocalInput;
  var toast = A.toast;
  var whoName = A.whoName;

  /* ---------- form editor ---------- */

  var fieldCounter = 0;

  function nextId(k) {
    fieldCounter += 1;
    return 'f' + fieldCounter + '-' + k;
  }

  function setFieldError(input, msg) {
    var wrap = input.closest('.field');
    if (!wrap) return;
    var el = wrap.querySelector('.field-error');
    if (!el) {
      el = h('p', { class: 'field-error' });
      wrap.appendChild(el);
    }
    el.textContent = msg || '';
    el.hidden = !msg;
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function imageControl(f, obj, id, ctx) {
    var box = h('div', { class: 'image-field' });
    function draw() {
      box.textContent = '';
      var inc = cur();
      var attId = obj[f.k];
      if (attId) {
        var img = photoImg(inc, attId, { class: 'thumb', alt: f.label });
        if (img) box.appendChild(img);
        else box.appendChild(h('p', { class: 'hint', text: 'The image for this form is not on this device yet. Import a full package from the device that added it.' }));
      }
      var row = h('div', { class: 'row wrap' });
      row.appendChild(btn(attId ? 'Replace image' : 'Add photo or image', pick, '', { id: id }));
      if (attId) {
        row.appendChild(btn('Remove image', function () {
          obj[f.k] = '';
          ctx.onChange(f);
          draw();
        }, 'btn-quiet'));
      }
      box.appendChild(row);
    }
    function pick() {
      var input = $('imageFile');
      input.value = '';
      input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file) return;
        toast('Preparing image...');
        processImage(file).then(function (res) {
          var inc = cur();
          var aid = C.addAttachment(inc, { mime: res.mime, data: res.data, name: file.name, by: whoName() });
          persist(inc);
          obj[f.k] = aid;
          ctx.onChange(f);
          draw();
          toast('Image added.');
        }).catch(function (err) {
          toast(err.message);
        });
      };
      input.click();
    }
    draw();
    return box;
  }

  /* Shrinks a picture to at most opts.max pixels (default 1600) as JPEG. */
  function processImage(file, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      if (file.size > 40 * 1024 * 1024) {
        reject(new Error('That image is too large.'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var max = opts.max || 1600;
          var w = img.naturalWidth;
          var ht = img.naturalHeight;
          var scale = Math.min(1, max / Math.max(w, ht));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(ht * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var g2 = canvas.getContext('2d');
          g2.fillStyle = '#ffffff';
          g2.fillRect(0, 0, cw, ch);
          g2.drawImage(img, 0, 0, cw, ch);
          var q = opts.quality || 0.82;
          var data = canvas.toDataURL('image/jpeg', q);
          while (data.length > 3500000 && q > 0.4) {
            q -= 0.15;
            data = canvas.toDataURL('image/jpeg', q);
          }
          URL.revokeObjectURL(url);
          if (data.indexOf('data:image/jpeg;base64,') !== 0) {
            reject(new Error('This browser could not prepare the image.'));
            return;
          }
          resolve({ mime: 'image/jpeg', data: data });
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(new Error('This image could not be read.'));
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('This image could not be read. Try a JPEG or PNG photo.'));
      };
      img.src = url;
    });
  }

  function inputFor(f, obj, id, ctx, top) {
    var v = obj[f.k];
    function set(val) {
      obj[f.k] = val;
      ctx.onChange(f);
    }
    var el;
    var control = null;
    switch (f.kind) {
      case 'text':
        el = h('input', { type: 'text', id: id, maxlength: String(f.max || 200), list: f.list || null, placeholder: f.placeholder || null, autocomplete: 'off' });
        if (top && ctx.autofillKey === f.k) el.setAttribute('list', 'autofill-keys');
        el.value = v || '';
        el.addEventListener('input', function () { set(el.value); });
        el.addEventListener('change', function () { if (top) ctx.onCommit(f); });
        control = el;
        break;
      case 'textarea':
        el = h('textarea', { id: id, rows: String(f.rows || 3), maxlength: String(f.max || 8000) });
        el.value = v || '';
        el.addEventListener('input', function () { set(el.value); });
        control = el;
        break;
      case 'datetime': {
        var d = h('input', { type: 'datetime-local', id: id });
        d.value = isoToInput(v);
        d.addEventListener('input', function () { set(fromLocalInput(d.value)); });
        var nowBtn = btn('Now', function () {
          var t = nowMinute();
          d.value = toLocalInput(t);
          set(t.toISOString());
        }, 'btn-quiet btn-small', { 'aria-label': 'Set ' + f.label + ' to now' });
        el = h('div', { class: 'with-btn' }, d, nowBtn);
        control = d;
        break;
      }
      case 'date':
        el = h('input', { type: 'date', id: id });
        el.value = v || '';
        el.addEventListener('input', function () { set(el.value); });
        el.addEventListener('change', function () { set(el.value); });
        control = el;
        break;
      case 'number':
      case 'money':
      case 'percent':
      case 'int': {
        var n = h('input', { type: 'text', id: id, inputmode: f.kind === 'int' ? 'numeric' : 'decimal', autocomplete: 'off', class: 'num' });
        n.value = numText(f, v);
        n.addEventListener('input', function () {
          set(n.value);
          if (n.getAttribute('aria-invalid')) setFieldError(n, C.checkValue(f, n.value));
        });
        n.addEventListener('blur', function () { setFieldError(n, C.checkValue(f, n.value)); });
        if (f.kind === 'money') el = h('div', { class: 'affix' }, h('span', { text: '$', 'aria-hidden': 'true' }), n);
        else if (f.kind === 'percent') el = h('div', { class: 'affix' }, n, h('span', { text: '%', 'aria-hidden': 'true' }));
        else el = n;
        control = n;
        break;
      }
      case 'select': {
        var s = h('select', { id: id });
        s.appendChild(h('option', { value: '', text: 'Not set' }));
        f.options.forEach(function (o) { s.appendChild(h('option', { value: o.v, text: o.t })); });
        s.value = v || '';
        s.addEventListener('change', function () { set(s.value); if (top) ctx.onCommit(f); });
        el = s;
        control = s;
        break;
      }
      case 'image':
        el = imageControl(f, obj, id, ctx);
        break;
      case 'images':
        el = photoStrip(obj[f.k] || [], {
          id: id,
          max: f.maxPhotos || C.LIMITS.photos,
          label: f.label,
          onChange: function (ids) { set(ids); }
        });
        break;
      default:
        el = h('span', { text: '' });
    }
    if (top && control) {
      ctx.controls[f.k] = {
        set: function (val) {
          if (f.kind === 'datetime') control.value = isoToInput(val);
          else if (control.classList && control.classList.contains('num')) control.value = numText(f, val);
          else control.value = val === null || val === undefined ? '' : String(val);
        }
      };
    }
    return el;
  }

  /* Text for a number box. Stored dollar amounts show cents: 1.8 shows as 1.80. */
  function numText(f, v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (f.kind === 'money' && typeof v === 'number' && /^-?\d+(\.\d)?$/.test(s)) s = v.toFixed(2);
    return s;
  }

  function checksControl(f, obj, ctx) {
    if (!Array.isArray(obj[f.k])) obj[f.k] = [];
    var fs = h('fieldset', { class: 'field plain kind-checks' });
    fs.appendChild(h('legend', { class: f.hideLabel ? 'sr-only' : null, text: f.label }));
    var row = h('div', { class: 'checks-row' });
    f.options.forEach(function (o) {
      var id = nextId(f.k);
      var box = h('input', { type: 'checkbox', id: id, checked: obj[f.k].indexOf(o.v) !== -1 });
      box.addEventListener('change', function () {
        var list = obj[f.k].filter(function (x) { return x !== o.v; });
        if (box.checked) list.push(o.v);
        obj[f.k] = f.options.map(function (x) { return x.v; }).filter(function (x) { return list.indexOf(x) !== -1; });
        ctx.onChange(f);
      });
      row.appendChild(h('label', { class: 'check', for: id }, box, ' ' + o.t));
    });
    fs.appendChild(row);
    return fs;
  }

  function rowIsEmpty(f, row) {
    return f.columns.every(function (c) { return C.isEmptyValue(row[c.k]); });
  }

  function rowsControl(f, obj, ctx) {
    if (!Array.isArray(obj[f.k])) obj[f.k] = [];
    var list = obj[f.k];
    var fs = h('fieldset', { class: 'field plain kind-rows' });
    fs.appendChild(h('legend', { class: f.hideLabel ? 'sr-only' : null, text: f.label }));
    if (f.hint) fs.appendChild(h('p', { class: 'hint', text: f.hint }));
    var holder = h('div', { class: 'rows-list' });
    var label = f.rowLabel || 'Row';
    function draw(focusIndex) {
      holder.textContent = '';
      if (!list.length) holder.appendChild(h('p', { class: 'hint', text: 'None yet.' }));
      list.forEach(function (row, i) {
        var card = h('div', { class: 'row-card' });
        var tools = h('span', { class: 'row-tools' },
          btn('Up', function () { move(i, i - 1); }, 'btn-quiet btn-small', { disabled: i === 0, 'aria-label': 'Move ' + label.toLowerCase() + ' ' + (i + 1) + ' up' }),
          btn('Down', function () { move(i, i + 1); }, 'btn-quiet btn-small', { disabled: i === list.length - 1, 'aria-label': 'Move ' + label.toLowerCase() + ' ' + (i + 1) + ' down' }),
          btn('Remove', function () {
            if (!rowIsEmpty(f, row) && !window.confirm('Remove ' + label.toLowerCase() + ' ' + (i + 1) + '?')) return;
            list.splice(i, 1);
            ctx.onChange(f);
            draw();
          }, 'btn-quiet btn-small', { 'aria-label': 'Remove ' + label.toLowerCase() + ' ' + (i + 1) }));
        card.appendChild(h('div', { class: 'row-head' }, h('span', { class: 'row-num', text: label + ' ' + (i + 1) }), tools));
        var grid = h('div', { class: 'row-grid' });
        f.columns.forEach(function (c) {
          var col = c;
          if (f.slots && c.slot) {
            /* ICS 215: resource columns take the names given in block 6; unnamed ones stay hidden. */
            var name = String(obj[f.slots + c.slot] || '').trim();
            if (!name && C.isEmptyValue(row[c.k])) return;
            col = {};
            Object.keys(c).forEach(function (k) { col[k] = c[k]; });
            col.label = (name || 'Resource ' + c.slot) + (c.part === 'req' ? ': required' : ': have');
          }
          grid.appendChild(fieldControl(col, row, ctx, false));
        });
        card.appendChild(grid);
        holder.appendChild(card);
      });
      if (focusIndex !== undefined) {
        var cards = holder.querySelectorAll('.row-card');
        var target = cards[focusIndex] && cards[focusIndex].querySelector('input, textarea, select');
        if (target) target.focus();
      }
    }
    function move(a, b) {
      if (b < 0 || b >= list.length) return;
      var t = list[a];
      list[a] = list[b];
      list[b] = t;
      ctx.onChange(f);
      draw();
    }
    draw();
    fs.appendChild(holder);
    fs.appendChild(btn(f.addLabel || 'Add row', function () {
      if (list.length >= (f.maxRows || 200)) {
        toast('This list is full.');
        return;
      }
      list.push(C.emptyRow(f));
      ctx.onChange(f);
      draw(list.length - 1);
    }, '', { 'data-add': f.k }));
    return fs;
  }

  function fieldControl(f, obj, ctx, top) {
    if (f.kind === 'rows') return rowsControl(f, obj, ctx);
    if (f.kind === 'checks') return checksControl(f, obj, ctx);
    var id = nextId(f.k);
    var wrap = h('div', { class: 'field kind-' + f.kind, 'data-key': f.k });
    var labelText = f.label + (f.required ? ' (required)' : '');
    if (f.kind === 'bool') {
      var box = h('input', { type: 'checkbox', id: id, checked: !!obj[f.k] });
      box.addEventListener('change', function () {
        obj[f.k] = box.checked;
        ctx.onChange(f);
      });
      wrap.appendChild(h('label', { class: 'check', for: id }, box, ' ' + labelText));
    } else {
      wrap.appendChild(h('label', { for: id, class: f.hideLabel ? 'sr-only' : null, text: labelText }));
      wrap.appendChild(inputFor(f, obj, id, ctx, top));
    }
    if (f.hint && top) wrap.appendChild(h('p', { class: 'hint', text: f.hint }));
    return wrap;
  }

  function matrixKeys(m) {
    var keys = new Set();
    m.rows.forEach(function (r) { m.cols.forEach(function (c) { keys.add(m.prefix + r[0] + c[0]); }); });
    return keys;
  }

  /* A block whose fields form a fixed table (ICS 209 blocks 30 to 32, ICS 221 block 6). */
  function matrixControl(def, b, data, ctx) {
    var m = b.matrix;
    var table = h('table', { class: 'data matrix' });
    var head = h('tr', null, h('th', { scope: 'col', text: '' }));
    m.cols.forEach(function (c) { head.appendChild(h('th', { scope: 'col', text: c[1] })); });
    table.appendChild(h('thead', null, head));
    var body = h('tbody');
    m.rows.forEach(function (r) {
      var tr = h('tr', null, h('th', { scope: 'row', text: r[1] }));
      m.cols.forEach(function (c) {
        var f = F.fieldByKey(def.type, m.prefix + r[0] + c[0]);
        var id = nextId(f.k);
        var td = h('td', { class: 'kind-' + f.kind });
        td.appendChild(h('label', { for: id, class: 'sr-only', text: f.label }));
        if (f.kind === 'bool') {
          var box = h('input', { type: 'checkbox', id: id, checked: !!data[f.k] });
          box.addEventListener('change', function () {
            data[f.k] = box.checked;
            ctx.onChange(f);
          });
          td.appendChild(box);
        } else {
          td.appendChild(inputFor(f, data, id, ctx, true));
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    return h('div', { class: 'table-wrap matrix-wrap' }, table);
  }

  /* "Add my location": fills latitude and longitude (and accuracy and time, when the block has them) from the device. */
  function geoControl(data, ctx) {
    var status = h('span', { class: 'hint geo-status', role: 'status' });
    var go = btn('Add my location', function () {
      if (!navigator.geolocation) {
        status.textContent = 'This browser cannot read the device location. Type the coordinates instead.';
        return;
      }
      go.disabled = true;
      status.textContent = 'Finding your location...';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var c = pos.coords;
        data.lat = Math.round(c.latitude * 1e6) / 1e6;
        data.lon = Math.round(c.longitude * 1e6) / 1e6;
        if ('gpsAcc' in data) data.gpsAcc = Math.round(c.accuracy || 0);
        if ('gpsAt' in data) data.gpsAt = new Date(pos.timestamp || Date.now()).toISOString();
        ['lat', 'lon', 'gpsAcc', 'gpsAt'].forEach(function (k) { if (ctx.controls[k]) ctx.controls[k].set(data[k]); });
        ctx.onChange({ k: 'lat' });
        go.disabled = false;
        status.textContent = 'Location added' + (c.accuracy ? ', accurate to about ' + Math.round(c.accuracy) + ' meters.' : '.');
      }, function (err) {
        go.disabled = false;
        status.textContent = err && err.code === 1
          ? 'Location is blocked for this page. Allow it in the browser or phone settings, or type the coordinates.'
          : 'The location could not be found. Try again with a view of the sky, or type the coordinates.';
      }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 });
    }, 'btn-small', { 'data-geo': '1' });
    return h('div', { class: 'row wrap geo-row' }, go, status);
  }

  function buildEditor(def, data, ctx) {
    var wrap = h('div', { class: 'editor' });
    var section = null;
    def.blocks.forEach(function (b, i) {
      if (b.section && b.section !== section) {
        section = b.section;
        wrap.appendChild(h('h3', { class: 'section-title', text: section === 'Tracking' || section.indexOf(' ') !== -1 ? section : section + ' section' }));
      }
      var block = h('section', { class: 'block' + (b.w === 'half' ? ' half' : '') + (b.geo ? ' geo' : ''), id: 'blk-' + i, tabindex: '-1', 'data-block': String(i) });
      var title = (b.n ? b.n + '. ' : '') + b.title;
      block.appendChild(h('h4', { class: 'block-title', text: title }));
      if (b.note) block.appendChild(h('p', { class: 'hint', text: b.note }));
      if (b.geo) block.appendChild(geoControl(data, ctx));
      var grid = h('div', { class: 'block-grid' });
      var inMatrix = b.matrix ? matrixKeys(b.matrix) : null;
      b.fields.forEach(function (f) {
        if (inMatrix && inMatrix.has(f.k)) return;
        grid.appendChild(fieldControl(f, data, ctx, true));
      });
      if (grid.children.length) block.appendChild(grid);
      if (b.matrix) block.appendChild(matrixControl(def, b, data, ctx));
      wrap.appendChild(block);
    });
    return wrap;
  }

  function autofill(inc, def, s, ctx) {
    var af = def.autofill;
    var key = String(s.data[af.key] || '').trim().toLowerCase();
    if (!key) return;
    var best = null;
    C.listRecords(inc, def.type).forEach(function (g) {
      if (g.rid === s.rid) return;
      var v = String(g.winner.data[af.key] || '').trim().toLowerCase();
      if (v === key && (!best || g.winner.at > best.winner.at)) best = g;
    });
    if (!best) {
      setupAutofill(def, s, ctx);
      return;
    }
    var filled = 0;
    var canonical = String(best.winner.data[af.key] || '').trim();
    if (canonical && s.data[af.key] !== canonical) {
      s.data[af.key] = canonical;
      if (ctx.controls[af.key]) ctx.controls[af.key].set(canonical);
      markDirty();
    }
    af.fields.forEach(function (k) {
      if (C.isEmptyValue(s.data[k]) && !C.isEmptyValue(best.winner.data[k])) {
        s.data[k] = clone(best.winner.data[k]);
        filled++;
        if (ctx.controls[k]) ctx.controls[k].set(s.data[k]);
      }
    });
    if (filled) {
      markDirty();
      toast('Filled ' + plural(filled, 'field', 'fields') + ' from the last entry for ' + s.data[af.key] + '.');
    }
  }

  function refreshDatalists(inc, type) {
    var names = [S.settings.name].concat(C.authors(inc).map(function (a) { return a.name; }));
    C.listRecords(inc, 'labor').forEach(function (g) { names.push(g.winner.data.name); });
    fillDatalist('people', names.concat(setupNames()));
    var sites = [];
    C.costRecords(inc).forEach(function (x) { sites.push(x.data.site); });
    fillDatalist('cost-sites', sites.concat(setupSites()));
    var places = A.setup().places.slice();
    C.listRecords(inc, '211').forEach(function (g) { places.push(g.winner.data.locationName); });
    fillDatalist('checkin-places', places);
    var def = FORMS[type];
    if (def.autofill) {
      var keys = C.listRecords(inc, type).map(function (g) { return g.winner.data[def.autofill.key]; });
      if (type === 'labor' || type === 'travel') keys = keys.concat(setupNames());
      if (type === 'equipment') keys = keys.concat(setupEquipment());
      fillDatalist('autofill-keys', keys);
    }
  }

  function autoInfo(inc, type, s) {
    var box = h('dl', { class: 'auto-info' });
    function item(k, v) {
      box.appendChild(h('div', null, h('dt', { text: k }), h('dd', { text: v || 'Not set' })));
    }
    var def = FORMS[type];
    if (def.group === 'cost') return box;
    item('Incident name', inc.name + (inc.number ? ' (' + inc.number + ')' : ''));
    if (type === '201') item('Incident number', inc.number);
    if (def.scope === 'period' || def.scope === 'period-many') {
      var p = C.periodOf(inc, s.period);
      item('Operational period ' + s.period, p ? fmtDT(p.start) + ' to ' + fmtDT(p.end) : '');
    }
    return box;
  }

  function copyFormData(s, source, from) {
    var def = FORMS[s.type];
    var current = C.sanitize(s.type, s.data, { lenient: true }).data;
    var hasData = F.fieldsOf(def).some(function (f) {
      return !f.def && f.defValue === undefined && !C.isEmptyValue(current[f.k]);
    });
    if (hasData && !window.confirm('Replace what is on this ' + def.code + ' with the one from ' + from + '?')) return;
    var data = clone(source);
    (def.resetOnCopy || []).forEach(function (k) {
      var f = F.fieldByKey(s.type, k);
      var v = f ? defaultValue(f) : undefined;
      data[k] = v === undefined ? C.emptyValue(f) : v;
    });
    s.data = data;
    markDirty();
    render();
    toast('Copied from ' + from + '. Review it, then save.');
  }

  function previousPeriodWith(inc, type, n) {
    var list = C.periods(inc).filter(function (p) { return p.n < n; }).reverse();
    for (var i = 0; i < list.length; i++) {
      if (type === '204') {
        if (C.listRecords(inc, '204', list[i].n).length) return list[i].n;
      } else {
        var g = C.getRecord(inc, C.recordId(type, list[i].n));
        if (g && !g.deleted) return list[i].n;
      }
    }
    return null;
  }

  function fillEmpty(s, pairs) {
    var n = 0;
    pairs.forEach(function (p) {
      if (p[1] && C.isEmptyValue(s.data[p[0]])) {
        s.data[p[0]] = p[1];
        n++;
      }
    });
    return n;
  }

  function formTools(inc, type, s) {
    var tools = [];
    var n = s.period;
    if (C.isClosed(inc)) return tools;
    if (FORMS[type].scope === 'period') {
      var prev = previousPeriodWith(inc, type, n);
      if (prev) {
        tools.push(['Copy from period ' + prev, function () {
          copyFormData(s, C.getRecord(inc, C.recordId(type, prev)).winner.data, 'period ' + prev);
        }]);
      }
    }
    var r201 = C.getRecord(inc, C.recordId('201'));
    if (type === '202' && r201 && !r201.deleted && r201.winner.data.objectives) {
      tools.push(['Copy objectives from 201', function () {
        if (s.data.objectives && !window.confirm('Replace the objectives on this 202 with the ones from the 201?')) return;
        s.data.objectives = r201.winner.data.objectives;
        markDirty();
        render();
        toast('Objectives copied from the 201.');
      }]);
    }
    if (type === '202') {
      tools.push(['Check forms that exist for this period', function () {
        var have = [];
        var g203 = C.getRecord(inc, C.recordId('203', n));
        var g205 = C.getRecord(inc, C.recordId('205', n));
        if (g203 && !g203.deleted) have.push('ICS 203');
        if (C.listRecords(inc, '204', n).length) have.push('ICS 204');
        if (g205 && !g205.deleted) have.push('ICS 205');
        var items = (s.data.iapItems || []).slice();
        have.forEach(function (x) { if (items.indexOf(x) === -1) items.push(x); });
        s.data.iapItems = F.fieldByKey('202', 'iapItems').options.map(function (o) { return o.v; }).filter(function (v) { return items.indexOf(v) !== -1; });
        markDirty();
        render();
        toast(have.length ? 'Checked ' + have.join(', ') + '.' : 'No 203, 204, or 205 saved for this period yet.');
      }]);
    }
    if (type === '203' && r201 && !r201.deleted) {
      tools.push(['Fill from 201 organization', function () {
        var o = r201.winner.data;
        var count = fillEmpty(s, [['icuc', o.ic], ['safety', o.safety], ['pio', o.pio], ['liaison', o.liaison],
          ['planChief', o.plans], ['logChief', o.logs], ['opsChief', o.ops], ['finChief', o.finance]]);
        if (count) markDirty();
        render();
        toast(count ? 'Filled ' + plural(count, 'empty position', 'empty positions') + ' from the 201.' : 'Nothing to fill. Those positions already have names or the 201 has none.');
      }]);
    }
    if (type === '204') {
      var g203b = C.getRecord(inc, C.recordId('203', n));
      if (g203b && !g203b.deleted) {
        tools.push(['Fill names from 203', function () {
          var o = g203b.winner.data;
          var low = function (x) { return String(x || '').trim().toLowerCase(); };
          var director = '';
          var supervisor = '';
          (o.branches || []).forEach(function (r) {
            if (r.role === 'Branch Director' && s.data.branch && low(r.branch) === low(s.data.branch)) director = r.name;
            if (r.role === 'Division/Group Supervisor' && r.unit &&
                (low(r.unit) === low(s.data.division) || low(r.unit) === low(s.data.group) ||
                 low(r.unit) === 'division ' + low(s.data.division) || low(r.unit) === 'group ' + low(s.data.group))) supervisor = r.name;
          });
          var count = fillEmpty(s, [['osc', o.opsChief], ['branchDirector', director], ['supervisor', supervisor]]);
          if (count) markDirty();
          render();
          toast(count ? 'Filled ' + plural(count, 'name', 'names') + ' from the 203.' : 'Nothing to fill from the 203 for this branch, division, or group.');
        }]);
      }
    }
    return tools.concat(extraTools(inc, type, s));
  }

  function conflictNote(inc, g, s) {
    var box = h('div', { class: 'conflict-note' });
    if (s.baseHeads.length > 1) {
      box.appendChild(h('p', { text: 'A combined version is loaded below. Check it, then press Save to finish. Saving replaces the separate versions.' }));
      return box;
    }
    var who = g.heads.map(function (r) {
      return (r.deleted ? 'deleted ' : '') + (r.by || 'someone') + (r.deviceName ? ' on ' + r.deviceName : '') + ' at ' + fmtShort(r.at);
    }).join('; ');
    box.appendChild(h('p', { text: 'This form has ' + g.heads.length + ' versions that were saved separately (' + who + '). You are seeing the most recent one.' }));
    box.appendChild(btn('Compare versions', function () { openCompare(g.rid); }, 'btn-primary btn-small'));
    return box;
  }

  function editorView(inc, type, rid, period, isNewRoute, opts) {
    opts = opts || {};
    var def = FORMS[type];
    var s = ensureSession(inc, type, rid, period, isNewRoute);
    var g = C.getRecord(inc, s.rid);
    refreshDatalists(inc, type);
    var root = h('div', { class: 'editor-view', 'data-type': type });

    var head = h('section', { class: 'card' });
    var titleRow = h('div', { class: 'view-head' });
    titleRow.appendChild(h('div', null,
      h('h2', { text: def.group === 'cost' || def.group === 'assess' || def.group === 'resource' ? def.title + (s.isNew ? ' (new entry)' : '') : def.group === 'note' ? (s.isNew ? 'New note' : 'Note') : (inc.hics && /^ICS /.test(def.code) ? 'H' : '') + def.code + ' ' + def.title }),
      opts.subtitle ? h('p', { class: 'hint', text: opts.subtitle }) : null));
    if (opts.back) titleRow.appendChild(h('a', { class: 'btn btn-quiet', href: opts.back, text: opts.backLabel || 'Back to list' }));
    head.appendChild(titleRow);
    head.appendChild(autoInfo(inc, type, s));
    head.appendChild(h('p', { class: 'hint saved-line', text: savedLine(g) }));
    if (def.group === 'form' && g) head.appendChild(signoffBar(inc, g, s));
    if (g && g.deleted) {
      var del = h('div', { class: 'conflict-note' });
      del.appendChild(h('p', { text: 'This item was deleted ' + fmtDT(g.winner.at) + (g.winner.by ? ' by ' + g.winner.by : '') + '.' }));
      del.appendChild(btn('Restore it', function () { restoreDeleted(g.rid); }, 'btn-primary btn-small'));
      head.appendChild(del);
    } else if (g && g.conflict) {
      head.appendChild(conflictNote(inc, g, s));
    }
    if (s.dirty && headKey(g) !== s.seen && !(g && g.conflict && s.baseHeads.length > 1)) {
      head.appendChild(h('p', { class: 'conflict-note', text: 'This form was also changed on another device while you were editing. Your changes are kept here. When you save, both versions are kept so you can compare them.' }));
    }
    var tools = formTools(inc, type, s);
    if (tools.length) {
      var tr = h('div', { class: 'row wrap tools' });
      tools.forEach(function (t) { tr.appendChild(btn(t[0], t[1], 'btn-quiet btn-small')); });
      head.appendChild(tr);
    }
    root.appendChild(head);

    var errorBox = h('p', { class: 'error form-error', role: 'alert', hidden: true });
    var preview = def.group === 'cost' ? h('div', { class: 'cost-preview', id: 'costPreview', role: 'status', 'aria-live': 'polite' }) : null;
    var closed = C.isClosed(inc);
    var ctx = {
      controls: {},
      autofillKey: def.autofill ? def.autofill.key : null,
      onChange: function () {
        markDirty();
        if (preview) costPreview(inc, type, s, preview);
      },
      onCommit: function (f) {
        if (def.autofill && f.k === def.autofill.key) autofill(cur(), def, S.session, ctx);
        if (preview) costPreview(inc, type, s, preview);
        /* ICS 215: naming a resource kind adds its columns to every assignment. */
        if (type === '215' && /^kind\d$/.test(f.k)) render();
      }
    };
    if (def.group !== 'note' && !closed) root.appendChild(formCheckBar(def, s));
    var editor = buildEditor(def, s.data, ctx);
    if (closed) {
      /* A closed-out incident is read-only. Every control is disabled, and nothing can be saved. */
      var lockedBox = h('fieldset', { class: 'plain readonly', disabled: true });
      lockedBox.appendChild(h('legend', { class: 'sr-only', text: 'Read only' }));
      lockedBox.appendChild(editor);
      editor = lockedBox;
    }
    root.appendChild(editor);
    if (preview) {
      costPreview(inc, type, s, preview);
      root.appendChild(preview);
    }
    root.appendChild(errorBox);

    var bar = h('div', { class: 'actionbar' });
    if (!closed) bar.appendChild(btn('Save', function () { doSave(false, errorBox); }, 'btn-primary', { id: 'saveBtn' }));
    if ((def.group === 'cost' || def.group === 'assess') && !closed) bar.appendChild(btn('Save and add another', function () { doSave(true, errorBox); }, '', { id: 'saveAnotherBtn' }));
    if (def.group !== 'cost') bar.appendChild(btn('Print', function () { printSession(); }, closed ? 'btn-primary' : '', { id: 'printBtn' }));
    if (g) bar.appendChild(btn('History', function () { openHistory(s.rid); }, 'btn-quiet', { id: 'historyBtn' }));
    if ((def.scope === 'many' || def.scope === 'period-many') && g && !g.deleted && !closed) {
      bar.appendChild(btn('Delete', function () { deleteRecord(); }, 'btn-danger', { id: 'deleteBtn' }));
    }
    bar.appendChild(h('span', { id: 'dirtyNote', class: 'dirty', text: closed ? 'Closed out: read only' : (s.dirty ? 'Unsaved changes' : '') }));
    root.appendChild(bar);
    return root;
  }

  /* The entry's cost as typed, with the notes PA reviewers would raise. */
  function costPreview(inc, type, s, box) {
    var d = C.sanitize(type, s.data, { lenient: true }).data;
    var c = C.costOf(type, d, C.costOpts(inc));
    box.textContent = '';
    var line;
    if (c.missingRate) line = type === 'labor' || type === 'equipment' || type === 'materials' ? 'Cost: a rate is still needed.' : 'Cost: an amount is still needed.';
    else if (type === 'labor' && !c.donated) line = 'Cost: ' + fmtMoney(c.total) + ' (' + fmtMoney(c.reg) + ' regular, ' + fmtMoney(c.ot) + ' overtime, with fringe benefits).';
    else line = (c.donated ? 'Donated value: ' : 'Cost: ') + fmtMoney(c.total) + '.';
    box.appendChild(h('p', { class: 'cost-line', text: line }));
    if (c.flagged) {
      box.appendChild(h('p', { class: 'flag-note', text: 'Budgeted employee on Category ' + d.category + ' (emergency) work: FEMA generally reimburses only the overtime. The ' +
        fmtMoney(c.flaggedCents / 100) + ' of straight time stays documented and is set apart in the summary.' }));
    }
    if (type === 'contracts' && d.contractType === 'Cost plus a percentage of cost') {
      box.appendChild(h('p', { class: 'flag-note', text: 'Cost plus a percentage of cost contracts are not allowed with federal funds (2 CFR 200.324(c)).' }));
    }
    if (type === 'contracts' && d.contractType === 'Time and materials' && (d.procChecks || []).indexOf('ceiling') === -1) {
      box.appendChild(h('p', { class: 'flag-note', text: 'Time and materials contracts need a ceiling price and a finding that no other contract type fit (2 CFR 200.318(j)).' }));
    }
  }

  function doSave(addAnother, errorBox) {
    var s = S.session;
    if (!s) return;
    var res = commitSession('save');
    if (!res.ok) {
      showError(errorBox, res.error);
      errorBox.scrollIntoView({ block: 'center' });
      return;
    }
    showError(errorBox, '');
    toast(res.saved ? 'Saved.' : 'No changes to save.');
    if (addAnother) {
      startAnother(s);
      return;
    }
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function startAnother(prev) {
    var inc = cur();
    var def = FORMS[prev.type];
    var data = defaultsFor(inc, prev.type);
    (def.carry || []).forEach(function (k) { data[k] = clone(prev.data[k]); });
    S.session = newSession(inc, prev.type, null, data);
    history.replaceState(null, '', routeBase(prev.type) + '/new');
    S.route = parseRoute();
    render();
    window.scrollTo(0, 0);
    var first = document.querySelector('.editor input:not([type="date"]):not([type="checkbox"]), .editor textarea');
    if (first) first.focus();
    toast('Saved. Ready for the next entry.');
  }

  function deleteRecord() {
    var s = S.session;
    if (!s) return;
    var inc = cur();
    var def = FORMS[s.type];
    var g = C.getRecord(inc, s.rid);
    if (!g) {
      S.session = null;
      go(routeBase(s.type));
      return;
    }
    if (!window.confirm('Delete this ' + (def.group === 'cost' ? def.code.toLowerCase() : def.code) + '? It stays in the history and can be restored.')) return;
    try {
      C.saveRecord(inc, {
        rid: g.rid, type: g.type, period: g.period, parents: g.heads.map(idOf), deleted: true,
        by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel()
      });
    } catch (err) {
      toast(err.message);
      return;
    }
    persist(inc);
    S.session = null;
    clearStoredSession();
    toast('Deleted.');
    go(routeBase(g.type));
  }

  function restoreDeleted(rid) {
    var inc = cur();
    var g = C.getRecord(inc, rid);
    if (!g) return;
    C.saveRecord(inc, {
      rid: g.rid, type: g.type, period: g.period, parents: g.heads.map(idOf), data: g.winner.data,
      by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel()
    });
    persist(inc);
    S.session = null;
    toast('Restored.');
    render();
  }

  function needPeriodCard(label) {
    return h('section', { class: 'card' },
      h('h2', { text: label }),
      h('p', { text: 'This form belongs to an operational period. Create one to start.' }),
      btn('Create operational period', function () { openPeriodDialog('new'); }, 'btn-primary'));
  }

  function periodFormView(inc, type) {
    var def = FORMS[type];
    var n = currentPeriodNumber(inc);
    if (!n) return needPeriodCard(def.code + ' ' + def.title);
    return editorView(inc, type, C.recordId(type, n), n, false, { subtitle: 'For operational period ' + n + '. Change the period in the bar above.' });
  }

  function recordRouteView(inc, type, id) {
    var def = FORMS[type];
    var back = routeBase(type);
    var backLabel = def.group === 'cost' ? 'Back to ' + COST_NAMES[type].toLowerCase() : def.group === 'note' ? 'Back to notes'
      : def.group === 'assess' ? 'Back to damage assessment' : type === 'volunteer' ? 'Back to volunteers' : 'Back to list';
    if (id === 'new') {
      var period = null;
      if (def.scope === 'period-many') {
        period = currentPeriodNumber(inc);
        if (!period) return needPeriodCard(def.code + ' ' + def.title);
      }
      return editorView(inc, type, null, period, true, {
        back: back, backLabel: backLabel,
        subtitle: period ? 'For operational period ' + period + '.' : null
      });
    }
    var g = C.getRecord(inc, id);
    if (!g || g.type !== type) {
      return h('section', { class: 'card' },
        h('h2', { text: 'Not found' }),
        h('p', { text: 'This item is not on this device. It may be in a package that has not been imported yet.' }),
        h('a', { class: 'btn', href: back, text: backLabel }));
    }
    if (g.period && inc._period !== g.period) inc._period = g.period;
    return editorView(inc, type, id, g.period, false, {
      back: back, backLabel: backLabel,
      subtitle: g.period ? 'For operational period ' + g.period + '.' : null
    });
  }

  /* ---------- exports ---------- */

  A.fieldCounter = fieldCounter;
  A.nextId = nextId;
  A.setFieldError = setFieldError;
  A.imageControl = imageControl;
  A.processImage = processImage;
  A.inputFor = inputFor;
  A.checksControl = checksControl;
  A.rowIsEmpty = rowIsEmpty;
  A.rowsControl = rowsControl;
  A.fieldControl = fieldControl;
  A.buildEditor = buildEditor;
  A.autofill = autofill;
  A.refreshDatalists = refreshDatalists;
  A.autoInfo = autoInfo;
  A.copyFormData = copyFormData;
  A.previousPeriodWith = previousPeriodWith;
  A.fillEmpty = fillEmpty;
  A.formTools = formTools;
  A.conflictNote = conflictNote;
  A.editorView = editorView;
  A.doSave = doSave;
  A.startAnother = startAnother;
  A.deleteRecord = deleteRecord;
  A.restoreDeleted = restoreDeleted;
  A.needPeriodCard = needPeriodCard;
  A.periodFormView = periodFormView;
  A.recordRouteView = recordRouteView;
})(window.FieldApp);
