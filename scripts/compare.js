// Side-by-side: reference sticker vs generated portrait, for visual checking.
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const avatars = require('./lib/avatars');
const { drawCharacter, defs } = require('./lib/character');
const { buildSequences } = require('./lib/motion');
const refs = { lavender: '16.50.05.jpeg', ruby: '16.50.05 (1).jpeg', scarlet: '16.50.06.jpeg', pearl: '16.50.06 (1).jpeg', mint: '16.50.06 (2).jpeg' };
const seqs = buildSequences();
const pose = seqs.idle.frames[0].pose;
let body = '';
avatars.forEach((av, i) => {
  const b = fs.readFileSync('assets/WhatsApp Image 2026-11-23 at ' + refs[av.id]).toString('base64');
  body += `<image href="data:image/jpeg;base64,${b}" x="${i * 320}" y="-50" width="320" height="420" preserveAspectRatio="xMidYMid slice"/>`;
  body += `<svg x="${i * 320}" y="330" width="320" height="320" viewBox="40 36 140 140">${defs(av)}${drawCharacter(pose, av, 'c' + i)}</svg>`;
  body += `<svg x="${i * 320 + 60}" y="650" width="200" height="273" viewBox="0 0 220 300">${drawCharacter(seqs.walkLeft.frames[6].pose, av, 'w' + i)}</svg>`;
});
fs.writeFileSync(process.argv[2], new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="930"><rect width="1600" height="930" fill="#f2f5f8"/>${body}</svg>`).render().asPng());
console.log('ok');
