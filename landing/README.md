# SCCS Discipline Tracker — landing page

A static, bilingual (EN/ES) page that introduces the app with the product-tour video
(`assets/sccs-tour.mp4`, made with HyperFrames — source in `../marketing/video`).
No build step and no third-party requests.

## Deploy on Vercel

1. In Vercel, **Add New → Project** and import this repository.
2. Set **Root Directory** to `landing` and **Framework Preset** to **Other**
   (leave the build and output settings empty).
3. Deploy. Every push to the branch you pick redeploys the page.

This only hosts the landing page. The app itself keeps its SQLite database on disk, so it
needs a host with a persistent volume (see the root README, "Deploying"); Vercel would lose
its data.

## Preview locally

```bash
npx serve landing
```

(Plain `python -m http.server` cannot seek the video, so the chapter links won't jump.)

## Update the video

Edit the scenes in `../marketing/video/compositions/`, then from `marketing/video`:

```bash
npx hyperframes@0.8.210 check
npx hyperframes@0.8.210 render -o renders/master.mp4
ffmpeg -i renders/master.mp4 -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an ../../landing/assets/sccs-tour.mp4
```

If you change scene lengths, update the chapter times (`data-t`) in `index.html`.
