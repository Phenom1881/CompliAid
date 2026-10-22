/* FieldICS: Welcome screen and the ICS 214 activity log. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var S = A.S;
  var btn = A.btn;
  var chooseImport = A.later('chooseImport');
  var deviceLabel = A.deviceLabel;
  var downloadLogCSV = A.later('downloadLogCSV');
  var entryPhotos = A.later('entryPhotos');
  var pickPhotos = A.later('pickPhotos');
  var chooseSetupFile = A.later('chooseSetupFile');
  var cur = A.cur;
  var C_LIMITS = A.C.LIMITS;
  var fillDatalist = A.fillDatalist;
  var fmtDT = A.fmtDT;
  var fromLocalInput = A.fromLocalInput;
  var h = A.h;
  var isoToInput = A.isoToInput;
  var openIncidentDialog = A.later('openIncidentDialog');
  var openLogPrint = A.later('openLogPrint');
  var periodLabel = A.periodLabel;
  var persist = A.persist;
  var persistSettings = A.persistSettings;
  var render = A.render;
  var toLocalInput = A.toLocalInput;
  var toast = A.toast;

  /* ---------- welcome ---------- */

  function textInput(id, label, value, opts) {
    opts = opts || {};
    var input = h('input', { type: 'text', id: id, maxlength: String(opts.max || 120), list: opts.list || null, placeholder: opts.placeholder || null });
    input.value = value || '';
    return { el: h('div', { class: 'field' }, h('label', { for: id, text: label }), input), input: input };
  }

  function welcomeView() {
    var card = h('section', { class: 'card welcome' });
    card.appendChild(h('h2', { text: 'Get started' }));
    card.appendChild(h('p', { text: 'FieldICS keeps your ICS forms, activity log, and cost records on this device, so it keeps working with no signal.' }));
    card.appendChild(h('p', { text: 'To share with another device, save a package file and send it any way you can: USB drive, email, text, or a shared folder. The other device imports it and everything merges.' }));
    var name = textInput('wName', 'Your name', S.settings.name);
    var pos = textInput('wPos', 'ICS position', S.settings.position, { list: 'ics-positions' });
    var dev = textInput('wDev', 'Device name', S.settings.deviceName, { placeholder: "Example: Chief's phone" });
    card.appendChild(h('div', { class: 'grid three' }, name.el, pos.el, dev.el));
    card.appendChild(h('p', { class: 'hint', text: 'Your name is recorded with every change you save, so the record shows who did what.' }));
    function keep() {
      S.settings.name = name.input.value.trim().slice(0, 120);
      S.settings.position = pos.input.value.trim().slice(0, 120);
      S.settings.deviceName = dev.input.value.trim().slice(0, 120);
      persistSettings();
    }
    card.appendChild(h('div', { class: 'row wrap' },
      btn('Create incident', function () { keep(); openIncidentDialog('new'); }, 'btn-primary', { id: 'welcomeNewBtn' }),
      btn('Import a package', function () { keep(); chooseImport(); }, '', { id: 'welcomeImportBtn' }),
      btn('Load locality setup file', function () { keep(); chooseSetupFile(); }, 'btn-quiet', { id: 'welcomeSetupBtn' })));
    card.appendChild(h('p', { class: 'hint', text: 'A locality setup file comes from your emergency management office. It adds your people, equipment, sites, and local rates so forms fill in faster.' }));
    return card;
  }

  /* ---------- ICS 214 log ---------- */

  function findEntry(inc, id) {
    for (var i = 0; i < inc.entries.length; i++) {
      if (inc.entries[i].id === id) return inc.entries[i];
    }
    return null;
  }

  function entryCard(e, ctx) {
    var superseded = !!ctx.corr.get(e.id);
    var orig = e.corrects ? ctx.byId.get(e.corrects) : null;
    var remote = e.deviceId && e.deviceId !== S.settings.deviceId;
    var cls = 'entry' + (e.corrects ? ' is-correction' : '') + (superseded ? ' is-superseded' : '') + (remote ? ' is-remote' : '');
    var li = h('li', { class: cls });
    li.appendChild(h('div', { class: 'entry-head' },
      h('span', { class: 'entry-time', text: fmtDT(e.ts) }),
      h('span', { text: e.author + (e.position ? ', ' + e.position : '') })));
    li.appendChild(h('div', { class: 'entry-text', text: e.text }));
    var pics = entryPhotos(cur(), e);
    if (pics) li.appendChild(pics);
    var foot = h('div', { class: 'entry-foot' });
    var left = h('span');
    if (e.corrects) {
      left.appendChild(h('span', { class: 'tag warn', text: 'Correction' }));
      left.appendChild(document.createTextNode(orig
        ? 'Corrects the entry by ' + orig.author + ' from ' + fmtDT(orig.ts) + '. '
        : 'Corrects an entry that is not on this device. '));
    }
    if (superseded) left.appendChild(h('span', { class: 'tag warn', text: 'Corrected, see later entry' }));
    if (remote) left.appendChild(h('span', { class: 'tag', text: 'From ' + (e.deviceName || 'another device') }));
    var gap = Math.abs(Date.parse(e.recordedAt) - Date.parse(e.ts));
    if (e.corrects || gap > 10 * 60 * 1000) left.appendChild(document.createTextNode('Recorded ' + fmtDT(e.recordedAt) + '. '));
    foot.appendChild(left);
    if (!e.corrects) {
      foot.appendChild(btn('Correct', function () {
        S.logDraft.correcting = e.id;
        S.logDraft.text = e.text;
        S.logDraft.time = isoToInput(e.ts);
        S.logDraft.timeTouched = true;
        render();
        var t = $('entryText');
        if (t) {
          t.scrollIntoView({ block: 'center' });
          t.focus();
        }
      }, 'btn-quiet btn-small'));
    }
    li.appendChild(foot);
    return li;
  }

  function logView(inc) {
    var d = S.logDraft;
    if (d.author === null) d.author = S.settings.name;
    if (d.position === null) d.position = S.settings.position;
    var correcting = d.correcting ? findEntry(inc, d.correcting) : null;
    if (d.correcting && !correcting) d.correcting = null;
    fillDatalist('people', [S.settings.name].concat(C.authors(inc).map(function (a) { return a.name; })));

    var root = h('div');
    var card = h('section', { class: 'card' });
    card.appendChild(h('h2', { text: correcting ? 'Add correction' : 'Add activity log entry (ICS 214)' }));
    var form = h('form', { id: 'entryForm', autocomplete: 'off' });
    if (correcting) {
      form.appendChild(h('div', { class: 'correct-banner' },
        h('div', null,
          h('strong', { text: 'Correcting an entry. ' }),
          h('span', { text: 'Entry from ' + fmtDT(correcting.ts) + ' by ' + correcting.author + '.' }),
          h('p', { class: 'hint', text: 'The original stays in the log. Your correction is added as a new entry.' })),
        btn('Cancel', function () {
          d.correcting = null;
          d.text = '';
          d.timeTouched = false;
          render();
        }, 'btn-quiet')));
    }
    var time = h('input', { type: 'datetime-local', id: 'entryTime', required: true });
    time.value = d.timeTouched ? d.time : toLocalInput(new Date());
    time.addEventListener('input', function () { d.time = time.value; d.timeTouched = true; });
    var author = h('input', { type: 'text', id: 'entryAuthor', maxlength: '120', list: 'people', required: true });
    author.value = d.author || '';
    author.addEventListener('input', function () { d.author = author.value; });
    var position = h('input', { type: 'text', id: 'entryPosition', maxlength: '120', list: 'ics-positions', placeholder: 'Example: Planning Section Chief' });
    position.value = d.position || '';
    position.addEventListener('input', function () { d.position = position.value; });
    var text = h('textarea', { id: 'entryText', rows: '4', maxlength: '5000', required: true });
    text.value = d.text;
    text.addEventListener('input', function () { d.text = text.value; });
    text.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
        ev.preventDefault();
        submit();
      }
    });
    form.appendChild(h('div', { class: 'grid three' },
      h('div', { class: 'field' }, h('label', { for: 'entryTime', text: 'Time of activity' }), time),
      h('div', { class: 'field' }, h('label', { for: 'entryAuthor', text: 'Your name' }), author),
      h('div', { class: 'field' }, h('label', { for: 'entryPosition', text: 'ICS position' }), position)));
    form.appendChild(h('div', { class: 'field' }, h('label', { for: 'entryText', text: 'What happened' }), text));
    if (!Array.isArray(d.photos)) d.photos = [];
    var photoRow = h('div', { class: 'row wrap entry-photos' });
    d.photos.forEach(function (id, i) {
      var att = C.getAttachment(inc, id);
      if (att) photoRow.appendChild(h('img', { class: 'mini-thumb', src: att.data, alt: 'Photo ' + (i + 1) + ' for this entry' }));
    });
    if (d.photos.length < C_LIMITS.entryPhotos) {
      photoRow.appendChild(btn(d.photos.length ? 'Add another photo' : 'Add photo', function () {
        pickPhotos(C_LIMITS.entryPhotos - d.photos.length).then(function (ids) {
          if (!ids.length) return;
          d.photos = d.photos.concat(ids);
          render();
        });
      }, 'btn-quiet btn-small', { id: 'entryPhotoBtn' }));
    }
    if (d.photos.length) {
      photoRow.appendChild(btn('Clear photos', function () { d.photos = []; render(); }, 'btn-quiet btn-small'));
    }
    form.appendChild(photoRow);
    form.appendChild(h('div', { class: 'row wrap' },
      h('button', { type: 'submit', id: 'addBtn', class: 'btn btn-primary', text: correcting ? 'Add correction' : 'Add to log' }),
      h('span', { class: 'hint', text: 'Entries cannot be edited or deleted. Use Correct to fix a mistake.' })));
    function submit() {
      var ts = d.timeTouched ? fromLocalInput(time.value) : C.nowISO();
      if (d.timeTouched && !ts) {
        toast('Enter a valid time of activity.');
        return;
      }
      if (Date.parse(ts) > Date.now() + 10 * 60 * 1000 &&
          !window.confirm('The time you entered is in the future. Add the entry anyway?')) return;
      var wasCorrection = !!d.correcting;
      try {
        C.addEntry(inc, {
          text: text.value,
          author: author.value,
          position: position.value,
          ts: ts,
          corrects: d.correcting,
          photos: d.photos,
          deviceId: S.settings.deviceId,
          deviceName: deviceLabel()
        });
      } catch (err) {
        toast(err.message);
        return;
      }
      if (author.value.trim() && !S.settings.name) {
        S.settings.name = author.value.trim();
        persistSettings();
      }
      d.text = '';
      d.correcting = null;
      d.timeTouched = false;
      d.photos = [];
      persist(inc);
      render();
      toast(wasCorrection ? 'Correction added.' : 'Entry added.');
      var t = $('entryText');
      if (t) t.focus();
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submit();
    });
    card.appendChild(form);
    root.appendChild(card);

    var listCard = h('section', { class: 'card' });
    var people = C.authors(inc);
    if (S.logFilter.author && !people.some(function (p) { return p.key === S.logFilter.author; })) S.logFilter.author = '';
    var fsel = h('select', { id: 'filterAuthor', 'aria-label': 'Show entries by' });
    fsel.appendChild(h('option', { value: '', text: 'Everyone' }));
    people.forEach(function (p) {
      fsel.appendChild(h('option', { value: p.key, text: p.name, selected: p.key === S.logFilter.author }));
    });
    fsel.addEventListener('change', function () { S.logFilter.author = fsel.value; render(); });
    var periodsList = C.periods(inc);
    var psel = h('select', { id: 'filterPeriod', 'aria-label': 'Operational period' });
    psel.appendChild(h('option', { value: '', text: 'All periods' }));
    periodsList.forEach(function (p) {
      psel.appendChild(h('option', { value: String(p.n), text: 'Period ' + periodLabel(p), selected: String(p.n) === S.logFilter.period }));
    });
    psel.addEventListener('change', function () { S.logFilter.period = psel.value; render(); });
    var sortBtn = btn(S.settings.newestFirst ? 'Newest first' : 'Oldest first', function () {
      S.settings.newestFirst = !S.settings.newestFirst;
      persistSettings();
      render();
    }, 'btn-quiet', { id: 'sortBtn' });

    var period = S.logFilter.period ? C.periodOf(inc, +S.logFilter.period) : null;
    var list = inc.entries.filter(function (e) {
      if (S.logFilter.author && e.author.toLowerCase() !== S.logFilter.author) return false;
      if (period && ((period.start && e.ts < period.start) || (period.end && e.ts >= period.end))) return false;
      return true;
    });
    if (S.settings.newestFirst) list = list.slice().reverse();

    listCard.appendChild(h('div', { class: 'log-head' },
      h('h2', null, 'Activity log ', h('span', { id: 'logCount', class: 'count', text: list.length === inc.entries.length ? '(' + inc.entries.length + ')' : '(showing ' + list.length + ' of ' + inc.entries.length + ')' })),
      h('div', { class: 'row wrap' }, fsel, psel, sortBtn,
        btn('Print 214', function () { openLogPrint(); }, 'btn-quiet'),
        btn('CSV', function () { downloadLogCSV(); }, 'btn-quiet'))));

    var ul = h('ol', { id: 'log', class: 'log' });
    var byId = new Map();
    inc.entries.forEach(function (e) { byId.set(e.id, e); });
    var ctx = { byId: byId, corr: C.correctionMap(inc) };
    list.forEach(function (e) { ul.appendChild(entryCard(e, ctx)); });
    listCard.appendChild(ul);
    if (!list.length) listCard.appendChild(h('p', { id: 'logEmpty', class: 'hint', text: inc.entries.length ? 'No entries match.' : 'No entries yet.' }));
    root.appendChild(listCard);
    return root;
  }

  /* ---------- exports ---------- */

  A.textInput = textInput;
  A.welcomeView = welcomeView;
  A.findEntry = findEntry;
  A.entryCard = entryCard;
  A.logView = logView;
})(window.FieldApp);
