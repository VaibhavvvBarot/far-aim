// Hand-picked paths into the regulations, by certificate and by topic.
// Each item is one of:
//   'sub:61:E'      a whole subpart (opens the Part with that subpart expanded)
//   'part:107'      a whole Part
//   '61.57'         a single section (FAR), '49cfr830.5' (NTSB)
//   'aim:3-2'       an AIM section (opens its first paragraph)
//   'aim-3-2-4'     a single AIM paragraph
// Anything that doesn't exist in the current data is quietly skipped,
// so a renumbered rule never produces a dead link.

// note: a short plain-language explanation shown above the group's links
export interface GuideGroup { title: string; note?: string; items: string[] }
// intro: paragraphs shown before the groups; kind 'decide' guides walk through a question step by step
export interface Guide { id: string; title: string; blurb: string; kind: 'cert' | 'topic' | 'decide'; intro?: string[]; keys?: string; groups: GuideGroup[] }

const VFR_OPS = ['91.3', '91.7', '91.9', '91.13', '91.15', '91.17', '91.103', '91.107', '91.111', '91.113', '91.117', '91.119', '91.121', '91.123', '91.151', '91.153', '91.155', '91.157', '91.159'];
const AIRSPACE = ['91.126', '91.127', '91.129', '91.130', '91.131', '91.133', '91.135', '91.137', '91.215', '91.225'];
const AIRCRAFT = ['91.203', '91.205', '91.207', '91.209', '91.211', '91.213', '91.403', '91.407', '91.409', '91.413', '91.417'];

