import { DIRECTIONS, rng } from './engine.mjs';

export const HULL_COLORS = ['#ffefd0', '#86deba', '#ff9773', '#8ed7f0'];
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;

function line(ctx, points, color, width) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function disc(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function glow(ctx, x, y, r, color) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, r);
  light.addColorStop(0, color);
  light.addColorStop(1, 'transparent');
  disc(ctx, x, y, r, light);
}

function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function reef(ctx, x, y, random) {
  glow(ctx, x, y, 47, '#051719d9');
  const sides = 8;
  const shore = [];
  const rotation = random(35) / 35;
  const aspect = 0.85 + random(24) / 100;
  for (let i = 0; i < sides; i++) {
    const angle = rotation + i * TAU / sides + (random(15) - 7) / 45;
    const r = 24 + random(15);
    shore.push([x + r * Math.cos(angle), y + aspect * r * Math.sin(angle)]);
  }
  polygon(ctx, shore.map(([px, py]) => [x + (px - x) * 1.21, y + (py - y) * 1.21]),
    '#2c554b', '#6d8a6d60');
  polygon(ctx, shore, '#122623', '#9caa8080');
  const summit = [x - 8 + random(14), y - 3 - random(11)];
  for (let i = 0; i < sides; i++) {
    polygon(ctx, [shore[i], shore[(i + 1) % sides], summit],
      ['#3e5140', '#425a46', '#243c33', '#1c322e', '#182b28', '#243d33', '#324d3b', '#556650'][i], '#82967432');
  }
  for (const i of [0, 2, 4, 6]) {
    const [px, py] = shore[i];
    const edge = [mix(px, summit[0], 0.21), mix(py, summit[1], 0.37)];
    const crown = [mix(px, summit[0], 0.62), mix(py, summit[1], 0.73)];
    line(ctx, [[px, py], edge, crown], '#afae7873', 0.75);
    line(ctx, [[px + 2, py + 1], [edge[0] + 2, edge[1] + 1], [crown[0] + 4, crown[1] + 2]], '#0a201db0', 1.6);
  }
  for (let i = 0; i < 8; i++) {
    const px = x - 21 + random(44);
    const py = y - 20 + random(40);
    line(ctx, [[px - 4, py + 3], [px, py], [px + 7, py - 2]], '#8d9f743a', 0.7);
  }
}

function berth(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  glow(ctx, 0, 0, 44, '#dea85a37');
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = '#ebc681';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-26, -26, 52, 52);
  ctx.setLineDash([]);
  polygon(ctx, [[-26,-25],[-17,-25],[-17,17],[17,17],[17,-25],[26,-25],[26,26],[-26,26]], '#816248', '#e7b981');
  for (const side of [-1, 1]) {
    for (let i = -18; i <= 18; i += 7) line(ctx, [[side * 18, i], [side * 25, i]], '#382b25', 1);
    disc(ctx, side * 22, -22, 3.8, '#f7cc85');
  }
  line(ctx, [[-8,4],[0,11],[8,4]], '#f5d5a6', 2);
  ctx.restore();
}

function current(ctx, x, y, dir) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir * Math.PI / 2);
  for (const offset of [-20, 0, 20]) {
    line(ctx, [[-13,offset+9],[0,offset],[13,offset+9]], '#91d8d08c', 2);
    line(ctx, [[-20,offset+7],[-28,offset+12]], '#91d8d044', 1);
  }
  ctx.restore();
}

function tideGate(ctx, x, y, open) {
  glow(ctx, x, y, 43, open ? '#71e5ba30' : '#f6946440');
  for (const side of [-1, 1]) {
    const px = x + side * 25;
    line(ctx, [[px,y-22],[px,y+22]], '#b88a5e', 5);
    disc(ctx, px, y - 22, 3, open ? '#aaf1c8' : '#ffad80');
    disc(ctx, px, y + 22, 3, open ? '#aaf1c8' : '#ffad80');
  }
  for (let i = -14; i <= 14; i += 7) {
    line(ctx, [[x-24,y+i],[x + (open ? -13 : 24),y+i]], open ? '#78baa6' : '#db926a', 1.5);
    if (open) line(ctx, [[x+13,y+i],[x+24,y+i]], '#78baa6', 1.5);
  }
}

