// receipt.js: draws the shareable "Smile Receipt" on a canvas and returns a PNG blob.
// It shows the monster drawing, qualifying smiles, sponsor pledges and the charity. It never
// contains a camera frame, a face, or any signal values. Pledges are labelled as promises.

const W = 1080, H = 1560;
const INK = '#4a3b5c', MUTED = '#7d6f8f', CORAL = '#e86b93', PURPLE = '#6a54b8';

function svgToImage(svg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function wrapText(measure, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (measure(test) > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function dashed(c, y) {
  c.strokeStyle = '#d9c7ad';
  c.lineWidth = 3;
  c.setLineDash([14, 12]);
  c.beginPath();
  c.moveTo(140, y);
  c.lineTo(W - 140, y);
  c.stroke();
  c.setLineDash([]);
}

/**
 * @param {object} r
 * @param {string} r.title           "Smile Monster"
 * @param {string} r.monsterSvg      standalone SVG markup of the monster
 * @param {string} r.monsterName     e.g. "Fluffy Furbun"
 * @param {string} r.stageLabel      e.g. "Level 3 · The Power of Joy"
 * @param {string} r.headline        e.g. "12 qualifying smiles"
 * @param {string} r.pledged         this session, e.g. "$1.80"
 * @param {string} r.cause           selected charity / cause
 * @param {{name, color, amount, note}[]} r.sponsors  this session's pledge per sponsor
 * @param {string} r.campaignPledged  campaign total pledged so far
 * @param {string} r.campaignConfirmed campaign total the user marked as donated
 * @param {string[]} r.lines         extra stat lines
 * @param {string} r.persona
 * @param {Date}   r.date
 */
export async function drawReceipt(r) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const font = (w, s) => `${w} ${s}px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, "Segoe UI", sans-serif`;

  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffd6e8');
  bg.addColorStop(0.5, '#e3dcff');
  bg.addColorStop(1, '#cdeedd');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#fffdf8';
  c.beginPath();
  c.roundRect(70, 60, W - 140, H - 120, 36);
  c.fill();
  c.fillStyle = '#cdeedd';
  for (let x = 70; x < W - 70; x += 40) {
    c.beginPath();
    c.moveTo(x, H - 60);
    c.lineTo(x + 20, H - 86);
    c.lineTo(x + 40, H - 60);
    c.fill();
  }

  c.textAlign = 'center';
  c.fillStyle = CORAL;
  c.font = font(800, 30);
  c.fillText('SMILE RECEIPT', W / 2, 130);
  c.fillStyle = MUTED;
  c.font = font(600, 26);
  c.fillText(`${r.title} · ${r.date.toLocaleDateString()}`, W / 2, 170);

  const img = await svgToImage(r.monsterSvg);
  if (img) c.drawImage(img, W / 2 - 160, 190, 320, 333);

  c.fillStyle = INK;
  c.font = font(800, 54);
  c.fillText(r.monsterName, W / 2, 580);
  c.fillStyle = PURPLE;
  c.font = font(700, 28);
  c.fillText(r.stageLabel, W / 2, 620);

  c.fillStyle = INK;
  c.font = font(800, 72);
  c.fillText(r.headline, W / 2, 715);
  c.fillStyle = CORAL;
  c.font = font(800, 52);
  c.fillText(`${r.pledged} pledged`, W / 2, 785);
  c.fillStyle = INK;
  c.font = font(600, 32);
  wrapText((t) => c.measureText(t).width, `for ${r.cause}`, W - 260).slice(0, 2)
    .forEach((l, i) => c.fillText(l, W / 2, 835 + i * 40));

  dashed(c, 900);

  // sponsor lines
  c.textAlign = 'left';
  let y = 955;
  for (const s of (r.sponsors || []).slice(0, 5)) {
    c.fillStyle = s.color || CORAL;
    c.beginPath();
    c.arc(160, y - 10, 11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = INK;
    c.font = font(700, 32);
    let name = s.name;
    while (c.measureText(name).width > 460 && name.length > 4) name = `${name.slice(0, -2)}…`;
    c.fillText(name, 186, y);
    const nameW = c.measureText(name).width;
    c.font = font(600, 24);
    c.fillStyle = MUTED;
    if (s.note) c.fillText(s.note, 186 + nameW + 16, y);
    c.textAlign = 'right';
    c.fillStyle = INK;
    c.font = font(800, 32);
    c.fillText(s.amount, W - 150, y);
    c.textAlign = 'left';
    y += 50;
  }
  if (!r.sponsors?.length) {
    c.fillStyle = MUTED;
    c.font = font(600, 28);
    c.fillText('No sponsors yet.', 160, y);
    y += 50;
  }

  c.textAlign = 'center';
  c.fillStyle = MUTED;
  c.font = font(600, 26);
  c.fillText(`Campaign so far: ${r.campaignPledged} pledged · ${r.campaignConfirmed} confirmed donated`, W / 2, y + 10);
  y += 60;

  dashed(c, y);
  y += 55;
  c.fillStyle = INK;
  c.font = font(700, 30);
  for (const line of (r.lines || []).slice(0, 3)) {
    if (y > H - 290) break; // keep clear of the footer
    c.fillText(line, W / 2, y);
    y += 42;
  }
  if (r.persona && y <= H - 245) {
    c.fillStyle = PURPLE;
    c.font = font(800, 34);
    c.fillText(r.persona, W / 2, y + 6);
  }

  c.fillStyle = MUTED;
  c.font = font(700, 24);
  c.fillText('Pledged means promised, not paid. Smile Monster processes no payments:', W / 2, H - 185);
  c.fillText('sponsors donate to the charity directly.', W / 2, H - 153);
  c.font = font(600, 22);
  c.fillText('Counted live by the Presage SmartSpectra SDK · nothing recorded · #presagechallenge', W / 2, H - 112);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
