/*
 * FieldICS PDF maker. Turns the printout pages built by print.js into a PDF file
 * on the device, with no network and no print dialog.
 *
 * How it works:
 *  1. Each printout (.p-doc) is laid out by the browser in a hidden box exactly as
 *     wide as the printable area of a letter page (landscape for wide forms).
 *  2. The layout is read back: every word with its position and font, every
 *     border and shaded box, every image.
 *  3. Page breaks are chosen so no line of text, table row, photo, or block heading
 *     is cut in half, and forced breaks (.p-break) start a new page.
 *  4. Each page is written as PDF drawing commands with the standard Helvetica
 *     fonts, so text stays selectable and searchable. Images are embedded as JPEG.
 * Text outside the Windows-1252 character set prints as "?".
 */
(function (root) {
  'use strict';

  var PX = 0.75; /* points per CSS pixel */
  var LETTER = { w: 612, h: 792 };
  var LAYOUTS = {
    portrait: { pageW: 612, pageH: 792, margin: 32 },
    landscape: { pageW: 792, pageH: 612, margin: 26 }
  };

  /* ---------- text encoding ---------- */

  var WIN = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
    0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
    0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
    0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f
  };

  function winAnsi(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      var b;
      if (c >= 0x20 && c < 0x7f) b = c;
      else if (c >= 0xa0 && c <= 0xff) b = c;
      else if (WIN[c]) b = WIN[c];
      else if (c >= 0xd800 && c <= 0xdbff) { b = 0x3f; i++; }
      else b = 0x3f;
      if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b);
      else out += String.fromCharCode(b);
    }
    return out;
  }

  function num(n) {
    return (Math.round(n * 100) / 100).toString();
  }

  function parseColor(css) {
    var m = /rgba?\(([^)]+)\)/.exec(css || '');
    if (!m) return null;
    var p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 4 && p[3] === 0) return null;
    return [p[0] / 255, p[1] / 255, p[2] / 255];
  }

  function colorOp(c, stroke) {
    return num(c[0]) + ' ' + num(c[1]) + ' ' + num(c[2]) + (stroke ? ' RG' : ' rg');
  }

  /* ---------- reading the layout ---------- */

  function fontKey(style) {
    var bold = parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold';
    var italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
    return (bold ? 'B' : 'R') + (italic ? 'I' : '');
  }

  function waitForImages(host) {
    var imgs = Array.prototype.slice.call(host.querySelectorAll('img'));
    return Promise.all(imgs.map(function (img) {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      if (typeof img.decode === 'function') return img.decode().catch(function () { /* drawn as a box */ });
      return new Promise(function (resolve) { img.onload = resolve; img.onerror = resolve; });
    }));
  }

  /*
   * Reads everything drawable inside host. Coordinates are CSS pixels relative to
   * the host's top left corner.
   */
  function readLayout(host) {
    var origin = host.getBoundingClientRect();
    var ox = origin.left;
    var oy = origin.top;
    var words = [];
    var rects = [];
    var images = [];
    var atoms = [];
    var breaks = [];
    var range = document.createRange();

    function rel(r) {
      return { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height };
    }

    function addWord(node, start, end, text, style, size, color, font) {
      range.setStart(node, start);
      range.setEnd(node, end);
      var list = range.getClientRects();
      if (list.length === 1 || text.length === 1) {
        if (!list.length) return;
        var r = rel(list[0]);
        if (r.w === 0 && r.h === 0) return;
        words.push({ x: r.x, y: r.y, w: r.w, h: r.h, text: text, size: size, color: color, font: font });
        return;
      }
      /* A word broken across lines: place it one character at a time. */
      for (var i = 0; i < text.length; i++) addWord(node, start + i, start + i + 1, text[i], style, size, color, font);
    }

    var walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var node = walker.currentNode;
    while (node) {
      if (node.nodeType === 3) {
        var parent = node.parentElement;
        var text = node.nodeValue;
        if (parent && /\S/.test(text)) {
          var style = getComputedStyle(parent);
          if (style.visibility !== 'hidden') {
            var size = parseFloat(style.fontSize) || 12;
            var color = parseColor(style.color) || [0, 0, 0];
            var font = fontKey(style);
            if (style.textTransform === 'uppercase') text = text.toUpperCase();
            else if (style.textTransform === 'lowercase') text = text.toLowerCase();
            var re = /\S+/g;
            var m;
            while ((m = re.exec(text))) addWord(node, m.index, m.index + m[0].length, m[0], style, size, color, font);
          }
        }
      } else if (node !== host) {
        var el = node;
        var cs = getComputedStyle(el);
        if (cs.display === 'none') {
          node = walker.nextSibling() || nextOutside(walker);
          continue;
        }
        var r2 = rel(el.getBoundingClientRect());
        if (r2.w > 0 && r2.h > 0) {
          var bg = parseColor(cs.backgroundColor);
          if (bg && !(bg[0] === 1 && bg[1] === 1 && bg[2] === 1)) rects.push({ x: r2.x, y: r2.y, w: r2.w, h: r2.h, fill: bg });
          var sides = [
            ['Top', function (bw) { return { x: r2.x, y: r2.y, w: r2.w, h: bw }; }],
            ['Bottom', function (bw) { return { x: r2.x, y: r2.y + r2.h - bw, w: r2.w, h: bw }; }],
            ['Left', function (bw) { return { x: r2.x, y: r2.y, w: bw, h: r2.h }; }],
            ['Right', function (bw) { return { x: r2.x + r2.w - bw, y: r2.y, w: bw, h: r2.h }; }]
          ];
          sides.forEach(function (sd) {
            var bw = parseFloat(cs['border' + sd[0] + 'Width']) || 0;
            var st = cs['border' + sd[0] + 'Style'];
            if (bw > 0 && st !== 'none' && st !== 'hidden') {
              var bc = parseColor(cs['border' + sd[0] + 'Color']);
              if (bc) {
                var box = sd[1](bw);
                box.fill = bc;
                rects.push(box);
              }
            }
          });
          if (el.tagName === 'IMG') images.push({ x: r2.x, y: r2.y, w: r2.w, h: r2.h, img: el, fit: cs.objectFit });
          if (el.tagName === 'TR' || el.tagName === 'IMG' || el.tagName === 'FIGURE' ||
              /\b(p-org-box|p-exercise|p-thumb|p-step)\b/.test(el.className)) {
            atoms.push({ top: r2.y, bottom: r2.y + r2.h });
          }
          if (/\bp-bh\b/.test(el.className)) atoms.push({ top: r2.y, bottom: r2.y + r2.h + 26 });
          if (el.tagName === 'THEAD') atoms.push({ top: r2.y, bottom: r2.y + r2.h + 22 });
          if (/\bp-break\b/.test(el.className)) breaks.push(r2.y);
        }
      }
      node = walker.nextNode();
    }
    words.forEach(function (w) { atoms.push({ top: w.y, bottom: w.y + w.h }); });
    return { words: words, rects: rects, images: images, atoms: atoms, breaks: breaks, height: host.scrollHeight };

    function nextOutside(tw) {
      while (tw.parentNode()) {
        var s = tw.nextSibling();
        if (s) return s;
      }
      return null;
    }
  }

  /* Chooses page breaks. Returns [[top, bottom], ...] in CSS pixels. */
  function paginate(layout, pageH) {
    var atoms = layout.atoms.filter(function (a) { return a.bottom - a.top < pageH * 0.85; });
    var breaks = layout.breaks.slice().sort(function (a, b) { return a - b; });
    var pages = [];
    var y = 0;
    var total = Math.max(layout.height, 1);
    var guard = 0;
    while (y < total - 1 && guard++ < 2000) {
      var limit = y + pageH;
      var forced = null;
      for (var i = 0; i < breaks.length; i++) {
        if (breaks[i] > y + 2 && breaks[i] < limit) { forced = breaks[i]; break; }
      }
      var end = forced !== null ? forced : Math.min(limit, total);
      if (forced === null && end < total) {
        var moved = true;
        while (moved) {
          moved = false;
          for (var j = 0; j < atoms.length; j++) {
            var a = atoms[j];
            if (a.top < end - 0.5 && a.bottom > end + 0.5 && a.top > y + 4) {
              end = a.top;
              moved = true;
            }
          }
        }
        if (end <= y + pageH * 0.25) end = limit;
      }
      pages.push([y, end]);
      y = end;
    }
    return pages;
  }

  /* ---------- images ---------- */

  function dataToBytes(dataUrl) {
    var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var s = atob(b64);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /* Draws an image at its box size (2x for print sharpness) with object-fit applied, as JPEG. */
  function rasterize(item) {
    var scale = 2;
    var cw = Math.max(1, Math.round(item.w * scale));
    var ch = Math.max(1, Math.round(item.h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cw, ch);
    var img = item.img;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    if (iw && ih) {
      if (item.fit === 'cover') {
        var s1 = Math.max(cw / iw, ch / ih);
        var sw = cw / s1;
        var sh = ch / s1;
        g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, cw, ch);
      } else if (item.fit === 'contain' || item.fit === 'scale-down') {
        var s2 = Math.min(cw / iw, ch / ih);
        var dw = iw * s2;
        var dh = ih * s2;
        g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      } else {
        g.drawImage(img, 0, 0, cw, ch);
      }
    }
    var url;
    try {
      url = canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      return null;
    }
    if (url.indexOf('data:image/jpeg') !== 0) return null;
    return { bytes: dataToBytes(url), w: cw, h: ch };
  }

  /* ---------- writing the PDF ---------- */

  function imageOnPage(im, slice) {
    return im && im.y + im.h > slice[0] && im.y < slice[1];
  }

  function bytesOf(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  function deflate(bytes) {
    if (typeof CompressionStream !== 'function') return Promise.resolve(null);
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); }, function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function pdfDate(d) {
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return 'D:' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function Writer() {
    this.parts = [];
    this.length = 0;
    this.offsets = [0];
  }
  Writer.prototype.raw = function (x) {
    var b = typeof x === 'string' ? bytesOf(x) : x;
    this.parts.push(b);
    this.length += b.length;
  };
  Writer.prototype.obj = function (n, body) {
    this.offsets[n] = this.length;
    this.raw(n + ' 0 obj\n');
    if (Array.isArray(body)) body.forEach(this.raw, this);
    else this.raw(body);
    this.raw('\nendobj\n');
  };

  var FONT_NAMES = { R: 'Helvetica', B: 'Helvetica-Bold', RI: 'Helvetica-Oblique', BI: 'Helvetica-BoldOblique' };
  var FONT_IDS = { R: 'F1', B: 'F2', RI: 'F3', BI: 'F4' };

  /* Builds one page's drawing commands. */
  function pageContent(layout, slice, frame, imageNames, pageLabel) {
    var y0 = slice[0];
    var y1 = slice[1];
    var H = frame.pageH;
    var M = frame.margin;
    var ops = [];
    function X(px) { return M + px * PX; }
    function Y(px) { return H - M - (px - y0) * PX; }
    ops.push('q');
    ops.push(num(M) + ' ' + num(M) + ' ' + num(frame.pageW - 2 * M) + ' ' + num(H - 2 * M) + ' re W n');
    layout.rects.forEach(function (r) {
      if (r.y + r.h <= y0 || r.y >= y1) return;
      ops.push(colorOp(r.fill) + ' ' + num(X(r.x)) + ' ' + num(Y(r.y + r.h)) + ' ' + num(Math.max(r.w * PX, 0.4)) + ' ' + num(Math.max(r.h * PX, 0.4)) + ' re f');
    });
    layout.images.forEach(function (im, i) {
      if (im.y + im.h <= y0 || im.y >= y1 || !imageNames[i]) return;
      ops.push('q ' + num(im.w * PX) + ' 0 0 ' + num(im.h * PX) + ' ' + num(X(im.x)) + ' ' + num(Y(im.y + im.h)) + ' cm /' + imageNames[i] + ' Do Q');
    });
    var lastFont = '';
    var lastColor = '';
    ops.push('BT');
    layout.words.forEach(function (w) {
      if (w.y < y0 - 0.5 || w.y + w.h > y1 + 0.5) return;
      var size = w.size * PX;
      var f = '/' + FONT_IDS[w.font] + ' ' + num(size) + ' Tf';
      if (f !== lastFont) { ops.push(f); lastFont = f; }
      var c = colorOp(w.color);
      if (c !== lastColor) { ops.push(c); lastColor = c; }
      var base = w.y + w.h - w.size * 0.212 - Math.max(0, (w.h - w.size * 1.117) / 2);
      ops.push('1 0 0 1 ' + num(X(w.x)) + ' ' + num(Y(base)) + ' Tm (' + winAnsi(w.text) + ') Tj');
    });
    ops.push('ET');
    ops.push('Q');
    if (pageLabel) {
      ops.push('BT /F1 7 Tf 0.3 0.3 0.3 rg 1 0 0 1 ' + num(frame.pageW - M - 60) + ' ' + num(M * 0.45) + ' Tm (' + winAnsi(pageLabel) + ') Tj ET');
    }
    return ops.join('\n');
  }

  /*
   * Makes a PDF from printout nodes (.p-doc sections). Returns Promise<{ blob, pages }>.
   * opts: { title, author }
   */
  function fromNodes(nodes, opts) {
    opts = opts || {};
    var host = document.createElement('div');
    host.className = 'pdf-host';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-30000px;top:0;background:#fff;margin:0;padding:0;';
    document.body.appendChild(host);
    var docs = [];
    nodes.forEach(function (n) {
      var wide = /\bp-wide\b/.test(n.className);
      var frame = wide ? LAYOUTS.landscape : LAYOUTS.portrait;
      var box = document.createElement('div');
      box.style.cssText = 'width:' + ((frame.pageW - 2 * frame.margin) / PX) + 'px;position:relative;background:#fff;';
      box.appendChild(n);
      host.appendChild(box);
      docs.push({ box: box, frame: frame });
    });
    return waitForImages(host).then(function () {
      var pages = [];
      var images = [];
      docs.forEach(function (d) {
        var frame = d.frame;
        var layout = readLayout(d.box);
        var slices = paginate(layout, (frame.pageH - 2 * frame.margin) / PX);
        var names = layout.images.map(function (im) {
          var pic = rasterize(im);
          if (!pic) return null;
          images.push(pic);
          return 'Im' + images.length;
        });
        slices.forEach(function (sl) {
          pages.push({ frame: frame, layout: layout, slice: sl, names: names });
        });
      });
      host.parentNode.removeChild(host);
      pages.forEach(function (p, i) {
        var label = pages.length > 1 ? 'Page ' + (i + 1) + ' of ' + pages.length : '';
        p.content = pageContent(p.layout, p.slice, p.frame, p.names, label);
        p.names = p.names.filter(function (nm, j) { return nm && imageOnPage(p.layout.images[j], p.slice); });
        p.layout = null;
      });
      return Promise.all(pages.map(function (p) {
        var raw = bytesOf(p.content);
        return deflate(raw).then(function (z) { p.stream = z || raw; p.flate = !!z; });
      })).then(function () { return assemble(pages, images, opts); });
    }, function (err) {
      if (host.parentNode) host.parentNode.removeChild(host);
      throw err;
    });
  }

  function assemble(pages, images, opts) {
    var w = new Writer();
    w.raw('%PDF-1.4\n%âãÏÓ\n');
    var n = 1;
    var catalog = n++;
    var pagesObj = n++;
    var info = n++;
    var fontObjs = {};
    Object.keys(FONT_NAMES).forEach(function (k) { fontObjs[k] = n++; });
    var imageObjs = images.map(function () { return n++; });
    var pageObjs = pages.map(function () { var o = { page: n++, content: n++ }; return o; });

    w.obj(catalog, '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R >>');
    w.obj(pagesObj, '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pageObjs.map(function (o) { return o.page + ' 0 R'; }).join(' ') + '] >>');
    var now = new Date();
    w.obj(info, '<< /Title (' + winAnsi(opts.title || 'FieldICS') + ') /Author (' + winAnsi(opts.author || '') + ') /Producer (FieldICS) /Creator (FieldICS) /CreationDate (' + pdfDate(now) + ') >>');
    Object.keys(FONT_NAMES).forEach(function (k) {
      w.obj(fontObjs[k], '<< /Type /Font /Subtype /Type1 /BaseFont /' + FONT_NAMES[k] + ' /Encoding /WinAnsiEncoding >>');
    });
    images.forEach(function (im, i) {
      w.obj(imageObjs[i], ['<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>\nstream\n', im.bytes, '\nendstream']);
    });
    var fontRes = '/Font << ' + Object.keys(FONT_NAMES).map(function (k) { return '/' + FONT_IDS[k] + ' ' + fontObjs[k] + ' 0 R'; }).join(' ') + ' >>';
    pages.forEach(function (p, i) {
      var xo = p.names.length ? ' /XObject << ' + p.names.map(function (nm) { return '/' + nm + ' ' + imageObjs[+nm.slice(2) - 1] + ' 0 R'; }).join(' ') + ' >>' : '';
      w.obj(pageObjs[i].page, '<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + p.frame.pageW + ' ' + p.frame.pageH + '] /Resources << ' + fontRes + xo + ' >> /Contents ' + pageObjs[i].content + ' 0 R >>');
      w.obj(pageObjs[i].content, ['<< /Length ' + p.stream.length + (p.flate ? ' /Filter /FlateDecode' : '') + ' >>\nstream\n', p.stream, '\nendstream']);
    });
    var xref = w.length;
    var lines = ['xref', '0 ' + n, '0000000000 65535 f '];
    for (var i = 1; i < n; i++) lines.push(String(w.offsets[i]).padStart(10, '0') + ' 00000 n ');
    w.raw(lines.join('\n') + '\n');
    w.raw('trailer\n<< /Size ' + n + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return { blob: new Blob(w.parts, { type: 'application/pdf' }), pages: pages.length };
  }

  root.FieldPDF = { fromNodes: fromNodes, paginate: paginate, winAnsi: winAnsi, LETTER: LETTER };
})(typeof self !== 'undefined' ? self : this);