function buoy(ctx, x, y, lit) {
  const accent = lit ? '#a7ffd0' : '#ffe2a0';
  glow(ctx, x, y, 37, lit ? '#8ef7b66c' : '#f4ba4052');
  ctx.beginPath();
  ctx.arc(x, y, 19, 0, TAU);
  ctx.strokeStyle = lit ? '#a7ffd07d' : '#f1c874a6';
  ctx.lineWidth = 1;
  ctx.stroke();
  polygon(ctx, [[x,y-13],[x+11,y],[x,y+13],[x-11,y]], '#122c29', accent);
  polygon(ctx, [[x,y-10],[x+6,y],[x,y+7],[x-6,y]], accent);
}

function vessel(ctx, x, y, angle, hull, isTow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const hullGradient = ctx.createLinearGradient(-25,0,25,0);
  hullGradient.addColorStop(0, '#2b3d36');
  hullGradient.addColorStop(0.46, hull);
  hullGradient.addColorStop(1, '#84613f');
  if (isTow) {
    glow(ctx, 0, 0, 39, '#ffd1818c');
    polygon(ctx, [[-14,-15],[11,-15],[19,-8],[19,8],[11,15],[-14,15],[-19,8],[-19,-8]], '#432f26', '#f3bb76');
    polygon(ctx, [[-12,-11],[12,-11],[15,0],[12,11],[-12,11],[-15,0]], '#b5814e', '#ffdf93');
    for (let i = -9; i <= 9; i += 4.5) line(ctx, [[-12,i],[12,i]], '#754d32', 0.7);
    polygon(ctx, [[-7,-8],[6,-8],[10,0],[6,8],[-7,8],[-10,0]], '#f4bb61', '#4d3026');
    disc(ctx, 1, 0, 6.2, '#fff1ac');
    disc(ctx, 1, 0, 3.2, '#fff8da');
  } else {
    glow(ctx, 14, 0, 39, '#f8e3a43d');
    polygon(ctx, [[-19,-12],[3,-13],[14,-9],[24,0],[14,9],[3,13],[-19,12],[-23,0]], hullGradient, '#fff2d5');
    polygon(ctx, [[-17,-8],[3,-9],[15,-6],[19,0],[15,6],[3,9],[-17,8]], '#876b46', '#523f31');
    polygon(ctx, [[-10,-7],[5,-7],[12,-3],[12,3],[5,7],[-10,7]], '#184044', '#d4d0a8');
    polygon(ctx, [[8,-5],[13,-2],[13,2],[8,5]], '#b4e0dc');
    line(ctx, [[-14,-8],[-14,8]], '#f8db9a', 1.4);
    disc(ctx, -16, -9, 1.8, '#ed9e69');
    disc(ctx, -16, 9, 1.8, '#c4e2ba');
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const terrain = base.getContext('2d');
  let scene, chartCache, sizeCache, frame = 0, changedAt = 0;
  let previous, effects = [];
  const unit = 90;
  const center = (index, size) => [unit * (index % size + 0.5), unit * (Math.floor(index / size) + 0.5)];

  function bake(chart, px) {
    if (chartCache === chart && sizeCache === px) return;
    chartCache = chart;
    sizeCache = px;
    base.width = base.height = px;
    const side = chart.size * unit;
    const scale = px / side;
    terrain.setTransform(scale, 0, 0, scale, 0, 0);
    const wash = terrain.createLinearGradient(0, 0, side, side);
    wash.addColorStop(0, '#244d46');
    wash.addColorStop(0.5, '#163b3b');
    wash.addColorStop(1, '#0d2b32');
    terrain.fillStyle = wash;
    terrain.fillRect(0, 0, side, side);
    const random = rng(chart.tiles);
    for (let i = 0; i < side * 4; i++) {
      const x = random(side), y = random(side);
      const width = 1 + random(5);
      terrain.fillStyle = i % 3 ? '#a5d5bd15' : '#071c254c';
      terrain.fillRect(x, y, width, 0.7);
    }
    chart.tiles.split('').forEach((tile, i) => {
      const [x, y] = center(i, chart.size);
      terrain.strokeStyle = '#a9d5be2b';
      terrain.lineWidth = 1;
      terrain.strokeRect(x - unit / 2, y - unit / 2, unit, unit);
      const waveX = x - 24 + random(44);
      const waveY = y - 20 + random(40);
      line(terrain, [[waveX-7,waveY],[waveX+7,waveY-1],[waveX+13,waveY]], '#adcfaf35', 1);
      if (tile === '#') reef(terrain, x, y, random);
      if (tile === 'D') berth(terrain, x, y);
      const dir = '^>v<'.indexOf(tile);
      if (dir >= 0) current(terrain, x, y, dir);
    });
    const vignette = terrain.createRadialGradient(side/2, side/2, side/3, side/2, side/2, side * 0.75);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, '#0515196b');
    terrain.fillStyle = vignette;
    terrain.fillRect(0, 0, side, side);
  }

  function paint(time) {
    frame = 0;
    if (!scene || document.hidden) return;
    const { chart, state, hint, reduced, hull } = scene;
    const px = Math.max(1, Math.round(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
    if (canvas.width !== px || canvas.height !== px) canvas.width = canvas.height = px;
    bake(chart, px);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    const scale = px / (unit * chart.size);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineJoin = ctx.lineCap = 'round';
    const at = i => center(i, chart.size);
    chart.tiles.split('').forEach((tile, i) => {
      if (tile === 'G') tideGate(ctx, ...at(i), state.lit > 0);
    });
    for (const index of chart.buoys) buoy(ctx, ...at(index), (state.lit & chart.buoyMask[index]) !== 0);
    state.trail.forEach((index, i) => {
      const [x, y] = at(index);
      ctx.save();
      ctx.globalAlpha = 1 - i * 0.18;
      glow(ctx, x, y, 37, '#9bd8d240');
      for (let j = 0; j < 3; j++) {
        const row = y - 8 + j * 9;
        line(ctx, [[x-24,row+4],[x-8,row],[x+5,row+2],[x+25,row-3]], '#b7ebe3a1', 1.8);
        disc(ctx, x + 19 - j * 13, row - 6, 1.3, '#cef6e9');
      }
      ctx.restore();
    });

    if (hint >= 0) {
      const [x, y] = at(hint);
      glow(ctx, x, y, 53, '#ffe9a96b');
      ctx.strokeStyle = '#ffe5a2';
      ctx.lineWidth = 2.8;
      ctx.setLineDash([7, 6]);
      ctx.strokeRect(x - 39, y - 39, 78, 78);
      ctx.setLineDash([]);
    }

    const elapsed = time - changedAt;
    const motion = reduced || !previous ? 1 : Math.min(1, Math.max(0, elapsed / 145));
    const eased = 1 - (1 - motion) ** 3;
    const interpolate = key => {
      const to = at(state[key]);
      if (!previous || motion === 1) return to;
      const from = at(previous[key]);
      return [mix(from[0], to[0], eased), mix(from[1], to[1], eased)];
    };
    const [sx, sy] = interpolate('ship');
    const [bx, by] = interpolate('barge');
    const angle = Math.atan2(sy - by, sx - bx);
    line(ctx, [[bx,by],[mix(bx,sx,0.48),mix(by,sy,0.48)+3],[sx,sy]], '#1b2a28', 4);
    line(ctx, [[bx,by],[mix(bx,sx,0.48),mix(by,sy,0.48)+3],[sx,sy]], '#e9cc94', 1.4);
    vessel(ctx, bx, by, angle, hull, true);
    vessel(ctx, sx, sy, angle, hull, false);
    effects = effects.filter(effect => time - effect.start < 520);
    for (const { index, start } of effects) {
      const [x, y] = at(index);
      const t = Math.max(0, (time - start) / 520);
      ctx.save();
      ctx.globalAlpha = (1 - t) ** 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 18 + 33 * t, 0, TAU);
      ctx.strokeStyle = '#d6ffb7';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12 + 0.3;
        const d = 12 + (30 + i % 3 * 10) * t;
        disc(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 2.4 - t, '#ffe6a3');
      }
      ctx.restore();
    }
    if (motion < 1 || effects.length > 0) frame = requestAnimationFrame(paint);
  }

  const refresh = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  return {
    refresh,
    update(next, animate = false) {
      if (animate && scene?.chart === next.chart && !next.reduced) {
        previous = scene.state;
        changedAt = performance.now();
        next.chart.buoys.filter(i => (next.state.lit & ~previous.lit & next.chart.buoyMask[i]) !== 0)
          .forEach(index => effects.push({ index, start: changedAt }));
      } else if (scene?.state !== next.state || next.reduced) {
        previous = null;
        effects = [];
      }
      scene = next;
      refresh();
    },
    clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      scene = previous = null;
      effects = [];
    },
    point(clientX, clientY, size) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left) / rect.width * size);
      const y = Math.floor((clientY - rect.top) / rect.height * size);
      return x >= 0 && x < size && y >= 0 && y < size ? x + y * size : -1;
    }
  };
}

export function relativeDirection(chart, from, to) {
  return chart.neighbors[from].indexOf(to);
}

export function swipeDirection(dx, dy) {
  const vector = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  return DIRECTIONS.findIndex(([x, y]) => x === vector[0] && y === vector[1]);
}
