// Renders a contact sheet of selected frames for visual checking.
// usage: node scripts/preview.js <out.png> [avatarIds|all] [seq:frame,...] [zoom]
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const avatars = require('./rig/avatars');
const { buildHead } = require('./rig/head');
const { drawCharacter, defs } = require('./rig/body');
const { buildSequences } = require('./rig/motion');
const out = process.argv[2], ids = process.argv[3] || 'all';
const picks = (process.argv[4] || 'idle:0,wave:20,turnFront:6,walkLeft:0,walkLeft:4,walkLeft:8,walkLeft:14,walkRight:3,walkRight:18').split(',').map((s) => s.split(':'));
const seqs = buildSequences();
const list = ids === 'all' ? avatars : avatars.filter((a) => ids.split(',').includes(a.id));
const W = 480, H = 760, Z = +process.argv[5] || 0.45;
let body = '';
list.forEach((av, r) => {
  const hd = buildHead(av);
  body += defs(av);
  picks.forEach(([sq, f], k) => { body += `<g transform="translate(${k * W + W / 2},${r * H + H - 30})"><rect x="${-W / 2}" y="${-H + 30}" width="${W}" height="${H}" fill="#eef3f7" stroke="#ccc"/><path d="M-200,0h400" stroke="#bbb"/>${drawCharacter(seqs[sq].frames[+f].pose, av, hd, `p${r}_${k}`)}</g>`; });
});
fs.writeFileSync(out, new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${picks.length * W * Z}" height="${list.length * H * Z}" viewBox="0 0 ${picks.length * W} ${list.length * H}">${body}</svg>`).render().asPng());
console.log('ok', out);
