// Renders a contact sheet of selected frames for visual checking.
// usage: node scripts/preview.js <out.png> [avatarIds] [seq:frame,...]
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const avatars = require('./lib/avatars');
const { drawCharacter } = require('./lib/character');
const { buildSequences } = require('./lib/motion');
const out = process.argv[2];
const ids = (process.argv[3] || 'all');
const picks = (process.argv[4] || 'walkLeft:0,walkLeft:4,walkLeft:8,walkLeft:12,turnFront:6,wave:20,idle:0,walkRight:3').split(',').map(s => s.split(':'));
const seqs = buildSequences();
const list = ids === 'all' ? avatars : avatars.filter(a => ids.split(',').includes(a.id));
const S = 1.5, W = 220, H = 300;
let body = '';
list.forEach((av, r) => picks.forEach(([sq, f], col) => {
  const fr = seqs[sq].frames[+f];
  body += `<g transform="translate(${col * W * S},${r * H * S}) scale(${S})"><rect width="${W}" height="${H}" fill="#eef3f7" stroke="#ccc"/><line x1="0" y1="290" x2="220" y2="290" stroke="#bbb"/>${drawCharacter(fr.pose, av, `p${r}_${col}`)}</g>`;
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${picks.length * W * S}" height="${list.length * H * S}">${body}</svg>`;
fs.writeFileSync(out, new Resvg(svg).render().asPng());
console.log('ok', out);
