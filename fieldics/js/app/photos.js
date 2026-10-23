/* FieldICS: Photos on cost entries, resource requests, and log entries, and the printed photo appendix. */
(function (A) {
  'use strict';

  var $ = A.$;
  var C = A.C;
  var FORMS = A.FORMS;
  var S = A.S;
  var btn = A.btn;
  var cur = A.cur;
  var fmtDT = A.fmtDT;
  var fmtDay = A.fmtDay;
  var h = A.h;
  var itemTitle = A.itemTitle;
  var openPanel = A.openPanel;
  var persist = A.persist;
  var processImage = A.processImage;
  var toast = A.toast;
  var whoName = A.whoName;

  var PHOTO_SIZE = { max: 1400, quality: 0.72 };
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  /* Asks for one or more photos, shrinks them, and stores them on the incident. Resolves to new attachment ids. */
  function pickPhotos(limit) {
    return new Promise(function (resolve) {
      var input = $('photoFiles');
      input.value = '';
      input.onchange = function () {
        var files = Array.prototype.slice.call(input.files || []).slice(0, Math.max(0, limit));
        if (!files.length) {
          resolve([]);
          return;
        }
        toast(files.length === 1 ? 'Preparing photo...' : 'Preparing ' + files.length + ' photos...');
        var inc = cur();
        var ids = [];
        var chain = Promise.resolve();
        files.forEach(function (file) {
          chain = chain.then(function () {
            return processImage(file, PHOTO_SIZE).then(function (res) {
              ids.push(C.addAttachment(inc, { mime: res.mime, data: res.data, name: file.name, by: whoName() }));
            }, function (err) {
              toast(file.name + ': ' + err.message);
            });
          });
        });
        chain.then(function () {
          if (ids.length) persist(inc);
          resolve(ids);
        });
      };
      input.click();
    });
  }

  function viewPhoto(att, caption) {
    var body = openPanel(caption || 'Photo');
    body.appendChild(h('img', { class: 'photo-large', src: att.data, alt: caption || 'Photo' }));
    body.appendChild(h('p', { class: 'hint', text: 'Added ' + fmtDT(att.at) + (att.by ? ' by ' + att.by : '') + (att.name ? '. File: ' + att.name : '') + '.' }));
  }

  /* Opens a photo by id, looked up when tapped, since photos may still be loading when the page is drawn. */
  function viewPhotoById(id, caption) {
    var att = C.getAttachment(cur(), id);
    if (att) viewPhoto(att, caption);
    else toast(S.photosLoading ? 'This photo is still loading.' : 'This photo is not on this device yet. It arrives with a package file that has photos.');
  }

  /*
   * An img for a stored photo. While photos are still loading after the app opens, it is
   * a placeholder that fills in when the photo arrives. null when the photo is not here.
   */
  function photoImg(inc, id, attrs) {
    var att = inc ? C.getAttachment(inc, id) : null;
    var a = {};
    Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    if (att) {
      a.src = att.data;
      return h('img', a);
    }
    if (!S.photosLoading) return null;
    a.src = BLANK;
    a['data-att'] = id;
    a.class = ((a.class || '') + ' is-loading').trim();
    return h('img', a);
  }

  /* Fills placeholders as photos arrive. final: loading is done, so any still missing are not on this device. */
  function fillPhotos(final) {
    var inc = cur();
    Array.prototype.forEach.call(document.querySelectorAll('img[data-att]'), function (img) {
      var att = inc ? C.getAttachment(inc, img.getAttribute('data-att')) : null;
      if (att) {
        img.src = att.data;
        img.removeAttribute('data-att');
        img.classList.remove('is-loading');
      } else if (final && img.parentNode) {
        img.parentNode.replaceChild(h('span', { class: 'photo-gone', text: 'Not on this device yet' }), img);
      }
    });
  }

  /*
   * A row of photo thumbnails with Add and Remove. ids: current attachment ids.
   * opts: { max, label, onChange(newIds), id }
   */
  function photoStrip(ids, opts) {
    var list = ids.slice();
    var box = h('div', { class: 'photo-strip' });
    function draw() {
      box.textContent = '';
      var inc = cur();
      var row = h('div', { class: 'photo-row' });
      list.forEach(function (id, i) {
        var img = photoImg(inc, id, { alt: '' });
        var cell = h('div', { class: 'photo-cell' });
        if (img) {
          cell.appendChild(h('button', {
            type: 'button', class: 'photo-thumb', 'aria-label': 'View photo ' + (i + 1),
            onclick: function () { viewPhotoById(id, (opts.label || 'Photo') + ' ' + (i + 1)); }
          }, img));
        } else {
          cell.appendChild(h('div', { class: 'photo-thumb missing', text: 'Not on this device yet' }));
        }
        cell.appendChild(btn('Remove', function () {
          if (!window.confirm('Remove photo ' + (i + 1) + '? It stays in the history of this item.')) return;
          list.splice(i, 1);
          opts.onChange(list.slice());
          draw();
        }, 'btn-quiet btn-small', { 'aria-label': 'Remove photo ' + (i + 1) }));
        row.appendChild(cell);
      });
      if (list.length) box.appendChild(row);
      var max = opts.max || 12;
      if (list.length < max) {
        box.appendChild(btn(list.length ? 'Add more photos' : 'Add photo', function () {
          pickPhotos(max - list.length).then(function (added) {
            if (!added.length) return;
            list = list.concat(added);
            opts.onChange(list.slice());
            draw();
            toast(added.length === 1 ? 'Photo added.' : added.length + ' photos added.');
          });
        }, '', { id: opts.id || null }));
      } else {
        box.appendChild(h('p', { class: 'hint', text: 'This item has the most photos it can hold (' + max + ').' }));
      }
    }
    draw();
    return box;
  }

  /* Thumbnails for a log entry card. */
  function entryPhotos(inc, e) {
    if (!e.photos || !e.photos.length) return null;
    var row = h('div', { class: 'photo-row small' });
    e.photos.forEach(function (id, i) {
      var img = photoImg(inc, id, { alt: '' });
      if (img) {
        row.appendChild(h('button', {
          type: 'button', class: 'photo-thumb', 'aria-label': 'View photo ' + (i + 1),
          onclick: function () { viewPhotoById(id, 'Log entry photo ' + (i + 1)); }
        }, img));
      } else {
        row.appendChild(h('div', { class: 'photo-thumb missing', text: 'Not here yet' }));
      }
    });
    return row;
  }

  /*
   * Photo appendix items for printing. which: { costs: [records from C.costRecords], requests: bool, log: [entries] }
   * Returns [{ id, caption }].
   */
  function appendixItems(inc, which) {
    var items = [];
    (which.costs || []).forEach(function (x) {
      (x.data.photos || []).forEach(function (id) {
        items.push({ id: id, caption: FORMS[x.type].title + ': ' + itemTitle(x.type, x.data) + (x.date ? ', ' + fmtDay(x.date) : '') + (x.data.site ? ', ' + x.data.site : '') + '.' });
      });
    });
    if (which.requests) {
      C.listRecords(inc, '213RR').forEach(function (g) {
        (g.winner.data.photos || []).forEach(function (id) {
          items.push({ id: id, caption: 'ICS 213 RR ' + itemTitle('213RR', g.winner.data) + '.' });
        });
      });
    }
    (which.log || []).forEach(function (e) {
      (e.photos || []).forEach(function (id) {
        items.push({ id: id, caption: 'ICS 214 entry, ' + fmtDT(e.ts) + ', ' + e.author + ': ' + (e.text.length > 90 ? e.text.slice(0, 90) + '...' : e.text) });
      });
    });
    (which.notes || []).forEach(function (g) {
      (g.winner.data.photos || []).forEach(function (id) {
        items.push({ id: id, caption: 'Note, ' + fmtDT(g.created) + ': ' + itemTitle('note', g.winner.data) });
      });
    });
    return items;
  }

  /* ---------- exports ---------- */

  A.pickPhotos = pickPhotos;
  A.viewPhoto = viewPhoto;
  A.viewPhotoById = viewPhotoById;
  A.photoImg = photoImg;
  A.fillPhotos = fillPhotos;
  A.photoStrip = photoStrip;
  A.entryPhotos = entryPhotos;
  A.appendixItems = appendixItems;
})(window.FieldApp);
