/* FieldICS: Shared helpers: page elements, formatting, messages, files. */
(function (A) {
  'use strict';

  /* Calls a function that a later module adds to window.FieldApp. */
  A.later = function (name) {
    return function () { return A[name].apply(null, arguments); };
  };

  var C = window.FieldICS;
  var F = window.FieldICSForms;
  var Store = window.FieldStore;
  var P = window.FieldPrint;
  var FORMS = F.FORMS;
  var COST_TYPES = F.COST_TYPES;

  var APP_NAME = 'FieldICS 0.3';
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var MAX_IMPORT_BYTES = 300 * 1024 * 1024;
  var ID_PART = /^[A-Za-z0-9-]{2,80}$/;
  var ROUTE_NAMES = ['log', 'notes', '201', '202', '203', '204', '205', '211', '213', '213rr', 'costs', 'share'];

  /* Navigation, grouped the way ICS sections work. code is the form number shown beside the name. */
  var NAV = [
    { r: 'log', group: 'Activity', code: '214', label: 'Activity log', types: [] },
    { r: 'notes', group: 'Activity', code: '', label: 'Notes', types: ['note'] },
    { r: '201', group: 'Planning', code: '201', label: 'Incident briefing', types: ['201'] },
    { r: '202', group: 'Planning', code: '202', label: 'Objectives', types: ['202'] },
    { r: '203', group: 'Planning', code: '203', label: 'Organization', types: ['203'] },
    { r: '204', group: 'Planning', code: '204', label: 'Assignments', types: ['204'] },
    { r: '205', group: 'Planning', code: '205', label: 'Radio plan', types: ['205'] },
    { r: '211', group: 'Resources', code: '211', label: 'Check-in', types: ['211'] },
    { r: '213rr', group: 'Resources', code: '213RR', label: 'Resource requests', types: ['213RR'] },
    { r: '213', group: 'Communications', code: '213', label: 'Messages', types: ['213'] },
    { r: 'costs', group: 'Finance', code: 'PA', label: 'Costs', types: COST_TYPES },
    { r: 'share', group: 'Output', code: '', label: 'Share and print', types: [] }
  ];

  var COST_NAMES = { labor: 'Labor', equipment: 'Equipment', materials: 'Materials', rentals: 'Rentals', contracts: 'Contracts', travel: 'Travel and other' };
  var COST_ADD = {
    labor: 'Add labor entry',
    equipment: 'Add equipment entry',
    materials: 'Add materials entry',
    rentals: 'Add rental entry',
    contracts: 'Add contract entry',
    travel: 'Add travel or other cost'
  };

  /* ---------- DOM helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function append(node, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) {
      c.forEach(function (x) { append(node, x); });
      return;
    }
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }

  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'value') node.value = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function btn(text, onclick, cls, extra) {
    var props = { type: 'button', class: 'btn' + (cls ? ' ' + cls : ''), text: text, onclick: onclick };
    if (extra) Object.keys(extra).forEach(function (k) { props[k] = extra[k]; });
    return h('button', props);
  }

  function fillDatalist(id, values) {
    var list = $(id);
    if (!list) return;
    list.textContent = '';
    var seen = new Set();
    values.forEach(function (v) {
      var s = String(v || '').trim();
      if (!s || seen.has(s.toLowerCase())) return;
      seen.add(s.toLowerCase());
      list.appendChild(h('option', { value: s }));
    });
  }

  /* ---------- formatting ---------- */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) { return pad(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
  function fmtTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : fmtDate(d) + ' ' + fmtTime(d);
  }

  function fmtShort(iso) {
    if (!iso) return 'not set';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? 'not set' : pad(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + fmtTime(d);
  }

  function fmtDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : '';
  }

  function toLocalInput(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fromLocalInput(v) {
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

  function isoToInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : toLocalInput(d);
  }

  function todayInput() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowMinute() {
    var d = new Date();
    d.setSeconds(0, 0);
    return d;
  }

  var moneyFmt = null;
  var rateFmt = null;
  try {
    moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    rateFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch (e) {
    moneyFmt = null;
    rateFmt = null;
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || n === '') return '';
    var x = Number(n);
    if (!isFinite(x)) return '';
    return moneyFmt ? moneyFmt.format(x) : '$' + x.toFixed(2);
  }

  function fmtRate(n) {
    if (n === null || n === undefined || n === '') return '';
    var x = Number(n);
    if (!isFinite(x)) return '';
    return rateFmt ? rateFmt.format(x) : '$' + x.toFixed(2);
  }

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /* ---------- feedback ---------- */

  var bannerState = { storage: '', startup: '' };

  function updateBanner() {
    var msg = bannerState.storage || bannerState.startup;
    var b = $('banner');
    b.textContent = msg;
    b.hidden = !msg;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  function openDialog(d) {
    if (d.open) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  function closeDialog(d) {
    if (typeof d.close === 'function') {
      if (d.open) d.close();
    } else {
      d.removeAttribute('open');
    }
  }

  function showMessage(title, lines) {
    $('msgTitle').textContent = title;
    var ul = $('msgList');
    ul.textContent = '';
    lines.forEach(function (l) { ul.appendChild(h('li', { text: l })); });
    openDialog($('messageDialog'));
  }

  function openPanel(title) {
    $('panelTitle').textContent = title;
    var body = $('panelBody');
    body.textContent = '';
    openDialog($('panelDialog'));
    return body;
  }

  function closePanel() {
    closeDialog($('panelDialog'));
  }

  function showError(el, msg) {
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function canShareFiles() {
    try {
      if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false;
      var probe = new File(['x'], 'x.json', { type: 'application/json' });
      return navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  function download(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('The file could not be read.')); };
      r.readAsText(file);
    });
  }

  /* ---------- exports ---------- */

  A.C = C;
  A.F = F;
  A.Store = Store;
  A.P = P;
  A.FORMS = FORMS;
  A.COST_TYPES = COST_TYPES;
  A.APP_NAME = APP_NAME;
  A.MON = MON;
  A.MAX_IMPORT_BYTES = MAX_IMPORT_BYTES;
  A.ID_PART = ID_PART;
  A.ROUTE_NAMES = ROUTE_NAMES;
  A.NAV = NAV;
  A.COST_NAMES = COST_NAMES;
  A.COST_ADD = COST_ADD;
  A.$ = $;
  A.append = append;
  A.h = h;
  A.btn = btn;
  A.fillDatalist = fillDatalist;
  A.pad = pad;
  A.fmtDate = fmtDate;
  A.fmtTime = fmtTime;
  A.fmtDT = fmtDT;
  A.fmtShort = fmtShort;
  A.fmtDay = fmtDay;
  A.toLocalInput = toLocalInput;
  A.fromLocalInput = fromLocalInput;
  A.isoToInput = isoToInput;
  A.todayInput = todayInput;
  A.nowMinute = nowMinute;
  A.moneyFmt = moneyFmt;
  A.rateFmt = rateFmt;
  A.fmtMoney = fmtMoney;
  A.fmtRate = fmtRate;
  A.clone = clone;
  A.plural = plural;
  A.bannerState = bannerState;
  A.updateBanner = updateBanner;
  A.toastTimer = toastTimer;
  A.toast = toast;
  A.openDialog = openDialog;
  A.closeDialog = closeDialog;
  A.showMessage = showMessage;
  A.openPanel = openPanel;
  A.closePanel = closePanel;
  A.showError = showError;
  A.canShareFiles = canShareFiles;
  A.download = download;
  A.readFileText = readFileText;
})(window.FieldApp = window.FieldApp || {});
