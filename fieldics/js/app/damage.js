/* FieldICS: Damage assessment: homes (Individual Assistance) and public facilities (Public Assistance). */
(function (A) {
  'use strict';

  var C = A.C;
  var F = A.F;
  var P = A.P;
  var S = A.S;
  var btn = A.btn;
  var commitSession = A.commitSession;
  var deletedToggle = A.deletedToggle;
  var download = A.download;
  var fmtDT = A.fmtDT;
  var fmtMoney = A.fmtMoney;
  var h = A.h;
  var itemLink = A.itemLink;
  var plural = A.plural;
  var printCtx = A.printCtx;
  var recordRouteView = A.recordRouteView;
  var render = A.render;
  var routeBase = A.routeBase;
  var startNew = A.startNew;
  var toast = A.toast;
  var track = A.track;
  var runPrint = A.later('runPrint');

  var Assess = window.FieldAssess;
  var LEVEL_CLASS = { Destroyed: 'lvl-destroyed', Major: 'lvl-major', Minor: 'lvl-minor', Affected: 'lvl-affected', Inaccessible: 'lvl-inaccessible' };

  function subnav(inc, sub) {
    var nav = h('nav', { class: 'subtabs', 'aria-label': 'Damage assessment' });
    var homes = C.listRecords(inc, 'daHome').length;
    var sites = C.listRecords(inc, 'daSite').length;
    [['summary', 'Summary', 0], ['homes', 'Homes (IA)', homes], ['sites', 'Public facilities (PA)', sites]].forEach(function (x) {
      var a = h('a', { class: 'subtab', href: '#/damage/' + x[0], 'aria-current': sub === x[0] ? 'page' : null }, x[1]);
      if (x[2]) a.appendChild(h('span', { class: 'count', text: ' ' + x[2] }));
      nav.appendChild(a);
    });
    return nav;
  }

  function levelTag(level) {
    return h('span', { class: 'tag tag-level ' + (LEVEL_CLASS[level] || ''), text: level || 'Not set' });
  }

  function summaryView(inc) {
    var t = Assess.damageTotals(inc);
    var card = h('section', { class: 'card' });
    card.appendChild(h('h2', { text: 'Damage assessment' }));
    card.appendChild(h('p', { class: 'hint', text: 'Initial damage assessment: homes for Individual Assistance and public facilities for Public Assistance. Walk the area, record each one with its location and photos, and the counts below feed the ICS 209 and the request for assistance. Works with no signal.' }));
    var tools = h('div', { class: 'row wrap tools' });
    if (!C.isClosed(inc)) {
      tools.appendChild(btn('Assess a home', function () { startNew('daHome'); }, 'btn-primary', { id: 'newHome' }));
      tools.appendChild(btn('Record a damaged facility', function () { startNew('daSite'); }, '', { id: 'newSite' }));
    }
    card.appendChild(tools);

    var table = h('table', { class: 'data' });
    table.appendChild(h('thead', null, h('tr', null, h('th', { text: 'Damage level' }), h('th', { class: 'num', text: 'Dwellings' }),
      h('th', { class: 'num', text: 'Insured' }), h('th', { class: 'num', text: 'No insurance' }), h('th', { class: 'num', text: 'Renters' }))));
    var tb = h('tbody');
    Assess.LEVELS.forEach(function (l) {
      tb.appendChild(h('tr', null, h('td', null, levelTag(l)), h('td', { class: 'num', text: String(t.levels[l]) }),
        h('td', { class: 'num', text: String(t.insured[l]) }), h('td', { class: 'num', text: String(t.uninsured[l]) }), h('td', { class: 'num', text: String(t.renters[l]) })));
    });
    tb.appendChild(h('tr', { class: 'total' }, h('td', { text: 'Total' }), h('td', { class: 'num', text: String(t.total) }),
      h('td', { class: 'num', text: String(t.insuredAll) }), h('td', { class: 'num', text: String(t.uninsuredAll) }), h('td', { class: 'num', text: String(t.rentersAll) })));
    table.appendChild(tb);
    card.appendChild(h('h3', { class: 'small-title', text: 'Homes: ' + plural(t.homes, 'record', 'records') + ', ' + plural(t.total, 'dwelling', 'dwellings') }));
    card.appendChild(h('div', { class: 'table-wrap', id: 'damageCounts' }, table));
    var notes = [];
    if (t.notHabitable) notes.push(plural(t.notHabitable, 'home cannot', 'homes cannot') + ' be lived in now.');
    if (t.needs) notes.push(plural(t.needs, 'household has', 'households have') + ' immediate needs noted.');
    if (t.review) notes.push(plural(t.review, 'home needs', 'homes need') + ' a second look by the damage assessment coordinator.');
    if (notes.length) card.appendChild(h('p', { class: 'warn-note', text: notes.join(' ') }));

    card.appendChild(h('h3', { class: 'small-title', text: 'Public facilities: ' + plural(t.sites, 'site', 'sites') + ', about ' + fmtMoney(t.siteCost) + (t.siteCostMissing ? ' (' + t.siteCostMissing + ' not yet estimated)' : '') }));
    if (t.sites) {
      var ct = h('table', { class: 'data' });
      ct.appendChild(h('thead', null, h('tr', null, h('th', { text: 'Category of work' }), h('th', { class: 'num', text: 'Approximate cost' }))));
      var cb = h('tbody');
      F.CATEGORY_LIST.concat([['', 'Not set']]).forEach(function (c) {
        if (t.siteByCategory[c[0]] === undefined) return;
        cb.appendChild(h('tr', null, h('td', { text: c[1] }), h('td', { class: 'num', text: fmtMoney(t.siteByCategory[c[0]]) })));
      });
      ct.appendChild(cb);
      card.appendChild(h('div', { class: 'table-wrap' }, ct));
    }

    var out = h('div', { class: 'row wrap tools' });
    out.appendChild(btn('Print damage summary', function () { A.printDamageSummary(inc); }, 'btn-primary', { id: 'printDamage' }));
    out.appendChild(btn('Damage inventory (Excel)', function () { inventoryXLSX(inc); }, '', { id: 'inventoryXlsx' }));
    out.appendChild(btn('Damage inventory (CSV)', function () { inventoryCSV(inc); }, 'btn-quiet'));
    out.appendChild(btn('Home assessments (CSV)', function () { homesCSV(inc); }, 'btn-quiet', { id: 'homesCsv' }));
    if (!C.isClosed(inc)) out.appendChild(btn('Start an ICS 209 with these counts', function () { A.new209(inc); }, 'btn-quiet'));
    card.appendChild(out);
    card.appendChild(h('p', { class: 'hint', text: 'The damage inventory uses the columns of the FEMA Grants Portal template, so its rows copy straight into the template your Program Delivery Manager provides.' }));
    return card;
  }

  function homesView(inc) {
    var all = C.listRecords(inc, 'daHome', null, S.showDeleted);
    var filter = S.damageLevel || '';
    var items = all.filter(function (g) { return !filter || g.winner.data.level === filter; }).sort(function (a, b) {
      return (b.winner.data.assessedAt || b.created) < (a.winner.data.assessedAt || a.created) ? -1 : 1;
    });
    var card = h('section', { class: 'card' });
    var sel = h('select', { id: 'damageLevel', 'aria-label': 'Show damage level' });
    sel.appendChild(h('option', { value: '', text: 'All levels' }));
    Assess.LEVELS.forEach(function (l) { sel.appendChild(h('option', { value: l, text: l, selected: l === filter })); });
    sel.addEventListener('change', function () { S.damageLevel = sel.value; render(); });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'Homes (Individual Assistance)' }), h('p', { class: 'hint', text: plural(all.length, 'home', 'homes') + ' assessed. Newest first.' })),
      h('div', { class: 'row wrap' }, sel, deletedToggle())));
    if (!C.isClosed(inc)) card.appendChild(h('div', { class: 'row wrap tools' }, btn('Assess a home', function () { startNew('daHome'); }, 'btn-primary', { id: 'newHome2' })));
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      var li = itemLink(routeBase('daHome') + '/' + g.rid, d.address || 'Home', [
        [d.city, d.dwelling + (d.dwelling === 'Multi-family' && d.units ? ' (' + d.units + ' units)' : ''), d.waterInches !== null ? d.waterInches + ' in of water' : '',
          d.tenure && d.tenure !== 'Unknown' ? d.tenure : '', (d.insurance || []).indexOf('none') !== -1 ? 'No insurance' : ''].filter(Boolean).join(' | '),
        [d.assessedAt ? fmtDT(d.assessedAt) : '', d.assessedBy, d.lat !== null ? 'Located' : 'No location', (d.photos || []).length ? plural(d.photos.length, 'photo', 'photos') : ''].filter(Boolean).join(' | ')
      ], g);
      li.firstChild.firstChild.appendChild(levelTag(d.level));
      if (d.review) li.firstChild.firstChild.appendChild(h('span', { class: 'tag warn', text: 'Second look' }));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: all.length ? 'No homes at this level.' : 'No homes assessed yet.' }));
    return card;
  }

  function sitesView(inc) {
    var items = C.listRecords(inc, 'daSite', null, S.showDeleted).sort(function (a, b) {
      return (b.winner.data.assessedAt || b.created) < (a.winner.data.assessedAt || a.created) ? -1 : 1;
    });
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'Public facilities (Public Assistance)' }), h('p', { class: 'hint', text: plural(items.length, 'site', 'sites') + '. These become the damage inventory.' })),
      deletedToggle()));
    if (!C.isClosed(inc)) card.appendChild(h('div', { class: 'row wrap tools' }, btn('Record a damaged facility', function () { startNew('daSite'); }, 'btn-primary', { id: 'newSite2' })));
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      var cat = F.CATEGORY_LIST.filter(function (c) { return c[0] === d.category; })[0];
      ul.appendChild(itemLink(routeBase('daSite') + '/' + g.rid, d.name || 'Damaged facility', [
        [cat ? cat[1] : 'Category not set', d.cost !== null ? 'About ' + fmtMoney(d.cost) : 'Cost not estimated', d.priority ? d.priority + ' priority' : ''].filter(Boolean).join(' | '),
        [d.cause, d.labor, d.complete !== null ? d.complete + '% complete' : ''].filter(Boolean).join(' | ')
      ], g));
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: 'No damaged facilities recorded yet.' }));
    return card;
  }

  function damageView(inc, r) {
    var root = h('div');
    root.appendChild(subnav(inc, r.sub));
    if (r.sub === 'homes') root.appendChild(r.id ? recordRouteView(inc, 'daHome', r.id) : homesView(inc));
    else if (r.sub === 'sites') root.appendChild(r.id ? recordRouteView(inc, 'daSite', r.id) : sitesView(inc));
    else root.appendChild(summaryView(inc));
    return root;
  }

  /* ---------- printing and files ---------- */

  function printSummary(inc) {
    commitSession('quiet');
    var homes = C.listRecords(inc, 'daHome').map(function (g) { return g.winner.data; }).sort(function (a, b) {
      return Assess.LEVELS.indexOf(a.level) - Assess.LEVELS.indexOf(b.level) || String(a.address).localeCompare(String(b.address));
    });
    var sites = C.listRecords(inc, 'daSite').map(function (g) { return g.winner.data; });
    var nodes = [P.damageSummary(printCtx(inc), { homes: homes, sites: sites, totals: Assess.damageTotals(inc) })];
    var items = [];
    C.listRecords(inc, 'daHome').forEach(function (g) {
      (g.winner.data.photos || []).forEach(function (id) { items.push({ id: id, caption: 'Home: ' + g.winner.data.address + ' (' + (g.winner.data.level || 'level not set') + ').' }); });
    });
    C.listRecords(inc, 'daSite').forEach(function (g) {
      (g.winner.data.photos || []).forEach(function (id) { items.push({ id: id, caption: 'Facility: ' + g.winner.data.name + '.' }); });
    });
    var app = P.photoAppendix(printCtx(inc), items, 'DAMAGE ASSESSMENT PHOTOS');
    if (app) nodes.push(app);
    runPrint(nodes, { title: 'Damage assessment summary' });
  }

  function fileBase(inc, what) {
    return 'fieldics_' + C.slug(inc.name) + '_' + what + '_' + C.stamp() + (inc.exercise ? '_exercise' : '');
  }

  function inventoryXLSX(inc) {
    commitSession('quiet');
    var bytes = window.FieldXLSX.build(Assess.inventorySheets(inc), { title: 'Damage inventory: ' + inc.name, creator: S.settings.name || 'FieldICS' });
    download(fileBase(inc, 'damage-inventory') + '.xlsx', new Blob([bytes], { type: window.FieldXLSX.MIME }));
    track('exports');
    toast('Damage inventory saved.');
  }

  function inventoryCSV(inc) {
    commitSession('quiet');
    download(fileBase(inc, 'damage-inventory') + '.csv', new Blob(['﻿' + Assess.inventoryCSV(inc)], { type: 'text/csv;charset=utf-8' }));
    toast('Damage inventory CSV saved.');
  }

  function homesCSV(inc) {
    commitSession('quiet');
    download(fileBase(inc, 'home-assessments') + '.csv', new Blob(['﻿' + Assess.homesCSV(inc)], { type: 'text/csv;charset=utf-8' }));
    toast('Home assessments CSV saved. Times are UTC.');
  }

  A.views.damage = damageView;

  /* ---------- exports ---------- */

  A.damageView = damageView;
  A.printDamageSummary = A.withPhotos(printSummary);
  A.downloadInventoryXLSX = inventoryXLSX;
  A.downloadInventoryCSV = inventoryCSV;
  A.downloadHomesCSV = homesCSV;
})(window.FieldApp);
