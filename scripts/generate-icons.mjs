// Regenerates every app icon from public/sccs.png: the shield is trimmed out of
// its margin and centered on white so it fills the icon. Run: node scripts/generate-icons.mjs
import sharp from 'sharp';

const SRC = 'public/sccs.png';
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const shield = await sharp(SRC).trim({ threshold: 20 }).toBuffer();

// `fill` is the share of the canvas height the shield takes.
async function icon(out, size, fill) {
  const h = Math.round(size * fill);
  const logo = await sharp(shield)
    .resize({ height: h, kernel: 'lanczos3' })
    .sharpen({ sigma: 0.6 })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: 'center' }])
    .flatten({ background: WHITE })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log('wrote', out);
}

await icon('public/icon-192.png', 192, 0.9);
await icon('public/icon-512.png', 512, 0.9);
// Maskable icons are cropped to a circle as small as 80% of the canvas.
await icon('public/icon-maskable-192.png', 192, 0.7);
await icon('public/icon-maskable-512.png', 512, 0.7);
// iOS adds its own rounded corners and never masks to a circle.
await icon('public/apple-touch-icon.png', 180, 0.86);
await icon('public/favicon-32.png', 32, 0.96);
