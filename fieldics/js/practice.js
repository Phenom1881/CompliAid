/*
 * FieldICS practice incident: a filled-in exercise incident for training and for trying
 * the app without making up data. Every name, place, and number in it is invented.
 * No DOM access, so this runs in Node tests too.
 *
 *   FieldPractice.build(C, { now, deviceId, deviceName, by }) -> incident (marked EXERCISE)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldPractice = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOUR = 3600000;

  function build(C, opts) {
    opts = opts || {};
    var now = opts.now ? new Date(opts.now) : new Date();
    /* Day one starts at 07:00 local time the day before now, so the third period is today. */
    var day1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 7, 0, 0, 0);
    function at(hours) { return new Date(day1.getTime() + hours * HOUR).toISOString(); }
    function day(offset) {
      var d = new Date(day1.getTime() + offset * 24 * HOUR);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    var who = { by: opts.by || 'Practice data', deviceId: opts.deviceId || 'practice-device', deviceName: opts.deviceName || 'Practice data' };
    var inc = C.createIncident({
      name: 'Practice: Laurel Fork Flash Flood', number: 'EX-2026-01', location: 'Laurel Fork EOC, 120 Main Street',
      applicant: 'Practice County', paId: '000-00000-00', disasterNumber: 'DR-0000-EX', exercise: true
    }, who.deviceName, at(-1));

    function save(type, data, time, extra) {
      var o = { type: type, data: data, by: who.by, deviceId: who.deviceId, deviceName: who.deviceName };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      return C.saveRecord(inc, o, time);
    }
    function log(hours, text, author, position) {
      C.addEntry(inc, { text: text, author: author || 'Sam Ortiz', position: position || 'Planning Section Chief', ts: at(hours), deviceId: who.deviceId, deviceName: who.deviceName }, at(hours + 0.05));
    }

    save('period', { start: at(0), end: at(12) }, at(0), { period: 1 });
    save('period', { start: at(12), end: at(24) }, at(11), { period: 2 });
    save('period', { start: at(24), end: at(36) }, at(23), { period: 3 });

    save('201', {
      initiated: at(-0.5),
      situation: 'Heavy rain overnight (4 to 6 inches) brought Laurel Fork out of its banks at 05:30. Water over Route 610 at the low-water bridge and over Creek Road near the park. Several homes on River Lane have water inside. No injuries reported. Hazards: swift water, downed lines on Creek Road, debris on roads.',
      objectives: '1. Keep the public off flooded roads: close Route 610 and Creek Road.\n2. Check on River Lane residents and move anyone who wants to leave to the shelter.\n3. Open the shelter at Laurel Fork Elementary.\n4. Begin initial damage assessment once water drops.',
      actions: [
        { time: '0600', action: 'Fire-Rescue crews to Route 610 and Creek Road to place barricades.' },
        { time: '0630', action: 'Requested sandbags and two pumps from the public works yard.' },
        { time: '0700', action: 'Shelter team opening Laurel Fork Elementary.' }
      ],
      ic: 'Chief Dana Reyes (Practice County Fire-Rescue)', ops: 'Capt. Lee Brandt', plans: 'Sam Ortiz', logs: 'Morgan Hale', finance: 'Pat Quinn',
      safety: 'Jordan Pike', pio: 'Casey Vance', liaison: 'Robin Shah',
      resources: [
        { resource: '2 engines', identifier: 'Engine 31, Engine 33', ordered: at(-1), eta: '0610', arrived: true, notes: 'Route 610 closure' },
        { resource: '1 dump truck', identifier: 'Public Works T-12', ordered: at(-0.7), eta: '0645', arrived: true, notes: 'Sandbags to River Lane' }
      ],
      prepName: 'Sam Ortiz', prepPosition: 'Planning Section Chief', prepAt: at(-0.4)
    }, at(-0.4));

    [1, 2].forEach(function (n) {
      save('202', {
        objectives: '1. Keep Route 610 and Creek Road closed until the water drops and the roads are inspected.\n2. Shelter and feed displaced residents at Laurel Fork Elementary.\n3. Complete initial damage assessment of River Lane and Creek Road homes.\n4. Document all costs for possible Public Assistance.',
        emphasis: 'No one enters moving water. Watch for downed lines on Creek Road.',
        awareness: 'More rain possible this evening (1 inch). River expected to crest by 10:00.',
        sspRequired: 'No', iapItems: ['ICS 203', 'ICS 204', 'ICS 205', 'ICS 205A', 'ICS 206', 'ICS 207', 'ICS 208'],
        prepName: 'Sam Ortiz', prepPosition: 'Planning Section Chief', prepAt: at(n === 1 ? 0.5 : 11.5),
        approvedName: 'Dana Reyes', approvedAt: at(n === 1 ? 0.75 : 11.75)
      }, at(n === 1 ? 0.75 : 11.75), { period: n });
    });

    save('203', {
      icuc: 'Dana Reyes (Practice County Fire-Rescue)', safety: 'Jordan Pike', pio: 'Casey Vance', liaison: 'Robin Shah',
      agencyReps: [{ agency: 'Practice County Public Works', name: 'Ali Navarro' }, { agency: 'Red Cross (Practice chapter)', name: 'Terry Lin' }],
      planChief: 'Sam Ortiz', resourcesUnit: 'Jamie Cole', situationUnit: 'Avery Ford', documentationUnit: 'Riley Grant',
      logChief: 'Morgan Hale', supplyUnit: 'Drew Patel', facilitiesUnit: 'Quinn Ellis', commsUnit: 'Kai Moreno', medicalUnit: 'Sasha Bell',
      opsChief: 'Lee Brandt', staging: [{ area: 'Fairgrounds', name: 'Blake Rivers' }],
      branches: [
        { branch: '', role: 'Division/Group Supervisor', unit: 'Division A', name: 'Taylor Webb' },
        { branch: '', role: 'Division/Group Supervisor', unit: 'Shelter Group', name: 'Jesse Ward' },
        { branch: '', role: 'Division/Group Supervisor', unit: 'Damage Assessment Group', name: 'Harper Lane' }
      ],
      finChief: 'Pat Quinn', timeUnit: 'Cameron Diaz', costUnit: 'Pat Quinn',
      prepName: 'Sam Ortiz', prepPosition: 'Planning Section Chief', prepAt: at(0.6)
    }, at(0.6), { period: 1 });

    save('204', {
      division: 'A', osc: 'Lee Brandt', oscContact: '555-0101', supervisor: 'Taylor Webb', supervisorContact: 'Fire Tac 2',
      resources: [{ identifier: 'Engine 31', leader: 'Lt. Gray', persons: 3, contact: 'Fire Tac 2', notes: 'Route 610 at the low-water bridge' },
        { identifier: 'Engine 33', leader: 'Lt. Moss', persons: 3, contact: 'Fire Tac 2', notes: 'Creek Road at the park' }],
      work: 'Hold road closures on Route 610 and Creek Road. Check River Lane homes door to door. Report anyone who needs to leave.',
      special: 'No one enters moving water. Stay 30 feet from downed lines.',
      comms: [{ function: 'Division A', contact: 'Fire Tac 2' }, { function: 'Command', contact: 'County Command' }],
      prepName: 'Sam Ortiz', prepPosition: 'Planning Section Chief', prepAt: at(0.7)
    }, at(0.7), { period: 1 });
    save('204', {
      group: 'Shelter', osc: 'Lee Brandt', supervisor: 'Jesse Ward', supervisorContact: '555-0144',
      resources: [{ identifier: 'Shelter team', leader: 'Terry Lin', persons: 6, contact: '555-0177', notes: 'Laurel Fork Elementary gym' }],
      work: 'Open and staff the shelter. Register residents. Coordinate meals with the school kitchen.',
      comms: [{ function: 'Shelter', contact: '555-0144' }],
      prepName: 'Sam Ortiz', prepPosition: 'Planning Section Chief', prepAt: at(0.7)
    }, at(0.7), { period: 1 });

    save('205', {
      preparedAt: at(0.5),
      channels: [
        { zone: 'County', ch: '1', function: 'Command', name: 'County Command', assignment: 'Command and section chiefs', rxFreq: '155.0000', rxNW: 'N', txFreq: '155.0000', txNW: 'N', mode: 'A', remarks: 'Practice frequencies only' },
        { zone: 'Fire', ch: '2', function: 'Tactical', name: 'Fire Tac 2', assignment: 'Division A', rxFreq: '154.0000', rxNW: 'N', txFreq: '154.0000', txNW: 'N', mode: 'A' }
      ],
      prepName: 'Kai Moreno', prepAt: at(0.5)
    }, at(0.5), { period: 1 });

    save('205A', {
      contacts: [
        { position: 'Incident Commander', name: 'Dana Reyes', method: '555-0100' },
        { position: 'Operations Section Chief', name: 'Lee Brandt', method: '555-0101' },
        { position: 'Planning Section Chief', name: 'Sam Ortiz', method: '555-0102' },
        { position: 'Logistics Section Chief', name: 'Morgan Hale', method: '555-0103' },
        { position: 'Shelter Group Supervisor', name: 'Jesse Ward', method: '555-0144' }
      ],
      prepName: 'Kai Moreno', prepPosition: 'Communications Unit Leader', prepAt: at(0.6)
    }, at(0.6), { period: 1 });

    save('206', {
      stations: [{ name: 'Shelter first aid', location: 'Laurel Fork Elementary nurse office', contact: '555-0145', paramedics: 'No' }],
      transport: [{ service: 'Practice County Rescue Squad', mode: 'Ground', location: 'Station 3', contact: '911 / Fire Tac 2', level: 'ALS' }],
      hospitals: [{ name: 'Practice Community Hospital', address: '400 Hospital Drive', contact: '555-0190', groundTime: '20 min', trauma: 'No', burn: 'No', helipad: 'Yes' }],
      procedures: 'Report any injury to the Division Supervisor and the Safety Officer. Swift water rescue requests go through County Command.',
      prepName: 'Sasha Bell', prepAt: at(0.6), approvedName: 'Jordan Pike', approvedAt: at(0.7)
    }, at(0.7), { period: 1 });

    save('208', {
      message: 'Turn around, do not drown. Six inches of moving water can knock a person down; one foot can float a car.\nAssume every downed line is live. Stay 30 feet away and call it in.\nWear gloves and boots when handling sandbags and debris. Wash hands before eating.\nHydrate and rotate crews every two hours.',
      sspRequired: 'No', prepName: 'Jordan Pike', prepPosition: 'Safety Officer', prepAt: at(0.6)
    }, at(0.6), { period: 1 });

    save('215A', {
      preparedAt: at(0.55),
      analysis: [
        { area: 'Division A (Route 610, Creek Road)', hazards: 'Swift water at road crossings; downed lines on Creek Road.', mitigations: 'Barricades set back from the water; no one enters water; utility notified for lines.' },
        { area: 'Shelter Group', hazards: 'Slips on wet floors; crowding at registration.', mitigations: 'Mats at entrances; two registration lines.' }
      ],
      prepName: 'Jordan Pike', oscName: 'Lee Brandt', oscAt: at(0.6)
    }, at(0.6), { period: 1 });

    var e31 = save('211', {
      location: 'Staging Area', locationName: 'Fairgrounds', identifier: 'Engine 31', agency: 'Practice County Fire-Rescue', kind: 'Engine', type: '3',
      checkIn: at(-0.8), leader: 'Lt. Gray', persons: 3, assignment: 'Division A', resourceKind: 'Equipment with operator', checkOut: at(13)
    }, at(-0.8));
    save('211', {
      location: 'Staging Area', locationName: 'Fairgrounds', identifier: 'Engine 33', agency: 'Practice County Fire-Rescue', kind: 'Engine', type: '3',
      checkIn: at(-0.7), leader: 'Lt. Moss', persons: 3, assignment: 'Division A', resourceKind: 'Equipment with operator'
    }, at(-0.7));
    save('211', {
      location: 'Base', locationName: 'Public Works yard', identifier: 'Public Works T-12', agency: 'Practice County Public Works', kind: 'Dump truck', type: '',
      checkIn: at(-0.4), leader: 'Ali Navarro', persons: 1, assignment: 'Sandbags to River Lane', resourceKind: 'Equipment with operator', checkOut: at(10)
    }, at(-0.4));
    save('211', {
      location: 'ICP', locationName: 'Laurel Fork EOC', identifier: 'Jamie Cole', agency: 'Practice County Emergency Management', checkIn: at(0), persons: 1,
      assignment: 'Resources Unit', resourceKind: 'Person', contact: '555-0104'
    }, at(0));

    save('213', { to: 'Morgan Hale, Logistics', from: 'Taylor Webb, Division A', subject: 'More barricades', at: at(2), message: 'Need 6 more barricades and 2 Road Closed signs at Creek Road and Mill Street.', reply: 'Sending from the Public Works yard, about 40 minutes.', replyName: 'Morgan Hale', replyAt: at(2.3) }, at(2.3));
    save('213RR', {
      at: at(1), number: '1', status: 'Filled', priority: 'Urgent', requestedBy: 'Lee Brandt, Operations',
      items: [{ qty: 2, kind: 'Pump', type: '3 inch trash pump', description: 'With 50 feet of discharge hose', arrivalRequested: at(2), cost: 410 }],
      location: 'River Lane at Mill Street', supplierName: 'Valley Rental', orderNumber: 'L-1'
    }, at(1));

    log(-1, 'Heavy rain overnight; Laurel Fork rising fast. EOC activated.', 'Dana Reyes', 'Incident Commander');
    log(-0.8, 'Engine 31 and Engine 33 to Route 610 and Creek Road for closures.', 'Dana Reyes', 'Incident Commander');
    log(0, 'Operational period 1 begins. Briefing held at the EOC.');
    log(0.5, 'Route 610 closed at the low-water bridge. Creek Road closed at the park.', 'Taylor Webb', 'Division A Supervisor');
    log(1, 'Resource request 1 placed for two pumps.', 'Morgan Hale', 'Logistics Section Chief');
    log(1.5, 'Shelter open at Laurel Fork Elementary. 4 residents registered.', 'Jesse Ward', 'Shelter Group Supervisor');
    log(2, 'Downed line reported on Creek Road at Mill Street. Utility notified.', 'Taylor Webb', 'Division A Supervisor');
    log(3, 'River crested at 10:00, about 2 feet above flood stage.', 'Avery Ford', 'Situation Unit Leader');
    log(5, 'Damage assessment teams begin on River Lane.', 'Harper Lane', 'Damage Assessment Group Supervisor');
    log(8, 'Shelter population 11. Dinner from the school kitchen.', 'Jesse Ward', 'Shelter Group Supervisor');
    log(10, 'Public Works T-12 released.', 'Jamie Cole', 'Resources Unit Leader');
    log(12, 'Operational period 2 begins. Night shift briefed.');
    log(13, 'Engine 31 released; Engine 33 holds the Route 610 closure overnight.', 'Lee Brandt', 'Operations Section Chief');

    save('note', { text: 'Mrs. Alvarez on River Lane needs oxygen; daughter calling back at 555-0161.', kind: 'Contact', pinned: true }, at(1.2));
    save('note', { text: 'Ask Public Works for the culvert inspection report on Route 610.', kind: 'Follow-up' }, at(3.5));
    save('note', { text: 'Decided: keep the shelter open overnight; reassess at 07:00.', kind: 'Decision' }, at(9));
    save('note', { text: 'Sandbag pile is at the corner of Mill Street and River Lane.', kind: 'Location' }, at(2.5));

    save('labor', { date: day(0), name: 'Lee Brandt', jobTitle: 'Fire Captain', department: 'Fire-Rescue', personType: 'Applicant employee', budgeted: 'Yes', regHours: 8, otHours: 4, regRate: 31.5, otRate: 47.25, fringeReg: 32, fringeOt: 8, category: 'B', site: 'Route 610', work: 'Road closure and Division A operations' }, at(13));
    save('labor', { date: day(0), name: 'Ali Navarro', jobTitle: 'Equipment Operator', department: 'Public Works', personType: 'Applicant employee', budgeted: 'Yes', regHours: 8, otHours: 2, regRate: 24, otRate: 36, fringeReg: 30, fringeOt: 8, category: 'B', site: 'River Lane', work: 'Sandbag delivery' }, at(13));
    save('labor', { date: day(0), name: 'Jamie Cole', jobTitle: 'Planner (temporary hire)', department: 'Emergency Management', personType: 'Applicant employee', budgeted: 'No', regHours: 10, regRate: 22, fringeReg: 10, category: 'B', site: 'EOC', work: 'Resources Unit' }, at(13));
    save('equipment', { date: day(0), description: 'Dump truck, 10 cubic yards', unitId: 'T-12', code: '8720', operator: 'Ali Navarro', usage: 8, usageUnit: 'Hours', rate: 55.28, rateSource: 'FEMA schedule', category: 'B', site: 'River Lane' }, at(13));
    save('materials', { description: 'Sandbags', obtained: 'Purchased', vendor: 'Valley Supply', qtyPurchased: 1000, qtyUsed: 800, unit: 'each', unitPrice: 0.65, purchaseDate: day(0), usedDate: day(0), invoice: 'VS-2231', category: 'B', site: 'River Lane' }, at(13));
    save('materials', { description: 'Gravel, #57 stone', obtained: 'Donated', donor: 'Laurel Quarry', qtyUsed: 12, unit: 'ton', unitPrice: 28, usedDate: day(1), category: 'A', site: 'Creek Road' }, at(25));
    save('rentals', { description: 'Trash pump, 3 inch, with hose', vendor: 'Valley Rental', startDate: day(0), endDate: day(1), hours: 30, rate: '205/day', withOperator: 'No', amount: 410, invoice: 'VR-1180', category: 'B', site: 'River Lane', rrNumber: '1' }, at(25));
    save('contracts', {
      contractor: 'Ridge Debris Services', description: 'Debris removal from Creek Road and the park', contractNumber: 'PC-26-014', procurement: 'Noncompetitive: exigency or emergency',
      contractType: 'Unit price', justification: 'Creek Road blocked to emergency vehicles; competition not practical for the first 72 hours.',
      procChecks: ['procedures', 'sam', 'clauses', 'conflict', 'history'], startDate: day(1), amount: 6800, invoice: 'RDS-88', category: 'A', site: 'Creek Road'
    }, at(30));
    save('travel', { date: day(0), kind: 'Meals', name: 'Division A crews', description: 'Meals for 14 responders', vendor: 'Main Street Diner', qty: 14, unit: 'meals', rate: 14, receipt: 'MSD-501', category: 'B', site: 'Fairgrounds' }, at(13));

    var homes = [
      { address: '12 River Lane', dwelling: 'Single family', level: 'Major', waterInches: 26, primary: 'Yes', tenure: 'Owner', insurance: ['home'], habitable: 'No', utilities: 'No', needs: 'Staying at the shelter.' },
      { address: '14 River Lane', dwelling: 'Single family', level: 'Minor', waterInches: 3, primary: 'Yes', tenure: 'Owner', insurance: ['home', 'flood'], habitable: 'Yes', utilities: 'Yes' },
      { address: '18 River Lane', dwelling: 'Manufactured home', level: 'Destroyed', primary: 'Yes', tenure: 'Renter', insurance: ['none'], habitable: 'No', utilities: 'No', needs: 'Family of 4 at the shelter; lost medications.' },
      { address: '21 River Lane', dwelling: 'Single family', level: 'Affected', basement: 'Unfinished', primary: 'Yes', tenure: 'Owner', insurance: ['unknown'], habitable: 'Yes', utilities: 'Yes' },
      { address: '40 Mill Street', dwelling: 'Multi-family', units: 6, unitsMinor: 4, unitsAffected: 2, level: 'Minor', waterInches: 2, primary: 'Yes', tenure: 'Renter', insurance: ['unknown'], habitable: 'Yes', utilities: 'Yes' },
      { address: '7 Creek Road', dwelling: 'Single family', level: 'Inaccessible', primary: 'Unknown', tenure: 'Unknown', insurance: ['unknown'], review: true, notes: 'Private bridge washed out.' }
    ];
    homes.forEach(function (d, i) {
      d.city = 'Laurel Fork';
      d.county = 'Practice County';
      d.assessedBy = 'Harper Lane';
      d.assessedAt = at(5 + i * 0.25);
      save('daHome', d, at(5 + i * 0.25));
    });
    save('daSite', { name: 'Route 610 low-water bridge approach', category: 'C', address1: 'Route 610 at Laurel Fork', city: 'Laurel Fork', state: 'VA', damage: 'Approach washed out on the east side, about 40 feet of road shoulder lost.', cause: 'Flooding', cost: 85000, complete: 0, labor: 'Contract', priorGrant: 'No', priority: 'High', insured: 'No', assessedBy: 'Ali Navarro', assessedAt: at(26) }, at(26));
    save('daSite', { name: 'Creek Road debris', category: 'A', address1: 'Creek Road from Mill Street to the park', city: 'Laurel Fork', state: 'VA', damage: 'Trees and flood debris across the road and in the ditches.', cause: 'Flooding', cost: 12000, complete: 40, labor: 'Force account and contract', priorGrant: 'No', priority: 'High', insured: 'No', assessedBy: 'Ali Navarro', assessedAt: at(26.5) }, at(26.5));
    save('daSite', { name: 'Laurel Fork Park restroom', category: 'G', address1: '1 Park Road', city: 'Laurel Fork', state: 'VA', damage: 'Two feet of water inside; fixtures and electrical damaged.', cause: 'Flooding', cost: 18000, complete: 0, labor: 'Contract', priorGrant: 'Unknown', priority: 'Low', insured: 'Yes', assessedBy: 'Harper Lane', assessedAt: at(27) }, at(27));

    [['Chris Adler', 'Laurel Fork Baptist disaster team', 1, 7], ['Dee Morgan', 'Laurel Fork Baptist disaster team', 1, 7], ['Eli Watts', 'Unaffiliated', 25, null], ['Fran Kim', 'CERT', 25, null]].forEach(function (v) {
      save('volunteer', {
        name: v[0], organization: v[1], signIn: at(v[2]), signOut: v[3] ? at(v[2] + v[3]) : '', waiver: true, briefed: true,
        work: 'Filling and placing sandbags', category: 'B', site: 'River Lane', rate: 18, fringe: 0
      }, at(v[2]));
    });

    save('209', {
      version: 'Initial', reportNo: '1', commanders: 'Dana Reyes (Practice County Fire-Rescue)', mgmtOrg: 'Practice County EOC', startAt: at(-1), timeZone: 'Local',
      size: 'About 2 square miles along Laurel Fork', percent: 30, definition: 'Flash flood', complexity: 'Type 4', from: at(0), to: at(12),
      prepName: 'Sam Ortiz', prepPosition: 'Planning Section Chief', prepAt: at(11), sentTo: 'State EOC (practice)', state: 'VA', jurisdiction: 'Practice County',
      events: 'Route 610 and Creek Road closed. Shelter opened with 11 residents. River crested at 10:00.', hazards: 'Swift water, downed lines, debris.',
      dmgResThreat: 20, dmgResDmg: 3, dmgResDest: 1, damageNotes: 'Initial assessment of River Lane and Mill Street under way.',
      pubEvacNow: 11, pubShelNow: 11, threatMgmt: ['C', 'H', 'N'], weather: 'One more inch of rain possible this evening.',
      planned: 'Hold road closures overnight. Finish damage assessment. Begin debris removal on Creek Road.',
      commitment: [{ agency: 'Practice County Fire-Rescue', resources: '2 Engine Type 3', resourceCount: 2, resourcePeople: 6, additional: 2 }]
    }, at(11));

    var g = C.getRecord(inc, e31.rid);
    save('221', {
      plannedRelease: at(13), released: 'Engine 31, Practice County Fire-Rescue', soSupplyNeed: true, soSupplyName: 'Drew Patel', soCommsNeed: true, soCommsName: 'Kai Moreno',
      soTimeNeed: true, soDemobNeed: true, actualRelease: at(13), destination: 'Station 31', travelMethod: 'Apparatus', reassigned: 'No',
      prepName: 'Jamie Cole', prepPosition: 'Resources Unit Leader', prepAt: at(13), source: 'ICS 211 check-in: ' + g.winner.data.identifier
    }, at(13));

    return inc;
  }

  return { build: build };
});