export const GUIDES: Guide[] = [
  {
    id: 'which-part', kind: 'decide', title: 'Part 91, 121, 125 or 135?',
    blurb: 'Work out which rules an operation falls under, step by step.',
    keys: 'which part applies 91 121 125 135 119 110 air carrier commercial operator charter common carriage noncommon private carriage holding out on-demand commuter domestic flag supplemental scheduled wet lease operating certificate ops specs compensation hire determine operation',
    intro: [
      'Answer these in order. The first step that fits usually decides it. Each step links to the rule that actually says so.',
      'Simplified for orientation. The definitions in § 110.2 and the exceptions in § 119.1 have more detail than fits here, and "holding out" is judged case by case (FAA Advisory Circular 120-12A). Read the rule before relying on it.',
    ],
    groups: [
      {
        title: 'Is anyone paying, or is it for hire?',
        note: 'No compensation or hire: it\'s Part 91. That includes a private pilot sharing costs pro rata with passengers (§ 61.113(c)). In large and turbine-powered multiengine airplanes, some arrangements that do involve charges, such as time sharing, interchange and company carriage, can also stay under Part 91 Subpart F when there is no common carriage (§ 91.501(b)). "Commercial operator" and "operational control" are defined in § 1.1.',
        items: ['61.113', '1.1', '91.501'],
      },
      {
        title: 'Is it one of the § 119.1(e) exceptions?',
        note: 'Part 119, and with it 121 and 135, does not apply to student instruction, ferry or training flights, aerial work (crop dusting, banner towing, aerial photography or survey, firefighting, powerline or pipeline patrol), balloon and glider sightseeing, nonstop air tours within 25 statute miles under a § 91.147 Letter of Authorization, nonstop parachute jump flights within 25 statute miles, Part 133 external load and a few others. Those fly under Part 91 plus their own Part (133, 137, 136). The exceptions don\'t cover non-common-carriage flights in airplanes with 20 or more seats or 6,000 lb or more payload.',
        items: ['119.1', '91.147', 'part:136', 'part:133', 'part:137'],
      },
      {
        title: 'Fractional ownership?',
        note: 'A fractional program run under Part 91 Subpart K, without common carriage, stays under Part 91 (§ 119.1(d)).',
        items: ['sub:91:K', '91.1001'],
      },
      {
        title: 'Common carriage, or not?',
        note: 'Common carriage means holding out to the public to carry persons or property for anyone who asks. Noncommon carriage is for hire without holding out (§ 110.2). Common carriage needs an air carrier or commercial operator certificate under Part 119 and then runs under 121 or 135 (§ 119.21). Not common carriage goes to step 6.',
        items: ['110.2', '119.5', '119.21'],
      },
      {
        title: 'Common carriage: Part 121 or Part 135?',
        note: 'Part 121 covers domestic, flag and supplemental operations: scheduled flights with turbojets, more than 9 passenger seats or more than 7,500 lb payload, and on-demand flights with more than 30 seats or more than 7,500 lb payload. Part 135 covers commuter and on-demand operations: scheduled flights (at least five round trips a week on one route) in non-turbojet airplanes with 9 seats or fewer and 7,500 lb payload or less, on-demand charters with 30 seats or fewer and 7,500 lb payload or less, all-cargo with 7,500 lb payload or less, and any rotorcraft operation (§ 119.25). The exact limits are in the definitions in § 110.2.',
        items: ['121.1', '135.1', '119.25', '119.49'],
      },
      {
        title: 'Not common carriage: Part 125 or Part 135?',
        note: 'For hire without holding out, in an airplane with 20 or more passenger seats or 6,000 lb or more payload: Part 125 (§ 119.23(a), § 125.1). Fewer than 20 seats and less than 6,000 lb payload: Part 135, apart from its commuter-only rules (§ 119.23(b)), unless § 91.501(b) lets it stay under Part 91.',
        items: ['119.23', '125.1', '125.3'],
      },
      {
        title: 'Leases and foreign operators',
        note: 'A wet lease is any lease where a person provides an entire aircraft and at least one crewmember (§ 110.2). Certificate holders have to send the FAA a copy before operating under one, and the FAA decides who has operational control (§ 119.53). Leased large civil aircraft also have truth-in-leasing rules (§ 91.23). Foreign air carriers operating in the U.S. fly under Part 129.',
        items: ['119.53', '91.23', 'part:129'],
      },
    ],
  },
  {
    id: 'ferry', kind: 'decide', title: 'Ferry flights and special flight permits',
    blurb: 'Flying an aircraft that doesn\'t meet airworthiness requirements to get it fixed.',
    keys: 'ferry flight special permit unairworthy airworthiness repair maintenance base 21.197 21.199 export delivery',
    intro: ['A special flight permit lets an aircraft that may not meet its airworthiness requirements, but can fly safely, make specific flights such as a ferry to a repair shop. Simplified. Read the rule before relying on it.'],
    groups: [
      {
        title: 'What a permit is for',
        note: 'Ferrying to a base for repairs, alterations or maintenance or to storage, delivery or export, production flight tests, evacuating from impending danger, customer demonstrations, and flights over maximum takeoff weight for extra fuel on long over-water or remote legs (§ 21.197).',
        items: ['21.197'],
      },
      {
        title: 'How to get one',
        note: 'Apply to the FAA, stating the purpose, itinerary, crew, the ways the aircraft doesn\'t comply and any limits you propose. The FAA can ask for an inspection (§ 21.199).',
        items: ['21.199', '21.181'],
      },
      {
        title: 'Related rules',
        note: 'Flying with inoperative instruments or equipment without a permit is covered in § 91.213. Ferry flights are excepted from Part 119 (§ 119.1(e)(3)) and Part 125 (§ 125.1(b)(2)).',
        items: ['91.213', '91.203', '91.7', '119.1'],
      },
    ],
  },
  {
    id: 'student', kind: 'cert', title: 'Student pilot',
    blurb: 'Eligibility, solo requirements and endorsements before the private.',
    groups: [
      { title: 'Student pilot rules', items: ['sub:61:C'] },
      { title: 'Key sections', items: ['61.83', '61.85', '61.87', '61.89', '61.93', '61.94', '61.95', '61.3', '61.23', '61.51'] },
      { title: 'Flying rules you need on day one', items: ['91.103', '91.113', '91.119', '91.151', '91.155', '91.17'] },
    ],
  },
  {
    id: 'private', kind: 'cert', title: 'Private pilot',
    blurb: 'Part 61 Subpart E plus the Part 91 rules the checkride covers.',
    groups: [
      { title: 'Private pilot rules', items: ['sub:61:E'] },
      { title: 'Certificates, logbooks and currency', items: ['61.3', '61.23', '61.31', '61.51', '61.56', '61.57', '61.60', '61.113'] },
      { title: 'Operating rules (VFR)', items: VFR_OPS },
      { title: 'Airspace', items: [...AIRSPACE, 'aim:3-1', 'aim:3-2', 'aim:3-3', 'aim:3-4', 'aim:3-5'] },
      { title: 'Aircraft documents and equipment', items: AIRCRAFT },
      { title: 'Accidents and incidents', items: ['49cfr830.2', '49cfr830.5', '49cfr830.10', '49cfr830.15'] },
    ],
  },
  {
    id: 'instrument', kind: 'cert', title: 'Instrument rating',
    blurb: 'Requirements for the rating, IFR currency and the IFR flight rules.',
    groups: [
      { title: 'Getting the rating', items: ['61.65', '61.3', '61.51'] },
      { title: 'Staying current', items: ['61.57'] },
      { title: 'IFR flight rules', items: ['91.167', '91.169', '91.171', '91.173', '91.175', '91.177', '91.179', '91.181', '91.183', '91.185', '91.187'] },
      { title: 'Equipment and inspections', items: ['91.205', '91.411', '91.413', '91.171'] },
      { title: 'AIM chapters to know', items: ['aim:5-1', 'aim:5-2', 'aim:5-3', 'aim:5-4', 'aim:5-5', 'aim:1-1', 'aim:1-2'] },
    ],
  },
  {
    id: 'commercial', kind: 'cert', title: 'Commercial pilot',
    blurb: 'Part 61 Subpart F, privileges for hire and the limits on them.',
    groups: [
      { title: 'Commercial pilot rules', items: ['sub:61:F'] },
      { title: 'Key sections', items: ['61.123', '61.125', '61.127', '61.129', '61.133', '61.31', '61.57'] },
      { title: 'Flying for hire', items: ['119.1', '91.147', '91.409', '91.205'] },
    ],
  },
  {
    id: 'cfi', kind: 'cert', title: 'Flight instructor',
    blurb: 'Part 61 Subpart H and the endorsements you will sign.',
    groups: [
      { title: 'Flight instructor rules', items: ['sub:61:H'] },
      { title: 'Key sections', items: ['61.183', '61.185', '61.187', '61.189', '61.193', '61.195', '61.197', '61.199'] },
      { title: 'Endorsements you will give', items: ['61.31', '61.56', '61.65', '61.87', '61.93', '61.103', '61.107'] },
    ],
  },
  {
    id: 'atp', kind: 'cert', title: 'Airline transport pilot',
    blurb: 'Part 61 Subpart G plus flight and duty limits.',
    groups: [
      { title: 'ATP rules', items: ['sub:61:G'] },
      { title: 'Flight and duty', items: ['part:117'] },
    ],
  },
  {
    id: 'sport', kind: 'cert', title: 'Sport and recreational',
    blurb: 'Sport pilot (Subpart J), sport instructors (K) and recreational (D).',
    groups: [
      { title: 'Sport pilot', items: ['sub:61:J'] },
      { title: 'Sport pilot instructors', items: ['sub:61:K'] },
      { title: 'Recreational pilot', items: ['sub:61:D'] },
    ],
  },
  {
    id: 'remote', kind: 'cert', title: 'Remote pilot (drones)',
    blurb: 'Part 107 small unmanned aircraft rules.',
    groups: [
      { title: 'Part 107', items: ['part:107'] },
      { title: 'Most asked about', items: ['107.29', '107.39', '107.41', '107.51', '107.65', '107.145'] },
    ],
  },
  {
    id: 'medical', kind: 'topic', title: 'Medical and BasicMed',
    blurb: 'Which medical you need, how long it lasts, and flying without one.',
    groups: [
      { title: 'Which medical, how long', items: ['61.23', '61.53'] },
      { title: 'Medical standards', items: ['part:67'] },
      { title: 'BasicMed', items: ['part:68'] },
      { title: 'Fitness for flight', items: ['91.17', 'aim:8-1'] },
    ],
  },
  {
    id: 'currency', kind: 'topic', title: 'Flight review and currency',
    blurb: 'Flight review, passenger currency, night and IFR currency.',
    groups: [
      { title: 'Rules', items: ['61.56', '61.57', '61.31', '61.51'] },
    ],
  },
  {
    id: 'airspace', kind: 'topic', title: 'Airspace',
    blurb: 'Classes A to G, special use airspace and TFRs.',
    groups: [
      { title: 'Operating rules', items: AIRSPACE },
      { title: 'AIM', items: ['aim:3-1', 'aim:3-2', 'aim:3-3', 'aim:3-4', 'aim:3-5'] },
      { title: 'Designations', items: ['part:71', 'part:73'] },
    ],
  },
  {
    id: 'weather', kind: 'topic', title: 'Weather minimums and fuel',
    blurb: 'VFR cloud clearance, special VFR, IFR alternates and fuel reserves.',
    groups: [
      { title: 'VFR', items: ['91.155', '91.157', '91.151'] },
      { title: 'IFR', items: ['91.167', '91.169', '91.175'] },
    ],
  },
  {
    id: 'maintenance', kind: 'topic', title: 'Aircraft and maintenance',
    blurb: 'Required documents, equipment, inspections and owner maintenance.',
    groups: [
      { title: 'Documents and equipment', items: ['91.203', '91.205', '91.207', '91.209', '91.213'] },
      { title: 'Inspections and records', items: ['91.403', '91.405', '91.407', '91.409', '91.411', '91.413', '91.417'] },
      { title: 'What owners may do', items: ['43.3', '43.9'] },
      { title: 'Ferrying an unairworthy aircraft', items: ['21.197', '21.199'] },
    ],
  },
  {
    id: 'accidents', kind: 'topic', title: 'Accidents and incidents',
    blurb: 'What counts as an accident and when to notify the NTSB.',
    groups: [{ title: 'NTSB Part 830', items: ['part:49-830'] }],
  },
];

// Guides whose subject matches a search, e.g. "135 vs 121" or "ferry permit"
const QSTOP = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'is', 'if', 'how', 'what', 'vs', 'v', 's', 'versus', 'do', 'does', 'i', 'my', 'part', 'cfr', '14', 'far', 'in', 'on', 'it', 'op', 'ops']);
export function guidesFor(q: string): Guide[] {
  const words = q.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w && !QSTOP.has(w));
  if (!words.length) return [];
  const out: [Guide, number][] = [];
  for (const g of GUIDES) {
    const hay = new Set(`${g.title} ${g.keys || ''}`.toLowerCase().split(/[^a-z0-9.]+/));
    const hit = words.filter((w) => hay.has(w) || (w.length > 4 && [...hay].some((h) => h.startsWith(w.slice(0, -1))))).length;
    if (hit >= Math.max(1, Math.ceil(words.length * 0.6)) && (words.length > 1 || g.kind === 'decide')) out.push([g, hit / words.length]);
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
}
