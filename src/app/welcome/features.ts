// Content for the /welcome feature guide. Each feature matches one chapter of
// the guided-tour film (marketing/demo-film/chapters.mjs); `start` is where
// that chapter begins in the video, from marketing/demo-film/chapters.json.
// Keep the three in step when a chapter changes.

export interface Feature {
  id: string;
  start: number;
  title: string;
  who: string[];
  headline: string;
  purpose: string;
  steps: string[];
  tip?: string;
  shot: { src: string; alt: string; kind: 'desktop' | 'phone' };
  extra?: { src: string; alt: string; kind: 'desktop' | 'phone' };
}

export const features: Feature[] = [
  {
    id: 'dashboard',
    start: 9,
    title: 'The dashboard',
    who: ['All staff'],
    headline: 'Start every day on the dashboard.',
    purpose: 'One screen tells you what happened, what is still open and who needs attention, so you know where to begin.',
    steps: [
      'Pick a period (today, this week, this month or all year) and read the totals: all, pending and resolved incidents.',
      'Use the quick actions to log an incident, recognize a student, open learning support or run a report in one tap.',
      'Open the alert cards: students at high risk, IEP/504 removal limits and the positive to corrective ratio.',
    ],
    tip: 'Every number is a link. Tap Pending to jump straight to the incidents that still need follow up.',
    shot: { src: 'desktop-dashboard', alt: 'Dashboard with incident totals, quick actions and alert cards', kind: 'desktop' },
  },
  {
    id: 'students',
    start: 22,
    title: 'Students',
    who: ['All staff'],
    headline: 'Know every student at a glance.',
    purpose: 'The roster and each student profile bring conduct points, learning support plans and history into one place.',
    steps: [
      'Search the roster by name or student ID, or filter by grade.',
      'Open a profile to see conduct points, standing (Good, Warning or Probation) and program badges like IEP or BIP.',
      'Log an incident or recognize the student right from the profile, with their plan and incident timeline in view.',
    ],
    tip: 'Every student starts the year with 100 conduct points. Each infraction deducts the points set for its code.',
    shot: { src: 'desktop-profile', alt: 'Student profile with conduct standing, plan badges and learning support', kind: 'desktop' },
  },
  {
    id: 'incidents',
    start: 35,
    title: 'Log an incident',
    who: ['Teachers', 'Counselors', 'Principals'],
    headline: 'Log an incident in under a minute.',
    purpose: 'The incident form uses the same PlusPortals discipline codes the office enters in the SIS, so nothing is typed twice.',
    steps: [
      'Tap New Incident, pick the student and the infraction code, for example PROFAN for profanity.',
      'Choose where it happened and the action taken, such as CLS (Classroom) and OR (Office Referral), then describe what happened.',
      'Choose a penalty. Detention hours or ISS and OSS days fill in for you, and the served status starts as Pending.',
    ],
    tip: 'Codes marked SIS match PlusPortals exactly, so the office can copy the referral into the SIS as it is.',
    shot: { src: 'desktop-incident-codes', alt: 'New incident form with PlusPortals location, action, penalty and served codes', kind: 'desktop' },
  },
  {
    id: 'support',
    start: 49,
    title: 'Learning support',
    who: ['All staff', 'Counselors and principals manage plans'],
    headline: 'Accommodations travel with the student.',
    purpose: 'IEP, 504, ELL, behavior (BIP), gifted and health plans live on the student record, so every adult sees what matters before they act.',
    steps: [
      'Pick a student with a plan in the incident form and their needs and behavior guidance appear before you choose a consequence.',
      'For students with an IEP or 504, the app warns at 8 days of removal and requires a manifestation determination review past 10 days, as IDEA does.',
      'Open Learning Support to see every plan, filter by program and read accommodations by type: presentation, response, setting, timing, behavior and assistive technology.',
    ],
    tip: 'Plan badges also appear on the roster and on every profile, so nobody has to remember who has a plan.',
    shot: { src: 'desktop-incident-alert', alt: 'Incident form showing the student plan and a manifestation determination warning', kind: 'desktop' },
    extra: { src: 'desktop-plan-detail', alt: 'Learning support plan with accommodations by type', kind: 'desktop' },
  },
  {
    id: 'follow-up',
    start: 63,
    title: 'Follow up',
    who: ['Teachers', 'Counselors', 'Principals'],
    headline: 'Follow through, then close it.',
    purpose: 'Every incident keeps its status, its full history and the conversation with home, from the first report to the resolution.',
    steps: [
      'Open the incident, update the status (Open, Pending, Resolved) and save. The status log records who changed what, and when.',
      'Tap Send to Parent: the email is written in Spanish first, then English, ready to send from your own mail.',
      'Export the record as PDF or Excel for a meeting, or escalate it to the principal.',
    ],
    shot: { src: 'desktop-incident-detail', alt: 'Incident detail with save, status log, export, send to parent and escalate buttons', kind: 'desktop' },
  },
  {
    id: 'mtss',
    start: 76,
    title: 'MTSS',
    who: ['Counselors and admins', 'Teachers can view'],
    headline: 'Support that grows with need.',
    purpose: 'Track Multi-Tiered System of Supports interventions with goals, progress checks and end dates.',
    steps: [
      'See how many students are in each tier: Tier 1 school-wide, Tier 2 targeted and Tier 3 intensive.',
      'Create an intervention with its goal, how progress will be monitored, the exit criteria and a planned end date.',
      'Filter to the 30-day check-ins that are due, update progress and export the list as a PDF.',
    ],
    shot: { src: 'desktop-mtss', alt: 'MTSS interventions grouped by tier', kind: 'desktop' },
  },
  {
    id: 'recognition',
    start: 89,
    title: 'Recognition',
    who: ['All staff'],
    headline: 'Catch students doing the right thing.',
    purpose: 'Positive behavior is tracked next to discipline, the PBIS way, so the school sees both sides of every student.',
    steps: [
      'Tap Recognize a Student, pick the student and a value: Respect, Responsibility, Integrity, Kindness, Leadership or Excellence.',
      'Add points and a short note. It appears in the feed, on the leaderboard and on the student profile.',
      'Watch the positive to corrective ratio. The PBIS goal is 4 recognitions for every correction.',
    ],
    tip: 'Recognitions also lower a student’s early-warning score in Insights.',
    shot: { src: 'mobile-recognition', alt: 'Recognize a student sheet on a phone', kind: 'phone' },
    extra: { src: 'desktop-recognition', alt: 'Recognition page with totals, feed and leaderboard', kind: 'desktop' },
  },
  {
    id: 'insights',
    start: 103,
    title: 'Insights',
    who: ['All staff'],
    headline: 'Spot who needs help early.',
    purpose: 'An early-warning score from incidents, suspensions, MTSS tiers and recognitions. Every point of the score has a reason you can read.',
    steps: [
      'Start with the tiles: high risk, moderate risk, IEP/504 removal alerts and the PBIS ratio.',
      'Check the manifestation determination list: students with a plan who are near or past 10 days of removal.',
      'Read each student’s reasons, such as incidents in the last 30 days or suspension days. Recognitions lower the score.',
    ],
    tip: 'Scores of 60 or more are high risk, 30 to 59 moderate. Tap a student to open their profile.',
    shot: { src: 'desktop-insights', alt: 'Insights with risk tiles, removal alerts and students to watch', kind: 'desktop' },
  },
  {
    id: 'referrals',
    start: 116,
    title: 'Referrals',
    who: ['Any staff member files', 'Coordinators review'],
    headline: 'Refer a student to the coordinators.',
    purpose: 'The Secondary Disciplinary Referral, filed in the app instead of on paper and kept confidential to the coordinators.',
    steps: [
      'Open Referrals and fill in the form: the students involved, their strengths, what happened, what you tried and what you suggest.',
      'Send it. Coordinators get it in their inbox (and by email when the school turns email on). You can always see the referrals you filed.',
      'Coordinators move each referral from New to In review to Closed and keep notes on it.',
    ],
    shot: { src: 'desktop-referrals', alt: 'Coordinator referral inbox with New and In review referrals', kind: 'desktop' },
  },
  {
    id: 'reports',
    start: 130,
    title: 'Reports and codes',
    who: ['All staff', 'Admins edit codes'],
    headline: 'Reports and the school codes.',
    purpose: 'Ready-made reports for meetings, and the PlusPortals code sets kept in one place.',
    steps: [
      'Open Reports and pick one: incidents by grade, by category, the top 10 students or the monthly summary. Print it or save a PDF.',
      'On Incidents, filter the list any way you like and export it to Excel.',
      'Admins keep the five code sets (infractions, penalties, actions, served statuses and locations) in sync with PlusPortals on the Violations page.',
    ],
    shot: { src: 'desktop-violations', alt: 'PlusPortals SIS code sets for penalties, actions, served statuses and locations', kind: 'desktop' },
  },
  {
    id: 'families',
    start: 143,
    title: 'Families',
    who: ['Parents', 'Students'],
    headline: 'A private view for families.',
    purpose: 'Parents see only their own child. Students see only themselves. Nothing else in the app is reachable from a family account.',
    steps: [
      'Families sign in with the account the school gives them and land on their own page, with conduct points and standing.',
      'They see each incident and recognition, without staff notes, witnesses or other students’ names.',
      'The school links each account to the right student. Until a link is verified, the page shows nothing.',
    ],
    shot: { src: 'mobile-family', alt: 'Family page on a phone with a student’s points, incidents and recognitions', kind: 'phone' },
  },
  {
    id: 'everywhere',
    start: 155,
    title: 'Works your way',
    who: ['Everyone'],
    headline: 'Works your way.',
    purpose: 'On a phone or a computer, in English or Spanish, light or dark.',
    steps: [
      'Press Ctrl K (or tap Search on a phone) to find any student, screen or action.',
      'Switch between English and Spanish with one tap. Every screen is translated.',
      'Light and dark mode follow your device, or pick one in Settings.',
      'Add it to your phone’s home screen and sign in with your fingerprint next time.',
    ],
    shot: { src: 'desktop-dashboard-es', alt: 'Dashboard in Spanish', kind: 'desktop' },
    extra: { src: 'desktop-dashboard-dark', alt: 'Dashboard in dark mode', kind: 'desktop' },
  },
  {
    id: 'security',
    start: 170,
    title: 'Privacy and security',
    who: ['Admins', 'Coordinators'],
    headline: 'Private by design.',
    purpose: 'Every role sees only what it needs, and every account is protected.',
    steps: [
      'Admins and coordinators create accounts on the Users page and choose each person’s role. Only admins can manage admin accounts.',
      'A password set by an admin is temporary: each person chooses their own at their first sign-in.',
      'Ten wrong passwords lock an account for 15 minutes. Changing a password signs out every other device.',
    ],
    shot: { src: 'mobile-password', alt: 'Choose a new password screen on a phone', kind: 'phone' },
    extra: { src: 'desktop-users', alt: 'User management with roles', kind: 'desktop' },
  },
];

