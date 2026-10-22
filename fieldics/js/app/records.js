/* FieldICS: Comparing versions, history, and print context. */
(function (A) {
  'use strict';

  var APP_NAME = A.APP_NAME;
  var C = A.C;
  var F = A.F;
  var FORMS = A.FORMS;
  var P = A.P;
  var S = A.S;
  var btn = A.btn;
  var clearStoredSession = A.clearStoredSession;
  var clone = A.clone;
  var closePanel = A.closePanel;
  var commitSession = A.commitSession;
  var cur = A.cur;
  var deviceLabel = A.deviceLabel;
  var ensureSession = A.ensureSession;
  var fmtDT = A.fmtDT;
  var fmtDay = A.fmtDay;
  var fmtMoney = A.fmtMoney;
  var fmtRate = A.fmtRate;
  var go = A.go;
  var h = A.h;
  var headKey = A.headKey;
  var idOf = A.idOf;
  var markDirty = A.markDirty;
  var nextId = A.nextId;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var persistSessionSoon = A.persistSessionSoon;
  var plural = A.plural;
  var recordTitle = A.recordTitle;
  var render = A.render;
  var routeBase = A.routeBase;
  var toast = A.toast;
  var whoName = A.whoName;

  /* ---------- compare and history ---------- */

  function valueSummary(f, v) {
    if (C.isEmptyValue(v)) return '(empty)';
    if (f.kind === 'rows') {
      var first = v.slice(0, 4).map(function (row) {
        return f.columns.map(function (c) { return P.valueText(c, row[c.k], printCtx(cur())); }).filter(Boolean).join(', ');
      });
      return plural(v.length, 'row', 'rows') + ': ' + first.join(' / ') + (v.length > 4 ? ' / ...' : '');
    }
    if (f.kind === 'image') return 'Image';
    var text = P.valueText(f, v, printCtx(cur()));
    return text.length > 400 ? text.slice(0, 400) + '...' : text;
  }

  function resolveWith(rid, data, deleted) {
    var inc = cur();
    var g = C.getRecord(inc, rid);
    if (!g) return;
    try {
      C.saveRecord(inc, {
        rid: g.rid, type: g.type, period: g.period, parents: g.heads.map(idOf),
        data: deleted ? undefined : data, deleted: !!deleted,
        by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel()
      });
    } catch (err) {
      toast(err.message);
      return;
    }
    persist(inc);
    S.session = null;
    clearStoredSession();
    closePanel();
    toast(deleted ? 'Kept the deletion.' : 'Done. This form now has one current version.');
    if (deleted) go(routeBase(g.type));
    else render();
  }

  function openCompare(rid) {
    var s = S.session;
    if (s && s.rid === rid && s.dirty) commitSession('quiet');
    var inc = cur();
    var g = C.getRecord(inc, rid);
    if (!g || g.heads.length < 2) {
      render();
      return;
    }
    var def = FORMS[g.type];
    var heads = g.heads;
    var wi = Math.max(0, heads.indexOf(g.winner));
    var fields = F.fieldsOf(def).filter(function (f) {
      return heads.some(function (x) { return !C.sameValue(x.data[f.k], heads[wi].data[f.k]); });
    });
    var delDiff = heads.some(function (x) { return x.deleted; }) && heads.some(function (x) { return !x.deleted; });
    var body = openPanel('Compare versions: ' + recordTitle(g));
    body.appendChild(h('p', { text: 'These versions were saved separately, on different devices or by different people. Keep one whole version, or pick item by item below. Nothing is lost: every version stays in the history.' }));
    function letter(i) { return String.fromCharCode(65 + i); }
    var legend = h('div', { class: 'cmp-versions' });
    heads.forEach(function (x, i) {
      legend.appendChild(h('div', { class: 'cmp-version' },
        h('div', { class: 'cmp-letter', text: 'Version ' + letter(i) + (i === wi ? ' (shown now)' : '') }),
        h('div', { class: 'hint', text: 'Saved ' + fmtDT(x.at) + ' by ' + (x.by || 'Unknown') + (x.deviceName ? ' on ' + x.deviceName : '') }),
        x.deleted ? h('span', { class: 'tag warn', text: 'Deletes this item' }) : null,
        btn(x.deleted ? 'Keep the deletion' : 'Keep version ' + letter(i), function () { resolveWith(rid, x.data, x.deleted); }, 'btn-small', { 'data-keep': String(i) })));
    });
    body.appendChild(legend);
    if (!fields.length && !delDiff) {
      body.appendChild(h('p', { text: 'The versions have the same content.' }));
      body.appendChild(h('div', { class: 'row end' }, btn('Combine them', function () { resolveWith(rid, heads[wi].data, false); }, 'btn-primary')));
      return;
    }
    body.appendChild(h('h3', { class: 'small-title', text: 'Or pick item by item (' + plural(fields.length + (delDiff ? 1 : 0), 'difference', 'differences') + ')' }));
    var groupName = 'cmp' + Date.now();
    function choiceGroup(key, title, describe) {
      var fs = h('fieldset', { class: 'cmp-field', 'data-key': key });
      fs.appendChild(h('legend', { text: title }));
      heads.forEach(function (x, i) {
        var id = nextId('cmp');
        fs.appendChild(h('label', { class: 'cmp-option', for: id },
          h('input', { type: 'radio', name: groupName + '-' + key, id: id, value: String(i), checked: i === wi }),
          h('span', { class: 'cmp-tag', text: letter(i) }),
          h('span', { class: 'cmp-val', text: describe(x) })));
      });
      return fs;
    }
    if (delDiff) {
      body.appendChild(choiceGroup('_deleted', 'Keep or delete this item?', function (x) { return x.deleted ? 'Delete it' : 'Keep it'; }));
    }
    fields.forEach(function (f) {
      body.appendChild(choiceGroup(f.k, f.label, function (x) { return valueSummary(f, x.data[f.k]); }));
    });
    body.appendChild(h('div', { class: 'row end wrap' },
      btn('Cancel', closePanel, 'btn-quiet'),
      btn('Use the selected values', function () {
        function picked(name) {
          var el = body.querySelector('input[name="' + name + '"]:checked');
          return el ? +el.value : wi;
        }
        if (delDiff && heads[picked(groupName + '-_deleted')].deleted) {
          resolveWith(rid, null, true);
          return;
        }
        var data = clone(heads[wi].deleted ? heads.filter(function (x) { return !x.deleted; })[0].data : heads[wi].data);
        fields.forEach(function (f) {
          data[f.k] = clone(heads[picked(groupName + '-' + f.k)].data[f.k]);
        });
        S.session = {
          incId: inc.id, type: g.type, rid: g.rid, period: g.period,
          baseHeads: heads.map(idOf), data: data, dirty: true, isNew: false, seen: headKey(g)
        };
        persistSessionSoon();
        closePanel();
        render();
        toast('Combined version loaded. Check it, then press Save.');
      }, 'btn-primary', { id: 'useSelected' })));
  }

  function printCtx(inc) {
    return {
      incident: inc,
      attachment: function (id) { return C.getAttachment(inc, id); },
      fmt: { dt: fmtDT, day: fmtDay, money: fmtMoney, rate: fmtRate },
      printedAt: C.nowISO(),
      appName: APP_NAME,
      locality: A.setup().locality
    };
  }

  function openHistory(rid) {
    var inc = cur();
    var g = C.getRecord(inc, rid);
    if (!g) return;
    var def = FORMS[g.type];
    var body = openPanel('History: ' + recordTitle(g));
    function showList() {
      body.textContent = '';
      body.appendChild(h('p', { class: 'hint', text: 'Every saved version is kept, newest first. Restoring loads an older version into the form so you can save it as the current one.' }));
      var ol = h('ol', { class: 'history' });
      g.revs.slice().reverse().forEach(function (r) {
        var isHead = g.heads.indexOf(r) !== -1;
        var li = h('li');
        li.appendChild(h('div', { class: 'history-meta', text: fmtDT(r.at) + ' | ' + (r.by || 'Unknown') + (r.deviceName ? ' on ' + r.deviceName : '') }));
        var tags = h('div');
        if (isHead) tags.appendChild(h('span', { class: 'tag', text: g.conflict ? 'Current (one of ' + g.heads.length + ')' : 'Current' }));
        if (r.deleted) tags.appendChild(h('span', { class: 'tag warn', text: 'Deleted' }));
        if (r.parents.length > 1) tags.appendChild(h('span', { class: 'tag', text: 'Combined ' + r.parents.length + ' versions' }));
        li.appendChild(tags);
        var row = h('div', { class: 'row wrap' });
        row.appendChild(btn('View', function () { showVersion(r); }, 'btn-quiet btn-small'));
        if (!r.deleted && !(isHead && !g.conflict)) {
          row.appendChild(btn('Restore this version', function () { restoreVersion(g, r); }, 'btn-small'));
        }
        li.appendChild(row);
        ol.appendChild(li);
      });
      body.appendChild(ol);
    }
    function showVersion(r) {
      body.textContent = '';
      body.appendChild(h('div', { class: 'row wrap' }, btn('Back to history', showList, 'btn-quiet btn-small'),
        h('span', { class: 'hint', text: 'Saved ' + fmtDT(r.at) + ' by ' + (r.by || 'Unknown') + (r.deviceName ? ' on ' + r.deviceName : '') })));
      var period = g.period ? C.periodOf(inc, g.period) : null;
      var preview = h('div', { class: 'preview' });
      preview.appendChild(P.form(g.type, r.data, printCtx(inc), { period: period, versionText: 'Viewing an older version.' }));
      body.appendChild(preview);
    }
    function restoreVersion(rec, r) {
      var s = ensureSession(inc, rec.type, rec.rid, rec.period, false);
      s.data = clone(r.data);
      markDirty();
      closePanel();
      render();
      toast('Older version loaded. Press Save to make it current.');
    }
    if (def) showList();
  }

  /* ---------- exports ---------- */

  A.valueSummary = valueSummary;
  A.resolveWith = resolveWith;
  A.openCompare = openCompare;
  A.printCtx = printCtx;
  A.openHistory = openHistory;
})(window.FieldApp);
