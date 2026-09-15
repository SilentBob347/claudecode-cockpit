#!/usr/bin/env node
/** Render one topic card per article from exported English metadata.
 * Both translations share the topic card. No runtime endpoint or font fetch.
 */
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = fileURLToPath(new URL('../out/', import.meta.url));
const target = `${out}/og/blog`;
mkdirSync(target, { recursive: true });
const escape = (text) => text.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, c) => ({
  amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'",
})[c]);
let count = 0;
for (const entry of readdirSync(`${out}/en/blog`, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const html = readFileSync(`${out}/en/blog/${entry.name}/index.html`, 'utf8');
  const match = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (!match) throw new Error(`Missing article title: ${entry.name}`);
  const title = decode(match[1]);
  // Monospace gives predictable line widths across build environments.
  const lines = [''];
  for (const word of title.split(/\s+/)) {
    const last = lines.length - 1;
    if (word.length > 29) throw new Error(`OG title word too long: ${title}`);
    if (lines[last] && `${lines[last]} ${word}`.length > 29) lines.push(word);
    else lines[last] += `${lines[last] ? ' ' : ''}${word}`;
  }
  if (lines.length > 4) throw new Error(`OG title needs a shorter layout: ${title}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#0d171c"/>
    <rect x="0" y="0" width="16" height="630" fill="#12a594"/>
    <circle cx="1100" cy="80" r="220" fill="#123831"/>
    <text x="80" y="100" fill="#9eeae0" font-size="26" font-family="monospace">OpenCockpit / Blog</text>
    ${lines.map((line, i) => `<text x="80" y="${220 + i * 70}" fill="#f7f9fa" font-family="monospace" font-size="54" font-weight="bold">${escape(line)}</text>`).join('')}
    <line x1="80" y1="530" x2="1120" y2="530" stroke="#31524f"/>
    <text x="80" y="580" fill="#9aa6b2" font-family="monospace" font-size="24">opencockpit.dev</text>
    <text x="1120" y="580" text-anchor="end" fill="#9eeae0" font-family="monospace" font-size="20">AI coding, in your hands.</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${target}/${entry.name}.png`);
  count++;
}
if (!count) throw new Error('No exported blog posts found');
console.log(`[og] Generated ${count} article cards (shared by English and Chinese)`);
