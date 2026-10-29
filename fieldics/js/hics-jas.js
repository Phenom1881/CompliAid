/*
 * FieldICS Job Action Sheets for the Hospital Incident Command System.
 *
 * Starter sheets for the main HICS positions, organized the way HICS job action sheets
 * are: immediate (first 2 hours), intermediate (2 to 12 hours), extended (beyond
 * 12 hours), and demobilization. Written for FieldICS from the HICS position
 * descriptions; each hospital should replace them with its own through the locality
 * setup file (setup.jas). No DOM access, so this runs in Node tests too.
 *
 *   FieldJAS.SHEETS: [{ id, position, section, reportsTo, mission, phases: { immediate, intermediate, extended, demob } }]
 *   FieldJAS.PHASES: [[key, label]]
 *   FieldJAS.sheetsFor(setup): the setup's own sheets when it has them, else the built-in ones
 *   FieldJAS.itemId(sheet, phase, index)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FieldJAS = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PHASES = [['immediate', 'Immediate (first 2 hours)'], ['intermediate', 'Intermediate (2 to 12 hours)'], ['extended', 'Extended (beyond 12 hours)'], ['demob', 'Demobilization and system recovery']];

  /* Actions every position takes, added to each sheet. */
  var COMMON = {
    immediate: [
      'Receive the appointment and briefing; get this Job Action Sheet, a vest or ID, and the HICS 214',
      'Read this entire sheet and review the HIMT chart (HICS 207)',
      'Notify your usual supervisor of your HICS assignment'
    ],
    intermediate: ['Document actions and decisions on the HICS 214 as they happen'],
    extended: ['Watch your staff and yourself for stress and fatigue; take breaks and hand off with a full briefing'],
    demob: [
      'Give your HICS forms and 214 to the Documentation Unit Leader',
      'Take part in the debriefing and after action review',
      'Submit your comments for the after action report and improvement plan'
    ]
  };

  function sheet(id, position, section, reportsTo, mission, phases) {
    return { id: id, position: position, section: section, reportsTo: reportsTo, mission: mission, phases: phases };
  }

  var SHEETS = [
    sheet('ic', 'Incident Commander', 'Command', 'Chief Executive Officer or designee',
      'Organize and direct the Hospital Command Center. Give overall strategic direction for hospital incident management and support services, and authorize the incident action plan.', {
        immediate: [
          'Assume the role and activate the Hospital Command Center (HCC)',
          'Assess the situation: scope, patients expected, hazards, and effect on hospital operations',
          'Decide which HIMT positions to activate and appoint them; record on the HICS 203',
          'Set the operational period and the initial objectives (IAP Quick Start or HICS 201)',
          'Brief the command staff and section chiefs; set the first planning meeting time',
          'With the Safety Officer, decide whether to restrict access, shelter in place, or evacuate',
          'Notify executive leadership and, through the Liaison Officer, the county EOC and health department'
        ],
        intermediate: [
          'Approve the incident action plan (HICS 200 cover sheet) for each operational period',
          'Hold regular briefings with the command staff and section chiefs',
          'Approve public statements with the Public Information Officer',
          'Track patient surge, bed availability, staffing, and supplies against the objectives',
          'Decide on activating surge plans, alternate care areas, and mutual aid requests'
        ],
        extended: [
          'Plan relief for HIMT positions, including your own',
          'Review and revise objectives each operational period',
          'Keep the board and senior leadership informed'
        ],
        demob: [
          'Decide when to scale back and when to deactivate the HCC',
          'Approve the demobilization plan; make sure all sections return to normal operations',
          'Issue the final message to staff and partners that the incident is over',
          'Lead the hotwash and assign the after action report'
        ]
      }),
    sheet('pio', 'Public Information Officer', 'Command', 'Incident Commander',
      'Serve as the conduit for information to internal and external stakeholders, including staff, visitors, families, and the news media, as approved by the Incident Commander.', {
        immediate: [
          'Get a briefing from the Incident Commander on the situation and what may be released',
          'Set up a media staging area away from patient care and the HCC',
          'Coordinate messages with the county or health department joint information center',
          'Prepare an initial statement for staff and the public; get it approved'
        ],
        intermediate: [
          'Hold regular media briefings and post updates on the hospital website and social media',
          'Watch news and social media for rumors and wrong information; correct them',
          'Work with the Patient Family Assistance Branch on information for families',
          'Protect patient privacy in every release; release patient information only as policy and law allow'
        ],
        extended: ['Keep a log of every release and inquiry', 'Plan relief for the PIO role'],
        demob: ['Issue the final media, staff, and patient briefings', 'Update the website and social media to show normal operations']
      }),
    sheet('lo', 'Liaison Officer', 'Command', 'Incident Commander',
      'Act as the hospital\'s point of contact with outside agencies, governments, and other health care organizations.', {
        immediate: [
          'Get a briefing from the Incident Commander',
          'Contact the county EOC, the local health department, and the regional health care coalition',
          'Report the hospital\'s status, bed availability, and needs as requested (HICS 251 and 259)',
          'Set up contact lists for partners on the HICS 205A and 258'
        ],
        intermediate: [
          'Keep partners informed of hospital status at set times',
          'Coordinate requests for outside resources and mutual aid with Logistics',
          'Host agency representatives who come to the hospital'
        ],
        extended: ['Keep the contact lists current', 'Pass on partner updates to the Incident Commander and Planning'],
        demob: ['Notify partners that the HCC is deactivating', 'Collect agreements and reimbursement paperwork for Finance']
      }),
    sheet('so', 'Safety Officer', 'Command', 'Incident Commander',
      'Ensure the safety of staff, patients, and visitors; monitor and correct hazardous conditions. Has the authority to stop any unsafe act.', {
        immediate: [
          'Get a briefing from the Incident Commander',
          'Assess hazards to staff, patients, and visitors; walk the affected areas if safe',
          'Stop any unsafe activity',
          'Start the HICS 215A safety analysis and recommend personal protective equipment'
        ],
        intermediate: [
          'Complete the HICS 215A for each operational period; brief the safety message',
          'Approve the staff medical plan (HICS 206)',
          'Report injuries and exposures to Employee Health and Compensation/Claims',
          'Check that decontamination, isolation, and security measures are working'
        ],
        extended: ['Watch for fatigue and stress hazards across the HIMT', 'Update the safety analysis as conditions change'],
        demob: ['Do a final facility safety review; document resolved and remaining hazards', 'Notify regulators as required and submit safety paperwork']
      }),
    sheet('ops', 'Operations Section Chief', 'Operations', 'Incident Commander',
      'Develop and carry out the strategy and tactics to meet the incident objectives; organize and direct the Operations Section.', {
        immediate: [
          'Get a briefing from the Incident Commander',
          'Activate the branches needed (Medical Care, Infrastructure, Security, HazMat, Business Continuity, Patient Family Assistance) and Staging',
          'Brief the branch directors and give them their assignments (HICS 204)',
          'Decide on patient care priorities: surge, cancel elective procedures, discharge where safe'
        ],
        intermediate: [
          'Track bed availability, patient flow, and staffing with Planning',
          'Request resources through Logistics; manage staging',
          'Give status to the Incident Commander and at planning meetings'
        ],
        extended: ['Plan the next operational period\'s assignments', 'Rotate staff and branch directors'],
        demob: ['Return branches to normal operations as the incident winds down', 'Make sure each branch completes its HICS 221']
      }),
    sheet('stage', 'Staging Manager', 'Operations', 'Operations Section Chief',
      'Organize and manage the staging of personnel, vehicles, equipment, supplies, and medication.', {
        immediate: ['Set up staging areas for personnel, vehicles, equipment and supplies, and medications', 'Assign team leaders for each staging area', 'Track what is in staging on the HICS 257'],
        intermediate: ['Fill requests from Operations from staging', 'Tell Logistics when supplies run low'],
        extended: ['Keep counts current each operational period'],
        demob: ['Return supplies and equipment; debrief staging staff']
      }),
    sheet('medcare', 'Medical Care Branch Director', 'Operations', 'Operations Section Chief',
      'Organize and manage the delivery of emergency, inpatient, outpatient, casualty care, and clinical support services.', {
        immediate: [
          'Activate the units needed: inpatient, outpatient, casualty care, behavioral health, clinical support, patient registration',
          'Set up triage and treatment areas; assign unit leaders',
          'Start patient tracking on the HICS 254 with the Patient Tracking Manager',
          'Report bed availability and staffing needs to the Operations Section Chief'
        ],
        intermediate: [
          'Decide on early discharges, cancelled procedures, and expanded care areas',
          'Request staff, supplies, and medications through Operations',
          'Coordinate patient transfers and evacuation (HICS 255 and 260) if needed'
        ],
        extended: ['Plan staffing for the next periods', 'Watch for staff fatigue in patient care areas'],
        demob: ['Reschedule cancelled procedures', 'Repatriate patients and notify families', 'Close alternate care areas; restore normal staffing']
      }),
    sheet('infra', 'Infrastructure Branch Director', 'Operations', 'Operations Section Chief',
      'Organize and manage the facility\'s power, water, HVAC, medical gases, building, and grounds.', {
        immediate: ['Assess every critical system and report on the HICS 251', 'Activate units for power, water, HVAC, building and grounds, medical gases, and environmental services as needed', 'Start repairs or workarounds for failed systems'],
        intermediate: ['Track fuel, water, and medical gas reserves', 'Report building damage and restricted areas to Safety and Operations', 'Arrange vendor repairs through Logistics'],
        extended: ['Update the HICS 251 each operational period', 'Plan for extended utility outages'],
        demob: ['Report final damage assessments', 'Return utilities to normal; arrange resupply of fuel and gases']
      }),
    sheet('security', 'Security Branch Director', 'Operations', 'Operations Section Chief',
      'Organize and direct security: access control, crowd and traffic control, and liaison with law enforcement.', {
        immediate: ['Secure the campus; lock down or restrict entrances as directed', 'Control traffic for ambulances and the emergency department', 'Contact local law enforcement as needed'],
        intermediate: ['Badge and track staff, volunteers, and visitors', 'Protect the HCC, pharmacy, and other critical areas', 'Support searches and family reunification areas'],
        extended: ['Rotate security staff; request help through Logistics'],
        demob: ['Lift the lockdown as directed', 'End added security measures and debrief staff']
      }),
    sheet('hazmat', 'Hazardous Materials Branch Director', 'Operations', 'Operations Section Chief',
      'Organize and direct hazardous materials response, including detection, spill response, and patient decontamination.', {
        immediate: ['Identify the hazard with the Safety Officer and medical-technical specialists', 'Set up the decontamination area and team with proper protective equipment', 'Protect the emergency department from contamination'],
        intermediate: ['Track decontaminated patients and staff', 'Contain runoff and contaminated materials', 'Coordinate with the fire department hazmat team'],
        extended: ['Rotate decontamination teams; monitor them medically'],
        demob: ['End decontamination; dispose of wastewater and materials properly', 'Refer decon staff to Employee Health; debrief']
      }),
    sheet('bizcon', 'Business Continuity Branch Director', 'Operations', 'Operations Section Chief',
      'Keep critical business functions running: information systems, records, and relocated services.', {
        immediate: ['Assess information systems and electronic health record availability', 'Start downtime procedures and paper records where needed', 'Identify services that must relocate'],
        intermediate: ['Restore systems by priority with IT', 'Keep patient records complete during downtime'],
        extended: ['Plan for longer outages and data entry backlogs'],
        demob: ['Return relocated services; resolve downtime data entry']
      }),
    sheet('pfa', 'Patient Family Assistance Branch Director', 'Operations', 'Operations Section Chief',
      'Organize social services and family reunification for patients and families.', {
        immediate: ['Set up a family assistance area away from treatment areas', 'Assign social services and family reunification staff', 'Coordinate information for families with the PIO and Patient Tracking Manager'],
        intermediate: ['Reunify families and patients as identification is confirmed', 'Arrange behavioral health support for families'],
        extended: ['Coordinate with the county family assistance center if one opens'],
        demob: ['Close the family area; return supplies; debrief staff']
      }),
    sheet('plan', 'Planning Section Chief', 'Planning', 'Incident Commander',
      'Oversee incident related data gathering and analysis, incident planning, and documentation; prepare the incident action plan.', {
        immediate: ['Activate the Resources, Situation, Documentation, and Demobilization units as needed', 'Start tracking personnel, materiel, patients, and beds', 'Set the planning meeting schedule with the Incident Commander'],
        intermediate: ['Lead planning meetings; assemble the IAP (HICS 200 cover, 202, 203, 204, 205A, 206, 215A)', 'Give situation reports to the HIMT and partners', 'Keep the HICS 203 and 207 current'],
        extended: ['Project needs for the next operational periods', 'Start the demobilization plan early'],
        demob: ['Make sure all documents are with the Documentation Unit', 'Submit the demobilization plan']
      }),
    sheet('res', 'Resources Unit Leader', 'Planning', 'Planning Section Chief',
      'Track personnel and materiel resources assigned to the incident.', {
        immediate: ['Track personnel (HICS 252) and materiel (HICS 257) with the tracking managers', 'Start the hospital resource directory (HICS 258)'],
        intermediate: ['Report resource status at planning meetings'],
        extended: ['Keep tracking current each operational period'],
        demob: ['Submit tracking forms; store tracking tools']
      }),
    sheet('sit', 'Situation Unit Leader', 'Planning', 'Planning Section Chief',
      'Collect and analyze incident information, including patient and bed tracking.', {
        immediate: ['Start patient tracking (HICS 254) and bed tracking with the managers', 'Post the situation in the HCC'],
        intermediate: ['Prepare the casualty and fatality report (HICS 259) and situation reports at set times'],
        extended: ['Project patient volume and bed needs'],
        demob: ['Submit tracking forms; store tracking tools']
      }),
    sheet('doc', 'Documentation Unit Leader', 'Planning', 'Planning Section Chief',
      'Collect, organize, and keep all incident documentation.', {
        immediate: ['Set up a filing system for incident documents', 'Collect HICS forms and activity logs from each position'],
        intermediate: ['Make copies of the IAP for the HIMT', 'Check forms for completeness'],
        extended: ['Keep the incident record complete and secure, including patient information'],
        demob: ['Catalog all paperwork for the after action report and reimbursement']
      }),
    sheet('demob', 'Demobilization Unit Leader', 'Planning', 'Planning Section Chief',
      'Develop the demobilization plan and oversee the orderly return to normal operations.', {
        immediate: ['Learn which resources are assigned and when they may be released'],
        intermediate: ['Draft the demobilization plan; review it with section chiefs'],
        extended: ['Brief the HIMT on the demobilization schedule'],
        demob: ['Track HICS 221 check-outs', 'Submit the approved plan and paperwork']
      }),
    sheet('log', 'Logistics Section Chief', 'Logistics', 'Incident Commander',
      'Organize and direct the services and support needed for the response: communications, IT equipment, food and water, supplies, facilities, transportation, and staffing.', {
        immediate: ['Activate the Service and Support branches as needed', 'Set up the labor pool and credentialing', 'Check critical supplies and order what is short'],
        intermediate: ['Fill resource requests from Operations', 'Coordinate outside resource requests with the Liaison Officer', 'Arrange staff food, water, rest areas, and family care'],
        extended: ['Plan resupply and staffing for later periods'],
        demob: ['Restock supplies; return borrowed equipment; debrief branches']
      }),
    sheet('svc', 'Service Branch Director', 'Logistics', 'Logistics Section Chief',
      'Manage communications, IT and IS equipment, and staff food and water.', {
        immediate: ['Set up radios and phones for the HCC (HICS 205A)', 'Support IT equipment needs', 'Arrange food and water for staff'],
        intermediate: ['Keep communications working; fix or replace equipment'],
        extended: ['Track food and water stocks'],
        demob: ['Store communications equipment; archive data; restock food and water']
      }),
    sheet('sup', 'Support Branch Director', 'Logistics', 'Logistics Section Chief',
      'Manage employee health and well-being, family care, supply, facilities, transportation, and the labor pool.', {
        immediate: ['Open the labor pool; register volunteers on the HICS 253', 'Check supply levels; set up supply delivery', 'Arrange transportation for staff and patients as needed'],
        intermediate: ['Support employee health and family care needs', 'Track supplies issued and returned (HICS 257)'],
        extended: ['Plan for staff housing and rest if the incident runs long'],
        demob: ['Inspect and store supplies; send equipment for service; debrief units']
      }),
    sheet('fin', 'Finance/Administration Section Chief', 'Finance/Administration', 'Incident Commander',
      'Monitor the use of financial assets and track costs, time, procurement, and claims for the response.', {
        immediate: ['Activate the Time, Procurement, Compensation/Claims, and Cost units as needed', 'Set up cost tracking for the incident, including FEMA reimbursement records', 'Set emergency purchasing authority with the Incident Commander'],
        intermediate: ['Track staff time (HICS 252) and purchases (HICS 256)', 'Report costs at planning meetings'],
        extended: ['Project costs for later periods', 'Prepare for reimbursement documentation'],
        demob: ['Make sure time sheets, purchase records, and claims are complete', 'Prepare the cost summary']
      }),
    sheet('time', 'Time Unit Leader', 'Finance/Administration', 'Finance/Administration Section Chief',
      'Track staff and volunteer hours for the response.', {
        immediate: ['Distribute HICS 252 time sheets to each section'],
        intermediate: ['Collect time sheets every 12 hours or each operational period'],
        extended: ['Reconcile time with payroll'],
        demob: ['Collect all time sheets']
      }),
    sheet('proc', 'Procurement Unit Leader', 'Finance/Administration', 'Finance/Administration Section Chief',
      'Process purchases and contracts for the response.', {
        immediate: ['Set up emergency purchasing procedures', 'Start the procurement summary (HICS 256)'],
        intermediate: ['Process purchase orders and contracts; keep documentation for reimbursement'],
        extended: ['Track vendor deliveries and invoices'],
        demob: ['Collect order forms and expense records']
      }),
    sheet('comp', 'Compensation/Claims Unit Leader', 'Finance/Administration', 'Finance/Administration Section Chief',
      'Handle injury, workers\' compensation, and liability claims from the response.', {
        immediate: ['Set up reporting for staff injuries and exposures'],
        intermediate: ['Document injuries and claims; coordinate with Employee Health and Risk Management'],
        extended: ['Track open claims'],
        demob: ['Submit insurance and workers\' compensation forms']
      }),
    sheet('cost', 'Cost Unit Leader', 'Finance/Administration', 'Finance/Administration Section Chief',
      'Track and analyze the costs of the response.', {
        immediate: ['Set up cost categories for the incident'],
        intermediate: ['Collect cost data from time and procurement; report totals'],
        extended: ['Project total costs'],
        demob: ['Complete expense reports; resolve outstanding expenses and cards']
      })
  ];

  SHEETS.forEach(function (s) {
    PHASES.forEach(function (p) {
      var own = s.phases[p[0]] || [];
      s.phases[p[0]] = p[0] === 'immediate' ? COMMON.immediate.concat(own) : own.concat(COMMON[p[0]] || []);
    });
  });

  function itemId(sheet, phase, index) {
    return sheet.id + '.' + phase + '.' + index;
  }

  function sheetsFor(setup) {
    return setup && Array.isArray(setup.jas) && setup.jas.length ? setup.jas : SHEETS;
  }

  return { SHEETS: SHEETS, PHASES: PHASES, itemId: itemId, sheetsFor: sheetsFor };
});
