// Hand-picked paths into the regulations, by certificate and by topic.
// Each item is one of:
//   'sub:61:E'      a whole subpart (opens the Part with that subpart expanded)
//   'part:107'      a whole Part
//   '61.57'         a single section (FAR), '49cfr830.5' (NTSB)
//   'aim:3-2'       an AIM section (opens its first paragraph)
//   'aim-3-2-4'     a single AIM paragraph
// Anything that doesn't exist in the current data is quietly skipped,
// so a renumbered rule never produces a dead link.

export interface GuideGroup { title: string; items: string[] }
export interface Guide { id: string; title: string; blurb: string; kind: 'cert' | 'topic'; groups: GuideGroup[] }

const VFR_OPS = ['91.3', '91.7', '91.9', '91.13', '91.15', '91.17', '91.103', '91.107', '91.111', '91.113', '91.117', '91.119', '91.121', '91.123', '91.151', '91.153', '91.155', '91.157', '91.159'];
const AIRSPACE = ['91.126', '91.127', '91.129', '91.130', '91.131', '91.133', '91.135', '91.137', '91.215', '91.225'];
const AIRCRAFT = ['91.203', '91.205', '91.207', '91.209', '91.211', '91.213', '91.403', '91.407', '91.409', '91.413', '91.417'];

export const GUIDES: Guide[] = [
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
    ],
  },
  {
    id: 'accidents', kind: 'topic', title: 'Accidents and incidents',
    blurb: 'What counts as an accident and when to notify the NTSB.',
    groups: [{ title: 'NTSB Part 830', items: ['part:49-830'] }],
  },
];
