/* FieldICS: Cost entry lists and the PA cost summary screen. */
(function (A) {
  'use strict';

  var C = A.C;
  var COST_ADD = A.COST_ADD;
  var COST_NAMES = A.COST_NAMES;
  var COST_TYPES = A.COST_TYPES;
  var F = A.F;
  var FORMS = A.FORMS;
  var S = A.S;
  var btn = A.btn;
  var deletedToggle = A.deletedToggle;
  var downloadCostCSV = A.later('downloadCostCSV');
  var fmtDay = A.fmtDay;
  var fmtMoney = A.fmtMoney;
  var h = A.h;
  var itemLink = A.itemLink;
  var itemTitle = A.itemTitle;
  var openCostPrint = A.later('openCostPrint');
  var plural = A.plural;
  var recordRouteView = A.recordRouteView;
  var render = A.render;
  var routeBase = A.routeBase;
  var startNew = A.startNew;

  /* ---------- costs ---------- */

  function costFilterBar(inc, onChange) {
    var cat = h('select', { id: 'costCategory', 'aria-label': 'Category of work' });
    cat.appendChild(h('option', { value: '', text: 'All categories' }));
    F.CATEGORY_LIST.forEach(function (c) {
      cat.appendChild(h('option', { value: c[0], text: c[1], selected: c[0] === S.costFilter.category }));
    });
    cat.addEventListener('change', function () { S.costFilter.category = cat.value; onChange(); });
    var sites = [];
    C.costRecords(inc).forEach(function (x) {
      var s = String(x.data.site || '').trim();
      if (s && sites.every(function (y) { return y.toLowerCase() !== s.toLowerCase(); })) sites.push(s);
    });
    sites.sort();
    var site = h('select', { id: 'costSite', 'aria-label': 'Location or site' });
    site.appendChild(h('option', { value: '', text: 'All sites' }));
    sites.forEach(function (s) { site.appendChild(h('option', { value: s, text: s, selected: s === S.costFilter.site })); });
    site.addEventListener('change', function () { S.costFilter.site = site.value; onChange(); });
    return h('div', { class: 'row wrap filters' }, cat, site);
  }

  function costSubnav(inc, sub) {
    var nav = h('nav', { class: 'subtabs', 'aria-label': 'Cost types' });
    var counts = {};
    C.costRecords(inc).forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
    [['summary', 'Summary']].concat(COST_TYPES.map(function (t) { return [t, COST_NAMES[t]]; })).forEach(function (x) {
      var a = h('a', { class: 'subtab', href: '#/costs/' + x[0], 'aria-current': sub === x[0] ? 'page' : null }, x[1]);
      if (x[0] !== 'summary' && counts[x[0]]) a.appendChild(h('span', { class: 'count', text: ' ' + counts[x[0]] }));
      nav.appendChild(a);
    });
    return nav;
  }

  function costLine(type, x) {
    var d = x.data;
    var bits = [];
    if (type === 'labor') {
      bits.push(fmtDay(d.date));
      if (d.jobTitle) bits.push(d.jobTitle);
      var hrs = [];
      if (d.regHours) hrs.push(d.regHours + ' reg');
      if (d.otHours) hrs.push(d.otHours + ' OT');
      if (hrs.length) bits.push(hrs.join(', ') + ' hrs');
    } else if (type === 'equipment') {
      bits.push(fmtDay(d.date));
      if (d.usage !== null) bits.push(d.usage + ' ' + (d.usageUnit || 'Hours').toLowerCase());
      if (d.operator) bits.push('Operator: ' + d.operator);
    } else if (type === 'materials') {
      bits.push(fmtDay(d.usedDate || d.purchaseDate));
      if (d.qtyUsed !== null || d.qtyPurchased !== null) bits.push((d.qtyUsed !== null ? d.qtyUsed : d.qtyPurchased) + (d.unit ? ' ' + d.unit : ''));
      if (d.vendor) bits.push(d.vendor);
    } else if (type === 'rentals') {
      bits.push([fmtDay(d.startDate), fmtDay(d.endDate)].filter(Boolean).join(' to '));
      if (d.vendor) bits.push(d.vendor);
    } else if (type === 'travel') {
      bits.push(fmtDay(d.date));
      if (d.qty !== null) bits.push(d.qty + (d.unit ? ' ' + d.unit : ''));
      if (d.vendor) bits.push(d.vendor);
    } else {
      bits.push([fmtDay(d.startDate), fmtDay(d.endDate)].filter(Boolean).join(' to '));
      if (d.procurement) bits.push(d.procurement);
    }
    if (d.photos && d.photos.length) bits.push(plural(d.photos.length, 'photo', 'photos'));
    if (d.category) bits.push('Cat. ' + d.category);
    if (d.site) bits.push(d.site);
    return bits.filter(Boolean).join(' | ');
  }

  function costList(inc, type) {
    var root = h('div');
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: FORMS[type].title }), h('p', { class: 'hint', text: 'Newest first. Tap an entry to edit it.' })),
      deletedToggle()));
    card.appendChild(h('div', { class: 'row wrap tools' },
      btn(COST_ADD[type], function () { startNew(type); }, 'btn-primary', { id: 'addCost' }),
      btn('CSV', function () { downloadCostCSV(inc, type); }, 'btn-quiet')));
    card.appendChild(costFilterBar(inc, render));
    var items = C.costRecords(inc, { type: type, category: S.costFilter.category, site: S.costFilter.site });
    if (S.showDeleted) {
      C.listRecords(inc, type, null, true).forEach(function (g) {
        if (g.deleted) items.push({ rec: g, type: type, data: g.winner.data, cost: C.costOf(type, g.winner.data), date: C.costDate(type, g.winner.data) });
      });
    }
    items.reverse();
    var total = 0;
    var ul = h('ul', { class: 'items' });
    items.forEach(function (x) {
      if (!x.rec.deleted && !x.cost.donated) total += x.cost.totalCents;
      var li = itemLink(routeBase(type) + '/' + x.rec.rid, itemTitle(type, x.data), [
        costLine(type, x),
        (x.cost.missingRate ? (type === 'rentals' || type === 'contracts' || type === 'travel' ? 'Amount needed' : 'Rate needed') : fmtMoney(x.cost.total) + (x.cost.donated ? ' donated value' : ''))
      ], x.rec);
      if (x.cost.missingRate) li.firstChild.classList.add('needs');
      if (x.cost.donated) {
        li.firstChild.classList.add('donated');
        li.firstChild.firstChild.appendChild(h('span', { class: 'tag', text: 'Donated' }));
      }
      ul.appendChild(li);
    });
    card.appendChild(h('p', { class: 'total-line', text: plural(items.length, 'entry', 'entries') + ' | Total ' + fmtMoney(total / 100) }));
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: 'No entries yet.' }));
    root.appendChild(card);
    return root;
  }

  function costSummaryView(inc) {
    var card = h('section', { class: 'card' });
    card.appendChild(h('h2', { text: 'Cost summary' }));
    card.appendChild(h('p', { class: 'hint', text: 'Labor, equipment, materials, rentals, and contracts, organized the way FEMA Public Assistance summary records group them. Eligibility is decided by FEMA and the state, not by this app.' }));
    card.appendChild(costFilterBar(inc, render));
    var s = C.costSummary(inc, { category: S.costFilter.category, site: S.costFilter.site });
    var table = h('table', { class: 'data' });
    table.appendChild(h('thead', null, h('tr', null, h('th', { text: 'Type' }), h('th', { class: 'num', text: 'Entries' }), h('th', { text: 'Incomplete', title: 'Entries that still need a rate or amount' }), h('th', { class: 'num', text: 'Total' }))));
    var tb = h('tbody');
    COST_TYPES.forEach(function (t) {
      var x = s.types[t];
      tb.appendChild(h('tr', null,
        h('td', null, h('a', { href: '#/costs/' + t, text: FORMS[t].title })),
        h('td', { class: 'num', text: String(x.count) }),
        h('td', { class: x.missing ? 'warn-text' : null, text: x.missing ? String(x.missing) : '' }),
        h('td', { class: 'num', text: fmtMoney(x.total) })));
    });
    tb.appendChild(h('tr', { class: 'total' }, h('td', { text: 'Total' }), h('td'), h('td'), h('td', { class: 'num', text: fmtMoney(s.total) })));
    table.appendChild(tb);
    card.appendChild(h('div', { class: 'table-wrap' }, table));
    if (s.donated.count) {
      card.appendChild(h('div', { class: 'donated-box', id: 'donatedSummary' },
        h('h3', { class: 'small-title', text: 'Donated resources (not in the total above)' }),
        h('p', { text: plural(s.donated.count, 'entry', 'entries') + ' valued at ' + fmtMoney(s.donated.total) +
          (s.donated.hours ? ', including ' + s.donated.hours + ' volunteer hours' : '') + (s.donated.missing ? '. ' + s.donated.missing + ' still need a rate or value.' : '.') }),
        h('p', { class: 'hint', text: 'Volunteer labor, donated equipment, and donated materials used for eligible emergency work can be credited toward the non-federal share. FEMA and the state decide. They print as their own section of the cost summary.' })));
    }
    if (s.types.labor.count) {
      card.appendChild(h('p', { class: 'hint', text: 'Labor: ' + s.types.labor.hours + ' hours, ' + fmtMoney(s.types.labor.reg) + ' regular time, ' + fmtMoney(s.types.labor.ot) + ' overtime (with fringe benefits).' }));
    }
    if (s.categories.length) {
      var ct = h('table', { class: 'data' });
      ct.appendChild(h('thead', null, h('tr', null, h('th', { text: 'Category of work' }), h('th', { class: 'num', text: 'Total' }))));
      var cb = h('tbody');
      s.categories.forEach(function (c) {
        var label = c.category ? F.CATEGORY_LIST.filter(function (x) { return x[0] === c.category; })[0][1] : 'Not set';
        cb.appendChild(h('tr', null, h('td', { text: label }), h('td', { class: 'num', text: fmtMoney(c.total) })));
      });
      ct.appendChild(cb);
      card.appendChild(h('h3', { class: 'small-title', text: 'By category of work' }));
      card.appendChild(h('div', { class: 'table-wrap' }, ct));
    }
    var row = h('div', { class: 'row wrap tools' });
    row.appendChild(btn('Print PA cost summary', function () { openCostPrint(); }, 'btn-primary', { id: 'printCosts' }));
    row.appendChild(btn('Check cost documentation', function () { A.openCostCheck(inc); }, '', { id: 'checkCosts' }));
    COST_TYPES.forEach(function (t) {
      if (s.types[t].count) row.appendChild(btn(COST_NAMES[t] + ' CSV', function () { downloadCostCSV(inc, t); }, 'btn-quiet'));
    });
    card.appendChild(row);
    return card;
  }

  function costsView(inc, r) {
    var root = h('div');
    root.appendChild(costSubnav(inc, r.sub));
    if (r.sub === 'summary') root.appendChild(costSummaryView(inc));
    else if (r.id) root.appendChild(recordRouteView(inc, r.sub, r.id));
    else root.appendChild(costList(inc, r.sub));
    return root;
  }

  /* ---------- exports ---------- */

  A.costFilterBar = costFilterBar;
  A.costSubnav = costSubnav;
  A.costLine = costLine;
  A.costList = costList;
  A.costSummaryView = costSummaryView;
  A.costsView = costsView;
})(window.FieldApp);
