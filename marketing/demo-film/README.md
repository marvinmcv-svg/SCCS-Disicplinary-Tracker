# SCCS Student OS guided tour

The three-minute film on `/welcome`, written as a [HyperFrames](https://github.com/heygen-com/hyperframes) composition: plain HTML plus one paused GSAP timeline. Every asset is local, so a render needs no network.

It teaches the app in 13 chapters. Each chapter puts the lesson on the left (who it is for, a headline, a one-line purpose and three or four numbered steps) and a real screen on the right. As each step becomes active, a numbered ring lights up the part of the screen it talks about.

## Files

- `chapters.mjs`: the source of truth. Copy, steps, which screen each step shows and the highlight boxes (`[x, y, width, height]` in the 1440 x 900 CSS-pixel space of the desktop captures).
- `build.mjs`: turns `chapters.mjs` into `index.html` (the composition) and `chapters.json` (chapter start times).
- `assets/`: real captures of the app on the demo dataset, plus GSAP and the Geist font.

The landing page copy lives in `src/app/welcome/features.ts`, with each feature's `start` taken from `chapters.json`. Keep the two in step when a chapter changes.

## Build and render

```bash
cd marketing/demo-film
node build.mjs                          # writes index.html and chapters.json
npx hyperframes lint .                  # composition contract checks
npx hyperframes validate .              # runtime errors and text contrast
npx hyperframes snapshot . --at 12,40,95   # spot-check frames
npx hyperframes render . -o renders/sccs-tour.mp4 --quality standard -w 4
# web-size encode (about 13 MB) that can start playing before it finishes downloading
ffmpeg -i renders/sccs-tour.mp4 -c:v libx264 -crf 30 -preset slower -tune stillimage -g 150 \
  -pix_fmt yuv420p -movflags +faststart -an ../../public/welcome/sccs-tour.mp4
# poster: the chapter list on the intro card
ffmpeg -ss 7.2 -i renders/sccs-tour.mp4 -frames:v 1 -vf scale=1600:-1 /tmp/poster.png
```

Convert the poster to `public/welcome/sccs-tour-poster.webp`.

## Re-capturing the screens

Capture after UI changes so the film matches the product: run the app on the demo dataset (`SCCS_ROSTER=demo bun prisma/seed.ts`), sign in as the admin for staff screens (it sees the whole school), and capture desktop screens at 1440 x 900 (device scale 2) and phone screens at 393 x 852 (device scale 3). If a screen's layout changes, re-measure its highlight boxes in `chapters.mjs` (Playwright's `boundingBox()` on the element gives them directly).
