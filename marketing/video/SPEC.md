# SCCS Discipline Tracker — product tour (SPEC)

GOAL:    A principal, counselor, teacher or parent who has never seen the app can say, at the end,
         what it does at each step of one real referral, and wants to try it.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, silent (plays muted on the landing page; no music
         source is configured — add a bed later with /media-use).
TIME:    106 s x 30 = 3180 frames. 13 scenes, cut on their own enter/exit moves.

STORY:   One worked example. 2:10 PM, Room 12, a student keeps disrupting a math lesson. The film
         follows that single referral through the app: the teacher records it, the codes match
         PlusPortals, the office follows through, the counselor sees the whole student and opens
         an MTSS plan, the family sees it, the principal sees the pattern. Then: who can do what,
         both languages, and the one line.

LOOK:    ground #F3F5FA (flat, no texture); ink #0F1B4C; body ink #46526E;
         school blue #1D4ED8 (the app's own primary) for chapter floods and highlight fills;
         one accent, red #DC2626, on one word per headline and on highlight rings only.
         Display: Inter 900, 84 px (7.8% of height), tracking -2.5%, max 2 lines.
         Body: Inter 400, 36 px, line-height 1.3, max 16 words.
         Labels on the UI: Inter 700, 28 px, white on #0F1B4C, 10 px radius, 12/18 px padding.
         Medium: the product's real UI. Desktop screens in a white window (radius 18 px, 36 px top
         bar, shadow 0 30 px 60 px rgba(15,27,76,0.18)); phone screens in a 22 px-radius device
         frame (#0F1B4C, 12 px bezel).
LAYOUT:  text column x 120–640; product window x 700–1820, y 190–890 (1120 x 700, 58% of width).
         Phones: 380 x 823, centred in the right region.
OBJECTS: real screenshots captured from the running app (demo data), labels pinned to the exact
         element they name (positions measured from the DOM at capture time).
MOTION:  enter: x +60 → 0, blur 10 → 0 px, opacity 0 → 1, 0.5 s expo.out; exit: x 0 → −50,
         blur 0 → 8 px, opacity → 0, 0.25 s power3.in (40–50% of the entrance).
         camera (punch-in / reframe on the window): 0.8 s power2.inOut, scale 1 → max 2.2.
         highlight ring: opacity 0 → 1 + scale 0.94 → 1, 0.3 s expo.out; label: blur 6 → 0 px,
         opacity 0 → 1, 0.2 s; staggers 0.35 s between targets; headline words 0.067 s apart.
SHOTS:   intro 0–5 s · title 5–9 · record 9–20 · penalty 20–28 · codes 28–35 · follow 35–46 ·
         profile 46–55 · mtss 55–64 · family 64–73 · leaders 73–85 · roles 85–94 ·
         languages 94–101 · end 101–106.
BANNED:  dark navy void, glow, gradients, glass cards, three cards in a row, KPI grids,
         numbered 01/02 labels, monospace caps labels, everything centred (except the end line),
         every element fading and sliding up, titles moving after they land, a title over a
         dimmed screenshot, the logo docked in a corner, click rings, invented numbers.
QA:      every label sits on its element at full zoom; every line holds 0.5 s + 0.3 s/word;
         nothing outside the 90% action-safe box; the parent scene shows only the linked child.