/** Who can do what. 'yes', 'view' (read only), 'own' (only their own), or ''. */
export const roles = ['Teacher', 'Counselor', 'Principal', 'Coordinator', 'Admin', 'Family'] as const;
export const permissions: { label: string; access: string[] }[] = [
  { label: 'Dashboard, roster and student profiles', access: ['yes', 'yes', 'yes', 'yes', 'yes', ''] },
  { label: 'Log and update incidents', access: ['yes', 'yes', 'yes', 'yes', 'yes', ''] },
  { label: 'Learning support plans', access: ['view', 'yes', 'yes', 'yes', 'yes', ''] },
  { label: 'MTSS interventions', access: ['view', 'yes', 'view', 'yes', 'yes', ''] },
  { label: 'Recognition and Insights', access: ['yes', 'yes', 'yes', 'yes', 'yes', ''] },
  { label: 'File a referral', access: ['yes', 'yes', 'yes', 'yes', 'yes', ''] },
  { label: 'Read the referral inbox', access: ['own', 'own', 'own', 'yes', 'own', ''] },
  { label: 'Users, settings and SIS codes', access: ['', '', '', 'yes', 'yes', ''] },
  { label: 'Family page (own child only)', access: ['', '', '', '', '', 'yes'] },
];

export const roleGuides = [
  { role: 'Teachers', points: ['Log an incident with SIS codes', 'See accommodations before acting', 'Recognize good choices', 'File a referral'], links: ['incidents', 'support', 'recognition', 'referrals'] },
  { role: 'Counselors', points: ['Manage learning support plans', 'Run MTSS interventions', 'Watch early-warning Insights', 'Follow up with families'], links: ['support', 'mtss', 'insights', 'follow-up'] },
  { role: 'Coordinators', points: ['Review the referral inbox', 'Manage accounts and roles', 'Keep codes in sync', 'Everything an admin can do'], links: ['referrals', 'security', 'reports', 'dashboard'] },
  { role: 'Principals and admins', points: ['Start on the dashboard', 'Escalations and reports', 'IDEA removal safeguards', 'School-wide settings'], links: ['dashboard', 'reports', 'support', 'security'] },
  { role: 'Parents and students', points: ['Your child’s conduct points', 'Incidents and recognitions', 'Change your password', 'Nothing about other students'], links: ['families'] },
];

export const faqs = [
  { q: 'Do I need to install anything?', a: 'No. Open the app in any browser on a phone, tablet or computer. You can add it to your home screen so it opens like an app, and turn on fingerprint sign-in.' },
  { q: 'Is it in Spanish?', a: 'Yes. Every screen switches between English and Spanish with the EN/ES toggle, and emails to parents are written in Spanish first, then English.' },
  { q: 'Do the codes match PlusPortals?', a: 'Yes. Infractions, penalties, actions, served statuses and locations use the same codes as the PlusPortals discipline entry, and admins can edit them on the Violations page.' },
  { q: 'Who can see a student’s record?', a: 'Staff see the records their role needs (see the table above). Referrals are visible only to coordinators and to the person who filed them. Families see only the students linked to their account.' },
  { q: 'I forgot my password. What do I do?', a: 'Ask a coordinator or an admin to set a temporary password on the Users page. When you sign in with it, the app asks you to choose a new one that only you know.' },
  { q: 'Why is my account locked?', a: 'After 10 wrong passwords the account locks for 15 minutes to stop guessing. Wait, then try again, or ask an admin to set a temporary password.' },
];
