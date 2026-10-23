/* FieldICS: Lists of 204s, 213s, and 213 RRs. */
(function (A) {
  'use strict';

  var C = A.C;
  var F = A.F;
  var FORMS = A.FORMS;
  var S = A.S;
  var btn = A.btn;
  var clone = A.clone;
  var commitSession = A.commitSession;
  var currentPeriodNumber = A.currentPeriodNumber;
  var defaultValue = A.defaultValue;
  var deviceLabel = A.deviceLabel;
  var fmtDT = A.fmtDT;
  var go = A.go;
  var h = A.h;
  var itemTitle = A.itemTitle;
  var needPeriodCard = A.needPeriodCard;
  var nextId = A.nextId;
  var persist = A.persist;
  var plural = A.plural;
  var previousPeriodWith = A.previousPeriodWith;
  var printMany = A.later('printMany');
  var render = A.render;
  var routeBase = A.routeBase;
  var savedLine = A.savedLine;
  var title204 = A.title204;
  var toast = A.toast;
  var whoName = A.whoName;

  /* ---------- lists ---------- */

  function itemLink(href, title, lines, g) {
    var a = h('a', { class: 'item' + (g && g.deleted ? ' is-deleted' : ''), href: href });
    var top = h('span', { class: 'item-top' }, h('span', { class: 'item-title', text: title }));
    if (g && g.conflict) top.appendChild(h('span', { class: 'tag warn', text: 'Versions to compare' }));
    if (g && g.deleted) top.appendChild(h('span', { class: 'tag', text: 'Deleted' }));
    a.appendChild(top);
    lines.forEach(function (l) { if (l) a.appendChild(h('span', { class: 'item-line', text: l })); });
    return h('li', null, a);
  }

  function deletedToggle() {
    var id = nextId('showDeleted');
    var box = h('input', { type: 'checkbox', id: id, checked: S.showDeleted });
    box.addEventListener('change', function () {
      S.showDeleted = box.checked;
      render();
    });
    return h('label', { class: 'check small', for: id }, box, ' Show deleted');
  }

  function startNew(type) {
    commitSession('leave');
    S.session = null;
    go(routeBase(type) + '/new');
  }

  function list204View(inc) {
    var def = FORMS['204'];
    var n = currentPeriodNumber(inc);
    if (!n) return needPeriodCard('ICS 204 Assignment Lists');
    var items = C.listRecords(inc, '204', n, S.showDeleted).sort(function (a, b) {
      return title204(a.winner.data).localeCompare(title204(b.winner.data));
    });
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'ICS 204 Assignment Lists' }), h('p', { class: 'hint', text: 'Operational period ' + n + '. One assignment list per branch, division, or group.' })),
      deletedToggle()));
    var tools = h('div', { class: 'row wrap tools' });
    if (!C.isClosed(inc)) tools.appendChild(btn('New 204', function () { startNew('204'); }, 'btn-primary', { id: 'new204' }));
    var prev = previousPeriodWith(inc, '204', n);
    if (prev && !C.isClosed(inc)) {
      tools.appendChild(btn('Copy all from period ' + prev, function () {
        var src = C.listRecords(inc, '204', prev);
        if (!window.confirm('Create ' + plural(src.length, 'new 204', 'new 204s') + ' in period ' + n + ' from period ' + prev + '?')) return;
        src.forEach(function (g) {
          var data = clone(g.winner.data);
          (def.resetOnCopy || []).forEach(function (k) {
            var f = F.fieldByKey('204', k);
            var v = defaultValue(f);
            data[k] = v === undefined ? C.emptyValue(f) : v;
          });
          C.saveRecord(inc, { type: '204', period: n, data: data, by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel() });
        });
        persist(inc);
        render();
        toast('Copied ' + plural(src.length, 'assignment list', 'assignment lists') + ' from period ' + prev + '. Review each one.');
      }, ''));
    }
    if (items.some(function (g) { return !g.deleted; })) tools.appendChild(btn('Print all 204s', function () { printMany(inc, '204', n); }, 'btn-quiet'));
    card.appendChild(tools);
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      var people = (d.resources || []).reduce(function (sum, r) { return sum + (r.persons || 0); }, 0);
      ul.appendChild(itemLink('#/204/' + g.rid, title204(d), [
        d.supervisor ? 'Supervisor: ' + d.supervisor : '',
        plural((d.resources || []).length, 'resource', 'resources') + (people ? ', ' + plural(people, 'person', 'people') : ''),
        savedLine(g)
      ], g));
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: 'No 204s for this period yet.' }));
    return card;
  }

  function list213View(inc) {
    var items = C.listRecords(inc, '213', null, S.showDeleted).sort(function (a, b) {
      return (b.winner.data.at || b.created) < (a.winner.data.at || a.created) ? -1 : 1;
    });
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'ICS 213 General Messages' }), h('p', { class: 'hint', text: plural(items.length, 'message', 'messages') + '.' })),
      deletedToggle()));
    var tools = h('div', { class: 'row wrap tools' });
    if (!C.isClosed(inc)) tools.appendChild(btn('New message', function () { startNew('213'); }, 'btn-primary', { id: 'new213' }));
    if (items.some(function (g) { return !g.deleted; })) tools.appendChild(btn('Print all', function () { printMany(inc, '213'); }, 'btn-quiet'));
    card.appendChild(tools);
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      ul.appendChild(itemLink('#/213/' + g.rid, itemTitle('213', d), [
        'To: ' + (d.to || 'not set') + (d.from ? ' | From: ' + d.from : ''),
        (d.at ? fmtDT(d.at) + ' | ' : '') + (d.reply ? 'Replied' + (d.replyName ? ' by ' + d.replyName : '') : 'No reply yet')
      ], g));
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: 'No messages yet.' }));
    return card;
  }

  function list213RRView(inc) {
    var all = C.listRecords(inc, '213RR', null, S.showDeleted);
    var counts = new Map();
    all.forEach(function (g) {
      var k = (g.winner.data.number || '').trim();
      if (k && !g.deleted) counts.set(k, (counts.get(k) || 0) + 1);
    });
    var items = all.filter(function (g) { return !S.rrStatus || g.winner.data.status === S.rrStatus; }).sort(function (a, b) {
      return (b.winner.data.at || b.created) < (a.winner.data.at || a.created) ? -1 : 1;
    });
    var card = h('section', { class: 'card' });
    var statusSel = h('select', { id: 'rrStatus', 'aria-label': 'Filter by status' });
    statusSel.appendChild(h('option', { value: '', text: 'All statuses' }));
    F.fieldByKey('213RR', 'status').options.forEach(function (o) {
      statusSel.appendChild(h('option', { value: o.v, text: o.t, selected: o.v === S.rrStatus }));
    });
    statusSel.addEventListener('change', function () { S.rrStatus = statusSel.value; render(); });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'ICS 213 RR Resource Requests' }), h('p', { class: 'hint', text: plural(all.length, 'request', 'requests') + '.' })),
      h('div', { class: 'row wrap' }, statusSel, deletedToggle())));
    var tools = h('div', { class: 'row wrap tools' });
    if (!C.isClosed(inc)) tools.appendChild(btn('New request', function () { startNew('213RR'); }, 'btn-primary', { id: 'new213rr' }));
    if (all.some(function (g) { return !g.deleted; })) tools.appendChild(btn('Print all', function () { printMany(inc, '213RR'); }, 'btn-quiet'));
    card.appendChild(tools);
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      var dup = d.number && counts.get(d.number.trim()) > 1;
      ul.appendChild(itemLink('#/213rr/' + g.rid, itemTitle('213RR', d), [
        [d.status || 'Requested', d.priority ? d.priority + ' priority' : '', d.at ? fmtDT(d.at) : ''].filter(Boolean).join(' | '),
        d.requestedBy ? 'Requested by ' + d.requestedBy : '',
        dup ? 'Another request uses number ' + d.number + '.' : ''
      ], g));
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: all.length ? 'No requests with this status.' : 'No requests yet.' }));
    return card;
  }

  /* ---------- exports ---------- */

  A.itemLink = itemLink;
  A.deletedToggle = deletedToggle;
  A.startNew = startNew;
  A.list204View = list204View;
  A.list213View = list213View;
  A.list213RRView = list213RRView;
})(window.FieldApp);
