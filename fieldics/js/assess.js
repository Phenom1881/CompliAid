/*
 * FieldICS damage assessment and volunteer rules. No DOM access, so this runs in Node tests too.
 *
 *  damageTotals(inc)         dwellings by damage level, with insurance, renters, and
 *                            primary residences; public facilities and their costs
 *  block30(inc)              ICS 209 block 30 counts from the home assessments
 *  inventoryRows(inc)        the damaged public facilities, in the columns of the FEMA
 *                            Grants Portal damage inventory template
 *  inventoryCSV(inc), inventorySheets(inc)
 *  volunteerHours(d), volunteerLabor(d, rid)   a volunteer shift as donated labor entries
 *  homesCSV(inc)             every home assessment, one row each
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./forms.js'), require('./core.js'));
  } else {
    root.FieldAssess = factory(root.FieldICSForms, root.FieldICS);
  }
})(typeof self !== 'undefined' ? self : this, function (Forms, C) {
  'use strict';

  var LEVELS = ['Destroyed', 'Major', 'Minor', 'Affected', 'Inaccessible'];
  var UNIT_LEVELS = ['Affected', 'Minor', 'Major', 'Destroyed'];

  function n0(v) {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  /* Dwellings one home record stands for, by level. A multi-family building counts its units. */
  function dwellingsByLevel(d) {
    var out = {};
    if (d.dwelling === 'Multi-family') {
      var any = false;
      UNIT_LEVELS.forEach(function (lvl) {
        var count = n0(d['units' + lvl]);
        if (count > 0) {
          out[lvl] = count;
          any = true;
        }
      });
      if (any) return out;
      if (d.level) out[d.level] = Math.max(1, n0(d.units));
      return out;
    }
    if (d.level) out[d.level] = 1;
    return out;
  }

  function homes(inc) {
    return C.listRecords(inc, 'daHome').map(function (g) { return g.winner.data; });
  }

  function sites(inc) {
    return C.listRecords(inc, 'daSite').map(function (g) { return g.winner.data; });
  }

  function damageTotals(inc) {
    var t = {
      levels: {}, insured: {}, uninsured: {}, renters: {}, primary: {},
      total: 0, insuredAll: 0, uninsuredAll: 0, rentersAll: 0, primaryAll: 0,
      homes: 0, review: 0, needs: 0, notHabitable: 0,
      sites: 0, siteCost: 0, siteCostMissing: 0, siteByCategory: {}
    };
    LEVELS.forEach(function (l) { t.levels[l] = 0; t.insured[l] = 0; t.uninsured[l] = 0; t.renters[l] = 0; t.primary[l] = 0; });
    homes(inc).forEach(function (d) {
      t.homes++;
      var by = dwellingsByLevel(d);
      var ins = d.insurance || [];
      var insured = ins.indexOf('home') !== -1 || ins.indexOf('flood') !== -1;
      var none = !insured && ins.indexOf('none') !== -1;
      Object.keys(by).forEach(function (l) {
        if (!(l in t.levels)) return;
        var count = by[l];
        t.levels[l] += count;
        t.total += count;
        if (insured) { t.insured[l] += count; t.insuredAll += count; }
        if (none) { t.uninsured[l] += count; t.uninsuredAll += count; }
        if (d.tenure === 'Renter') { t.renters[l] += count; t.rentersAll += count; }
        if (d.primary === 'Yes') { t.primary[l] += count; t.primaryAll += count; }
      });
      if (d.review) t.review++;
      if (d.needs) t.needs++;
      if (d.habitable === 'No') t.notHabitable++;
    });
    var cents = 0;
    sites(inc).forEach(function (d) {
      t.sites++;
      if (typeof d.cost === 'number') cents += Math.round(d.cost * 100);
      else t.siteCostMissing++;
      var k = d.category || '';
      t.siteByCategory[k] = (t.siteByCategory[k] || 0) + n0(d.cost);
    });
    t.siteCost = cents / 100;
    return t;
  }

  /*
   * ICS 209 block 30 from the home assessments. Single-family and manufactured homes are
   * single residences; multi-family units go on the Other line. Affected, minor, and major
   * count as damaged. Inaccessible homes are not counted.
   */
  function block30(inc) {
    var out = { dmgResDmg: 0, dmgResDest: 0, dmgOtherDmg: 0, dmgOtherDest: 0 };
    homes(inc).forEach(function (d) {
      var by = dwellingsByLevel(d);
      var multi = d.dwelling === 'Multi-family';
      Object.keys(by).forEach(function (l) {
        var key = l === 'Destroyed' ? 'Dest' : (l === 'Inaccessible' ? null : 'Dmg');
        if (!key) return;
        out[(multi ? 'dmgOther' : 'dmgRes') + key] += by[l];
      });
    });
    return out;
  }

  /* Columns of the FEMA Grants Portal damage inventory template. */
  var INVENTORY_HEAD = ['Category', 'Name of damage/facility', 'Address 1', 'Address 2', 'City', 'State', 'Zip', 'Latitude', 'Longitude',
    'Describe Damage', 'Primary Cause of Damage', 'Approx. Cost', '% Work Complete', 'Labor Type',
    'Has received grant(s) on the facility in the past?', 'Applicant priority'];

  function inventoryRows(inc) {
    return C.listRecords(inc, 'daSite').map(function (g) {
      var d = g.winner.data;
      return [d.category, d.name, d.address1, d.address2, d.city, d.state, d.zip,
        d.lat === null ? '' : d.lat, d.lon === null ? '' : d.lon, d.damage, d.cause,
        d.cost === null ? '' : d.cost, d.complete === null ? '' : d.complete, d.labor, d.priorGrant, d.priority];
    });
  }

  function cell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csv(head, rows) {
    return [head.map(cell).join(',')].concat(rows.map(function (r) { return r.map(cell).join(','); })).join('\r\n') + '\r\n';
  }

  function inventoryCSV(inc) {
    return csv(INVENTORY_HEAD, inventoryRows(inc));
  }

  /* The damage inventory as one Excel sheet, for FieldXLSX.build. */
  function inventorySheets(inc) {
    var rows = [
      [{ v: (inc.exercise ? 'EXERCISE: ' : '') + 'Damage Inventory', s: 'title' }],
      [{ v: 'Applicant: ' + (inc.applicant || '') + '    Disaster: ' + (inc.disasterNumber || '') + '    Incident: ' + inc.name, s: 'note' }],
      [{ v: 'Columns match the FEMA Grants Portal damage inventory template. Copy the rows into the template your Program Delivery Manager provides.', s: 'note' }],
      INVENTORY_HEAD.map(function (h) { return { v: h, s: 'head' }; })
    ];
    inventoryRows(inc).forEach(function (r) {
      rows.push(r.map(function (v, i) {
        if (v === '' || v === null || v === undefined) return null;
        if (i === 11 && typeof v === 'number') return { v: v, s: 'money' };
        if ((i === 7 || i === 8 || i === 12) && typeof v === 'number') return { v: v, s: 'num' };
        return String(v);
      }));
    });
    if (rows.length === 4) rows.push([{ v: 'No damaged facilities recorded.', s: 'note' }]);
    return [{ name: 'Damage Inventory', cols: [10, 30, 24, 14, 16, 8, 8, 11, 12, 40, 18, 13, 10, 16, 20, 12], freeze: 4, rows: rows }];
  }

  var HOME_HEAD = ['Street address', 'Town or city', 'County', 'Latitude', 'Longitude', 'Dwelling type', 'Units', 'Damage level',
    'Water depth (inches)', 'Primary residence', 'Owner or renter', 'Insurance', 'Habitable', 'Utilities working', 'Needs review',
    'Immediate needs', 'Notes', 'Assessed by', 'Assessed at (UTC)', 'Record id'];

  function homesCSV(inc) {
    var insText = { home: "Homeowner's or renter's", flood: 'Flood', none: 'None', unknown: 'Unknown' };
    var rows = C.listRecords(inc, 'daHome').map(function (g) {
      var d = g.winner.data;
      return [d.address, d.city, d.county, d.lat === null ? '' : d.lat, d.lon === null ? '' : d.lon, d.dwelling,
        d.units === null ? '' : d.units, d.level, d.waterInches === null ? '' : d.waterInches, d.primary, d.tenure,
        (d.insurance || []).map(function (x) { return insText[x] || x; }).join('; '), d.habitable, d.utilities, d.review ? 'yes' : '',
        d.needs, d.notes, d.assessedBy, d.assessedAt, g.rid];
    });
    return csv(HOME_HEAD, rows);
  }

  /* ---------- volunteers ---------- */

  function volunteerHours(d) {
    if (!d.signIn || !d.signOut) return null;
    var ms = Date.parse(d.signOut) - Date.parse(d.signIn);
    if (!(ms > 0)) return 0;
    return Math.round(ms / 360000) / 10;
  }

  /*
   * A volunteer shift as donated labor, one entry per day, valued at straight time.
   * Returns [{ type: 'labor', data }]. source ties the entries to the sign-in.
   */
  function volunteerLabor(d, rid) {
    var days = C.hoursByDay(d.signIn, d.signOut);
    var source = ('Volunteer sign-in ' + String(rid || '').slice(0, 24) + ': ' + (d.name || '')).slice(0, 200);
    return days.map(function (x) {
      return {
        type: 'labor',
        data: {
          date: x.date,
          name: String(d.name || '').slice(0, 200),
          department: d.organization || '',
          personType: 'Donated labor',
          regHours: Math.min(24, Math.round(x.hours * 100) / 100),
          regRate: typeof d.rate === 'number' ? d.rate : null,
          fringeReg: typeof d.fringe === 'number' ? d.fringe : null,
          category: d.category || '',
          site: d.site || '',
          work: d.work || '',
          source: source
        }
      };
    });
  }

  function volunteerTotals(inc) {
    var t = { count: 0, here: 0, hours: 0, people: new Set() };
    C.listRecords(inc, 'volunteer').forEach(function (g) {
      var d = g.winner.data;
      t.count++;
      if (!d.signOut) t.here++;
      t.hours += volunteerHours(d) || 0;
      t.people.add(String(d.name || '').trim().toLowerCase());
    });
    t.hours = Math.round(t.hours * 10) / 10;
    t.people = t.people.size;
    return t;
  }

  return {
    LEVELS: LEVELS,
    INVENTORY_HEAD: INVENTORY_HEAD,
    dwellingsByLevel: dwellingsByLevel,
    damageTotals: damageTotals,
    block30: block30,
    inventoryRows: inventoryRows,
    inventoryCSV: inventoryCSV,
    inventorySheets: inventorySheets,
    homesCSV: homesCSV,
    volunteerHours: volunteerHours,
    volunteerLabor: volunteerLabor,
    volunteerTotals: volunteerTotals
  };
});
