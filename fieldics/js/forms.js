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
            choice('budgeted', 'Budgeted employee', ['Yes', 'No'], { hint: 'Whether the salary is in the pre-disaster budget. PA staff need this to apply the labor rules.' })
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
      autofill: { key: 'contractor', fields: ['contractNumber', 'procurement'] },
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
            day('startDate', 'Work start date'),
            day('endDate', 'Work end date')
          ]
        },
        {
          title: 'Invoice',
          note: 'Can be added when the invoice arrives. Entries without an amount are flagged in the summary.',
          fields: [money('amount', 'Amount'), text('invoice', 'Invoice number', { max: 80 }), day('datePaid', 'Date paid')]
        },
        costWhere(false),
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
        costPhotos(),
        costSource()
      ]
    }
  };

  var RECORD_TYPES = Object.keys(FORMS);
  var FORM_TYPES = ['201', '202', '203', '204', '205', '211', '213', '213RR'];
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
    NOTE_KINDS: NOTE_KINDS,
    COST_TYPES: COST_TYPES,
    CATEGORY_LIST: CATEGORY_LIST,
    CHECKIN_LOCATIONS: CHECKIN_LOCATIONS,
    POSITIONS: POSITIONS,
    fieldsOf: fieldsOf,
    fieldByKey: fieldByKey
  };
});
