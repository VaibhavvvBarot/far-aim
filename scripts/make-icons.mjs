// Draws the app icon: a Class B-blue section sign inside a magenta airspace ring.
import sharp from 'sharp';
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#f5f6f2"/>
<circle cx="256" cy="256" r="${190 - pad}" fill="none" stroke="#a0246a" stroke-width="22" stroke-dasharray="2 0"/>
<circle cx="256" cy="256" r="${150 - pad}" fill="none" stroke="#a0246a" stroke-width="5" stroke-dasharray="14 10" opacity=".55"/>
<text x="256" y="${340 - pad/3}" font-family="DejaVu Serif, serif" font-weight="bold" font-size="${250 - pad*1.2}" text-anchor="middle" fill="#1f5fa8">§</text>
</svg>`;
await sharp(Buffer.from(svg(0))).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(svg(0))).resize(192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(svg(0))).resize(180).png().toFile('public/icons/apple-touch-icon.png');
