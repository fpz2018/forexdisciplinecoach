const sharp = require('sharp');
const path = require('path');

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f172a"/>
  <rect x="32" y="32" width="448" height="448" rx="72" fill="#10b981"/>
  <text x="256" y="290" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="200" fill="white">FX</text>
  <polyline points="120,360 200,310 280,340 360,280 400,300" fill="none" stroke="white" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
</svg>`);

const iconsDir = path.join(__dirname, '..', 'public', 'icons');

async function generate() {
  await sharp(svg).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'));
  await sharp(svg).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'));
  console.log('Icons generated: icon-192.png, icon-512.png');
}

generate().catch(console.error);
