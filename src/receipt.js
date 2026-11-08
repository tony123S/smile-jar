// receipt.js: draws the shareable "Smile Receipt" card on a canvas and returns a PNG blob.
// It contains only the session totals the user just saw. No camera frame, face or name is drawn.

const W = 1080, H = 1350;

function svgToImage(svg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {object} r
 * @param {string} r.title        e.g. "Smile Session" or "Try Not to Smile"
 * @param {string} r.headline     e.g. "12 smiles"
 * @param {string} r.pledged      e.g. "$1.80"
 * @param {string} r.cause
 * @param {string[]} r.lines      extra stat lines
 * @param {string} r.persona      e.g. "You're a pun person"
 * @param {string} r.jarSvg       standalone SVG markup of the jar
 * @param {Date}   r.date
 */
export async function drawReceipt(r) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const font = (w, s) => `${w} ${s}px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, "Segoe UI", sans-serif`;

  // background + paper
  c.fillStyle = '#ffe2a8';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#fffdf8';
  c.beginPath();
  c.roundRect(70, 70, W - 140, H - 140, 36);
  c.fill();
  // zig-zag receipt edge at the bottom
  c.fillStyle = '#ffe2a8';
  for (let x = 70; x < W - 70; x += 40) {
    c.beginPath();
    c.moveTo(x, H - 70);
    c.lineTo(x + 20, H - 96);
    c.lineTo(x + 40, H - 70);
    c.fill();
  }

  c.textAlign = 'center';
  c.fillStyle = '#ef6f5e';
  c.font = font(800, 30);
  c.fillText('SMILE RECEIPT', W / 2, 150);
  c.fillStyle = '#7a6a5a';
  c.font = font(600, 26);
  c.fillText(`${r.title} · ${r.date.toLocaleDateString()}`, W / 2, 192);

  const jar = await svgToImage(r.jarSvg);
  if (jar) c.drawImage(jar, W / 2 - 150, 220, 300, 330);

  c.fillStyle = '#2b2118';
  c.font = font(800, 92);
  c.fillText(r.headline, W / 2, 650);
  c.font = font(800, 64);
  c.fillStyle = '#ef6f5e';
  c.fillText(`${r.pledged} pledged`, W / 2, 735);
  c.fillStyle = '#2b2118';
  c.font = font(600, 34);
  wrap(c, `for ${r.cause}`, W - 260).forEach((l, i) => c.fillText(l, W / 2, 795 + i * 42));

  // dashed divider
  c.strokeStyle = '#d9c7ad';
  c.lineWidth = 3;
  c.setLineDash([14, 12]);
  c.beginPath();
  c.moveTo(140, 880);
  c.lineTo(W - 140, 880);
  c.stroke();
  c.setLineDash([]);

  c.font = font(700, 34);
  c.fillStyle = '#2b2118';
  let y = 945;
  for (const line of r.lines.slice(0, 4)) { c.fillText(line, W / 2, y); y += 52; }
  if (r.persona) {
    c.fillStyle = '#7b4cd8';
    c.font = font(800, 38);
    c.fillText(r.persona, W / 2, y + 10);
  }

  c.fillStyle = '#7a6a5a';
  c.font = font(600, 24);
  c.fillText('Counted live by the SmartSpectra SDK · nothing recorded · #presagechallenge', W / 2, H - 130);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
