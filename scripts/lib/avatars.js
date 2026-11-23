// Character definitions. Each one is modelled closely on one of the reference stickers in /assets
// (face, hair style, accessories, outfit colours) and re-drawn as a full-body walking character.
const SKIN = { base: '#f5c8a6', light: '#fbdcc4', shade: '#e4a888', deep: '#cf8f72', blush: '#f2878f' };
const HAIR = { base: '#1f1b23', top: '#3a3441', mid: '#433c4d', gloss: '#7d7689', dark: '#0f0d12' };

module.exports = [
  {
    id: 'lavender',
    name: 'Lavender',
    tagline: 'Wavy hair, lilac smocked top',
    skin: SKIN, hair: HAIR, hairStyle: 'longWavy', eyeColor: '#3e3540',
    noseStud: true,
    top: { kind: 'offShoulder', color: '#9874bd', shade: '#7458a0', line: '#5f4585', sleeve: 'puff' },
    necklace: { kind: 'heart', color: '#e3e6ec' },
    bottom: { kind: 'pants', color: '#5f7fb3', shade: '#46639a', line: '#3b5486' },
    shoes: { kind: 'sneaker', color: '#fbfaf8', shade: '#dcd5cf', sole: '#c9bfb7', accent: '#b49ad6' },
  },
  {
    id: 'ruby',
    name: 'Ruby',
    tagline: 'Curly hair, round glasses, floral dress',
    skin: SKIN, hair: HAIR, hairStyle: 'curlyLong', eyeColor: '#3a2f33',
    glasses: { color: '#3a2a2e', width: 1.6, size: 13.6 },
    earring: { kind: 'pearl' },
    top: { kind: 'dress', color: '#b83f4b', shade: '#8f2d39', line: '#6f1f2b', sleeve: 'shortPuff', print: 'roses', printColors: ['#6d1824', '#de6f7a', '#4b6b3a'] },
    scarf: { color: '#252227', shade: '#3d3943' },
    bottom: { kind: 'skirt', legs: 'skin' },
    shoes: { kind: 'flat', color: '#2c2529', shade: '#1b1619', sole: '#141113', accent: '#4a3e44' },
  },
  {
    id: 'scarlet',
    name: 'Scarlet',
    tagline: 'Twin braids, red kurta & ID lanyard',
    skin: SKIN, hair: HAIR, hairStyle: 'braids', eyeColor: '#43352f',
    top: { kind: 'kurta', color: '#dc4d51', shade: '#b03539', line: '#8f2a31', sleeve: 'long' },
    dupatta: { color: '#262329', shade: '#3c3842', style: 'drape' },
    lanyard: { color: '#3569ae', stripe: '#a7cbf2', card: '#ffffff' },
    bottom: { kind: 'kurtaHem', legs: 'leggings', legColor: '#2a272d', legShade: '#1a181c' },
    shoes: { kind: 'sandal', color: '#8b5b3e', shade: '#6c432c', sole: '#4c2f1f', accent: '#b07a55' },
  },
  {
    id: 'pearl',
    name: 'Pearl',
    tagline: 'Curly bun, gold specs & printed kurta',
    skin: SKIN, hair: HAIR, hairStyle: 'curlyBun', eyeColor: '#3f3330',
    glasses: { color: '#c99a3e', width: 2.4, size: 15.2, gold: true },
    top: { kind: 'kurta', color: '#8e939a', shade: '#6d727a', line: '#5a5f66', sleeve: 'threeQuarter', print: 'floralBright', printColors: ['#cf474d', '#e7b947', '#4f7cc4', '#6c9b59'] },
    dupatta: { color: '#a9aeb5', shade: '#8a9099', style: 'hang', print: true },
    neckband: { color: '#1e1e22' },
    bottom: { kind: 'kurtaHem', legs: 'leggings', legColor: '#efe8de', legShade: '#d3c9bc' },
    shoes: { kind: 'flat', color: '#767a80', shade: '#5a5e64', sole: '#44474b', accent: '#9a9ea4' },
  },
  {
    id: 'mint',
    name: 'Mint',
    tagline: 'Sleek side braid, hoops & mint shirt',
    skin: SKIN, hair: HAIR, hairStyle: 'slickBraid', eyeColor: '#3c3438',
    earring: { kind: 'hoop' },
    top: { kind: 'shirt', color: '#d2e8d3', shade: '#a9cbac', line: '#84a888', sleeve: 'elbow' },
    necklace: { kind: 'chain', color: '#d5d9df' },
    bottom: { kind: 'pants', color: '#3c4356', shade: '#2b3141', line: '#232836' },
    shoes: { kind: 'sneaker', color: '#fbfaf8', shade: '#dcd5cf', sole: '#c9bfb7', accent: '#9fc7a3' },
  },
];
