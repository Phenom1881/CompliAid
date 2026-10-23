/* FieldICS: The added ICS forms: 205A contact list, 207 chart, 208 safety message, 209 status summary, and 221 check-out. */
(function (A) {
  'use strict';

  var C = A.C;
  var P = A.P;
  var S = A.S;
  var btn = A.btn;
  var commitSession = A.commitSession;
  var currentPeriodNumber = A.currentPeriodNumber;
  var deletedToggle = A.deletedToggle;
  var fmtDT = A.fmtDT;
  var go = A.go;
  var h = A.h;
  var itemLink = A.itemLink;
  var itemTitle = A.itemTitle;
  var markDirty = A.markDirty;
  var plural = A.plural;
  var printCtx = A.printCtx;
  var recordRouteView = A.recordRouteView;
  var render = A.render;
  var routeBase = A.routeBase;
  var savedLine = A.savedLine;
  var setup = A.setup;
  var startNew = A.startNew;
  var toast = A.toast;
  var versionText = A.versionText;
  var runPrint = A.later('runPrint');
  var printMany = A.later('printMany');

  function low(x) {
    return String(x || '').trim().toLowerCase();
  }

  function live(inc, rid) {
    var g = C.getRecord(inc, rid);
    return g && !g.deleted ? g : null;
  }

  /* ---------- ICS 205A: names from the 203, contact methods from the setup and other forms ---------- */

  function contactsFrom203(d) {
    var out = [];
    function add(position, names) {
      String(names || '').split('\n').forEach(function (nm) {
        nm = nm.trim();
        if (nm) out.push({ position: position, name: nm });
      });
    }
    add('Incident Commander', d.icuc);
    add('Deputy Incident Commander', d.icDeputy);
    add('Safety Officer', d.safety);
    add('Public Information Officer', d.pio);
    add('Liaison Officer', d.liaison);
    (d.agencyReps || []).forEach(function (r) { add('Agency Representative' + (r.agency ? ', ' + r.agency : ''), r.name); });
    add('Operations Section Chief', d.opsChief);
    add('Deputy Operations Section Chief', d.opsDeputy);
    (d.staging || []).forEach(function (r) { add('Staging Area Manager' + (r.area ? ', ' + r.area : ''), r.name); });
    (d.branches || []).forEach(function (r) { add([r.role || 'Branch position', r.branch ? 'Branch ' + r.branch : '', r.unit].filter(Boolean).join(', '), r.name); });
    add('Air Operations Branch Director', d.airOpsDirector);
    add('Planning Section Chief', d.planChief);
    add('Deputy Planning Section Chief', d.planDeputy);
    add('Resources Unit Leader', d.resourcesUnit);
    add('Situation Unit Leader', d.situationUnit);
    add('Documentation Unit Leader', d.documentationUnit);
    add('Demobilization Unit Leader', d.demobUnit);
    (d.techSpecs || []).forEach(function (r) { add('Technical Specialist' + (r.specialty ? ', ' + r.specialty : ''), r.name); });
    add('Logistics Section Chief', d.logChief);
    add('Deputy Logistics Section Chief', d.logDeputy);
    add('Support Branch Director', d.supportDirector);
    add('Supply Unit Leader', d.supplyUnit);
    add('Facilities Unit Leader', d.facilitiesUnit);
    add('Ground Support Unit Leader', d.groundUnit);
    add('Service Branch Director', d.serviceDirector);
    add('Communications Unit Leader', d.commsUnit);
    add('Medical Unit Leader', d.medicalUnit);
    add('Food Unit Leader', d.foodUnit);
    add('Finance/Administration Section Chief', d.finChief);
    add('Deputy Finance/Administration Section Chief', d.finDeputy);
    add('Time Unit Leader', d.timeUnit);
    add('Procurement Unit Leader', d.procurementUnit);
    add('Compensation/Claims Unit Leader', d.compClaimsUnit);
    add('Cost Unit Leader', d.costUnit);
    return out;
  }

  /* How to reach a person: the locality setup first, then their check-in, then a 204. */
  function contactFor(inc, name, n) {
    var key = low(name);
    var p = setup().people.filter(function (x) { return low(x.name) === key; })[0];
    if (p && (p.phone || p.email)) return [p.phone, p.email].filter(Boolean).join(', ');
    var ci = C.listRecords(inc, '211').filter(function (g) { return low(g.winner.data.identifier) === key && g.winner.data.contact; })[0];
    if (ci) return ci.winner.data.contact;
    var found = '';
    C.listRecords(inc, '204', n).forEach(function (g) {
      var d = g.winner.data;
      if (found) return;
      if (low(d.supervisor) === key && d.supervisorContact) found = d.supervisorContact;
      else if (low(d.branchDirector) === key && d.branchContact) found = d.branchContact;
      else if (low(d.osc) === key && d.oscContact) found = d.oscContact;
    });
    return found;
  }

  function fill205A(inc, s) {
    var g203 = live(inc, C.recordId('203', s.period));
    var list = (s.data.contacts || []).slice();
    var have = new Map();
    list.forEach(function (r) { if (r.name) have.set(low(r.name), r); });
    var added = 0;
    var filled = 0;
    var people = g203 ? contactsFrom203(g203.winner.data) : [];
    people.forEach(function (x) {
      var row = have.get(low(x.name));
      if (!row) {
        row = { position: x.position, name: x.name, method: contactFor(inc, x.name, s.period) };
        list.push(row);
        have.set(low(x.name), row);
        added++;
      }
    });
    list.forEach(function (r) {
      if (!r.method && r.name) {
        var m = contactFor(inc, r.name, s.period);
        if (m) {
          r.method = m;
          filled++;
        }
      }
    });
    list.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    s.data.contacts = list;
    markDirty();
    render();
    if (!g203) toast('There is no 203 for this period, so only contact methods were filled in' + (filled ? ' (' + filled + ').' : '. None were found.'));
    else toast((added ? 'Added ' + plural(added, 'person', 'people') + ' from the 203. ' : 'Everyone on the 203 is already listed. ') +
      (filled ? 'Filled in ' + plural(filled, 'contact method', 'contact methods') + '.' : ''));
  }

  /* ---------- ICS 208 ---------- */

  function tools208(inc, s) {
    var out = [];
    var g202 = live(inc, C.recordId('202', s.period));
    if (g202 && (g202.winner.data.sspRequired || g202.winner.data.sspLocation)) {
      out.push(['Copy site safety plan from 202', function () {
        s.data.sspRequired = g202.winner.data.sspRequired;
        s.data.sspLocation = g202.winner.data.sspLocation;
        markDirty();
        render();
        toast('Copied block 5 of the 202.');
      }]);
    }
    var g215a = live(inc, C.recordId('215A', s.period));
    if (g215a && (g215a.winner.data.analysis || []).length) {
      out.push(['Add hazards from 215A', function () {
        var lines = (g215a.winner.data.analysis || []).map(function (r) {
          return '- ' + (r.area ? r.area + ': ' : '') + (r.hazards || '').replace(/\s+/g, ' ') + (r.mitigations ? ' Mitigation: ' + r.mitigations.replace(/\s+/g, ' ') : '');
        });
        s.data.message = (s.data.message ? s.data.message.replace(/\s+$/, '') + '\n\n' : '') + 'Hazards and mitigations (ICS 215A):\n' + lines.join('\n');
        markDirty();
        render();
        toast('Added ' + plural(lines.length, 'area', 'areas') + ' from the 215A.');
      }]);
    }
    return out;
  }

  /* ---------- ICS 209 ---------- */

  function fmtClock(iso) {
    var d = new Date(iso);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + p(d.getMinutes());
  }

  /* Agencies with resources on the incident now, from the 211 check-ins and volunteers. */
  function commitmentRows(inc) {
    var by = new Map();
    function row(agency) {
      var k = low(agency) || 'not stated';
      if (!by.has(k)) by.set(k, { agency: agency || 'Agency not stated', kinds: new Map(), resourceCount: 0, resourcePeople: 0, additional: 0 });
      return by.get(k);
    }
    C.listRecords(inc, '211').forEach(function (g) {
      var d = g.winner.data;
      if (d.checkOut) return;
      var r = row(d.agency || d.homeUnit);
      var persons = d.persons || 1;
      if (d.resourceKind === 'Person' || !d.resourceKind) {
        r.additional += persons;
      } else {
        r.resourceCount += 1;
        r.resourcePeople += persons;
        var kind = [d.kind, d.type].filter(Boolean).join(' ') || d.resourceKind;
        r.kinds.set(kind, (r.kinds.get(kind) || 0) + 1);
      }
    });
    var vol = C.listRecords(inc, 'volunteer').filter(function (g) { return !g.winner.data.signOut; });
    if (vol.length) row('Volunteers').additional += vol.length;
    return Array.from(by.values()).map(function (r) {
      return {
        agency: r.agency.slice(0, 200),
        resources: Array.from(r.kinds.keys()).map(function (k) { return r.kinds.get(k) + ' ' + k; }).join(', ').slice(0, 600),
        resourceCount: r.resourceCount || null,
        resourcePeople: r.resourcePeople || null,
        additional: r.additional || null
      };
    });
  }

  /* Fills empty blocks of a 209 from what the incident already holds. Returns the names of the blocks filled. */
  function autoFill209(inc, d) {
    var filled = [];
    function set(k, v, label) {
      if (v === undefined || v === null || v === '' || !C.isEmptyValue(d[k])) return;
      d[k] = v;
      if (label && filled.indexOf(label) === -1) filled.push(label);
    }
    var n = currentPeriodNumber(inc);
    var p = n ? C.periodOf(inc, n) : null;
    set('startAt', inc.createdAt, '6');
    if (p) {
      set('from', p.start, '11');
      set('to', p.end, '11');
    }
    var g203 = n ? live(inc, C.recordId('203', n)) : null;
    var g201 = live(inc, C.recordId('201'));
    set('commanders', g203 && g203.winner.data.icuc ? g203.winner.data.icuc : (g201 ? g201.winner.data.ic : ''), '4');
    var loc = setup().locality;
    set('state', loc.state, '16');
    set('jurisdiction', loc.name, '20');
    set('definition', inc.exercise ? 'Exercise' : '', '9');
    var from = d.from || (p && p.start) || '';
    var to = d.to || (p && p.end) || '';
    var entries = inc.entries.filter(function (e) { return (!from || e.ts >= from) && (!to || e.ts < to); });
    if (entries.length) {
      var lines = entries.slice(-60).map(function (e) { return fmtClock(e.ts) + ' ' + e.text.replace(/\s+/g, ' ').slice(0, 220); });
      set('events', (entries.length > 60 ? '(Last 60 of ' + entries.length + ' log entries)\n' : '') + lines.join('\n'), '28');
    }
    var b30 = window.FieldAssess.block30(inc);
    Object.keys(b30).forEach(function (k) { if (b30[k]) set(k, b30[k], '30'); });
    var t = window.FieldAssess.damageTotals(inc);
    if (t.homes || t.sites) {
      var parts = [];
      if (t.homes) {
        parts.push(plural(t.total, 'dwelling', 'dwellings') + ' assessed: ' + ['Destroyed', 'Major', 'Minor', 'Affected', 'Inaccessible'].map(function (l) {
          return t.levels[l] ? t.levels[l] + ' ' + l.toLowerCase() : '';
        }).filter(Boolean).join(', ') + '.' + (t.notHabitable ? ' ' + plural(t.notHabitable, 'home', 'homes') + ' cannot be lived in now.' : ''));
      }
      if (t.sites) parts.push(plural(t.sites, 'public facility or site', 'public facilities or sites') + ' damaged, about $' + t.siteCost.toFixed(2) + ' to repair' + (t.siteCostMissing ? ' (' + t.siteCostMissing + ' not yet estimated)' : '') + '.');
      set('damageNotes', parts.join(' '), '30');
    }
    var cost = C.costSummary(inc);
    if (cost.total) set('costToDate', cost.total, '45');
    if (!(d.commitment || []).length) {
      var rows = commitmentRows(inc);
      if (rows.length) {
        d.commitment = rows;
        filled.push('48 to 52');
      }
    }
    var prior = C.listRecords(inc, '209').length;
    set('version', prior ? 'Update' : 'Initial');
    return filled;
  }

  function tools209(inc, s) {
    return [['Fill from incident data', function () {
      var filled = autoFill209(inc, s.data);
      markDirty();
      render();
      toast(filled.length ? 'Filled block' + (filled.length === 1 ? ' ' : 's ') + filled.join(', ') + ' from the incident. Only empty blocks are filled.' : 'Nothing to fill. The blocks FieldICS can fill already have something in them.');
    }]];
  }

  function new209(inc) {
    var data = A.defaultsFor(inc, '209');
    autoFill209(inc, data);
    commitSession('leave');
    S.session = null;
    S.prefill = { type: '209', data: data };
    go(routeBase('209') + '/new');
  }

  function list209View(inc) {
    var items = C.listRecords(inc, '209', null, S.showDeleted).sort(function (a, b) {
      return (b.winner.data.prepAt || b.created) < (a.winner.data.prepAt || a.created) ? -1 : 1;
    });
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'ICS 209 Incident Status Summary' }),
        h('p', { class: 'hint', text: 'Situation reports for the state EOC and partners. A new 209 starts filled in from the log, the damage assessment, check-ins, and costs; check it before sending.' })),
      deletedToggle()));
    var tools = h('div', { class: 'row wrap tools' });
    if (!C.isClosed(inc)) tools.appendChild(btn('New status summary', function () { new209(inc); }, 'btn-primary', { id: 'new209' }));
    if (items.some(function (g) { return !g.deleted; })) tools.appendChild(btn('Print all', function () { printMany(inc, '209'); }, 'btn-quiet'));
    card.appendChild(tools);
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      ul.appendChild(itemLink(routeBase('209') + '/' + g.rid, itemTitle('209', d), [
        [d.from ? 'For ' + fmtDT(d.from) + (d.to ? ' to ' + fmtDT(d.to) : '') : '', d.sentTo ? 'Sent to ' + d.sentTo : ''].filter(Boolean).join(' | '),
        savedLine(g)
      ], g));
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: 'No status summaries yet.' }));
    return card;
  }

  /* ---------- ICS 221 demobilization check-out, from a 211 ---------- */

  function make221(inc, s) {
    if (s.dirty) {
      var res = commitSession('save');
      if (!res.ok) {
        toast(res.error);
        return;
      }
    }
    var d = s.data;
    var source = ('ICS 211 check-in: ' + d.identifier).slice(0, 200);
    var existing = C.listRecords(inc, '221').filter(function (g) { return g.winner.data.source === source; })[0];
    if (existing) {
      go(routeBase('221') + '/' + existing.rid);
      toast('This check-in already has an ICS 221. Opened it.');
      return;
    }
    var data = A.defaultsFor(inc, '221');
    data.released = [d.identifier, d.agency].filter(Boolean).join(', ').slice(0, 160);
    data.orderNumber = d.orderNumber || '';
    data.plannedRelease = d.checkOut || '';
    data.actualRelease = d.checkOut || '';
    data.travelMethod = (d.travel || '').slice(0, 80);
    data.destination = (d.homeUnit || d.agency || '').slice(0, 200);
    data.source = source;
    commitSession('leave');
    S.session = null;
    S.prefill = { type: '221', data: data };
    go(routeBase('221') + '/new');
  }

  function list221View(inc) {
    var items = C.listRecords(inc, '221', null, S.showDeleted).sort(function (a, b) {
      return (b.winner.data.plannedRelease || b.created) < (a.winner.data.plannedRelease || a.created) ? -1 : 1;
    });
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null, h('h2', { text: 'ICS 221 Demobilization Check-Out' }),
        h('p', { class: 'hint', text: 'One per resource released. Open a check-in on the 211 and choose "Make ICS 221" to start one with its details.' })),
      deletedToggle()));
    var tools = h('div', { class: 'row wrap tools' });
    if (!C.isClosed(inc)) tools.appendChild(btn('New check-out', function () { startNew('221'); }, 'btn-primary', { id: 'new221' }));
    if (items.some(function (g) { return !g.deleted; })) tools.appendChild(btn('Print all', function () { printMany(inc, '221'); }, 'btn-quiet'));
    card.appendChild(tools);
    var ul = h('ul', { class: 'items' });
    items.forEach(function (g) {
      var d = g.winner.data;
      var needs = 0;
      var signed = 0;
      Object.keys(d).forEach(function (k) {
        if (/^so\w+Need$/.test(k) && d[k]) {
          needs++;
          if (d[k.replace(/Need$/, 'Name')]) signed++;
        }
      });
      ul.appendChild(itemLink(routeBase('221') + '/' + g.rid, itemTitle('221', d), [
        [d.plannedRelease ? 'Release ' + fmtDT(d.plannedRelease) : '', d.orderNumber ? 'Order ' + d.orderNumber : ''].filter(Boolean).join(' | '),
        needs ? signed + ' of ' + needs + ' sign-offs done' : 'No sign-offs checked yet'
      ], g));
    });
    card.appendChild(ul);
    if (!items.length) card.appendChild(h('p', { class: 'hint', text: 'No check-outs yet.' }));
    return card;
  }

  /* ---------- ICS 207 from the 203 ---------- */

  function chartNode(inc, n, iapPage) {
    var g = live(inc, C.recordId('203', n));
    if (!g) return null;
    return P.chart207(printCtx(inc), g.winner.data, { period: C.periodOf(inc, n), iapPage: iapPage, versionText: versionText(g) });
  }

  function print207(inc, n) {
    commitSession('quiet');
    var node = chartNode(inc, n);
    if (!node) {
      toast('Fill in the 203 for period ' + n + ' first. The 207 chart is drawn from it.');
      return;
    }
    runPrint([node], { title: 'ICS 207 organization chart, period ' + n });
  }

  /* ---------- registering ---------- */

  A.toolsFor['205A'] = function (inc, s) { return [['Fill from 203 and setup', function () { fill205A(inc, s); }]]; };
  A.toolsFor['208'] = tools208;
  A.toolsFor['209'] = tools209;
  A.toolsFor['203'] = function (inc, s) { return s.isNew ? [] : [['Print ICS 207 chart', function () { print207(inc, s.period); }]]; };
  A.toolsFor['211'] = function (inc, s) { return !s.isNew && s.data.checkOut ? [['Make ICS 221', function () { make221(inc, s); }]] : []; };

  A.views['209'] = function (inc, r) { return r.id ? recordRouteView(inc, '209', r.id) : list209View(inc); };
  A.views['221'] = function (inc, r) { return r.id ? recordRouteView(inc, '221', r.id) : list221View(inc); };

  /* ---------- exports ---------- */

  A.contactsFrom203 = contactsFrom203;
  A.fill205A = fill205A;
  A.autoFill209 = autoFill209;
  A.commitmentRows = commitmentRows;
  A.new209 = new209;
  A.make221 = make221;
  A.chartNode = chartNode;
  A.print207 = A.withPhotos(print207);
})(window.FieldApp);
