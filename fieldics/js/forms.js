/*
 * FieldICS form definitions.
 *
 * One description per record type drives three things:
 *  - validation of saved and imported data (core.js)
 *  - the on-screen editor (app.js)
 *  - the printed layout (print.js)
 *
 * Block numbers and labels follow the FEMA NIMS ICS forms (ICS 201, 202, 203,
 * 204, 205, 213, 213 RR). Cost entries follow the fields on the FEMA Public
 * Assistance summary records for force account labor, force account equipment,
 * materials, rented equipment, and contract work.
 *
 * Field kinds: text, textarea, datetime, date, number, money, percent, int,
 * select, checks, bool, rows (a repeating table), image (one picture),
 * images (a list of photos).
 *
 * Field options used by the app:
 *  def: 'now' | 'today' | 'me' | 'myPosition' | 'meAndPosition'  (value for a new form)
 *  defValue: a fixed value for a new form
 *  list: id of a suggestion list
 *  hideLabel: the block title already names the field
 * Block options:
 *  header: printed in the form header instead of the body
 *  page: page number on multi-page forms (ICS 201)
 *  col: 'left' or 'right' column on two-column forms (ICS 203)
 *  signature: prints a signature line
 *  noPrint: shown in the app only
 *  photos: a photo block, printed as an appendix instead of in the form
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldICSForms = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function options(list) {
    return list.map(function (o) {
      return Array.isArray(o) ? { v: o[0], t: o[1] } : { v: o, t: o };
    });
  }

  function field(kind, k, label, extra) {
    var f = { k: k, label: label, kind: kind };
    if (extra) {
      Object.keys(extra).forEach(function (key) { f[key] = extra[key]; });
    }
    return f;
  }

  function text(k, label, x) { return field('text', k, label, x); }
  function area(k, label, x) { return field('textarea', k, label, x); }
  function when(k, label, x) { return field('datetime', k, label, x); }
  function day(k, label, x) { return field('date', k, label, x); }
  function num(k, label, x) { return field('number', k, label, x); }
  function money(k, label, x) { return field('money', k, label, x); }
  function pct(k, label, x) { return field('percent', k, label, x); }
  function whole(k, label, x) { return field('int', k, label, x); }
  function flag(k, label, x) { return field('bool', k, label, x); }
  function image(k, label, x) { return field('image', k, label, x); }
  function images(k, label, x) { return field('images', k, label, x); }

  function choice(k, label, list, x) {
    var f = field('select', k, label, x);
    f.options = options(list);
    return f;
  }

  function checks(k, label, list, x) {
    var f = field('checks', k, label, x);
    f.options = options(list);
    return f;
  }

  function rows(k, label, columns, x) {
    var f = field('rows', k, label, x);
    f.columns = columns;
    return f;
  }

  function prepared(n, extra) {
    extra = extra || {};
    var list = [text('prepName', 'Name', { list: 'people', def: 'me' })];
    if (!extra.noPosition) {
      list.push(text('prepPosition', 'Position/title', { list: 'ics-positions', def: 'myPosition' }));
    }
    list.push(when('prepAt', 'Date/time', { def: 'now' }));
    return { n: n, title: extra.title || 'Prepared by', fields: list, signature: true, prepared: true };
  }

  /* Latitude and longitude in decimal degrees. A block marked geo gets an "Add my location" button. */
  function geoFields() {
    return [
      num('lat', 'Latitude', { min: -90, max: 90, decimals: 6, placeholder: '36.834100' }),
      num('lon', 'Longitude', { min: -180, max: 180, decimals: 6, placeholder: '-81.515300' }),
      num('gpsAcc', 'Location accuracy (meters)', { max: 100000, decimals: 0 }),
      when('gpsAt', 'Location taken')
    ];
  }

  function geoBlock(title, extra) {
    return {
      title: title || 'Location', geo: true,
      note: 'Add my location fills these from the device GPS, which works with no signal. Or type them in.',
      fields: (extra || []).concat(geoFields())
    };
  }

  /*
   * A block laid out as a table with fixed rows and columns, like ICS 209 block 31.
   * Each cell is its own field, keyed prefix + row key + column key, so it validates,
   * merges, and compares like any other field. cols: [key, label, kind?, options?].
   */
  function matrix(prefix, rowList, colList) {
    var fields = [];
    rowList.forEach(function (r) {
      colList.forEach(function (c) {
        var kind = c[2] || 'int';
        var f = field(kind, prefix + r[0] + c[0], r[1] + ': ' + c[1], c[3] ? { max: c[3] } : null);
        fields.push(f);
      });
    });
    return { fields: fields, matrix: { prefix: prefix, rows: rowList, cols: colList } };
  }

  function extend(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  function horizons(prefix, label) {
    return [['12', '12 hours'], ['24', '24 hours'], ['48', '48 hours'], ['72', '72 hours'], ['After', 'Anticipated after 72 hours']].map(function (x) {
      return area(prefix + x[0], x[1], { rows: 2, max: 3000, hint: x[0] === '12' ? label : null });
    });
  }

  /* Resource slots on the ICS 215: each assignment line records required and have for up to six kinds. */
  var SLOTS_215 = 6;

  function slotColumns() {
    var cols = [];
    for (var i = 1; i <= SLOTS_215; i++) {
      cols.push(whole('r' + i + 'Req', 'Resource ' + i + ': required', { slot: i, part: 'req', max: 10000 }));
      cols.push(whole('r' + i + 'Have', 'Resource ' + i + ': have', { slot: i, part: 'have', max: 10000 }));
    }
    return cols;
  }

  var CATEGORY_LIST = [
    ['A', 'A: Debris removal'],
    ['B', 'B: Emergency protective measures'],
    ['C', 'C: Roads and bridges'],
    ['D', 'D: Water control facilities'],
    ['E', 'E: Buildings and equipment'],
    ['F', 'F: Utilities'],
    ['G', 'G: Parks, recreational, and other facilities']
  ];

  function costWhere(withWork) {
    var list = [
      choice('category', 'FEMA category of work', CATEGORY_LIST),
      text('site', 'Location or site', { list: 'cost-sites' }),
      text('project', 'Project number (if assigned)', { max: 60 }),
      text('rrNumber', 'Resource request (213 RR) number', { max: 60 })
    ];
    if (withWork) list.push(area('work', 'Description of work performed', { rows: 2, max: 2000 }));
    return { title: 'Where and what', fields: list };
  }

  function costGeo() {
    return geoBlock('Site location on the map');
  }

  function costPhotos() {
    return {
      title: 'Photos and receipts', photos: true,
      note: 'Photos of the work, the equipment in use, receipts, or invoices. They print as an appendix to the cost summary.',
      fields: [images('photos', 'Photos', { hideLabel: true })]
    };
  }

  function costSource() {
    return {
      title: 'Created from', noPrint: true,
      note: 'Filled in when this entry was made from a check-in or a resource request.',
      fields: [text('source', 'Created from', { max: 200, hideLabel: true })]
    };
  }

  var NOTE_KINDS = ['Info', 'Contact', 'Location', 'Follow-up', 'Decision'];

  var CONTRACT_TYPES = ['Fixed price (lump sum)', 'Unit price', 'Time and materials', 'Cost plus fixed fee', 'Cost plus a percentage of cost'];

  /* The federal procurement standards PA reviewers check a contract file against (2 CFR 200, as revised in 2024). */
  var PROC_CHECKS = [
    ['procedures', 'Followed our written procurement procedures (200.318(a))'],
    ['competition', 'Competed fully and openly, or wrote down why not (200.319, 200.320)'],
    ['sam', 'Checked SAM.gov: the contractor is not suspended or debarred (2 CFR 180)'],
    ['smallBiz', 'Took the affirmative steps for small, minority, and women-owned businesses (200.321)'],
    ['priceAnalysis', 'Cost or price analysis, if over the simplified acquisition threshold (200.324(a))'],
    ['clauses', 'Required federal contract clauses are in the contract (200.327, Appendix II)'],
    ['bonds', 'Bid, performance, and payment bonds, if construction over the threshold (200.326)'],
    ['ceiling', 'Time and materials only: no other type fit, and there is a ceiling price (200.318(j))'],
    ['conflict', 'No conflict of interest in the award (200.318(c))'],
    ['oversight', 'Work monitored against the contract terms (200.318(b))'],
    ['history', 'Procurement history kept: method, contract type, selection, and price basis (200.318(i))']
  ];

  var CHECKIN_LOCATIONS = ['Base', 'Staging Area', 'ICP', 'Helibase', 'Other'];

  var POSITIONS = [
    'Incident Commander', 'Deputy Incident Commander', 'Public Information Officer', 'Safety Officer',
    'Liaison Officer', 'Agency Representative', 'Operations Section Chief', 'Deputy Operations Section Chief',
    'Branch Director', 'Division/Group Supervisor', 'Strike Team Leader', 'Task Force Leader',
    'Single Resource Boss', 'Staging Area Manager', 'Air Operations Branch Director', 'Planning Section Chief',
    'Resources Unit Leader', 'Situation Unit Leader', 'Documentation Unit Leader', 'Demobilization Unit Leader',
    'Technical Specialist', 'Logistics Section Chief', 'Support Branch Director', 'Supply Unit Leader',
    'Facilities Unit Leader', 'Ground Support Unit Leader', 'Service Branch Director',
    'Communications Unit Leader', 'Medical Unit Leader', 'Food Unit Leader',
    'Finance/Administration Section Chief', 'Time Unit Leader', 'Procurement Unit Leader',
    'Compensation/Claims Unit Leader', 'Cost Unit Leader', 'EOC Director', 'EOC Manager',
    'Emergency Management Coordinator', 'Scribe'
  ];

  var FORMS = {
    period: {
      type: 'period',
      group: 'meta',
      scope: 'period',
      code: 'Operational period',
      title: 'Operational period',
      blocks: [
        { title: 'Operational period', fields: [when('start', 'Start', { required: true }), when('end', 'End', { required: true })] }
      ]
    },

    '201': {
      type: '201',
      group: 'form',
      scope: 'incident',
      code: 'ICS 201',
      title: 'Incident Briefing',
      repeatPrepared: true,
      resetOnCopy: ['prepName', 'prepPosition', 'prepAt'],
      blocks: [
        { n: '3', title: 'Date/time initiated', header: true, fields: [when('initiated', 'Date and time initiated', { def: 'now', hideLabel: true })] },
        {
          n: '4', title: 'Map/sketch', page: 1,
          note: 'Include a sketch showing the total area of operations, the incident site/area, impacted and threatened areas, overflight results, trajectories, impacted shorelines, or other graphics depicting situational status and resource assignment. A photo of a hand-drawn sketch works.',
          fields: [image('map', 'Map or sketch image'), area('mapNotes', 'Map/sketch notes', { rows: 3, max: 4000 })]
        },
        {
          n: '5', title: 'Situation summary and health and safety briefing', page: 1,
          note: 'For briefings or transfer of command: recognize potential incident health and safety hazards and develop necessary measures (remove hazard, provide personal protective equipment, warn people of the hazard) to protect responders from those hazards.',
          fields: [area('situation', 'Situation summary and health and safety briefing', { rows: 8, hideLabel: true })]
        },
        { n: '7', title: 'Current and planned objectives', page: 2, fields: [area('objectives', 'Current and planned objectives', { rows: 6, hideLabel: true })] },
        {
          n: '8', title: 'Current and planned actions, strategies, and tactics', page: 2,
          fields: [rows('actions', 'Actions', [
            text('time', 'Time', { max: 40, placeholder: '0800' }),
            area('action', 'Actions', { rows: 2, max: 2000 })
          ], { addLabel: 'Add action', rowLabel: 'Action', hideLabel: true, printMin: 8 })]
        },
        {
          n: '9', title: 'Current organization', page: 3, chart: true,
          note: 'Fill in additional organization as appropriate.',
          fields: [
            area('ic', 'Incident Commander(s)', { rows: 2, max: 600, hint: 'For Unified Command, list each Incident Commander with their agency.' }),
            text('ops', 'Operations Section Chief'),
            text('plans', 'Planning Section Chief'),
            text('logs', 'Logistics Section Chief'),
            text('finance', 'Finance/Admin Section Chief'),
            text('safety', 'Safety Officer'),
            text('pio', 'Public Information Officer'),
            text('liaison', 'Liaison Officer'),
            rows('orgMore', 'Additional organization', [
              text('position', 'Position', { list: 'ics-positions' }),
              text('name', 'Name')
            ], { addLabel: 'Add position', rowLabel: 'Position' })
          ]
        },
        {
          n: '10', title: 'Resource summary', page: 4,
          fields: [rows('resources', 'Resources', [
            text('resource', 'Resource', { hint: 'Number and category, kind, or type ordered' }),
            text('identifier', 'Resource identifier', { hint: 'Agency and/or resource designator' }),
            when('ordered', 'Date/time ordered'),
            text('eta', 'ETA', { max: 40, placeholder: '1430' }),
            flag('arrived', 'Arrived'),
            area('notes', 'Notes (location/assignment/status)', { rows: 2, max: 1000 })
          ], { addLabel: 'Add resource', rowLabel: 'Resource', hideLabel: true, printMin: 10 })]
        },
        prepared('6')
      ]
    },

    '202': {
      type: '202',
      group: 'form',
      scope: 'period',
      code: 'ICS 202',
      title: 'Incident Objectives',
      iap: 1,
      resetOnCopy: ['prepName', 'prepPosition', 'prepAt', 'approvedName', 'approvedAt'],
      blocks: [
        { n: '3', title: 'Objective(s)', fields: [area('objectives', 'Objective(s)', { rows: 8, hideLabel: true })] },
        {
          n: '4', title: 'Operational period command emphasis',
          fields: [
            area('emphasis', 'Operational period command emphasis', { rows: 4, hideLabel: true }),
            area('awareness', 'General situational awareness', { rows: 4 })
          ]
        },
        {
          n: '5', title: 'Site safety plan required?', w: 'half',
          fields: [
            choice('sspRequired', 'Site safety plan required?', ['Yes', 'No']),
            text('sspLocation', 'Approved site safety plan(s) located at')
          ]
        },
        {
          n: '6', title: 'Incident action plan', w: 'half',
          note: 'The items checked below are included in this incident action plan.',
          fields: [
            checks('iapItems', 'Included in this IAP', ['ICS 203', 'ICS 204', 'ICS 205', 'ICS 205A', 'ICS 206', 'ICS 207', 'ICS 208', 'Map/Chart', 'Weather Forecast/Tides/Currents'], { hideLabel: true }),
            text('iapOther', 'Other attachments')
          ]
        },
        prepared('7'),
        {
          n: '8', title: 'Approved by Incident Commander', signature: true,
          fields: [text('approvedName', 'Name', { list: 'people' }), when('approvedAt', 'Date/time')]
        }
      ]
    },

    '203': {
      type: '203',
      group: 'form',
      scope: 'period',
      code: 'ICS 203',
      title: 'Organization Assignment List',
      iap: 2,
      twoColumn: true,
      resetOnCopy: ['prepName', 'prepPosition', 'prepAt'],
      blocks: [
        {
          n: '3', title: 'Incident Commander(s) and Command Staff', col: 'left',
          fields: [
            area('icuc', 'IC/UCs', { rows: 2, max: 600, hint: 'One per line. For Unified Command, include each agency.' }),
            text('icDeputy', 'Deputy'),
            text('safety', 'Safety Officer'),
            text('pio', 'Public Information Officer'),
            text('liaison', 'Liaison Officer')
          ]
        },
        {
          n: '4', title: 'Agency/organization representatives', col: 'left',
          fields: [rows('agencyReps', 'Representatives', [
            text('agency', 'Agency/organization'),
            text('name', 'Name')
          ], { addLabel: 'Add representative', rowLabel: 'Representative', hideLabel: true, printMin: 4 })]
        },
        {
          n: '5', title: 'Planning Section', col: 'left',
          fields: [
            text('planChief', 'Chief'),
            text('planDeputy', 'Deputy'),
            text('resourcesUnit', 'Resources Unit'),
            text('situationUnit', 'Situation Unit'),
            text('documentationUnit', 'Documentation Unit'),
            text('demobUnit', 'Demobilization Unit'),
            rows('techSpecs', 'Technical specialists', [
              text('specialty', 'Specialty'),
              text('name', 'Name')
            ], { addLabel: 'Add technical specialist', rowLabel: 'Specialist', printMin: 2 })
          ]
        },
        {
          n: '6', title: 'Logistics Section', col: 'right',
          fields: [
            text('logChief', 'Chief'),
            text('logDeputy', 'Deputy'),
            text('supportDirector', 'Support Branch Director'),
            text('supplyUnit', 'Supply Unit'),
            text('facilitiesUnit', 'Facilities Unit'),
            text('groundUnit', 'Ground Support Unit'),
            text('serviceDirector', 'Service Branch Director'),
            text('commsUnit', 'Communications Unit'),
            text('medicalUnit', 'Medical Unit'),
            text('foodUnit', 'Food Unit')
          ]
        },
        {
          n: '7', title: 'Operations Section', col: 'right',
          fields: [
            text('opsChief', 'Chief'),
            text('opsDeputy', 'Deputy'),
            rows('staging', 'Staging areas', [
              text('area', 'Staging area'),
              text('name', 'Manager')
            ], { addLabel: 'Add staging area', rowLabel: 'Staging area', printMin: 1 }),
            rows('branches', 'Branches, divisions, and groups', [
              text('branch', 'Branch', { max: 80 }),
              choice('role', 'Position', ['Branch Director', 'Deputy Branch Director', 'Division/Group Supervisor', 'Other']),
              text('unit', 'Division/group', { max: 80, placeholder: 'Division A' }),
              text('name', 'Name')
            ], { addLabel: 'Add branch position', rowLabel: 'Position', printMin: 4, hint: 'Add one row per person. For a division or group, enter its identifier and choose Division/Group Supervisor.' }),
            text('airOpsDirector', 'Air Operations Branch Director')
          ]
        },
        {
          n: '8', title: 'Finance/Administration Section', col: 'right',
          fields: [
            text('finChief', 'Chief'),
            text('finDeputy', 'Deputy'),
            text('timeUnit', 'Time Unit'),
            text('procurementUnit', 'Procurement Unit'),
            text('compClaimsUnit', 'Compensation/Claims Unit'),
            text('costUnit', 'Cost Unit')
          ]
        },
        prepared('9')
      ]
    },

    '204': {
      type: '204',
      group: 'form',
      scope: 'period-many',
      code: 'ICS 204',
      title: 'Assignment List',
      iap: 3,
      resetOnCopy: ['prepName', 'prepPosition', 'prepAt'],
      blocks: [
        {
          n: '3', title: 'Branch, division, group, staging area',
          fields: [
            text('branch', 'Branch', { max: 80 }),
            text('division', 'Division', { max: 80 }),
            text('group', 'Group', { max: 80 }),
            text('staging', 'Staging area', { max: 80 })
          ]
        },
        {
          n: '4', title: 'Operations personnel', cols: 2,
          fields: [
            text('osc', 'Operations Section Chief'),
            text('oscContact', 'Contact number(s)'),
            text('branchDirector', 'Branch Director'),
            text('branchContact', 'Contact number(s)'),
            text('supervisor', 'Division/Group Supervisor'),
            text('supervisorContact', 'Contact number(s)')
          ]
        },
        {
          n: '5', title: 'Resources assigned',
          fields: [rows('resources', 'Resources assigned', [
            text('identifier', 'Resource identifier'),
            text('leader', 'Leader'),
            whole('persons', '# of persons'),
            text('contact', 'Contact (phone, pager, radio frequency, etc.)'),
            area('notes', 'Reporting location, special equipment and supplies, remarks, notes, information', { rows: 2, max: 1000 })
          ], { addLabel: 'Add resource', rowLabel: 'Resource', hideLabel: true, printMin: 6 })]
        },
        { n: '6', title: 'Work assignments', fields: [area('work', 'Work assignments', { rows: 6, hideLabel: true })] },
        { n: '7', title: 'Special instructions', fields: [area('special', 'Special instructions', { rows: 4, hideLabel: true })] },
        {
          n: '8', title: 'Communications',
          note: 'Radio and/or phone contact numbers needed for this assignment.',
          fields: [rows('comms', 'Communications', [
            text('function', 'Name/function'),
            text('contact', 'Primary contact: cell, pager, or radio (frequency/system/channel)')
          ], { addLabel: 'Add contact', rowLabel: 'Contact', hideLabel: true, printMin: 4 })]
        },
        prepared('9')
      ]
    },

    '205': {
      type: '205',
      group: 'form',
      scope: 'period',
      code: 'ICS 205',
      title: 'Incident Radio Communications Plan',
      iap: 4,
      wide: true,
      resetOnCopy: ['preparedAt', 'prepName', 'prepAt'],
      blocks: [
        { n: '2', title: 'Date/time prepared', header: true, fields: [when('preparedAt', 'Date/time prepared', { def: 'now', hideLabel: true })] },
        {
          n: '4', title: 'Basic radio channel use',
          fields: [rows('channels', 'Channels', [
            text('zone', 'Zone/group', { max: 40 }),
            text('ch', 'Ch #', { max: 20 }),
            choice('function', 'Function', ['Command', 'Tactical', 'Ground-to-Air', 'Air-to-Air', 'Support', 'Dispatch']),
            text('name', 'Channel name/trunked radio system talkgroup', { max: 120 }),
            text('assignment', 'Assignment', { max: 120 }),
            text('rxFreq', 'RX freq', { max: 40, placeholder: '155.4750' }),
            choice('rxNW', 'RX N or W', ['N', 'W']),
            text('rxTone', 'RX tone/NAC', { max: 40 }),
            text('txFreq', 'TX freq', { max: 40 }),
            choice('txNW', 'TX N or W', ['N', 'W']),
            text('txTone', 'TX tone/NAC', { max: 40 }),
            choice('mode', 'Mode (A, D, or M)', [['A', 'A (analog)'], ['D', 'D (digital)'], ['M', 'M (mixed)']]),
            text('remarks', 'Remarks', { max: 300 })
          ], { addLabel: 'Add channel', rowLabel: 'Channel', hideLabel: true, printMin: 8 })]
        },
        { n: '5', title: 'Special instructions', fields: [area('special', 'Special instructions', { rows: 4, hideLabel: true })] },
        {
          n: '6', title: 'Prepared by (Communications Unit Leader)', signature: true, prepared: true,
          fields: [text('prepName', 'Name', { list: 'people', def: 'me' }), when('prepAt', 'Date/time', { def: 'now' })]
        }
      ]
    },

    '205A': {
      type: '205A',
      group: 'form',
      scope: 'period',
      code: 'ICS 205A',
      title: 'Communications List',
      iap: 5,
      resetOnCopy: ['prepName', 'prepPosition', 'prepAt'],
      blocks: [
        {
          n: '3', title: 'Basic local communications information',
          note: 'Everyone on the incident who may need to be reached, and how. Prints in name order. "Fill from 203 and setup" adds the names on the 203 with the phone numbers in the locality setup.',
          fields: [rows('contacts', 'Contacts', [
            text('position', 'Incident assigned position', { list: 'ics-positions' }),
            text('name', 'Name', { list: 'people' }),
            text('method', 'Method(s) of contact (phone, pager, cell, etc.)', { max: 300 })
          ], { addLabel: 'Add contact', rowLabel: 'Contact', hideLabel: true, printMin: 12, maxRows: 300, printSort: 'name', printLabels: { name: 'Name (alphabetized)' } })]
        },
        prepared('4')
      ]
    },

    '206': {
      type: '206',
      group: 'form',
      scope: 'period',
      code: 'ICS 206',
      title: 'Medical Plan',
      iap: 6,
      wide: true,
      resetOnCopy: ['prepName', 'prepAt', 'approvedName', 'approvedAt'],
      blocks: [
        {
          n: '3', title: 'Medical aid stations',
          fields: [rows('stations', 'Medical aid stations', [
            text('name', 'Name'),
            text('location', 'Location', { max: 200 }),
            text('contact', 'Contact number(s)/frequency'),
            choice('paramedics', 'Paramedics on site?', ['Yes', 'No'])
          ], { addLabel: 'Add aid station', rowLabel: 'Aid station', hideLabel: true, printMin: 3 })]
        },
        {
          n: '4', title: 'Transportation (indicate air or ground)',
          fields: [rows('transport', 'Transportation', [
            text('service', 'Ambulance service'),
            choice('mode', 'Air or ground', ['Ground', 'Air']),
            text('location', 'Location', { max: 200 }),
            text('contact', 'Contact number(s)/frequency'),
            choice('level', 'Level of service', ['ALS', 'BLS'])
          ], { addLabel: 'Add ambulance service', rowLabel: 'Service', hideLabel: true, printMin: 3 })]
        },
        {
          n: '5', title: 'Hospitals',
          fields: [rows('hospitals', 'Hospitals', [
            text('name', 'Hospital name'),
            text('address', 'Address, latitude and longitude if helipad', { max: 300 }),
            text('contact', 'Contact number(s)/frequency'),
            text('airTime', 'Travel time: air', { max: 40 }),
            text('groundTime', 'Travel time: ground', { max: 40 }),
            choice('trauma', 'Trauma center', ['Yes', 'No']),
            text('traumaLevel', 'Trauma level', { max: 20 }),
            choice('burn', 'Burn center', ['Yes', 'No']),
            choice('helipad', 'Helipad', ['Yes', 'No'])
          ], { addLabel: 'Add hospital', rowLabel: 'Hospital', hideLabel: true, printMin: 3 })]
        },
        {
          n: '6', title: 'Special medical emergency procedures',
          fields: [
            area('procedures', 'Special medical emergency procedures', { rows: 5, hideLabel: true }),
            flag('aviation', 'Aviation assets are used for rescue. If assets are used, coordinate with Air Operations.')
          ]
        },
        {
          n: '7', title: 'Prepared by (Medical Unit Leader)', signature: true, prepared: true,
          fields: [text('prepName', 'Name', { list: 'people', def: 'me' }), when('prepAt', 'Date/time', { def: 'now' })]
        },
        {
          n: '8', title: 'Approved by (Safety Officer)', signature: true,
          fields: [text('approvedName', 'Name', { list: 'people' }), when('approvedAt', 'Date/time')]
        }
      ]
    },

    '208': {
      type: '208',
      group: 'form',
      scope: 'period',
      code: 'ICS 208',
      title: 'Safety Message/Plan',
      iap: 8,
      resetOnCopy: ['prepName', 'prepPosition', 'prepAt'],
      blocks: [
        {
          n: '3', title: 'Safety message/expanded safety message, safety plan, site safety plan',
          fields: [area('message', 'Safety message', { rows: 12, hideLabel: true, max: 12000 })]
        },
        {
          n: '4', title: 'Site safety plan required?',
          fields: [
            choice('sspRequired', 'Site safety plan required?', ['Yes', 'No']),
            text('sspLocation', 'Approved site safety plan(s) located at')
          ]
        },
        prepared('5')
      ]
    },

    '215': {
      type: '215',
      group: 'form',
      scope: 'period',
      code: 'ICS 215',
      title: 'Operational Planning Worksheet',
      wide: true,
      resetOnCopy: ['prepName', 'prepPosition', 'prepAt'],
      blocks: [
        {
          n: '6', title: 'Resources: kinds and types (column headings)', cols: 3,
          note: 'Name up to six kinds or types of resources, such as Engine Type 3, Dump truck, or Search team. Each assignment below records how many it requires and has; the worksheet works out what to order.',
          fields: [1, 2, 3, 4, 5, 6].map(function (i) { return text('kind' + i, 'Resource ' + i, { max: 60 }); })
        },
        {
          title: 'Assignments (blocks 3 to 5 and 7 to 10)',
          fields: [rows('lines', 'Assignments', [
            text('branch', '3. Branch', { max: 80 }),
            text('division', '4. Division, group, or other', { max: 80 }),
            area('work', '5. Work assignment and special instructions', { rows: 2, max: 2000 })
          ].concat(slotColumns(), [
            text('overhead', '7. Overhead position(s)', { max: 200 }),
            text('equipment', '8. Special equipment and supplies', { max: 300 }),
            text('reporting', '9. Reporting location', { max: 200 }),
            text('arrival', '10. Requested arrival time', { max: 40 })
          ]), { addLabel: 'Add assignment', rowLabel: 'Assignment', hideLabel: true, printMin: 3, maxRows: 60, slots: 'kind' })]
        },
        prepared('14')
      ]
    },

    '215A': {
      type: '215A',
      group: 'form',
      scope: 'period',
      code: 'ICS 215A',
      title: 'Incident Action Plan Safety Analysis',
      resetOnCopy: ['preparedAt', 'prepName', 'oscName', 'oscAt'],
      blocks: [
        { n: '3', title: 'Date/time prepared', header: true, fields: [when('preparedAt', 'Date/time prepared', { def: 'now', hideLabel: true })] },
        {
          title: 'Safety analysis (blocks 5 to 7)',
          note: 'One row per incident area or assignment: the hazards and risks there, and how each is mitigated. The Safety Officer and the Operations Section Chief prepare it together.',
          fields: [rows('analysis', 'Safety analysis', [
            text('area', '5. Incident area', { max: 200 }),
            area('hazards', '6. Hazards/risks', { rows: 2, max: 2000 }),
            area('mitigations', '7. Mitigations', { rows: 2, max: 2000 })
          ], { addLabel: 'Add incident area', rowLabel: 'Area', hideLabel: true, printMin: 6 })]
        },
        {
          n: '8', title: 'Prepared by (Safety Officer)', signature: true, prepared: true,
          fields: [text('prepName', 'Name', { list: 'people', def: 'me' })]
        },
        {
          title: 'Prepared by (Operations Section Chief)', signature: true,
          fields: [text('oscName', 'Name', { list: 'people' }), when('oscAt', 'Date/time')]
        }
      ]
    },

    '213': {
      type: '213',
      group: 'form',
      scope: 'many',
      code: 'ICS 213',
      title: 'General Message',
      blocks: [
        { n: '2', title: 'To (name/position)', w: 'half', fields: [text('to', 'To (name/position)', { required: true, hideLabel: true, list: 'people' })] },
        { n: '3', title: 'From (name/position)', w: 'half', fields: [text('from', 'From (name/position)', { hideLabel: true, def: 'meAndPosition' })] },
        { n: '4', title: 'Subject', w: 'half', fields: [text('subject', 'Subject', { hideLabel: true })] },
        { n: '5', title: 'Date and time', w: 'half', fields: [when('at', 'Date and time', { hideLabel: true, def: 'now' })] },
        { n: '7', title: 'Message', fields: [area('message', 'Message', { rows: 8, required: true, hideLabel: true })] },
        {
          n: '8', title: 'Approved by', signature: true,
          fields: [text('approvedName', 'Name', { list: 'people' }), text('approvedPosition', 'Position/title', { list: 'ics-positions' })]
        },
        { n: '9', title: 'Reply', fields: [area('reply', 'Reply', { rows: 5, hideLabel: true })] },
        {
          n: '10', title: 'Replied by', signature: true,
          fields: [text('replyName', 'Name', { list: 'people' }), text('replyPosition', 'Position/title', { list: 'ics-positions' }), when('replyAt', 'Date/time')]
        }
      ]
    },

    '213RR': {
      type: '213RR',
      group: 'form',
      scope: 'many',
      code: 'ICS 213 RR',
      title: 'Resource Request Message',
      blocks: [
        { section: 'Requestor', n: '2', title: 'Date/time', header: true, w: 'half', fields: [when('at', 'Date/time', { def: 'now', hideLabel: true })] },
        { n: '3', title: 'Resource request number', header: true, w: 'half', fields: [text('number', 'Resource request number', { max: 60, hideLabel: true })] },
        {
          n: '4', title: 'Order',
          note: 'Use additional forms when requesting different resource sources of supply.',
          fields: [rows('items', 'Order', [
            num('qty', 'Qty.'),
            text('kind', 'Kind', { max: 120 }),
            text('type', 'Type', { max: 120 }),
            area('description', 'Detailed item description (vital characteristics, brand, specs, experience, size, etc.)', { rows: 2, max: 2000 }),
            when('arrivalRequested', 'Arrival requested'),
            when('arrivalEstimated', 'Arrival estimated'),
            money('cost', 'Cost')
          ], { addLabel: 'Add item', rowLabel: 'Item', hideLabel: true, printMin: 4 })]
        },
        { n: '5', title: 'Requested delivery/reporting location', fields: [area('location', 'Requested delivery/reporting location', { rows: 2, max: 1000, hideLabel: true })] },
        { n: '6', title: 'Suitable substitutes and/or suggested sources', fields: [area('substitutes', 'Suitable substitutes and/or suggested sources', { rows: 2, max: 2000, hideLabel: true })] },
        { n: '7', title: 'Requested by name/position', w: 'half', fields: [text('requestedBy', 'Requested by name/position', { hideLabel: true, def: 'meAndPosition' })] },
        { n: '8', title: 'Priority', w: 'half', fields: [choice('priority', 'Priority', ['Urgent', 'Routine', 'Low'], { hideLabel: true })] },
        { n: '9', title: 'Section Chief approval', signature: true, fields: [text('approval', 'Name', { list: 'people' })] },
        { section: 'Logistics', n: '10', title: 'Logistics order number', w: 'half', fields: [text('orderNumber', 'Logistics order number', { max: 60, hideLabel: true })] },
        { n: '11', title: 'Supplier phone/fax/email', w: 'half', fields: [text('supplierContact', 'Supplier phone/fax/email', { hideLabel: true })] },
        { n: '12', title: 'Name of supplier/POC', w: 'half', fields: [text('supplierName', 'Name of supplier/POC', { hideLabel: true })] },
        { n: '13', title: 'Notes', fields: [area('logNotes', 'Notes', { rows: 3, max: 2000, hideLabel: true })] },
        { n: '14', title: 'Approval signature of authorized logistics representative', signature: true, w: 'half', fields: [text('logApproval', 'Name', { list: 'people' })] },
        { n: '15', title: 'Date/time', w: 'half', fields: [when('logAt', 'Date/time', { hideLabel: true })] },
        { n: '16', title: 'Order placed by', w: 'half', fields: [choice('placedBy', 'Order placed by', [['SPUL', 'SPUL (Supply Unit)'], ['PROC', 'PROC (Procurement Unit)']], { hideLabel: true })] },
        { section: 'Finance', n: '17', title: 'Reply/comments from Finance', fields: [area('financeReply', 'Reply/comments from Finance', { rows: 3, max: 2000, hideLabel: true })] },
        { n: '18', title: 'Finance Section signature', signature: true, w: 'half', fields: [text('financeName', 'Name', { list: 'people' })] },
        { n: '19', title: 'Date/time', w: 'half', fields: [when('financeAt', 'Date/time', { hideLabel: true })] },
        {
          section: 'Tracking', title: 'Photos', photos: true, noPrint: true,
          note: 'Photos of the item, a quote, or a delivery receipt. Kept with the request and shared with it.',
          fields: [images('photos', 'Photos', { hideLabel: true })]
        },
        {
          title: 'Request status', noPrint: true,
          note: 'For tracking in this app. Not part of the printed ICS 213 RR.',
          fields: [choice('status', 'Status', ['Requested', 'Approved', 'Ordered', 'Filled', 'Cancelled'], { defValue: 'Requested' })]
        }
      ]
    },

    '211': {
      type: '211',
      group: 'form',
      scope: 'many',
      code: 'ICS 211',
      title: 'Incident Check-In List',
      blocks: [
        {
          n: '3', title: 'Check-in location',
          fields: [
            choice('location', 'Check-in location', CHECKIN_LOCATIONS, { required: true, defValue: 'Staging Area' }),
            text('locationName', 'Location name or other', { max: 120, list: 'checkin-places' })
          ]
        },
        {
          n: '5', title: 'Single resource personnel by agency and name, or resource',
          fields: [
            text('identifier', 'Resource name or identifier', { required: true, max: 120, hint: "For a single person, enter the person's name. For equipment or a crew, its name or ID, such as Engine 31." }),
            text('agency', 'Agency', { max: 120 }),
            text('state', 'State', { max: 20 }),
            text('category', 'Category', { max: 80 }),
            text('kind', 'Kind', { max: 80 }),
            text('type', 'Type', { max: 40 }),
            choice('stTf', 'ST or TF', [['ST', 'ST (strike team)'], ['TF', 'TF (task force)']])
          ]
        },
        {
          title: 'Check-in information',
          fields: [
            text('orderNumber', '6. Order request #', { max: 60 }),
            when('checkIn', '7. Date/time check-in', { def: 'now', required: true }),
            text('leader', "8. Leader's name", { max: 120, list: 'people', hint: 'For equipment, the operator. For a strike team or task force, the leader. Blank for a single person.' }),
            whole('persons', '9. Total number of personnel', { max: 10000 }),
            text('contact', '10. Incident contact information', { max: 200 }),
            text('homeUnit', '11. Home unit or agency', { max: 120 }),
            text('departure', '12. Departure point, date and time', { max: 200 }),
            text('travel', '13. Method of travel', { max: 80 }),
            text('assignment', '14. Incident assignment', { max: 200 }),
            text('qualifications', '15. Other qualifications', { max: 200 }),
            text('toRU', '16. Data provided to Resources Unit (date, time, initials)', { max: 80 })
          ]
        },
        {
          section: 'Tracking', title: 'Check-out and costs', noPrint: true,
          note: 'For tracking in this app. Check-out time and the resource kind are used to make labor and equipment cost entries.',
          fields: [
            when('checkOut', 'Date/time check-out'),
            choice('resourceKind', 'What checked in', ['Person', 'Equipment with operator', 'Crew, strike team, or task force'], { defValue: 'Person' }),
            text('department', 'Department (for labor entries)', { max: 120 })
          ]
        },
        extend(geoBlock('Check-in location on the map'), { section: 'Tracking', noPrint: true })
      ]
    },

    '209': {
      type: '209',
      group: 'form',
      scope: 'many',
      code: 'ICS 209',
      title: 'Incident Status Summary',
      wide: true,
      blocks: [
        {
          n: '3', title: 'Report version', w: 'half',
          fields: [choice('version', 'Report version', ['Initial', 'Update', 'Final'], { defValue: 'Initial' }), text('reportNo', 'Report number (if used)', { max: 20 })]
        },
        { n: '4', title: 'Incident Commander(s) and agency or organization', w: 'half', fields: [area('commanders', 'Incident Commander(s) and agency or organization', { rows: 2, max: 600, hideLabel: true })] },
        { n: '5', title: 'Incident management organization', w: 'half', fields: [text('mgmtOrg', 'Incident management organization', { hideLabel: true, placeholder: 'County EOC, Type 3 IMT' })] },
        { n: '6', title: 'Incident start date/time', w: 'half', fields: [when('startAt', 'Date/time'), text('timeZone', 'Time zone', { max: 20, placeholder: 'EDT' })] },
        { n: '7', title: 'Current incident size or area involved', w: 'half', fields: [text('size', 'Size or area, with the unit ("sq mi", "city block")', { hideLabel: true })] },
        { n: '8', title: 'Percent (%) contained/completed', w: 'half', fields: [pct('percent', 'Percent contained or completed', { hideLabel: true, max: 100 })] },
        { n: '9', title: 'Incident definition', w: 'half', fields: [text('definition', 'Incident definition', { hideLabel: true, placeholder: 'Flash flood, tornado, winter storm' })] },
        { n: '10', title: 'Incident complexity level', w: 'half', fields: [choice('complexity', 'Incident complexity level', ['Type 1', 'Type 2', 'Type 3', 'Type 4', 'Type 5'], { hideLabel: true })] },
        { n: '11', title: 'For time period', fields: [when('from', 'From date/time'), when('to', 'To date/time')] },
        {
          section: 'Approval and routing information', n: '12', title: 'Prepared by',
          fields: [text('prepName', 'Print name', { list: 'people', def: 'me' }), text('prepPosition', 'ICS position', { list: 'ics-positions', def: 'myPosition' }), when('prepAt', 'Date/time prepared', { def: 'now' })]
        },
        { n: '13', title: 'Date/time submitted', w: 'half', fields: [when('submittedAt', 'Date/time submitted'), text('submittedTz', 'Time zone', { max: 20 })] },
        { n: '14', title: 'Approved by', w: 'half', signature: true, fields: [text('approvedName', 'Print name', { list: 'people' }), text('approvedPosition', 'ICS position', { list: 'ics-positions' })] },
        { n: '15', title: 'Primary location, organization, or agency sent to', fields: [text('sentTo', 'Sent to', { hideLabel: true, placeholder: 'State EOC' })] },
        { section: 'Incident location information', n: '16', title: 'State', w: 'half', fields: [text('state', 'State', { hideLabel: true, max: 40 })] },
        { n: '17', title: 'County/parish/borough', w: 'half', fields: [text('county', 'County', { hideLabel: true })] },
        { n: '18', title: 'City', w: 'half', fields: [text('city', 'City', { hideLabel: true })] },
        { n: '19', title: 'Unit or other', w: 'half', fields: [text('unit', 'Unit or other', { hideLabel: true })] },
        { n: '20', title: 'Incident jurisdiction', w: 'half', fields: [text('jurisdiction', 'Incident jurisdiction', { hideLabel: true })] },
        { n: '21', title: 'Incident location ownership (if different than jurisdiction)', w: 'half', fields: [text('ownership', 'Incident location ownership', { hideLabel: true })] },
        {
          n: '22', title: 'Longitude and latitude (decimal degrees)', geo: true,
          fields: [num('lat', 'Latitude', { min: -90, max: 90, decimals: 6 }), num('lon', 'Longitude', { min: -180, max: 180, decimals: 6 })]
        },
        { n: '23', title: 'US National Grid reference', w: 'half', fields: [text('usng', 'US National Grid reference', { hideLabel: true, max: 60 })] },
        { n: '24', title: 'Legal description (township, section, range)', w: 'half', fields: [text('legal', 'Legal description', { hideLabel: true })] },
        { n: '25', title: 'Short location or area description (list all affected areas or a reference point)', fields: [area('areaDesc', 'Short location or area description', { rows: 3, hideLabel: true })] },
        { n: '26', title: 'UTM coordinates', w: 'half', fields: [text('utm', 'UTM coordinates', { hideLabel: true, max: 80 })] },
        { n: '27', title: 'Electronic geospatial data included or attached (format, content, collection time, and labels)', w: 'half', fields: [text('geodata', 'Geospatial data', { hideLabel: true, max: 300 })] },
        { section: 'Incident summary', n: '28', title: 'Significant events for the time period reported (progress, evacuations, incident growth)', fields: [area('events', 'Significant events', { rows: 8, hideLabel: true, max: 12000 })] },
        { n: '29', title: 'Primary materials or hazards involved (hazardous chemicals, fuel types, infectious agents, radiation)', fields: [area('hazards', 'Primary materials or hazards', { rows: 3, hideLabel: true })] },
        extend({ n: '30', title: 'Damage assessment information', note: 'Counts of structures. "Fill from incident data" counts the homes in the damage assessment: single-family and manufactured homes on line E, and units in multi-family buildings on the Other line (this form has no line for multiple residences). Affected, minor, and major homes count as damaged.' },
          (function () {
            var m = matrix('dmg', [['Res', 'E. Single residences'], ['Com', 'F. Nonresidential commercial property'], ['Minor', 'Other minor structures'], ['Other', 'Other']],
              [['Threat', 'B. # threatened (72 hrs)'], ['Dmg', 'C. # damaged'], ['Dest', 'D. # destroyed']]);
            m.fields.unshift(area('damageNotes', 'Summary of damage and restriction of use or availability (residential, commercial, natural resources, critical infrastructure)', { rows: 3, max: 4000 }));
            return m;
          })()),
        extend({ n: '31', title: 'Public status summary (civilians)', pageBreak: true, note: 'Note in block 47 any numbers that are estimates.' },
          matrix('pub', [['Fat', 'D. Fatalities'], ['Inj', 'E. With injuries/illness'], ['Trap', 'F. Trapped/in need of rescue'], ['Miss', 'G. Missing'],
            ['Evac', 'H. Evacuated'], ['Sip', 'I. Sheltering in place'], ['Shel', 'J. In temporary shelters'], ['Imm', 'K. Have received mass immunizations'],
            ['ReqImm', 'L. Require immunizations'], ['Quar', 'M. In quarantine'], ['Total', 'N. Total # civilians (public) affected']],
          [['Now', 'A. # this reporting period'], ['ToDate', 'B. Total # to date']])),
        extend({ n: '32', title: 'Responder status summary' },
          matrix('resp', [['Fat', 'D. Fatalities'], ['Inj', 'E. With injuries/illness'], ['Trap', 'F. Trapped/in need of rescue'], ['Miss', 'G. Missing'],
            ['Sip', 'H. Sheltering in place'], ['Imm', 'I. Have received immunizations'], ['ReqImm', 'J. Require immunizations'], ['Quar', 'K. In quarantine'],
            ['Total', 'L. Total # responders affected']],
          [['Now', 'A. # this reporting period'], ['ToDate', 'B. Total # to date']])),
        { n: '33', title: 'Life, safety, and health status/threat remarks', fields: [area('lifeRemarks', 'Life, safety, and health remarks', { rows: 3, hideLabel: true })] },
        {
          n: '34', title: 'Life, safety, and health threat management (check if active)',
          fields: [checks('threatMgmt', 'Active', [
            ['A', 'A. No likely threat'], ['B', 'B. Potential future threat'], ['C', 'C. Mass notifications in progress'], ['D', 'D. Mass notifications completed'],
            ['E', 'E. No evacuation(s) imminent'], ['F', 'F. Planning for evacuation'], ['G', 'G. Planning for shelter-in-place'], ['H', 'H. Evacuation(s) in progress'],
            ['I', 'I. Shelter-in-place in progress'], ['J', 'J. Repopulation in progress'], ['K', 'K. Mass immunization in progress'], ['L', 'L. Mass immunization complete'],
            ['M', 'M. Quarantine in progress'], ['N', 'N. Area restriction in effect']
          ], { hideLabel: true })]
        },
        { n: '35', title: 'Weather concerns (current and predicted weather, and related factors that may cause concern)', fields: [area('weather', 'Weather concerns', { rows: 3, hideLabel: true })] },
        { n: '36', title: 'Projected incident activity, potential, movement, escalation, or spread', fields: horizons('proj', 'And the factors influencing it.') },
        { n: '37', title: 'Strategic objectives (define planned end-state for incident)', fields: [area('strategy', 'Strategic objectives', { rows: 4, hideLabel: true })] },
        {
          section: 'Incident situation', pageBreak: true, n: '38', title: 'Current incident threat summary and risk information',
          note: 'Threats to life, property, communities, residences, health care facilities, critical infrastructure, commercial facilities, natural and cultural resources, and continuity of operations.',
          fields: horizons('threat', '')
        },
        { n: '39', title: 'Critical resource needs (category, kind or type, and amount, in priority order)', fields: horizons('needs', '') },
        {
          n: '40', title: 'Strategic discussion',
          note: 'How the overall strategy, constraints, and current information relate to the critical resource needs, the incident action plan and management objectives, and the anticipated results. Major problems and concerns.',
          fields: [area('discussion', 'Strategic discussion', { rows: 5, hideLabel: true })]
        },
        { n: '41', title: 'Planned actions for next operational period', fields: [area('planned', 'Planned actions', { rows: 4, hideLabel: true })] },
        { n: '42', title: 'Projected final incident size/area', w: 'half', fields: [text('finalSize', 'Projected final size', { hideLabel: true })] },
        { n: '43', title: 'Anticipated incident management completion date', w: 'half', fields: [day('completionDate', 'Completion date', { hideLabel: true })] },
        { n: '44', title: 'Projected significant resource demobilization start date', w: 'half', fields: [day('demobDate', 'Demobilization start date', { hideLabel: true })] },
        { n: '45', title: 'Estimated incident costs to date', w: 'half', fields: [money('costToDate', 'Estimated costs to date', { hideLabel: true })] },
        { n: '46', title: 'Projected final incident cost estimate', w: 'half', fields: [money('costFinal', 'Projected final cost', { hideLabel: true })] },
        { n: '47', title: 'Remarks (or continuation of any blocks above; list the block number)', fields: [area('remarks', 'Remarks', { rows: 4, hideLabel: true })] },
        {
          section: 'Incident resource commitment summary', pageBreak: true, n: '48 to 52', title: 'Resources by agency or organization',
          fields: [
            rows('commitment', 'Resource commitment', [
              text('agency', '48. Agency or organization'),
              text('resources', '49. Resources (kind or type, with numbers)', { max: 600, placeholder: '2 engines, 1 dump truck' }),
              whole('resourceCount', '# of resources', { max: 100000 }),
              whole('resourcePeople', '# of personnel with those resources', { max: 100000 }),
              whole('additional', '50. Additional personnel not assigned to a resource', { max: 100000 })
            ], { addLabel: 'Add agency or organization', rowLabel: 'Agency', hideLabel: true, printMin: 6 })
          ]
        },
        { n: '53', title: 'Additional cooperating and assisting organizations not listed above', fields: [area('cooperating', 'Cooperating and assisting organizations', { rows: 2, hideLabel: true })] }
      ]
    },

    '221': {
      type: '221',
      group: 'form',
      scope: 'many',
      code: 'ICS 221',
      title: 'Demobilization Check-Out',
      blocks: [
        { n: '3', title: 'Planned release date/time', w: 'half', fields: [when('plannedRelease', 'Planned release date/time', { hideLabel: true })] },
        { n: '4', title: 'Resource or personnel released', w: 'half', fields: [text('released', 'Resource or personnel released', { required: true, hideLabel: true, max: 160, list: 'people' })] },
        { n: '5', title: 'Order request number', w: 'half', fields: [text('orderNumber', 'Order request number', { hideLabel: true, max: 60 })] },
        extend({
          n: '6', title: 'Resource or personnel sign-off',
          note: 'Resources are not released until the checked boxes below have been signed off by the appropriate overhead and the Demobilization Unit Leader (or Planning Section representative).'
        }, matrix('so', [
          ['Supply', 'Logistics: Supply Unit'], ['Comms', 'Logistics: Communications Unit'], ['Facil', 'Logistics: Facilities Unit'],
          ['Ground', 'Logistics: Ground Support Unit'], ['Security', 'Logistics: Security Manager'], ['Time', 'Finance/Admin: Time Unit'],
          ['Other', 'Other section/staff'], ['Docs', 'Planning: Documentation Unit Leader'], ['Demob', 'Planning: Demobilization Unit Leader']
        ], [['Need', 'Check-out needed', 'bool'], ['Remarks', 'Remarks', 'text', 300], ['Name', 'Signed off by', 'text', 120]])),
        { n: '7', title: 'Remarks', fields: [area('remarks', 'Remarks', { rows: 3, hideLabel: true })] },
        {
          n: '8', title: 'Travel information',
          fields: [
            choice('overnight', 'Room overnight', ['Yes', 'No']),
            when('etd', 'Estimated time of departure'),
            when('actualRelease', 'Actual release date/time'),
            text('destination', 'Destination'),
            when('eta', 'Estimated time of arrival'),
            text('travelMethod', 'Travel method', { max: 80 }),
            text('travelContact', 'Contact information while traveling'),
            choice('manifest', 'Manifest', ['Yes', 'No']),
            text('manifestNo', 'Manifest number', { max: 60 }),
            text('notified', 'Area/agency/region notified (name, date)')
          ]
        },
        {
          n: '9', title: 'Reassignment information',
          fields: [
            choice('reassigned', 'Reassigned', ['Yes', 'No']),
            text('reIncident', 'Incident name'),
            text('reNumber', 'Incident number', { max: 60 }),
            text('reLocation', 'Location'),
            text('reOrder', 'Order request number', { max: 60 })
          ]
        },
        prepared('10'),
        costSource()
      ]
    },

    /* Damage assessment: one home (Individual Assistance) per record. */
    daHome: {
      type: 'daHome',
      group: 'assess',
      scope: 'many',
      code: 'Home assessment',
      title: 'Home damage assessment (IA)',
      carry: ['city', 'county'],
      blocks: [
        {
          title: 'Address',
          fields: [
            text('address', 'Street address', { required: true, max: 200 }),
            text('city', 'Town or city', { max: 120 }),
            text('county', 'County', { max: 120 }),
            text('place', 'Location description or landmark', { max: 300 })
          ]
        },
        geoBlock('Location on the map'),
        {
          title: 'Dwelling',
          fields: [
            choice('dwelling', 'Dwelling type', ['Single family', 'Multi-family', 'Manufactured home'], { defValue: 'Single family' }),
            whole('units', 'Units in the building (multi-family)', { max: 1000 }),
            choice('primary', 'Primary residence (lived in 6 months a year or more)', ['Yes', 'No', 'Unknown']),
            choice('tenure', 'Owner or renter', ['Owner', 'Renter', 'Unknown']),
            checks('insurance', 'Insurance', [['home', "Homeowner's or renter's"], ['flood', 'Flood (NFIP or private)'], ['none', 'Confirmed none'], ['unknown', 'Unknown']])
          ]
        },
        {
          title: 'Damage',
          note: 'Damage levels from the FEMA damage assessment guidelines. Affected: cosmetic damage only (for a conventional home, water only in a crawl space or unfinished basement). Minor: repairable, nonstructural damage (water 1 to 3 inches in a living space, or in a finished basement). Major: structural damage, or water above 18 inches or the outlets in a living space. Destroyed: a total loss (water at the roofline). Between 3 and 18 inches, weigh how long the water stood, contamination, the outlets, and how many rooms flooded. Manufactured home: Minor when water reached the floor system but not the living space; Major when it entered the living space; Destroyed when the frame is bent or twisted, or a total loss.',
          fields: [
            choice('level', 'Damage level', ['Affected', 'Minor', 'Major', 'Destroyed', 'Inaccessible'], { required: true }),
            num('waterInches', 'Water depth in the living space (inches)', { max: 600 }),
            choice('basement', 'Basement', ['None', 'Unfinished', 'Finished', 'Crawl space']),
            choice('habitable', 'Can be lived in now', ['Yes', 'No', 'Unknown']),
            choice('utilities', 'Utilities working', ['Yes', 'No', 'Unknown']),
            flag('review', 'Needs a second look by the damage assessment coordinator')
          ]
        },
        extend({ title: 'Units by damage level (multi-family)', note: 'For a multi-family building, how many units are at each level.' },
          matrix('units', [['Affected', 'Affected'], ['Minor', 'Minor'], ['Major', 'Major'], ['Destroyed', 'Destroyed']], [['', 'units']])),
        {
          title: 'Needs and notes',
          fields: [
            area('needs', 'Immediate needs (shelter, medical, food, power for medical equipment)', { rows: 2, max: 2000 }),
            area('notes', 'Notes', { rows: 3, max: 4000 })
          ]
        },
        { title: 'Photos', photos: true, note: 'The water line, the outside of the home, and the worst damage.', fields: [images('photos', 'Photos', { hideLabel: true })] },
        {
          title: 'Assessed by',
          fields: [text('assessedBy', 'Assessed by', { list: 'people', def: 'me' }), when('assessedAt', 'Date/time', { def: 'now' })]
        }
      ]
    },

    /* Damage assessment: one damaged public facility or work site (Public Assistance) per record. */
    daSite: {
      type: 'daSite',
      group: 'assess',
      scope: 'many',
      code: 'Public facility assessment',
      title: 'Public facility damage (PA)',
      carry: ['city', 'state', 'zip', 'cause'],
      blocks: [
        {
          title: 'Facility or site',
          fields: [
            text('name', 'Name of damage or facility', { required: true, max: 200, placeholder: 'Route 610 culvert at Rock Creek' }),
            choice('category', 'FEMA category of work', CATEGORY_LIST),
            text('address1', 'Address 1', { max: 200 }),
            text('address2', 'Address 2', { max: 200 }),
            text('city', 'City', { max: 120 }),
            text('state', 'State', { max: 40 }),
            text('zip', 'ZIP code', { max: 20 })
          ]
        },
        geoBlock('Location on the map'),
        {
          title: 'Damage',
          fields: [
            area('damage', 'Describe the damage', { rows: 4, max: 4000 }),
            text('cause', 'Primary cause of damage', { max: 120, placeholder: 'Flooding' }),
            money('cost', 'Approximate cost to repair'),
            pct('complete', 'Work complete (%)', { max: 100 }),
            choice('labor', 'Labor type', ['Force account', 'Contract', 'Mutual aid', 'Donated resources', 'Force account and contract']),
            choice('priorGrant', 'Has received Public Assistance grants for this facility before', ['Yes', 'No', 'Unknown']),
            choice('priority', 'Applicant priority', ['High', 'Medium', 'Low']),
            choice('insured', 'Insured', ['Yes', 'No', 'Unknown'])
          ]
        },
        { title: 'Photos', photos: true, note: 'Wide shots showing the whole facility and its setting, close-ups of the damage, and anything showing pre-disaster condition.', fields: [images('photos', 'Photos', { hideLabel: true })] },
        {
          title: 'Assessed by',
          fields: [text('assessedBy', 'Assessed by', { list: 'people', def: 'me' }), when('assessedAt', 'Date/time', { def: 'now' })]
        }
      ]
    },

    /*
     * A person's sign-off on one saved version of a form: who prepared, reviewed, or
     * approved which version, and when. Kept and shared like any record. It records
     * accountability; it is not a cryptographic signature.
     */
    signoff: {
      type: 'signoff',
      group: 'meta',
      scope: 'many',
      code: 'Sign-off',
      title: 'Sign-off',
      blocks: [
        {
          title: 'Sign-off',
          fields: [
            text('target', 'Form record', { required: true, max: 80 }),
            text('version', 'Version signed', { required: true, max: 80 }),
            choice('role', 'Role', ['Prepared by', 'Reviewed by', 'Approved by'], { required: true }),
            text('name', 'Name', { required: true, max: 120 }),
            text('position', 'Position/title', { max: 120 }),
            when('at', 'Signed', { required: true })
          ]
        }
      ]
    },

    /* A spontaneous or affiliated volunteer signing in. Their hours become donated labor. */
    volunteer: {
      type: 'volunteer',
      group: 'resource',
      scope: 'many',
      code: 'Volunteer',
      title: 'Volunteer sign-in',
      blocks: [
        {
          title: 'Volunteer',
          fields: [
            text('name', 'Name', { required: true, max: 120 }),
            text('organization', 'Organization or group (if any)', { max: 160, placeholder: 'Church disaster team, CERT, unaffiliated' }),
            text('phone', 'Phone', { max: 40 }),
            text('skills', 'Skills or certifications', { max: 300 }),
            flag('waiver', 'Signed the liability waiver'),
            flag('briefed', 'Had the safety briefing')
          ]
        },
        {
          title: 'Time',
          fields: [
            when('signIn', 'Signed in', { required: true, def: 'now' }),
            when('signOut', 'Signed out')
          ]
        },
        {
          title: 'Work and value',
          note: 'Volunteer hours on eligible emergency work can count toward the non-federal share. Value them at the rate your agency pays for similar work, straight time, plus fringe benefits.',
          fields: [
            text('work', 'Work performed', { max: 300 }),
            choice('category', 'FEMA category of work', CATEGORY_LIST),
            text('site', 'Location or site', { list: 'cost-sites' }),
            money('rate', 'Hourly rate for similar work'),
            pct('fringe', 'Fringe benefits (%)')
          ]
        }
      ]
    },

    labor: {
      type: 'labor',
      group: 'cost',
      scope: 'many',
      code: 'Labor entry',
      title: 'Force account labor',
      summaryTitle: 'Force Account Labor Summary',
      autofill: { key: 'name', fields: ['jobTitle', 'department', 'personType', 'budgeted', 'regRate', 'otRate', 'fringeReg', 'fringeOt'] },
      carry: ['date', 'category', 'site', 'project', 'work'],
      blocks: [
        {
          title: 'Who and when',
          fields: [
            day('date', 'Date worked', { required: true, def: 'today' }),
            text('name', 'Employee name', { required: true }),
            text('jobTitle', 'Job title'),
            text('department', 'Department or agency'),
            choice('personType', 'Type of individual', [
              'Applicant employee', 'Mutual aid', 'EMAC', ['Donated labor', 'Volunteer (donated labor)'], 'Other'
            ], { defValue: 'Applicant employee', hint: 'Volunteer hours are kept out of the cost totals and listed as donated resources.' }),
            choice('budgeted', 'Budgeted employee', ['Yes', 'No'], { hint: 'Whether the salary is in the pre-disaster budget. On Category A and B (emergency) work, FEMA generally reimburses only overtime for budgeted employees; FieldICS flags their straight time but keeps it documented.' })
          ]
        },
        { title: 'Hours', fields: [num('regHours', 'Regular hours', { max: 24 }), num('otHours', 'Overtime hours', { max: 24 })] },
        {
          title: 'Rates',
          note: 'Rates can be added later by finance. Entries without rates are flagged in the summary.',
          fields: [
            money('regRate', 'Regular rate per hour'),
            money('otRate', 'Overtime rate per hour'),
            pct('fringeReg', 'Fringe benefits, regular time (%)'),
            pct('fringeOt', 'Fringe benefits, overtime (%)')
          ]
        },
        costWhere(true),
        costGeo(),
        costPhotos(),
        costSource()
      ]
    },

    equipment: {
      type: 'equipment',
      group: 'cost',
      scope: 'many',
      code: 'Equipment entry',
      title: 'Force account equipment',
      summaryTitle: 'Force Account Equipment Summary',
      autofill: { key: 'description', fields: ['unitId', 'code', 'usageUnit', 'rate', 'rateSource'] },
      carry: ['date', 'category', 'site', 'project', 'work', 'operator'],
      blocks: [
        {
          title: 'Equipment and use',
          fields: [
            day('date', 'Date used', { required: true, def: 'today' }),
            text('description', 'Type of equipment', { required: true, hint: 'Size, capacity, horsepower, make, and model as appropriate.' }),
            text('unitId', 'Unit or ID number', { max: 60 }),
            text('code', 'FEMA equipment code number', { max: 20 }),
            text('operator', "Operator's name"),
            num('usage', 'Hours or miles used', { max: 5000 }),
            choice('usageUnit', 'Use measured in', ['Hours', 'Miles'], { defValue: 'Hours' }),
            flag('donated', 'Donated by a third party', { hint: 'Not an applicant expense. Listed with donated resources, valued at the rate.' }),
            text('donor', 'Donor', { max: 160 })
          ]
        },
        {
          title: 'Rate',
          note: 'Can be added later. Entries without a rate are flagged in the summary.',
          fields: [money('rate', 'Rate per hour or mile'), choice('rateSource', 'Rate source', ['FEMA schedule', 'Local rate']), text('rateSchedule', 'Schedule', { max: 120, hint: 'Filled in when you pick a rate from a schedule.' })]
        },
        costWhere(true),
        costGeo(),
        costPhotos(),
        costSource()
      ]
    },

    materials: {
      type: 'materials',
      group: 'cost',
      scope: 'many',
      code: 'Materials entry',
      title: 'Materials and supplies',
      summaryTitle: 'Materials and Supplies Summary',
      autofill: { key: 'description', fields: ['vendor', 'unit', 'unitPrice', 'obtained'] },
      carry: ['usedDate', 'category', 'site', 'project', 'work'],
      blocks: [
        {
          title: 'Material',
          fields: [
            text('description', 'Material description', { required: true }),
            choice('obtained', 'How obtained', ['Purchased', 'From stock', 'Donated']),
            text('donor', 'Donor', { max: 160, hint: 'For donated materials. Value them at current local prices.' }),
            text('vendor', 'Vendor'),
            num('qtyPurchased', 'Quantity purchased'),
            num('qtyUsed', 'Quantity used'),
            text('unit', 'Unit', { max: 40, placeholder: 'each, ton, gallon' }),
            money('unitPrice', 'Unit price'),
            day('purchaseDate', 'Date purchased'),
            day('usedDate', 'Date used', { def: 'today' }),
            text('invoice', 'Invoice or receipt number', { max: 80 })
          ]
        },
        costWhere(true),
        costGeo(),
        costPhotos(),
        costSource()
      ]
    },

    rentals: {
      type: 'rentals',
      group: 'cost',
      scope: 'many',
      code: 'Rental entry',
      title: 'Rented equipment',
      summaryTitle: 'Rented Equipment Summary',
      autofill: { key: 'description', fields: ['vendor', 'code', 'rate', 'withOperator'] },
      carry: ['category', 'site', 'project', 'work'],
      blocks: [
        {
          title: 'Rental',
          fields: [
            text('description', 'Type of equipment', { required: true, hint: 'Size, capacity, horsepower, make, and model as appropriate.' }),
            text('vendor', 'Vendor'),
            text('code', 'Equipment code number (if any)', { max: 20 }),
            day('startDate', 'First date used', { def: 'today' }),
            day('endDate', 'Last date used'),
            num('hours', 'Hours used', { max: 100000 }),
            text('rate', 'Rate as invoiced', { max: 80, placeholder: '95.00/hr or 1,800/week' }),
            choice('withOperator', 'Operator included', ['Yes', 'No']),
            text('operator', "Operator's name")
          ]
        },
        {
          title: 'Invoice',
          note: 'Can be added when the invoice arrives. Entries without an amount are flagged in the summary.',
          fields: [money('amount', 'Amount (total cost)'), text('invoice', 'Invoice number', { max: 80 }), day('datePaid', 'Date paid')]
        },
        costWhere(true),
        costGeo(),
        costPhotos(),
        costSource()
      ]
    },

    contracts: {
      type: 'contracts',
      group: 'cost',
      scope: 'many',
      code: 'Contract entry',
      title: 'Contract work',
      summaryTitle: 'Contract Work Summary',
      autofill: { key: 'contractor', fields: ['contractNumber', 'procurement', 'contractType'] },
      carry: ['category', 'site', 'project'],
      blocks: [
        {
          title: 'Contract',
          fields: [
            text('contractor', 'Contractor', { required: true }),
            area('description', 'Description of work performed', { rows: 3, max: 3000 }),
            text('contractNumber', 'Contract or PO number', { max: 80 }),
            choice('procurement', 'Procurement method', [
              'Micro-purchase', 'Small purchase (quotes)', 'Sealed bids', 'Proposals',
              'Noncompetitive: exigency or emergency', 'Noncompetitive: sole source', 'Noncompetitive: other',
              'Pre-existing contract'
            ], { hint: 'Contract costs are reviewed against federal procurement standards (2 CFR 200). Keep the procurement file.' }),
            choice('contractType', 'Contract type', CONTRACT_TYPES, {
              hint: 'Time and materials needs a ceiling price. Cost plus a percentage of cost is not allowed with federal funds (2 CFR 200.324(c)).'
            }),
            area('justification', 'Reason for noncompetitive procurement', {
              rows: 2, max: 2000,
              hint: 'For an exigency, emergency, or sole source contract: why competition was not practical, and for how long.'
            }),
            day('startDate', 'Work start date'),
            day('endDate', 'Work end date')
          ]
        },
        {
          title: 'Invoice',
          note: 'Can be added when the invoice arrives. Entries without an amount are flagged in the summary.',
          fields: [money('amount', 'Amount'), text('invoice', 'Invoice number', { max: 80 }), day('datePaid', 'Date paid')]
        },
        {
          title: 'Procurement file checklist (2 CFR 200)',
          note: 'What Public Assistance reviewers look for in a contract file. Tick each item that is done and kept in the file. Not every item applies to every contract.',
          fields: [checks('procChecks', 'Done and in the file', PROC_CHECKS, { hideLabel: true })]
        },
        costWhere(false),
        costGeo(),
        costPhotos(),
        costSource()
      ]
    },

    /* Working notes: quick, editable, kept apart from the official ICS 214 until someone moves one there. */
    note: {
      type: 'note',
      group: 'note',
      scope: 'many',
      code: 'Note',
      title: 'Note',
      blocks: [
        {
          title: 'Note',
          fields: [
            area('text', 'Note', { required: true, rows: 5, max: 4000, hideLabel: true }),
            choice('kind', 'Kind', NOTE_KINDS, { defValue: 'Info' }),
            flag('pinned', 'Pin to the top of the notes'),
            flag('done', 'Follow-up done')
          ]
        },
        geoBlock('Location', [text('place', 'Place or address', { max: 300 })]),
        {
          title: 'Photos', photos: true,
          note: 'A photo of a whiteboard, a map, a sign-in sheet, or a business card.',
          fields: [images('photos', 'Photos', { hideLabel: true })]
        }
      ]
    },

    travel: {
      type: 'travel',
      group: 'cost',
      scope: 'many',
      code: 'Travel or other entry',
      title: 'Travel, meals, and other costs',
      summaryTitle: 'Travel, Meals, and Other Direct Costs',
      autofill: { key: 'name', fields: ['department'] },
      carry: ['date', 'category', 'site', 'project', 'kind'],
      blocks: [
        {
          title: 'Cost',
          fields: [
            day('date', 'Date', { required: true, def: 'today' }),
            choice('kind', 'Kind of cost', ['Mileage', 'Meals', 'Lodging', 'Per diem', 'Fuel', 'Supplies bought in the field', 'Other'], { required: true }),
            text('name', 'Person or crew', { list: 'people' }),
            text('department', 'Department or agency'),
            text('description', 'Description', { max: 300, placeholder: 'Meals for 12 responders, EOC' }),
            text('vendor', 'Vendor'),
            num('qty', 'Quantity', { hint: 'Miles, meals, nights, or gallons.' }),
            text('unit', 'Unit', { max: 40, placeholder: 'miles, meals, nights' }),
            money('rate', 'Rate per unit'),
            money('amount', 'Amount', { hint: 'Leave blank to use quantity times rate.' }),
            text('receipt', 'Receipt or invoice number', { max: 80 }),
            day('datePaid', 'Date paid')
          ]
        },
        costWhere(false),
        costGeo(),
        costPhotos(),
        costSource()
      ]
    }
  };

  var RECORD_TYPES = Object.keys(FORMS);
  var FORM_TYPES = ['201', '202', '203', '204', '205', '205A', '206', '208', '209', '211', '213', '213RR', '215', '215A', '221'];
  var ASSESS_TYPES = ['daHome', 'daSite'];
  var COST_TYPES = ['labor', 'equipment', 'materials', 'rentals', 'contracts', 'travel'];

  var flatCache = Object.create(null);

  function fieldsOf(def) {
    if (flatCache[def.type]) return flatCache[def.type];
    var list = [];
    def.blocks.forEach(function (b) {
      b.fields.forEach(function (f) { list.push(f); });
    });
    flatCache[def.type] = list;
    return list;
  }

  function fieldByKey(type, key) {
    var list = fieldsOf(FORMS[type]);
    for (var i = 0; i < list.length; i++) {
      if (list[i].k === key) return list[i];
    }
    return null;
  }

  return {
    FORMS: FORMS,
    RECORD_TYPES: RECORD_TYPES,
    FORM_TYPES: FORM_TYPES,
    ASSESS_TYPES: ASSESS_TYPES,
    NOTE_KINDS: NOTE_KINDS,
    CONTRACT_TYPES: CONTRACT_TYPES,
    PROC_CHECKS: PROC_CHECKS,
    COST_TYPES: COST_TYPES,
    CATEGORY_LIST: CATEGORY_LIST,
    CHECKIN_LOCATIONS: CHECKIN_LOCATIONS,
    POSITIONS: POSITIONS,
    fieldsOf: fieldsOf,
    fieldByKey: fieldByKey
  };
});
