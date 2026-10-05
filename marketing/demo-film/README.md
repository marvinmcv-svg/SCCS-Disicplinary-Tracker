# SCCS Student OS film

The 46-second product film on `/welcome`, written as a [HyperFrames](https://github.com/heygen-com/hyperframes) composition: plain HTML plus one paused GSAP timeline. Every asset is local, so a render needs no network.

```bash
cd marketing/demo-film
npx hyperframes lint .                 # composition contract checks
npx hyperframes snapshot . --at 8,19,34   # spot-check frames
npx hyperframes render . -o ../../public/welcome/sccs-demo.mp4 --quality standard
# web-size encode (about 2.5 MB) with fast start
ffmpeg -i ../../public/welcome/sccs-demo.mp4 -c:v libx264 -crf 27 -preset slow \
  -pix_fmt yuv420p -movflags +faststart -an /tmp/sccs-demo.mp4 && mv /tmp/sccs-demo.mp4 ../../public/welcome/sccs-demo.mp4
```

Screens in `assets/` are real captures of the app (seeded demo data, counselor account). Re-capture them after UI changes so the film matches the product.
