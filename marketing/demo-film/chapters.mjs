// The guided tour, chapter by chapter. Each chapter teaches one feature: what
// it is for, who uses it, and three or four steps. Every step can light up a
// part of a real screen.
//
// Highlight boxes are [x, y, width, height] in the 1440 x 900 CSS-pixel space
// of the desktop captures (measured with Playwright, see README). `img` is the
// screen shown from that step on; `phone` shows a phone capture beside it.

export const INTRO = 9;
export const OUTRO = 8;

export const chapters = [
  {
    title: 'The dashboard',
    who: ['All staff'],
    headline: 'Start every day on the dashboard.',
    lede: 'One screen tells you what happened, what is still open and who needs attention.',
    duration: 13,
    layout: 'window',
    steps: [
      { text: 'Check the totals: all, pending and resolved incidents, for today, this week or the whole year.', img: 'desktop-dashboard', hl: [[306, 213, 1086, 181]] },
      { text: 'Use quick actions to log an incident, recognize a student or run a report in one tap.', hl: [[282, 432, 1132, 116]] },
      { text: 'Open the alerts: students at high risk, IEP/504 removal limits and the positive to corrective ratio.', hl: [[282, 561, 1132, 64]] },
    ],
  },
  {
    title: 'Students',
    who: ['All staff'],
    headline: 'Know every student at a glance.',
    lede: 'The roster and each profile bring points, plans and history together.',
    duration: 13,
    layout: 'window',
    steps: [
      { text: 'Search the roster by name or student ID, or filter by grade.', img: 'desktop-students', hl: [[305, 185, 1086, 50]] },
      { text: 'Open a profile to see conduct points, standing and program badges like IEP or BIP.', img: 'desktop-profile', hl: [[337, 129, 1022, 165]] },
      { text: 'Log an incident or recognize the student right from the profile, with their plan in view.', hl: [[336, 478, 290, 44], [337, 547, 1022, 353]] },
    ],
  },
  {
    title: 'Log an incident',
    who: ['Teachers', 'Counselors', 'Principals'],
    headline: 'Log an incident in under a minute.',
    lede: 'The form uses the same PlusPortals codes the office enters in the SIS, so nothing is typed twice.',
    duration: 14,
    layout: 'window',
    steps: [
      { text: 'Pick the student and the infraction code, like PROFAN for profanity.', img: 'desktop-incident-codes', hl: [[412, 234, 616, 50]] },
      { text: 'Choose the location and the action taken, such as CLS Classroom and OR Office Referral.', hl: [[833, 143, 195, 50], [728, 625, 300, 50]] },
      { text: 'Choose a penalty. Detention hours or suspension days fill in for you, and the served status starts as Pending.', hl: [[412, 691, 616, 164]] },
    ],
  },
  {
    title: 'Learning support',
    who: ['All staff', 'Counselors and principals manage plans'],
    headline: 'See the plan before any consequence.',
    lede: 'IEP, 504, ELL, behavior, gifted and health plans travel with the student.',
    duration: 14,
    layout: 'window',
    steps: [
      { text: 'Pick a student with a plan and the form shows their needs and behavior guidance first.', img: 'desktop-incident-alert', hl: [[412, 300, 616, 153]] },
      { text: 'The app warns from day 8 of removal and requires a manifestation determination review past day 10, as IDEA does.', hl: [[412, 466, 616, 95]] },
      { text: 'Open the plan to see every accommodation by type: presentation, setting, timing and behavior.', img: 'desktop-plan-detail', hl: [[364, 439, 712, 245]] },
    ],
  },
  {
    title: 'Follow up',
    who: ['Teachers', 'Counselors', 'Principals'],
    headline: 'Follow through, then close it.',
    lede: 'Every incident keeps its status, its history and the conversation with home.',
    duration: 13,
    layout: 'window',
    steps: [
      { text: 'Update the status and save. The status log records who changed what, and when.', img: 'desktop-incident-detail', hl: [[360, 188, 304, 44]] },
      { text: 'Send to Parent writes the email in Spanish and English, ready to send from your mail.', hl: [[974, 188, 163, 44]] },
      { text: 'Export the record as PDF or Excel, or escalate it to the principal.', hl: [[672, 188, 294, 44], [360, 240, 202, 44]] },
    ],
  },
  {
    title: 'MTSS',
    who: ['Counselors and admins', 'Teachers can view'],
    headline: 'Support that grows with need.',
    lede: 'Track Tier 1, 2 and 3 interventions with goals, progress checks and end dates.',
    duration: 13,
    layout: 'window',
    steps: [
      { text: 'See how many students are in each tier, from school-wide prevention to intensive support.', img: 'desktop-mtss', hl: [[288, 180, 1120, 340]] },
      { text: 'Create an intervention with a goal, how progress is monitored and exit criteria.', hl: [[1224, 112, 184, 44]] },
      { text: 'Filter to the 30-day check-ins that are due, so no review slips.', hl: [[1186, 576, 205, 36]] },
    ],
  },
  {
    title: 'Recognition',
    who: ['All staff'],
    headline: 'Catch students doing the right thing.',
    lede: 'Positive behavior is tracked next to discipline, the PBIS way.',
    duration: 14,
    layout: 'window',
    steps: [
      { text: 'Tap Recognize, pick a student and a value: Respect, Responsibility, Integrity, Kindness, Leadership or Excellence.', img: 'desktop-recognition', phone: 'mobile-recognition', hl: [[1203, 112, 205, 44]] },
      { text: 'Add points and a short note. It appears in the feed and on the leaderboard.', hl: [[289, 429, 754, 471], [1093, 433, 290, 208]] },
      { text: 'Watch the positive to corrective ratio. The PBIS goal is 4 to 1.', hl: [[1131, 234, 277, 113]] },
    ],
  },
  {
    title: 'Insights',
    who: ['All staff'],
    headline: 'Spot who needs help early.',
    lede: 'An early-warning score from incidents, suspensions, MTSS tiers and recognitions. Every point has a reason.',
    duration: 13,
    layout: 'window',
    steps: [
      { text: 'Start with the tiles: high and moderate risk, IEP/504 removal alerts and the PBIS ratio.', img: 'desktop-insights', hl: [[288, 180, 1120, 113]] },
      { text: 'Manifestation determination alerts list students near or past 10 days of removal.', hl: [[288, 317, 1120, 265]] },
      { text: 'Each student lists the reasons behind the score. Recognitions lower it.', hl: [[289, 676, 1118, 82]] },
    ],
  },
  {
    title: 'Referrals',
    who: ['Any staff member files', 'Coordinators review'],
    headline: 'Refer a student to the coordinators.',
    lede: 'The Secondary Disciplinary Referral, filed in the app and kept confidential.',
    duration: 14,
    layout: 'window',
    steps: [
      { text: 'Fill in the referral: the students involved, their strengths, what happened and what you tried.', img: 'desktop-referral-form', hl: [[313, 286, 846, 240]] },
      { text: 'Only coordinators see the inbox. Teachers see just the referrals they filed.', img: 'desktop-referrals', hl: [[288, 180, 173, 38]] },
      { text: 'Coordinators move each referral from New to In review to Closed, with notes.', hl: [[288, 238, 264, 38], [289, 292, 894, 304]] },
    ],
  },
  {
    title: 'Reports and codes',
    who: ['All staff', 'Admins edit codes'],
    headline: 'Reports and the school codes.',
    lede: 'Ready-made reports for meetings, and the PlusPortals code sets kept in one place.',
    duration: 13,
    layout: 'window',
    steps: [
      { text: 'Open a ready-made report: by grade, by category, top students or the monthly summary. Print it or save a PDF.', img: 'desktop-reports', hl: [[288, 168, 1120, 252]] },
      { text: 'Export any filtered incident list to Excel.', img: 'desktop-incidents', hl: [[1134, 94, 110, 44]] },
      { text: 'Admins keep the infraction, penalty, action, served and location codes in sync with PlusPortals.', img: 'desktop-violations', hl: [[288, 168, 1120, 658]] },
    ],
  },
  {
    title: 'Families',
    who: ['Parents', 'Students'],
    headline: 'A private view for families.',
    lede: 'Parents see only their own child. Students see only themselves.',
    duration: 12,
    layout: 'phones',
    phones: ['mobile-family'],
    phoneScroll: 150,
    steps: [
      { text: 'Families sign in and land on their own page, with conduct points and standing.' },
      { text: 'They see each incident and recognition, without staff notes or other students’ names.' },
      { text: 'The school links each account to the right student. An unverified link shows nothing.' },
    ],
  },
  {
    title: 'Works your way',
    who: ['Everyone'],
    headline: 'Works your way.',
    lede: 'On a phone or a computer, in English or Spanish, light or dark.',
    duration: 15,
    layout: 'grid',
    tiles: ['desktop-palette', 'desktop-dashboard-es', 'desktop-dashboard-dark', 'mobile-dashboard'],
    steps: [
      { text: 'Press Ctrl K, or tap Search on a phone, to find any student or screen.' },
      { text: 'Switch between English and Spanish with one tap.' },
      { text: 'Light and dark mode follow your device, or pick one in Settings.' },
      { text: 'Install it on your phone’s home screen and sign in with your fingerprint.' },
    ],
  },
  {
    title: 'Privacy and security',
    who: ['Admins', 'Coordinators'],
    headline: 'Private by design.',
    lede: 'Every role sees only what it needs, and every account is protected.',
    duration: 14,
    layout: 'window',
    steps: [
      { text: 'Admins and coordinators create accounts and choose each person’s role.', img: 'desktop-users', hl: [[1278, 88, 130, 44], [1119, 181, 192, 50]] },
      { text: 'A password set by an admin is temporary. Each person chooses their own at first sign-in.', phone: 'mobile-password' },
      { text: 'Ten wrong passwords lock the account for 15 minutes. Changing a password signs out every other device.' },
    ],
  },
];

export const outro = {
  headline: 'You’re ready.',
  takeaways: [
    'Log incidents with the same codes as PlusPortals.',
    'See every student’s plan before you act.',
    'Recognize good choices as often as you correct.',
  ],
  cta: 'Sign in with your SCCS account',
};
