/* FieldICS: Volunteer sign-in and sign-out, their hours as donated labor, and donated goods. */
(function (A) {
  'use strict';

  var C = A.C;
  var P = A.P;
  var S = A.S;
  var btn = A.btn;
  var clone = A.clone;
  var commitSession = A.commitSession;
  var deletedToggle = A.deletedToggle;
  var deviceLabel = A.deviceLabel;
  var fmtDT = A.fmtDT;
  var fmtMoney = A.fmtMoney;
  var go = A.go;
  var h = A.h;
  var itemLink = A.itemLink;
  var markDirty = A.markDirty;
  var nowMinute = A.nowMinute;
  var persist = A.persist;
  var plural = A.plural;
  var printCtx = A.printCtx;
  var recordRouteView = A.recordRouteView;
  var render = A.render;
  var routeBase = A.routeBase;
  var startNew = A.startNew;
  var toast = A.toast;
  var whoName = A.whoName;
  var runPrint = A.later('runPrint');

  var Assess = window.FieldAssess;

  function by() {
    return { by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel() };
  }

  /* Labor entries already made from volunteer sign-ins, by source and date. */
  function madeFrom(inc) {
    var set = new Set();
    C.costRecords(inc, { type: 'labor' }).forEach(function (x) {
      if (x.data.source) set.add(x.data.source + '|' + x.date);
    });
    return set;
  }

  /* Makes the donated labor entries for signed-out volunteers that do not have them yet. Returns how many were made. */
  function recordLabor(inc, groups) {
    var have = madeFrom(inc);
    var made = 0;
    groups.forEach(function (g) {
      Assess.volunteerLabor(g.winner.data, g.rid).forEach(function (x) {
        if (have.has(x.data.source + '|' + x.data.date)) return;
        var o = by();
        o.type = 'labor';
        o.data = x.data;
        C.saveRecord(inc, o);
        have.add(x.data.source + '|' + x.data.date);
        made++;
      });
    });
    if (made) persist(inc);
    return made;
  }

  function signOut(inc, g) {
    commitSession('leave');
    S.session = null;
    var data = clone(g.winner.data);
    data.signOut = nowMinute().toISOString();
    try {
      var o = by();
      o.rid = g.rid;
      o.type = 'volunteer';
      o.parents = [g.winner.id];
      o.data = data;
      C.saveRecord(inc, o);
    } catch (err) {
      toast(err.message);
      return;
    }
    persist(inc);
    render();
    toast(data.name + ' signed out after ' + plural(Assess.volunteerHours(data) || 0, 'hour', 'hours') + '.');
  }

  function volunteersView(inc) {
    var all = C.listRecords(inc, 'volunteer', null, S.showDeleted);
    var filter = S.volunteerFilter;
    var items = all.filter(function (g) {
      if (filter === 'here') return !g.deleted && !g.winner.data.signOut;
      if (filter === 'out') return !g.deleted && !!g.winner.data.signOut;
      return true;
    }).sort(function (a, b) { return (b.winner.data.signIn || '') < (a.winner.data.signIn || '') ? -1 : 1; });
    var t = Assess.volunteerTotals(inc);
    var closed = C.isClosed(inc);

    var card = h('section', { class: 'card' });
    var sel = h('select', { id: 'volunteerFilter', 'aria-label': 'Show' });
    [['here', 'Signed in now'], ['out', 'Signed out'], ['all', 'Everyone']].forEach(function (o) {
      sel.appendChild(h('option', { value: o[0], text: o[1], selected: o[0] === filter }));
    });
    sel.addEventListener('change', function () { S.volunteerFilter = sel.value; render(); });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'Volunteers' }),
        h('p', { class: 'hint', id: 'volunteerCounts', text: plural(t.here, 'volunteer', 'volunteers') + ' signed in now. ' + plural(t.count, 'sign-in', 'sign-ins') + ' in all, ' + t.hours + ' hours.' })),
      h('div', { class: 'row wrap' }, sel, deletedToggle())));
    var tools = h('div', { class: 'row wrap tools' });
    if (!closed) tools.appendChild(btn('Sign in a volunteer', function () { startNew('volunteer'); }, 'btn-primary', { id: 'newVolunteer' }));
    tools.appendChild(btn('Print sign-in sheet', function () { printSheet(inc, false); }, 'btn-quiet', { id: 'printVolunteers' }));
    tools.appendChild(btn('Blank sign-in sheet', function () { printSheet(inc, true); }, 'btn-quiet'));
    var pending = all.filter(function (g) { return !g.deleted && g.winner.data.signOut; });
    if (pending.length && !closed) {
      tools.appendChild(btn('Record hours as donated labor', function () {
        var made = recordLabor(inc, pending);
        toast(made ? 'Made ' + plural(made, 'donated labor entry', 'donated labor entries') + '. Find them under Costs, Labor, and in the donated resources.' : 'Every signed-out volunteer already has donated labor entries.');
        render();
      }, '', { id: 'volunteerLabor' }));
    }
    card.appendChild(tools);
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      var hours = Assess.volunteerHours(d);
      var li = itemLink(routeBase('volunteer') + '/' + g.rid, d.name + (d.organization ? ', ' + d.organization : ''), [
        'In ' + fmtDT(d.signIn) + (d.signOut ? ' | Out ' + fmtDT(d.signOut) + ' (' + plural(hours || 0, 'hour', 'hours') + ')' : ' | On site'),
        [d.work, d.skills, d.waiver ? 'Waiver signed' : 'No waiver yet', d.briefed ? 'Briefed' : 'Not briefed'].filter(Boolean).join(' | ')
      ], g);
      if (!g.deleted && !d.signOut && !closed) {
        li.appendChild(btn('Sign out', function () { signOut(inc, g); }, 'btn-small item-action', { 'aria-label': 'Sign out ' + d.name }));
      }
      ul.appendChild(li);
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: all.length ? 'No one matches this view.' : 'No volunteers signed in yet.' }));

    var don = C.costSummary(inc).donated;
    var gifts = h('section', { class: 'card' });
    gifts.appendChild(h('h2', { text: 'Donated goods and equipment' }));
    gifts.appendChild(h('p', { class: 'hint', text: 'Donated materials, donated equipment time, and volunteer labor are listed together as donated resources, kept out of the cost totals. They can be credited toward the non-federal share of eligible emergency work.' }));
    gifts.appendChild(h('p', { id: 'donatedTotal', text: plural(don.count, 'donated resource', 'donated resources') + ' valued at ' + fmtMoney(don.total) + (don.hours ? ', including ' + don.hours + ' volunteer hours' : '') + '.' }));
    if (!closed) {
      gifts.appendChild(h('div', { class: 'row wrap tools' },
        btn('Record donated materials', function () {
          S.prefill = { type: 'materials', data: { obtained: 'Donated' } };
          startNew('materials');
        }, '', { id: 'donateMaterials' }),
        btn('Record donated equipment', function () {
          S.prefill = { type: 'equipment', data: { donated: true } };
          startNew('equipment');
        }, '', { id: 'donateEquipment' }),
        btn('See donated resources', function () { go('#/costs/summary'); }, 'btn-quiet')));
    }
    var root = h('div');
    root.appendChild(card);
    root.appendChild(gifts);
    return root;
  }

  function printSheet(inc, blank) {
    commitSession('quiet');
    var rows = blank ? [] : C.listRecords(inc, 'volunteer').map(function (g) { return g.winner.data; }).sort(function (a, b) {
      return (a.signIn || '') < (b.signIn || '') ? -1 : 1;
    });
    runPrint([P.volunteerSheet(printCtx(blank ? { name: '', number: '', exercise: false, atts: [] } : inc), rows, { blank: blank })],
      { title: blank ? 'Volunteer sign-in sheet (blank)' : 'Volunteer sign-in sheet' });
  }

  function volunteerTools(inc, s) {
    var tools = [];
    if (!s.data.signOut) {
      tools.push(['Sign out now', function () {
        s.data.signOut = nowMinute().toISOString();
        markDirty();
        render();
        toast('Sign-out time set. Press Save to record it.');
      }]);
    } else if (!s.isNew) {
      tools.push(['Record hours as donated labor', function () {
        if (s.dirty) {
          var res = commitSession('save');
          if (!res.ok) {
            toast(res.error);
            return;
          }
        }
        var g = C.getRecord(inc, s.rid);
        var made = g ? recordLabor(inc, [g]) : 0;
        toast(made ? 'Made ' + plural(made, 'donated labor entry', 'donated labor entries') + '.' : 'This sign-in already has its donated labor entries.');
      }]);
    }
    return tools;
  }

  A.toolsFor.volunteer = volunteerTools;
  A.views.volunteers = function (inc, r) { return r.id ? recordRouteView(inc, 'volunteer', r.id) : volunteersView(inc); };

  /* ---------- exports ---------- */

  A.volunteersView = volunteersView;
  A.recordVolunteerLabor = recordLabor;
  A.printVolunteerSheet = printSheet;
})(window.FieldApp);
