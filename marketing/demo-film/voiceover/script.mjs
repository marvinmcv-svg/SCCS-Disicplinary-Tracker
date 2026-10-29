// Narration for the guided tour, written to be read aloud by a London voice
// in British English. One recording per entry below (see SCRIPT.md, which
// build.mjs generates from this file for the voice artist).
//
// Each chapter has an opening line, then one line per on-screen step, in the
// same order as the steps in chapters.mjs. build.mjs times each step to start
// as the narrator reaches its line, so keep one line per step. Aim for about
// 50 words a chapter (20 seconds at a relaxed pace).

export const intro = {
  file: 'intro',
  lines: [
    'Hello, and welcome to S C C S Student O S.',
    'In the next few minutes, I’ll show you everything the app can do, in thirteen short chapters.',
  ],
};

export const chapters = [
  {
    file: 'c01',
    opening: 'Every school day starts on the dashboard.',
    steps: [
      'At the top are your totals: all incidents, pending and resolved, for today, this week or the whole year.',
      'Quick actions let you log an incident or recognise a student in one tap.',
      'And the alert cards show who needs your attention.',
    ],
  },
  {
    file: 'c02',
    opening: 'Next, your students.',
    steps: [
      'Search the roster by name or student I D, or filter by grade.',
      'Open a profile to see conduct points, standing, and badges such as I E P.',
      'You can log an incident or recognise the student from right here, with their plan in view.',
    ],
  },
  {
    file: 'c03',
    opening: 'Logging an incident takes less than a minute.',
    steps: [
      'Pick the student and the infraction code, like PROFAN, for profanity.',
      'Choose where it happened and the action taken, with the same PlusPortals codes the office uses.',
      'Then choose a penalty, and detention hours or suspension days fill themselves in.',
    ],
  },
  {
    file: 'c04',
    opening: 'Before any consequence, you’ll see the student’s plan.',
    steps: [
      'Choose a student with a learning support plan, and their needs appear first.',
      'The app warns you from day eight of removal, and asks for a review after day ten, following I D E A guidance.',
      'Open the plan to see every accommodation, sorted by type.',
    ],
  },
  {
    file: 'c05',
    opening: 'Every incident keeps its status, and its history.',
    steps: [
      'Update the status and save, and the log records who changed what.',
      'Send to Parent writes the email for you, in Spanish and English.',
      'And you can export a P D F or a spreadsheet, or escalate it to the principal.',
    ],
  },
  {
    file: 'c06',
    opening: 'M T S S tracks support that grows with need.',
    steps: [
      'See how many students are in each tier, from prevention to intensive support.',
      'Create an intervention with a goal, and how its progress will be checked.',
      'Then filter to the check-ins that are due, so no review slips through the net.',
    ],
  },
  {
    file: 'c07',
    opening: 'Recognition is about catching students doing the right thing.',
    steps: [
      'Tap Recognise, choose the student, and pick a value, like kindness or leadership.',
      'Add points and a short note, and it shows up in the feed and on the leaderboard.',
      'The goal is four recognitions for every correction.',
    ],
  },
  {
    file: 'c08',
    opening: 'Insights helps you spot who needs help, early.',
    steps: [
      'Start with the tiles: high and moderate risk, and removal alerts.',
      'This list shows students with a plan who are close to ten days of removal.',
      'And every score lists the reasons behind it.',
    ],
  },
  {
    file: 'c09',
    opening: 'Any member of staff can refer a student to the coordinators.',
    steps: [
      'Fill in what happened, the student’s strengths, and what you’ve already tried.',
      'Only the coordinators see the inbox.',
      'They move each referral from new, to in review, to closed.',
    ],
  },
  {
    file: 'c10',
    opening: 'Reports are ready made for your meetings.',
    steps: [
      'Pick one, then print it or save it as a P D F.',
      'Any list of incidents exports straight to Excel.',
      'And admins keep the school’s codes in step with PlusPortals.',
    ],
  },
  {
    file: 'c11',
    opening: 'Families get a private view of their own.',
    steps: [
      'Parents sign in and see their own child’s points and standing.',
      'They see each incident and recognition, but never staff notes, or anyone else’s name.',
      'And the school links every account to the right student.',
    ],
  },
  {
    file: 'c12',
    opening: 'It also works the way you do.',
    steps: [
      'Press Control K to find anyone in a second.',
      'Switch between English and Spanish with one tap.',
      'Choose light or dark.',
      'And add it to your phone, then sign in with your fingerprint.',
    ],
  },
  {
    file: 'c13',
    opening: 'Finally, privacy and security.',
    steps: [
      'Admins and coordinators create the accounts, and choose each person’s role.',
      'A password set by an admin is temporary, so everyone chooses their own when they first sign in.',
      'And after ten wrong attempts, the account locks for fifteen minutes.',
    ],
  },
];

export const outro = {
  file: 'outro',
  lines: [
    'And that’s the tour.',
    'Same codes as PlusPortals. Every plan before you act. And plenty of recognition.',
    'You’re ready. Sign in with your S C C S account.',
  ],
};
