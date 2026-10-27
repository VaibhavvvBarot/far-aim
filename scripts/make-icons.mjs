// Draws the app icon from Vaibhav Barot's compass-rose logo (the same mark as his website, vfly-site).
import sharp from 'sharp';
const ROSE = [
  ['M12 12L12 1.5L13.3 10.7Z', '#E8C68A'], ['M12 12L13.3 10.7L22.5 12Z', '#6E4E1C'],
  ['M12 12L22.5 12L13.3 13.3Z', '#E8C68A'], ['M12 12L13.3 13.3L12 22.5Z', '#6E4E1C'],
  ['M12 12L12 22.5L10.7 13.3Z', '#E8C68A'], ['M12 12L10.7 13.3L1.5 12Z', '#6E4E1C'],
  ['M12 12L1.5 12L10.7 10.7Z', '#E8C68A'], ['M12 12L10.7 10.7L12 1.5Z', '#6E4E1C'],
];
// scale: how much of the square the rose fills (maskable icons need a safe margin)
const svg = (scale) => {
  const s = (512 * scale) / 24, off = (512 - 24 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#16233A"/>
<g transform="translate(${off} ${off}) scale(${s})">${ROSE.map(([d, f]) => `<path d="${d}" fill="${f}"/>`).join('')}</g>
</svg>`;
};
await sharp(Buffer.from(svg(0.8))).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(svg(0.8))).resize(192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(svg(0.6))).resize(512).png().toFile('public/icons/icon-maskable-512.png');
await sharp(Buffer.from(svg(0.78))).resize(180).png().toFile('public/icons/apple-touch-icon.png');
