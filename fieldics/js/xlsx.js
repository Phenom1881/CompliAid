/*
 * FieldICS Excel writer. Builds a standard .xlsx workbook on the device, with no
 * network and no outside library. No DOM access, so it runs in Node tests too.
 *
 * build(sheets) -> Uint8Array (the .xlsx file)
 *   sheets: [{ name, cols: [width...], freeze: rowsAbove, rows: [[cell...]...] }]
 *   cell: null | string | number | { v, f, s }
 *     v: the value (string, number, or null). For a formula, the value shown until
 *        the spreadsheet recalculates it.
 *     f: a formula without the leading "=" (optional)
 *     s: a style name from STYLES (optional)
 *
 * Text is always written as text, never as a formula, so a typed "=..." in a form
 * stays harmless. Excel and LibreOffice recalculate every formula on open.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldXLSX = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* Style names, in the order of cellXfs in styles.xml. */
  var STYLES = ['normal', 'head', 'title', 'bold', 'money', 'moneyBold', 'date', 'num', 'pct', 'wrap', 'note', 'totalLabel', 'int'];
  var STYLE_INDEX = {};
  STYLES.forEach(function (s, i) { STYLE_INDEX[s] = i; });

  /* ---------- zip (stored, no compression) ---------- */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, 'utf8'));
  }

  function zip(files, when) {
    var d = when || new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [];
    var central = [];
    var offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name);
      var data = typeof f.data === 'string' ? utf8(f.data) : f.data;
      var crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cenSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true);
    end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var size = all.reduce(function (n, p) { return n + p.length; }, 0);
    var out = new Uint8Array(size);
    var at = 0;
    all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  /* ---------- cells ---------- */

  /* XML 1.0 allows only some control characters. */
  var BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

  function esc(s) {
    return String(s).replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function colName(i) {
    var s = '';
    i += 1;
    while (i > 0) {
      var m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  function ref(col, row) { return colName(col) + row; }

  /* Excel serial day number for a 'YYYY-MM-DD' date. */
  function dateSerial(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569;
  }

  function cellXml(c, r, cell) {
    if (cell === null || cell === undefined || cell === '') return '';
    var obj = typeof cell === 'object' ? cell : { v: cell };
    var at = ' r="' + ref(c, r) + '"';
    var st = obj.s && STYLE_INDEX[obj.s] ? ' s="' + STYLE_INDEX[obj.s] + '"' : '';
    var v = obj.v;
    if (obj.f) {
      var fx = '<f>' + esc(obj.f) + '</f>';
      if (typeof v === 'number' && isFinite(v)) return '<c' + at + st + '>' + fx + '<v>' + v + '</v></c>';
      if (v === null || v === undefined || v === '') return '<c' + at + st + '>' + fx + '</c>';
      return '<c' + at + st + ' t="str">' + fx + '<v>' + esc(v) + '</v></c>';
    }
    if (typeof v === 'number') return isFinite(v) ? '<c' + at + st + '><v>' + v + '</v></c>' : '';
    if (v === null || v === undefined || v === '') return st ? '<c' + at + st + '/>' : '';
    return '<c' + at + st + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    /* Print each sheet one page wide, as many pages tall as it needs. */
    x += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
    if (sheet.freeze) {
      x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + sheet.freeze + '" topLeftCell="A' + (sheet.freeze + 1) +
        '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>';
    }
    if (sheet.cols && sheet.cols.length) {
      x += '<cols>' + sheet.cols.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }
    x += '<sheetData>';
    sheet.rows.forEach(function (row, ri) {
      var cells = (row || []).map(function (cell, ci) { return cellXml(ci, ri + 1, cell); }).join('');
      if (cells) x += '<row r="' + (ri + 1) + '">' + cells + '</row>';
    });
    x += '</sheetData>';
    if (sheet.autoFilter) x += '<autoFilter ref="' + esc(sheet.autoFilter) + '"/>';
    x += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
    x += '<pageSetup orientation="' + (sheet.portrait ? 'portrait' : 'landscape') + '" fitToWidth="1" fitToHeight="0"/>';
    return x + '</worksheet>';
  }

  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="4">' +
    '<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/>' +
    '<numFmt numFmtId="165" formatCode="yyyy-mm-dd"/>' +
    '<numFmt numFmtId="166" formatCode="0.00"/>' +
    '<numFmt numFmtId="167" formatCode="0.0#&quot;%&quot;"/>' +
    '</numFmts>' +
    '<fonts count="4">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE7ECEF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF8D98A1"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top style="thin"><color rgb="FF172026"/></top><bottom style="double"><color rgb="FF172026"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="13">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function safeSheetName(name, used) {
    var s = String(name || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet';
    var base = s;
    var n = 2;
    while (used.has(s.toLowerCase())) {
      var suffix = ' ' + n++;
      s = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(s.toLowerCase());
    return s;
  }

  function build(sheets, opts) {
    opts = opts || {};
    if (!sheets || !sheets.length) throw new Error('A workbook needs at least one sheet.');
    var used = new Set();
    var names = sheets.map(function (s) { return safeSheetName(s.name, used); });
    var files = [];
    files.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names.map(function (n, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '</Types>'
    });
    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '</Relationships>'
    });
    var now = (opts.now || new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
    files.push({
      name: 'docProps/core.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + esc(opts.title || 'FieldICS workbook') + '</dc:title>' +
        '<dc:creator>' + esc(opts.creator || 'FieldICS') + '</dc:creator>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
        '</cp:coreProperties>'
    });
    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + names.map(function (n, i) {
          return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets>' +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
        '</workbook>'
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names.map(function (n, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    });
    files.push({ name: 'xl/styles.xml', data: STYLES_XML });
    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) });
    });
    return zip(files, opts.now);
  }

  /* A sheet name quoted for use inside a formula. */
  function sheetRef(name) {
    return "'" + String(name).replace(/'/g, "''") + "'";
  }

  return {
    MIME: MIME,
    STYLES: STYLES,
    build: build,
    colName: colName,
    ref: ref,
    sheetRef: sheetRef,
    dateSerial: dateSerial,
    crc32: crc32,
    zip: zip
  };
});
