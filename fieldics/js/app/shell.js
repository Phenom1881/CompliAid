/* FieldICS: The status chip, incident and period bar, tabs, and the main render. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var NAV = A.NAV;
  var S = A.S;
  var btn = A.btn;
  var commitSession = A.commitSession;
  var costsView = A.later('costsView');
  var cur = A.cur;
  var currentPeriodNumber = A.currentPeriodNumber;
  var editorView = A.later('editorView');
  var go = A.go;
  var h = A.h;
  var list204View = A.later('list204View');
  var list211View = A.later('list211View');
  var lockView = A.later('lockView');
  var renderNotices = A.later('renderNotices');
  var renderQuickLog = A.later('renderQuickLog');
  var list213RRView = A.later('list213RRView');
  var list213View = A.later('list213View');
  var logView = A.later('logView');
  var openCompare = A.later('openCompare');
  var openIncidentDialog = A.later('openIncidentDialog');
  var openPeriodDialog = A.later('openPeriodDialog');
  var openRecord = A.openRecord;
  var periodFormView = A.later('periodFormView');
  var periodLabel = A.periodLabel;
  var persist = A.persist;
  var persistSettings = A.persistSettings;
  var plural = A.plural;
  var recordRouteView = A.later('recordRouteView');
  var recordTitle = A.recordTitle;
  var shareView = A.later('shareView');
  var sortedIncidents = A.sortedIncidents;
  var welcomeView = A.later('welcomeView');

  /* ---------- render shell ---------- */

  function renderStatus() {
    var chip = $('statusChip');
    var offline = typeof navigator.onLine === 'boolean' && !navigator.onLine;
    var fileMode = window.location.protocol === 'file:';
    var text;
    var ok = false;
    if (S.storageKind === 'memory') {
      text = 'Not saving on this device';
    } else if (S.swReady) {
      text = 'Ready for offline use';
      ok = true;
    } else if (fileMode) {
      text = 'Running from a file';
      ok = true;
    } else {
      text = 'Not yet saved for offline use';
    }
    if (offline) text += ' | No connection';
    chip.textContent = text;
    chip.className = 'chip ' + (ok ? 'ok' : 'warn');
  }


  function renderIncidentBar(inc) {
    var bar = $('incidentBar');
    bar.textContent = '';
    bar.hidden = S.incidents.size === 0;
    if (bar.hidden) return;
    var sel = h('select', { id: 'incidentSelect', 'aria-label': 'Incident' });
    sortedIncidents().forEach(function (i) {
      sel.appendChild(h('option', { value: i.id, text: i.name + (i.number ? ' (' + i.number + ')' : ''), selected: i.id === S.currentId }));
    });
    sel.addEventListener('change', function () { switchIncident(sel.value); });
    bar.appendChild(h('div', { class: 'bar-row' },
      h('label', { class: 'bar-label', for: 'incidentSelect', text: 'Incident' }),
      h('div', { class: 'bar-controls' },
        sel,
        btn('Details', function () { openIncidentDialog('edit'); }, 'btn-quiet btn-small', { id: 'incidentDetailsBtn', 'aria-label': 'Incident details' }),
        btn('New', function () { openIncidentDialog('new'); }, 'btn-small', { id: 'newIncidentBtn', 'aria-label': 'New incident' }))));
    if (!inc) return;
    var list = C.periods(inc);
    var controls = h('div', { class: 'bar-controls' });
    if (list.length) {
      var n = currentPeriodNumber(inc);
      var ps = h('select', { id: 'periodSelect' });
      list.forEach(function (p) {
        ps.appendChild(h('option', { value: String(p.n), text: periodLabel(p), selected: p.n === n }));
      });
      ps.addEventListener('change', function () { switchPeriod(+ps.value); });
      controls.appendChild(ps);
      controls.appendChild(btn('Edit', function () { openPeriodDialog('edit', currentPeriodNumber(cur())); }, 'btn-quiet btn-small', { id: 'editPeriodBtn', 'aria-label': 'Edit operational period' }));
    } else {
      controls.appendChild(h('span', { id: 'periodSelect', class: 'hint grow', text: 'None yet.' }));
    }
    controls.appendChild(btn('New', function () { openPeriodDialog('new'); }, 'btn-small', { id: 'newPeriodBtn', 'aria-label': 'New operational period' }));
    bar.appendChild(h('div', { class: 'bar-row' },
      h('label', { class: 'bar-label', for: 'periodSelect', text: 'Operational period' }), controls));
  }

  function conflictCounts(inc) {
    var counts = {};
    C.conflictList(inc).forEach(function (g) {
      NAV.forEach(function (item) {
        if (item.types.indexOf(g.type) !== -1) counts[item.r] = (counts[item.r] || 0) + 1;
      });
    });
    return counts;
  }

  function renderNav(inc) {
    var nav = $('nav');
    nav.textContent = '';
    nav.hidden = !inc;
    if (!inc) return;
    var counts = conflictCounts(inc);
    var active = null;
    var group = '';
    NAV.forEach(function (item) {
      if (item.group !== group) {
        group = item.group;
        nav.appendChild(h('span', { class: 'nav-group', text: group }));
      }
      var on = S.route.name === item.r;
      var a = h('a', { class: 'tab', href: '#/' + item.r, 'aria-current': on ? 'page' : null },
        item.code ? h('span', { class: 'nav-code', text: item.code }) : null,
        h('span', { class: 'nav-name', text: item.label }));
      if (counts[item.r]) {
        a.appendChild(h('span', { class: 'badge', text: String(counts[item.r]), title: plural(counts[item.r], 'item', 'items') + ' with versions to compare' }));
      }
      if (on) active = a;
      nav.appendChild(a);
    });
    if (active && typeof active.scrollIntoView === 'function') {
      var left = active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2;
      nav.scrollLeft = Math.max(0, left);
    }
  }

  function renderConflictBar(inc) {
    var bar = $('conflictBar');
    bar.textContent = '';
    var list = inc ? C.conflictList(inc) : [];
    bar.hidden = !list.length;
    if (!list.length) return;
    bar.appendChild(h('p', { text: (list.length === 1 ? '1 form has' : list.length + ' forms have') +
      ' versions saved separately on different devices. Compare them and keep the right one:' }));
    var row = h('div', { class: 'row wrap' });
    list.slice(0, 6).forEach(function (g) {
      row.appendChild(btn(recordTitle(g), function () { openRecord(cur(), g, true); }, 'btn-small'));
    });
    if (list.length > 6) row.appendChild(h('span', { text: 'and ' + (list.length - 6) + ' more in the form tabs.' }));
    bar.appendChild(row);
  }

  function render() {
    renderStatus();
    $('settingsBtn').hidden = !!S.lock.locked;
    if (S.lock.locked) {
      ['incidentBar', 'nav', 'conflictBar', 'noticeBar'].forEach(function (id) { $(id).hidden = true; });
      renderQuickLog(null);
      var lv = $('view');
      lv.textContent = '';
      lv.appendChild(lockView());
      return;
    }
    var inc = cur();
    document.documentElement.classList.toggle('is-exercise', !!(inc && inc.exercise));
    renderNotices(inc);
    renderQuickLog(inc);
    renderIncidentBar(inc);
    renderNav(inc);
    renderConflictBar(inc);
    var view = $('view');
    view.textContent = '';
    if (!S.ready) {
      view.appendChild(h('p', { class: 'hint', text: 'Opening storage...' }));
      return;
    }
    if (!inc) {
      view.appendChild(welcomeView());
      return;
    }
    var r = S.route;
    var el;
    if (r.name === 'log') el = logView(inc);
    else if (r.name === '201') el = editorView(inc, '201', C.recordId('201'), null, false);
    else if (r.name === '202' || r.name === '203' || r.name === '205') el = periodFormView(inc, r.name);
    else if (r.name === '204') el = r.id ? recordRouteView(inc, '204', r.id) : list204View(inc);
    else if (r.name === '211') el = r.id ? recordRouteView(inc, '211', r.id) : list211View(inc);
    else if (r.name === '213') el = r.id ? recordRouteView(inc, '213', r.id) : list213View(inc);
    else if (r.name === '213rr') el = r.id ? recordRouteView(inc, '213RR', r.id) : list213RRView(inc);
    else if (r.name === 'costs') el = costsView(inc, r);
    else el = shareView(inc);
    view.appendChild(el);
    if (S.pendingCompare && S.session && S.session.rid === S.pendingCompare) {
      var rid = S.pendingCompare;
      S.pendingCompare = null;
      setTimeout(function () { openCompare(rid); }, 0);
    } else {
      S.pendingCompare = null;
    }
  }

  function switchIncident(id) {
    if (!S.incidents.has(id)) return;
    commitSession('leave');
    S.session = null;
    S.currentId = id;
    S.settings.lastIncidentId = id;
    S.logDraft.correcting = null;
    S.logFilter = { author: '', period: '' };
    persistSettings();
    if (S.route.id) go('#/' + S.route.name);
    else render();
  }

  function switchPeriod(n) {
    var inc = cur();
    if (!inc) return;
    commitSession('leave');
    S.session = null;
    inc._period = n;
    persist(inc);
    if (S.route.name === '204' && S.route.id) go('#/204');
    else render();
  }

  /* ---------- exports ---------- */

  A.renderStatus = renderStatus;
  A.renderIncidentBar = renderIncidentBar;
  A.conflictCounts = conflictCounts;
  A.renderNav = renderNav;
  A.renderConflictBar = renderConflictBar;
  A.render = render;
  A.switchIncident = switchIncident;
  A.switchPeriod = switchPeriod;
})(window.FieldApp);
