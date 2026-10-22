/* FieldICS: ICS 211 check-in and check-out, and turning check-ins and resource requests into cost entries. */
(function (A) {
  'use strict';

  var C = A.C;
  var FORMS = A.FORMS;
  var S = A.S;
  var btn = A.btn;
  var clone = A.clone;
  var closePanel = A.closePanel;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var currentPeriodNumber = A.currentPeriodNumber;
  var deletedToggle = A.deletedToggle;
  var deviceLabel = A.deviceLabel;
  var fmtDT = A.fmtDT;
  var go = A.go;
  var h = A.h;
  var itemLink = A.itemLink;
  var markDirty = A.markDirty;
  var nowMinute = A.nowMinute;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var plural = A.plural;
  var render = A.render;
  var routeBase = A.routeBase;
  var setup = A.setup;
  var startNew = A.startNew;
  var title204 = A.title204;
  var toast = A.toast;
  var whoName = A.whoName;
  var printCheckins = A.later('printCheckins');
  var rateTools = A.later('rateTools');

  function by() {
    return { by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel() };
  }

  function saveNew(inc, type, data) {
    var o = by();
    o.type = type;
    o.data = data;
    return C.saveRecord(inc, o);
  }

  /* Saves a new version of a record from outside the editor, replacing the version shown. */
  function saveOver(inc, g, data) {
    var o = by();
    o.rid = g.rid;
    o.type = g.type;
    o.period = g.period;
    o.parents = [g.winner.id];
    o.data = data;
    return C.saveRecord(inc, o);
  }

  /* ---------- the activity log feed ---------- */

  function describe(d) {
    var what = [d.identifier, d.agency, [d.kind, d.type].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    var bits = [what];
    if (d.persons) bits.push(plural(d.persons, 'person', 'personnel'));
    if (d.leader) bits.push('Leader: ' + d.leader);
    if (d.assignment) bits.push('Assignment: ' + d.assignment);
    return bits.join('. ');
  }

  function where(d) {
    return (d.location || 'check-in') + (d.locationName ? ' (' + d.locationName + ')' : '');
  }

  function logCheck(inc, kind, d) {
    if (setup().options.checkinsToLog === false) return;
    var text = kind === 'in'
      ? 'Checked in at ' + where(d) + ': ' + describe(d) + '.'
      : 'Checked out: ' + d.identifier + (d.agency ? ', ' + d.agency : '') + '. On the incident ' + hoursText(d) + '.';
    try {
      C.addEntry(inc, {
        text: text,
        author: whoName(),
        position: S.settings.position,
        ts: kind === 'in' ? d.checkIn : d.checkOut,
        source: 'ICS 211',
        deviceId: S.settings.deviceId,
        deviceName: deviceLabel()
      });
    } catch (e) {
      /* The check-in is saved either way. */
    }
  }

  function hoursText(d) {
    var ms = Date.parse(d.checkOut) - Date.parse(d.checkIn);
    if (!(ms > 0)) return 'time not known';
    var hours = Math.round(ms / 360000) / 10;
    return hours + (hours === 1 ? ' hour' : ' hours');
  }

  /* Called after any form is saved. prev is the data before this save, or null. */
  function afterSave(inc, type, data, prev) {
    if (type !== '211') return;
    if (data.checkIn && data.identifier && (!prev || !prev.identifier)) logCheck(inc, 'in', data);
    if (data.checkOut && (!prev || !prev.checkOut)) logCheck(inc, 'out', data);
  }

  /* ---------- the 211 list ---------- */

  function onScene(d) { return !d.checkOut; }

  function list211View(inc) {
    var all = C.listRecords(inc, '211', null, S.showDeleted);
    var here = all.filter(function (g) { return !g.deleted && onScene(g.winner.data); });
    var filter = S.checkinFilter;
    var items = all.filter(function (g) {
      if (filter === 'here') return !g.deleted && onScene(g.winner.data);
      if (filter === 'out') return !g.deleted && !onScene(g.winner.data);
      return true;
    }).sort(function (a, b) { return (b.winner.data.checkIn || '') < (a.winner.data.checkIn || '') ? -1 : 1; });
    var persons = here.reduce(function (n, g) { return n + (g.winner.data.persons || (g.winner.data.resourceKind === 'Person' ? 1 : 0)); }, 0);

    var card = h('section', { class: 'card' });
    var sel = h('select', { id: 'checkinFilter', 'aria-label': 'Show' });
    [['here', 'On the incident now'], ['out', 'Checked out'], ['all', 'Everyone']].forEach(function (o) {
      sel.appendChild(h('option', { value: o[0], text: o[1], selected: o[0] === filter }));
    });
    sel.addEventListener('change', function () { S.checkinFilter = sel.value; render(); });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null,
        h('h2', { text: 'ICS 211 Incident Check-In List' }),
        h('p', { class: 'hint', text: plural(here.length, 'resource', 'resources') + ' on the incident now' + (persons ? ', about ' + plural(persons, 'person', 'people') : '') + '. ' + plural(all.length, 'check-in', 'check-ins') + ' in all.' })),
      h('div', { class: 'row wrap' }, sel, deletedToggle())));
    var tools = h('div', { class: 'row wrap tools' });
    tools.appendChild(btn('Check in', function () { startNew('211'); }, 'btn-primary', { id: 'new211' }));
    if (all.some(function (g) { return !g.deleted; })) tools.appendChild(btn('Print 211', function () { printCheckins(inc, false); }, 'btn-quiet', { id: 'print211' }));
    tools.appendChild(btn('Blank 211', function () { printCheckins(inc, true); }, 'btn-quiet'));
    card.appendChild(tools);
    if (setup().options.checkinsToLog !== false) {
      card.appendChild(h('p', { class: 'hint', text: 'Check-ins and check-outs are added to the ICS 214 activity log automatically.' }));
    }
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      var li = itemLink(routeBase('211') + '/' + g.rid, d.identifier + (d.agency ? ', ' + d.agency : ''), [
        [d.kind, d.type, d.persons ? plural(d.persons, 'person', 'people') : ''].filter(Boolean).join(' | '),
        'In ' + fmtDT(d.checkIn) + ' at ' + where(d) + (d.checkOut ? ' | Out ' + fmtDT(d.checkOut) + ' (' + hoursText(d) + ')' : ' | On the incident'),
        d.assignment ? 'Assignment: ' + d.assignment : ''
      ], g);
      if (!g.deleted && onScene(d)) {
        li.appendChild(btn('Check out', function () { checkOut(g.rid); }, 'btn-small item-action', { 'aria-label': 'Check out ' + d.identifier }));
      }
      ul.appendChild(li);
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: all.length ? 'No one matches this view.' : 'No check-ins yet.' }));
    return card;
  }

  function checkOut(rid) {
    commitSession('leave');
    S.session = null;
    var inc = cur();
    var g = C.getRecord(inc, rid);
    if (!g || g.deleted || g.winner.data.checkOut) return;
    var data = clone(g.winner.data);
    data.checkOut = nowMinute().toISOString();
    try {
      saveOver(inc, g, data);
    } catch (err) {
      toast(err.message);
      return;
    }
    afterSave(inc, '211', data, g.winner.data);
    persist(inc);
    render();
    toast(data.identifier + ' checked out.');
  }

  /* ---------- cost entries from a check-in ---------- */

  function existingSources(inc) {
    var set = new Set();
    C.costRecords(inc).forEach(function (x) {
      if (x.data.source) set.add(x.data.source + '|' + x.date);
    });
    return set;
  }

  function makeCheckinCosts(inc, s) {
    var d = s.data;
    if (s.dirty) {
      var res = commitSession('save');
      if (!res.ok) {
        toast(res.error);
        return;
      }
    }
    var list = C.costsFromCheckin(d, { regularDay: setup().options.regularDay });
    if (!list.length) {
      toast(d.resourceKind === 'Crew, strike team, or task force'
        ? 'Crews need a labor entry for each person. Add them under Costs, Labor.'
        : 'Add a check-out time first.');
      return;
    }
    var have = existingSources(inc);
    var fresh = list.filter(function (x) { return !have.has(x.data.source + '|' + x.data.date); });
    if (!fresh.length) {
      toast('Cost entries for this check-in already exist.');
      return;
    }
    var label = fresh[0].type === 'labor' ? 'labor' : 'equipment';
    if (!window.confirm('Make ' + plural(fresh.length, label + ' entry', label + ' entries') + ' from this check-in (one per day)? Rates and the category of work can be added after.')) return;
    var people = setup().people;
    fresh.forEach(function (x) {
      if (x.type === 'labor') {
        var p = people.filter(function (q) { return q.name.toLowerCase() === String(x.data.name).toLowerCase(); })[0];
        if (p) ['jobTitle', 'personType', 'budgeted', 'regRate', 'otRate', 'fringeReg', 'fringeOt'].forEach(function (k) {
          if (p[k] !== null && p[k] !== '' && x.data[k] === undefined) x.data[k] = p[k];
        });
      }
      saveNew(inc, x.type, x.data);
    });
    persist(inc);
    render();
    toast('Made ' + plural(fresh.length, 'cost entry', 'cost entries') + '. Find them under Costs.');
  }

  function addTo204(inc, s) {
    var n = currentPeriodNumber(inc);
    var list = n ? C.listRecords(inc, '204', n) : [];
    var body = openPanel('Add ' + (s.data.identifier || 'this resource') + ' to a 204');
    if (!list.length) {
      body.appendChild(h('p', { text: n ? 'There are no 204s for operational period ' + n + ' yet.' : 'Create an operational period and a 204 first.' }));
      return;
    }
    body.appendChild(h('p', { class: 'hint', text: 'Adds a row to block 5, Resources assigned, of the 204 you pick, for operational period ' + n + '.' }));
    var ul = h('ul', { class: 'items' });
    list.forEach(function (g) {
      var already = (g.winner.data.resources || []).some(function (r) { return String(r.identifier).toLowerCase() === String(s.data.identifier).toLowerCase(); });
      ul.appendChild(h('li', null, btn(title204(g.winner.data) + (already ? ' (already listed)' : ''), function () {
        var data = clone(g.winner.data);
        data.resources = (data.resources || []).concat([{
          identifier: s.data.identifier, leader: s.data.leader, persons: s.data.persons,
          contact: s.data.contact, notes: [s.data.agency, s.data.kind, s.data.type].filter(Boolean).join(', ')
        }]);
        try {
          saveOver(inc, g, data);
        } catch (err) {
          toast(err.message);
          return;
        }
        if (s.data.assignment === '' || s.data.assignment === undefined) {
          s.data.assignment = title204(g.winner.data);
          markDirty();
        }
        persist(inc);
        closePanel();
        render();
        toast('Added to the 204 for ' + title204(g.winner.data) + '.');
      }, 'btn-wide', { disabled: already })));
    });
    body.appendChild(ul);
  }

  function checkinTools(inc, s) {
    var tools = [];
    if (!s.data.checkOut) {
      tools.push(['Check out now', function () {
        s.data.checkOut = nowMinute().toISOString();
        markDirty();
        render();
        toast('Check-out time set. Press Save to record it.');
      }]);
    }
    if (s.data.checkOut && !s.isNew) tools.push(['Make cost entries', function () { makeCheckinCosts(inc, s); }]);
    if (!s.isNew) tools.push(['Add to a 204', function () { addTo204(inc, s); }]);
    return tools;
  }

  /* ---------- cost entries from a resource request ---------- */

  function requestCosts(inc, s) {
    if (s.dirty) {
      var res = commitSession('save');
      if (!res.ok) {
        toast(res.error);
        return;
      }
    }
    var rr = s.data;
    var items = rr.items || [];
    var body = openPanel('Record costs from request #' + (rr.number || ''));
    var linked = C.costRecords(inc).filter(function (x) { return rr.number && x.data.rrNumber === rr.number; });
    if (linked.length) {
      body.appendChild(h('p', { class: 'conflict-note', text: plural(linked.length, 'cost entry already points', 'cost entries already point') + ' to this request: ' +
        linked.map(function (x) { return FORMS[x.type].title.toLowerCase(); }).join(', ') + '.' }));
    }
    if (!items.length) {
      body.appendChild(h('p', { text: 'This request has no items in block 4.' }));
      return;
    }
    body.appendChild(h('p', { class: 'hint', text: 'Makes one cost entry per item, with the supplier, quantity, and cost from the request and its request number. Add the invoice and date paid when they come in.' }));
    var kind = h('fieldset', { class: 'field plain' }, h('legend', { text: 'Record as' }));
    [['materials', 'Materials and supplies (purchased)'], ['rentals', 'Rented equipment'], ['contracts', 'Contract work']].forEach(function (o, i) {
      kind.appendChild(h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'rrKind', value: o[0], checked: i === 0 }), ' ' + o[1]));
    });
    body.appendChild(kind);
    var boxes = h('fieldset', { class: 'field plain' }, h('legend', { text: 'Items' }));
    items.forEach(function (it, i) {
      var label = (it.qty !== null ? it.qty + ' x ' : '') + ([it.kind, it.type, it.description].filter(Boolean).join(', ') || 'Item ' + (i + 1)) + (it.cost !== null ? ', $' + it.cost : ', no cost yet');
      boxes.appendChild(h('label', { class: 'choice' }, h('input', { type: 'checkbox', value: String(i), checked: true, 'data-item': String(i) }), ' ' + label));
    });
    body.appendChild(boxes);
    body.appendChild(h('div', { class: 'row end' }, btn('Cancel', closePanel, 'btn-quiet'), btn('Make cost entries', function () {
      var type = body.querySelector('input[name="rrKind"]:checked').value;
      var picked = Array.prototype.slice.call(body.querySelectorAll('input[data-item]:checked')).map(function (x) { return +x.value; });
      if (!picked.length) {
        toast('Pick at least one item.');
        return;
      }
      var list = C.costsFromRequest(rr, type, picked);
      list.forEach(function (x) { saveNew(inc, x.type, x.data); });
      persist(inc);
      closePanel();
      toast('Made ' + plural(list.length, 'cost entry', 'cost entries') + '.');
      go('#/costs/' + type);
    }, 'btn-primary', { id: 'rrMakeCosts' })));
  }

  /* Extra buttons at the top of a form, by form type. Returns [[label, onclick]]. */
  function extraTools(inc, type, s) {
    if (type === '211') return checkinTools(inc, s);
    if (type === '213RR' && !s.isNew) return [['Record costs from this request', function () { requestCosts(inc, s); }]];
    if (type === 'equipment') return rateTools(inc, s);
    return [];
  }

  /* ---------- exports ---------- */

  A.afterSave = afterSave;
  A.list211View = list211View;
  A.checkOut = checkOut;
  A.extraTools = extraTools;
})(window.FieldApp);
