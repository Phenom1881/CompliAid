/* FieldICS: Readiness checks for the IAP and cost documentation, and jumping to a form block. */
(function (A) {
  'use strict';

  var C = A.C;
  var FORMS = A.FORMS;
  var S = A.S;
  var btn = A.btn;
  var closePanel = A.closePanel;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var go = A.go;
  var h = A.h;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var plural = A.plural;
  var routeBase = A.routeBase;
  var openIncidentDialog = A.openIncidentDialog;
  var printIAP = A.later('printIAP');

  var Checks = window.FieldChecks;

  function blockIndexOf(def, field) {
    for (var i = 0; i < def.blocks.length; i++) {
      if (def.blocks[i].fields.some(function (f) { return f.k === field; })) return i;
    }
    return -1;
  }

  function scrollToBlock(i) {
    var el = document.getElementById('blk-' + i);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 1600);
    var input = el.querySelector('input, textarea, select, button');
    if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
    else el.focus({ preventScroll: true });
  }

  /* Opens a form (or one record) and scrolls to the block holding `field`. */
  function jumpTo(f) {
    var inc = cur();
    if (f.type === 'incident') {
      closePanel();
      openIncidentDialog('edit');
      var box = document.getElementById('incCostBox');
      if (box) box.open = true;
      return;
    }
    if (f.type === 'period') {
      closePanel();
      A.openPeriodDialog('edit', f.period);
      return;
    }
    commitSession('leave');
    S.session = null;
    if (f.period && inc._period !== f.period) {
      inc._period = f.period;
      persist(inc);
    }
    S.pendingJump = f.field || null;
    closePanel();
    var def = FORMS[f.type];
    if (f.rid && def.scope !== 'period' && def.scope !== 'incident') go(routeBase(f.type) + '/' + f.rid);
    else go(routeBase(f.type));
  }

  /* The bar above every form: jump to a block, and check what is still empty. */
  function formCheckBar(def, s) {
    var bar = h('div', { class: 'checkbar' });
    var visible = def.blocks.map(function (b, i) { return { b: b, i: i }; });
    var empty = Checks.emptyBlocks(def.type, s.data);
    var emptySet = new Set(empty.map(function (x) { return x.index; }));
    if (visible.length >= 4) {
      var sel = h('select', { id: 'jumpBlock', 'aria-label': 'Jump to block' });
      sel.appendChild(h('option', { value: '', text: 'Jump to block...' }));
      visible.forEach(function (x) {
        sel.appendChild(h('option', { value: String(x.i), text: (x.b.n ? x.b.n + '. ' : '') + x.b.title + (emptySet.has(x.i) ? ' (empty)' : '') }));
      });
      sel.addEventListener('change', function () {
        if (sel.value !== '') scrollToBlock(+sel.value);
        sel.value = '';
      });
      bar.appendChild(sel);
    }
    bar.appendChild(btn('Check this form', function () { openFormCheck(def, s); }, 'btn-quiet btn-small', { id: 'checkForm' }));
    if (def.iap && s.period) {
      bar.appendChild(btn('Check the IAP', function () { openIAPCheck(cur(), s.period); }, 'btn-quiet btn-small', { id: 'checkIap' }));
    }
    if (S.pendingJump) {
      var idx = blockIndexOf(def, S.pendingJump);
      S.pendingJump = null;
      if (idx !== -1) setTimeout(function () { scrollToBlock(idx); }, 30);
    }
    return bar;
  }

  function openFormCheck(def, s) {
    var body = openPanel('Check: ' + (def.group === 'cost' ? def.title : def.code + ' ' + def.title));
    var cleaned = C.sanitize(def.type, s.data, { lenient: true });
    var missing = C.missingRequired(def.type, cleaned.data);
    var empty = Checks.emptyBlocks(def.type, cleaned.data);
    var list = h('ul', { class: 'check-list' });
    missing.forEach(function (label) {
      list.appendChild(h('li', { class: 'lvl-fix' }, h('span', { class: 'tag warn', text: 'Required' }), ' ' + label));
    });
    cleaned.problems.forEach(function (p) {
      list.appendChild(h('li', { class: 'lvl-fix' }, h('span', { class: 'tag warn', text: 'Not valid' }), ' ' + p));
    });
    empty.forEach(function (b) {
      list.appendChild(h('li', { class: 'lvl-check' }, h('span', { class: 'tag', text: 'Empty' }), ' ' + (b.n ? 'Block ' + b.n + ': ' : '') + b.title + ' ',
        btn('Go there', function () { closePanel(); scrollToBlock(b.index); }, 'btn-quiet btn-small')));
    });
    if (!list.children.length) body.appendChild(h('p', { class: 'ok-note', text: 'Every block has something in it and nothing required is missing.' }));
    else body.appendChild(list);
    if (def.type === '202' || def.iap) body.appendChild(btn('Check the whole IAP for this period', function () { openIAPCheck(cur(), s.period); }, 'btn-quiet'));
    if (def.group === 'cost') body.appendChild(btn('Check all cost documentation', function () { openCostCheck(cur()); }, 'btn-quiet'));
  }

  function findingList(found, empty) {
    var box = h('div');
    if (!found.length) {
      box.appendChild(h('p', { class: 'ok-note', text: empty }));
      return box;
    }
    [['fix', 'Fix before you print', 'lvl-fix'], ['check', 'Worth a look', 'lvl-check']].forEach(function (g) {
      var items = found.filter(function (f) { return f.level === g[0]; });
      if (!items.length) return;
      box.appendChild(h('h3', { class: 'small-title', text: g[1] + ' (' + items.length + ')' }));
      var ul = h('ul', { class: 'check-list' });
      items.forEach(function (f) {
        ul.appendChild(h('li', { class: g[2] }, h('span', { text: f.text + ' ' }),
          f.type ? btn(f.rid || f.type === 'incident' || f.type === 'period' ? 'Open' : 'Go to ' + (FORMS[f.type] ? FORMS[f.type].code : 'it'), function () { jumpTo(f); }, 'btn-quiet btn-small') : null));
      });
      box.appendChild(ul);
    });
    return box;
  }

  function openIAPCheck(inc, n) {
    commitSession('quiet');
    var found = inc.hics ? Checks.hicsIap(inc, n) : Checks.iap(inc, n);
    var body = openPanel('IAP check: operational period ' + n);
    body.appendChild(h('p', { class: 'hint', text: inc.hics
      ? 'Checks the HICS 202 (or IAP Quick Start), 203, 204s, 206, 215A, and 200 cover sheet for this period before a briefing. It looks for missing forms and blocks, not whether the plan is right.'
      : 'Checks the 202, 203, 204s, and 205 for this period, and the 205A, 206, 207, and 208 when the 202 lists them, before a briefing. It looks for missing forms and blocks, not whether the plan is right.' }));
    body.appendChild(findingList(found, 'The IAP forms for period ' + n + ' are filled in.'));
    body.appendChild(h('div', { class: 'row end' }, btn('Print IAP', function () { closePanel(); printIAP(inc, n); }, 'btn-primary')));
  }

  function openCostCheck(inc) {
    commitSession('quiet');
    var found = Checks.costs(inc);
    var body = openPanel('Cost documentation check');
    body.appendChild(h('p', { class: 'hint', text: 'Looks for the gaps Public Assistance reviewers most often ask about. It does not decide eligibility.' }));
    body.appendChild(findingList(found, 'No gaps found in ' + plural(C.costRecords(inc).length, 'cost entry', 'cost entries') + '.'));
  }

  /* ---------- exports ---------- */

  A.jumpTo = jumpTo;
  A.scrollToBlock = scrollToBlock;
  A.formCheckBar = formCheckBar;
  A.openFormCheck = openFormCheck;
  A.openIAPCheck = openIAPCheck;
  A.openCostCheck = openCostCheck;
})(window.FieldApp);
