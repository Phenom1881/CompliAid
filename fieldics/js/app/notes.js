/* FieldICS: Working notes. Quick to take, editable, and kept apart from the ICS 214 until someone adds one to it. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var F = A.F;
  var S = A.S;
  var btn = A.btn;
  var commitSession = A.commitSession;
  var deletedToggle = A.deletedToggle;
  var deviceLabel = A.deviceLabel;
  var fmtDT = A.fmtDT;
  var h = A.h;
  var nextId = A.nextId;
  var persist = A.persist;
  var plural = A.plural;
  var render = A.render;
  var routeBase = A.routeBase;
  var startNew = A.startNew;
  var toast = A.toast;
  var track = A.track;
  var whoName = A.whoName;
  var runPrint = A.runPrint;
  var printCtx = A.printCtx;

  var KINDS = F.NOTE_KINDS;

  function by() {
    return { by: whoName(), deviceId: S.settings.deviceId, deviceName: deviceLabel() };
  }

  /* Saves a new note. data: { text, kind, pinned, done, photos }. Returns the record id. */
  function addNote(inc, data) {
    var o = by();
    o.type = 'note';
    o.data = {
      text: data.text,
      kind: KINDS.indexOf(data.kind) !== -1 ? data.kind : 'Info',
      pinned: !!data.pinned,
      done: false,
      photos: data.photos || []
    };
    var rec = C.saveRecord(inc, o);
    track('notes');
    return rec;
  }

  /* Saves a changed copy of a note as its next version. */
  function changeNote(inc, g, change) {
    var data = JSON.parse(JSON.stringify(g.winner.data));
    Object.keys(change).forEach(function (k) { data[k] = change[k]; });
    var o = by();
    o.rid = g.rid;
    o.type = 'note';
    o.period = null;
    o.parents = [g.winner.id];
    o.data = data;
    C.saveRecord(inc, o);
    persist(inc);
  }

  /* The 214 entry made from a note carries this, so the note can show it is in the log. Fits the 40-character limit. */
  function noteSource(rid) {
    return 'Note ' + String(rid).slice(0, 35);
  }

  function loggedSet(inc) {
    var set = new Set();
    inc.entries.forEach(function (e) { if (e.source && e.source.indexOf('Note ') === 0) set.add(e.source); });
    return set;
  }

  function addToLog(inc, g) {
    var d = g.winner.data;
    if (!window.confirm('Add this note to the ICS 214 activity log, at the time it was taken (' + fmtDT(g.created) + ')? Log entries cannot be edited afterward; mistakes are fixed with a correction.')) return;
    try {
      C.addEntry(inc, {
        text: d.text,
        author: whoName(),
        position: S.settings.position,
        ts: g.created,
        source: noteSource(g.rid),
        photos: (d.photos || []).slice(0, C.LIMITS.entryPhotos),
        deviceId: S.settings.deviceId,
        deviceName: deviceLabel()
      });
    } catch (err) {
      toast(err.message);
      return;
    }
    persist(inc);
    render();
    toast('Added to the activity log.');
  }

  function makeMessage(g) {
    var text = g.winner.data.text || '';
    S.prefill = { type: '213', data: { subject: text.split('\n')[0].slice(0, 100), message: text } };
    startNew('213');
  }

  /* ---------- the notes screen ---------- */

  function matches(g, show, q) {
    var d = g.winner.data;
    if (show === 'pinned' && !d.pinned) return false;
    if (show === 'open' && !(d.kind === 'Follow-up' && !d.done)) return false;
    if (KINDS.indexOf(show) !== -1 && d.kind !== show) return false;
    if (q && String(d.text || '').toLowerCase().indexOf(q) === -1 && String(g.revs[0].by || '').toLowerCase().indexOf(q) === -1) return false;
    return true;
  }

  function sorted(list) {
    return list.slice().sort(function (a, b) {
      var pa = a.winner.data.pinned ? 1 : 0;
      var pb = b.winner.data.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return a.created < b.created ? 1 : -1;
    });
  }

  function noteItem(inc, g, logged) {
    var d = g.winner.data;
    var openFollow = d.kind === 'Follow-up' && !d.done;
    var li = h('li', { class: 'note' + (d.pinned ? ' is-pinned' : '') + (openFollow ? ' is-open' : '') + (g.deleted ? ' is-deleted' : '') });
    var head = h('div', { class: 'note-head' },
      h('span', { class: 'note-time', text: fmtDT(g.created) }),
      h('span', { class: 'note-by', text: g.revs[0].by || '' }),
      h('span', { class: 'tag', text: d.kind || 'Info' }));
    if (d.pinned) head.appendChild(h('span', { class: 'tag tag-pin', text: 'Pinned' }));
    if (openFollow) head.appendChild(h('span', { class: 'tag warn', text: 'Open' }));
    if (d.kind === 'Follow-up' && d.done) head.appendChild(h('span', { class: 'tag tag-ok', text: 'Done' }));
    if (logged.has(noteSource(g.rid))) head.appendChild(h('span', { class: 'tag tag-ok', text: 'In the 214' }));
    if (g.conflict) head.appendChild(h('span', { class: 'tag warn', text: 'Versions to compare' }));
    if (g.deleted) head.appendChild(h('span', { class: 'tag', text: 'Deleted' }));
    li.appendChild(head);
    li.appendChild(h('p', { class: 'note-text', text: d.text || '' }));
    var extra = [];
    if (d.photos && d.photos.length) extra.push(plural(d.photos.length, 'photo', 'photos'));
    /* Only a change to the words counts as an edit; pinning or ticking done does not. */
    var changed = g.revs.filter(function (r, i) { return i > 0 && r.data && r.data.text !== g.revs[i - 1].data.text; });
    var lastEdit = changed[changed.length - 1];
    if (lastEdit) extra.push('Edited ' + fmtDT(lastEdit.at) + (lastEdit.by ? ' by ' + lastEdit.by : '') + '. Earlier wording is in History');
    if (extra.length) li.appendChild(h('p', { class: 'note-meta', text: extra.join('. ') + '.' }));
    if (!g.deleted) {
      var row = h('div', { class: 'note-actions' });
      row.appendChild(btn(d.pinned ? 'Unpin' : 'Pin', function () {
        changeNote(inc, g, { pinned: !d.pinned });
        render();
      }, 'btn-quiet btn-small'));
      if (d.kind === 'Follow-up') {
        row.appendChild(btn(d.done ? 'Reopen' : 'Mark done', function () {
          changeNote(inc, g, { done: !d.done });
          render();
          toast(d.done ? 'Follow-up reopened.' : 'Follow-up marked done.');
        }, 'btn-quiet btn-small'));
      }
      if (!logged.has(noteSource(g.rid))) row.appendChild(btn('Add to 214', function () { addToLog(inc, g); }, 'btn-quiet btn-small', { 'aria-label': 'Add this note to the ICS 214 activity log' }));
      row.appendChild(btn('Make 213', function () { makeMessage(g); }, 'btn-quiet btn-small', { 'aria-label': 'Start an ICS 213 message from this note' }));
      row.appendChild(h('a', { class: 'btn btn-quiet btn-small', href: routeBase('note') + '/' + g.rid, text: 'Edit' }));
      li.appendChild(row);
    }
    return li;
  }

  function notesView(inc) {
    var all = C.listRecords(inc, 'note', null, S.showDeleted);
    var live = all.filter(function (g) { return !g.deleted; });
    var open = live.filter(function (g) { return g.winner.data.kind === 'Follow-up' && !g.winner.data.done; }).length;
    var card = h('section', { class: 'card' });
    card.appendChild(h('div', { class: 'view-head' },
      h('div', null,
        h('h2', { text: 'Notes' }),
        h('p', { class: 'hint', id: 'notesCount', text: plural(live.length, 'note', 'notes') + (open ? ', ' + plural(open, 'open follow-up', 'open follow-ups') : '') +
          '. Working notes for this incident. They are not part of the ICS 214 until you add one to it.' })),
      h('div', { class: 'row wrap' },
        deletedToggle(),
        live.length ? btn('Print notes', function () { printNotes(inc); }, 'btn-quiet btn-small', { id: 'printNotes' }) : null)));

    /* Quick entry. */
    var form = h('form', { id: 'noteForm', class: 'note-form', autocomplete: 'off' });
    var ta = h('textarea', { id: 'noteText', rows: '3', maxlength: '4000', 'aria-label': 'New note',
      placeholder: fine() ? 'Type a note and press Enter. Shift+Enter starts a new line.' : 'Type a note.' });
    var kind = h('select', { id: 'noteKind', 'aria-label': 'Kind of note' });
    KINDS.forEach(function (k) { kind.appendChild(h('option', { value: k, text: k })); });
    var pinId = nextId('notePin');
    var pin = h('input', { type: 'checkbox', id: pinId });
    form.appendChild(ta);
    form.appendChild(h('div', { class: 'row wrap note-form-row' },
      kind,
      h('label', { class: 'check small', for: pinId }, pin, ' Pin'),
      h('button', { type: 'submit', class: 'btn btn-primary', id: 'noteAdd', text: 'Add note' })));
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && fine()) {
        e.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ta.value.trim()) {
        ta.focus();
        return;
      }
      try {
        addNote(inc, { text: ta.value, kind: kind.value, pinned: pin.checked });
      } catch (err) {
        toast(err.message);
        return;
      }
      persist(inc);
      ta.value = '';
      pin.checked = false;
      kind.value = 'Info';
      drawList();
      ta.focus();
      toast('Note added.');
    });
    card.appendChild(form);

    /* Filters. */
    var q = h('input', { type: 'search', id: 'noteSearch', placeholder: 'Search notes', 'aria-label': 'Search notes' });
    q.value = S.noteFilter.q;
    var show = h('select', { id: 'noteShow', 'aria-label': 'Show' });
    [['all', 'All notes'], ['pinned', 'Pinned'], ['open', 'Open follow-ups']].concat(KINDS.map(function (k) { return [k, k]; })).forEach(function (o) {
      show.appendChild(h('option', { value: o[0], text: o[1], selected: S.noteFilter.show === o[0] }));
    });
    card.appendChild(h('div', { class: 'row wrap filters note-filters' }, q, show));

    var ul = h('ul', { class: 'notes', id: 'notesList' });
    var empty = h('p', { class: 'hint', id: 'notesEmpty' });
    card.appendChild(ul);
    card.appendChild(empty);

    function drawList() {
      var now = C.listRecords(inc, 'note', null, S.showDeleted);
      var liveNow = now.filter(function (g) { return !g.deleted; });
      var openNow = liveNow.filter(function (g) { return g.winner.data.kind === 'Follow-up' && !g.winner.data.done; }).length;
      var count = $('notesCount');
      if (count) count.textContent = plural(liveNow.length, 'note', 'notes') + (openNow ? ', ' + plural(openNow, 'open follow-up', 'open follow-ups') : '') +
        '. Working notes for this incident. They are not part of the ICS 214 until you add one to it.';
      var term = S.noteFilter.q.trim().toLowerCase();
      var list = sorted(now).filter(function (g) { return matches(g, S.noteFilter.show, term); });
      var logged = loggedSet(inc);
      ul.textContent = '';
      list.forEach(function (g) { ul.appendChild(noteItem(inc, g, logged)); });
      empty.textContent = list.length ? '' : (now.length ? 'No notes match.' : 'No notes yet. Anything typed above is saved with your name and the time.');
      empty.hidden = !!list.length;
    }
    var timer = null;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { S.noteFilter.q = q.value; drawList(); }, 120);
    });
    show.addEventListener('change', function () { S.noteFilter.show = show.value; drawList(); });
    drawList();
    return card;
  }

  function fine() {
    return !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  }

  /* ---------- printing ---------- */

  function printNotes(inc) {
    commitSession('quiet');
    var term = S.noteFilter.q.trim().toLowerCase();
    var list = sorted(C.listRecords(inc, 'note')).filter(function (g) { return matches(g, S.noteFilter.show, term); });
    var logged = loggedSet(inc);
    var rows = list.map(function (g) {
      var d = g.winner.data;
      var status = [d.pinned ? 'Pinned' : '', d.kind === 'Follow-up' ? (d.done ? 'Done' : 'Open') : '', logged.has(noteSource(g.rid)) ? 'In the 214' : ''].filter(Boolean).join(', ');
      return { time: g.created, by: g.revs[0].by || '', kind: d.kind || 'Info', text: d.text || '', status: status };
    });
    var filtered = S.noteFilter.show !== 'all' || term;
    window.FieldPrint && runPrint([window.FieldPrint.notesList(printCtx(inc), rows, { filtered: filtered })], { title: 'Notes' });
  }

  /* ---------- exports ---------- */

  A.addNote = addNote;
  A.notesView = notesView;
  A.printNotes = printNotes;
  A.noteSource = noteSource;
})(window.FieldApp);
