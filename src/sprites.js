// Sprite sheets are stored as small animated AVIF files (see scripts/to-avif.js). This unpacks one
// into the sprite sheet the players draw from: every frame laid out on a grid, `cols` per row.
window.loadSpriteSheet = async function loadSpriteSheet(url, frames, m) {
  const data = await (await fetch(url)).arrayBuffer();
  const dec = new ImageDecoder({ data, type: 'image/avif', preferAnimation: true });
  try {
    await dec.tracks.ready;
    const sheet = new OffscreenCanvas(m.cols * m.frameW, Math.ceil(frames / m.cols) * m.frameH);
    const ctx = sheet.getContext('2d');
    for (let i = 0; i < frames; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      ctx.drawImage(image, (i % m.cols) * m.frameW, Math.floor(i / m.cols) * m.frameH, m.frameW, m.frameH);
      image.close();
    }
    return sheet.transferToImageBitmap();
  } finally { dec.close(); }
};
