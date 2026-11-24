// The five characters of the reference picture. All coordinates are reference-image pixels.
//   src/assets/main-reference/Five Cheerful Chibi Women with Water Bottles.png
// `cx` is the body/face centre line, the ground is at y = 805.
const SKIN = { base: '#fdc6a2', light: '#ffdcc2', shade: '#eda77f', deep: '#d4805f' };

module.exports = [
  {
    id: 'lavender', name: 'Lavender', tagline: 'Wavy hair, lilac smocked top',
    skin: SKIN, cx: 216, x0: 14, x1: 400,
    head: {
      eyes: [[163, 337], [268, 337]], mouth: [215, 378], ears: [[112, 360], [316, 360]], capY: 327, longHair: true,
      // occluders in front of the long hair (arm + bottle, body, free arm)
      occ: [[[120, 402], [172, 402], [172, 440], [150, 575], [118, 535]], [[150, 420], [282, 420], [300, 620], [150, 620]],
        [[245, 440], [282, 438], [318, 470], [318, 500], [312, 540], [330, 570], [340, 620], [270, 620]]],
      hairFill: [[86, 330], [100, 250], [330, 250], [346, 330], [346, 400], [350, 440], [352, 500], [330, 548], [300, 553], [280, 572], [252, 558], [230, 576], [204, 560], [180, 574], [150, 562], [126, 568], [108, 540], [96, 500], [96, 440], [90, 400]],
    },
    top: { kind: 'peplum', color: '#b273c2', shade: '#92589f', light: '#d09bdb', line: '#83489a', sleeve: 'puff', bare: true },
    sections: [[429, 24, 17], [438, 48, 24], [452, 53, 27], [472, 45, 31], [500, 41, 30], [522, 42, 30], [550, 55, 40], [577, 68, 50]],
    hemSag: 7, legs: { kind: 'flare', color: '#7593c4', shade: '#5c79ad', light: '#a9c3e8', w: [64, 56, 58] },
    shoes: { color: '#ffffff', shade: '#e3d6cd', sole: '#cdbdb3', kind: 'sneaker' }, necklace: 'heart',
  },
  {
    id: 'mint', name: 'Mint', tagline: 'Sleek side braid, pearl earrings & mint shirt',
    skin: SKIN, cx: 551, x0: 396, x1: 706,
    head: {
      eyes: [[502, 333], [601, 333]], mouth: [552, 378], ears: [[443, 358], [662, 358]], capY: 327,
      drops: [{ kind: 'disc', box: [434, 367, 464, 397], at: [449, 360] }, { kind: 'disc', box: [636, 367, 666, 397], at: [651, 360] }], boxes: [[404, 330, 440, 392]],
    },
    top: { kind: 'shirt', color: '#d3ebc8', shade: '#b4d4ab', light: '#eef9e8', line: '#86b184', sleeve: 'elbow' },
    sections: [[423, 24, 17], [432, 42, 24], [446, 50, 28], [475, 48, 32], [510, 52, 34], [550, 61, 40], [592, 73, 50]],
    hemSag: 6, legs: { kind: 'pants', color: '#443c46', shade: '#332c36', light: '#7d6f76', w: [62, 50, 48] },
    shoes: { color: '#ffffff', shade: '#e3d6cd', sole: '#cdbdb3', kind: 'sneaker' }, braid: 'front',
  },
  {
    id: 'pearl', name: 'Pearl', tagline: 'Curly bun, gold specs & floral kurta',
    skin: SKIN, cx: 873, x0: 712, x1: 1022,
    head: {
      eyes: [[824, 345], [920, 345]], mouth: [875, 386], ears: [[767, 362], [988, 360]], capY: 330,
      lens: [[817, 345, 43], [934, 345, 43]], rim: '#d9962a', extra: [[779, 337, 11], [977, 337, 11]], chinY: 424, drops: [{ kind: 'curl', box: [752, 372, 792, 420], at: [776, 366] }, { kind: 'curl', box: [962, 372, 1002, 418], at: [982, 366] }],
    },
    top: { kind: 'kurta', color: '#a3a1a4', shade: '#86858a', light: '#c4c3c6', line: '#6c6b70', sleeve: 'long' },
    sections: [[428, 24, 17], [436, 42, 24], [450, 48, 28], [480, 46, 31], [530, 51, 35], [580, 63, 46], [615, 73, 54], [657, 87, 64]],
    hemSag: 7, legs: { kind: 'bare', color: '#f9efde', shade: '#e2d3bb', light: '#fffaf0', w: [54, 47, 36] },
    shoes: { color: '#535053', shade: '#39373a', sole: '#2c2a2d', kind: 'flat' }, print: 'flowers', cardigan: true, neckband: '#2f2a2d',
  },
  {
    id: 'ruby', name: 'Ruby', tagline: 'Curly hair, round glasses, floral dress',
    skin: SKIN, cx: 1217, x0: 1018, x1: 1412,
    head: {
      eyes: [[1165, 337], [1268, 337]], mouth: [1216, 381], ears: [[1112, 358], [1319, 358]], capY: 328, longHair: true,
      lens: [[1160, 341, 41], [1270, 341, 41]], rim: '#1e1012', drops: [{ kind: 'light', box: [1104, 368, 1130, 412], at: [1117, 366] }, { kind: 'light', box: [1303, 368, 1330, 412], at: [1316, 366] }],
      occ: [[[1126, 404], [1180, 404], [1180, 440], [1170, 530], [1140, 545], [1120, 500]], [[1172, 420], [1285, 420], [1320, 620], [1112, 620], [1135, 586], [1160, 530]],
        [[1245, 428], [1282, 428], [1314, 470], [1314, 510], [1312, 560], [1335, 575], [1335, 625], [1270, 625]]],
      hairFill: [[1096, 330], [1112, 250], [1320, 250], [1346, 330], [1350, 400], [1350, 440], [1356, 490], [1342, 540], [1326, 566], [1300, 578], [1276, 594], [1250, 580], [1226, 596], [1200, 580], [1174, 594], [1146, 580], [1120, 582], [1104, 560], [1100, 510], [1096, 450], [1084, 400]],
    },
    top: { kind: 'dress', color: '#d43c47', shade: '#b02d39', light: '#f3707a', line: '#8f1e2b', sleeve: 'puff' },
    sections: [[430, 24, 17], [438, 44, 24], [452, 50, 28], [480, 45, 31], [520, 43, 31], [550, 51, 37], [578, 60, 45], [620, 76, 56], [664, 92, 66]],
    hemSag: 8, seam: 574, legs: { kind: 'bare', color: '#fdc6a2', shade: '#eda77f', light: '#ffdcc2', w: [50, 44, 34] },
    shoes: { color: '#3a2226', shade: '#23130f', sole: '#1a0d0e', kind: 'flat' }, print: 'roses', scarf: '#2f2a2d', collar: true,
  },
  {
    id: 'scarlet', name: 'Scarlet', tagline: 'Twin braids, red kurta & ID lanyard',
    skin: SKIN, cx: 1560, x0: 1412, x1: 1716,
    head: {
      eyes: [[1511, 333], [1614, 333]], mouth: [1563, 379], ears: [[1450, 358], [1676, 358]], capY: 327,
    },
    top: { kind: 'kurta', color: '#e1474c', shade: '#bb343c', light: '#ff8086', line: '#97252f', sleeve: 'long' },
    sections: [[428, 24, 17], [436, 42, 24], [450, 49, 28], [480, 47, 31], [530, 51, 35], [568, 60, 44], [610, 72, 54], [647, 85, 62]],
    hemSag: 7, seam: 566, legs: { kind: 'bare', color: '#40373f', shade: '#302930', light: '#7d6f76', w: [54, 46, 34] },
    shoes: { color: '#b06a47', shade: '#84482c', sole: '#5a2d1a', kind: 'flat' }, dupatta: '#3b3338', lanyard: '#2f6fd0', braid: 'back',
  },
];
