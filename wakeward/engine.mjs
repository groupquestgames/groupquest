export const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ARROWS = '^>v<';
const ALPHABET = '#.SBODG' + ARROWS;
export const MAX_MOVES = 300;
export const RULESET = 'w1';

export function makeChart(rows, wake) {
  const size = rows.length;
  if (size < 4 || size > 8 || rows.some(row => row.length !== size) ||
      !Number.isInteger(wake) || wake < 0 || wake > 4) throw new Error('Invalid chart size');
  const tiles = rows.join('');
  const single = type => tiles.indexOf(type) >= 0 && tiles.indexOf(type) === tiles.lastIndexOf(type);
  if (![...tiles].every(tile => ALPHABET.includes(tile)) || !['S', 'B', 'D'].every(single)) {
    throw new Error('Invalid chart tiles');
  }
  const ship = tiles.indexOf('S');
  const barge = tiles.indexOf('B');
  const dock = tiles.indexOf('D');
  const buoys = [...tiles].flatMap((tile, i) => tile === 'O' ? [i] : []);
  const buoyMask = tiles.split('').map((_, i) => buoys.includes(i) ? 1 << buoys.indexOf(i) : 0);
  const neighbors = tiles.split('').map((_, i) =>
    DIRECTIONS.map(([dx, dy]) => {
      const x = i % size + dx;
      const y = Math.floor(i / size) + dy;
      return x >= 0 && x < size && y >= 0 && y < size ? x + y * size : -1;
    })
  );
  if (!neighbors[ship].includes(barge) || !buoys.length || buoys.length > 4) throw new Error('Invalid objectives');
  return { rows, size, tiles, ship, barge, dock, wake, buoys, buoyMask, all: (1 << buoys.length) - 1, neighbors };
}

export function initial(chart) {
  return { ship: chart.ship, barge: chart.barge, lit: 0, trail: [] };
}

export function complete(chart, state) {
  return state.barge === chart.dock && state.lit === chart.all;
}

export function step(chart, state, direction) {
  const next = chart.neighbors[state.ship][direction];
  if (next === undefined || next < 0 || chart.tiles[next] === '#') return { error: 'reef' };
  if (next === state.barge || state.trail.includes(next)) return { error: 'wake' };
  const forced = ARROWS.indexOf(chart.tiles[state.ship]);
  if (forced >= 0 && forced !== direction) return { error: 'current' };
  if (chart.tiles[next] === 'G' && state.lit === 0) return { error: 'gate' };
  return {
    ship: next,
    barge: state.ship,
    lit: state.lit | chart.buoyMask[state.ship],
    trail: chart.wake ? [state.barge, ...state.trail].slice(0, chart.wake) : []
  };
}

export function replay(chart, moves) {
  if (!Array.isArray(moves) || moves.length > MAX_MOVES) return null;
  const states = [initial(chart)];
  for (const move of moves) {
    if (!Number.isInteger(move) || move < 0 || move > 3 || complete(chart, states.at(-1))) return null;
    const next = step(chart, states.at(-1), move);
    if (next.error) return null;
    states.push(next);
  }
  return states;
}

// Exact breadth-first search. A bounded search can reject a generated chart,
// but only an actual solution allows that chart to be used.
export function solve(chart, start = initial(chart), limit = 24000) {
  const key = ({ ship, barge, lit, trail }) => {
    // Each position occupies one base-65 digit. Zero marks an empty trail slot.
    let value = (ship * 64 + barge) * 16 + lit;
    for (let i = 0; i < chart.wake; i++) value = value * 65 + (trail[i] ?? -1) + 1;
    return value;
  };
  const seen = new Set([key(start)]);
  const queue = [{ state: start, parent: -1, move: -1 }];
  for (let i = 0; i < queue.length; i++) {
    const { state } = queue[i];
    if (complete(chart, state)) {
      const path = [];
      for (let p = i; queue[p].parent >= 0; p = queue[p].parent) path.push(queue[p].move);
      return path.reverse();
    }
    if (i >= limit) return null;
    for (let direction = 0; direction < 4; direction++) {
      const next = step(chart, state, direction);
      if (next.error) continue;
      const nextKey = key(next);
      if (seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push({ state: next, parent: i, move: direction });
    }
  }
  return null;
}

export function medal(moves, par, assisted) {
  return moves === par && !assisted ? 3 : moves <= par + Math.max(3, Math.ceil(par / 3)) ? 2 : 1;
}

export function rng(seed) {
  let x = 2166136261;
  for (const character of seed) x = Math.imul(x ^ character.charCodeAt(0), 16777619);
  return limit => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) % limit;
  };
}

export function candidate(random, size, wake, buoyCount, currents, gates) {
  const tiles = Array(size * size).fill('.');
  const options = Array.from(tiles.keys());
  const ship = random(options.length);
  const x = ship % size;
  const barge = x < size - 1 ? ship + 1 : ship - 1;
  tiles[ship] = 'S';
  tiles[barge] = 'B';
  const free = options.filter(i => i !== ship && i !== barge);
  const place = tile => {
    const i = free.splice(random(free.length), 1)[0];
    tiles[i] = tile;
  };
  place('D');
  for (let i = 0; i < buoyCount; i++) place('O');
  for (let i = 0; i < gates; i++) place('G');
  for (let i = 0; i < currents; i++) place(ARROWS[random(4)]);
  for (let i = 0; i < Math.floor(tiles.length * 0.24); i++) place('#');
  return makeChart(Array.from({ length: size }, (_, y) => tiles.slice(y * size, (y + 1) * size).join('')), wake);
}

export function utcDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && utcDate(date) === value;
}

export function daily(date, fallback) {
  const random = rng(RULESET + ':' + date);
  for (let i = 0; i < 14; i++) {
    const chart = candidate(random, 7, 3, 3, 3, 1);
    const path = solve(chart, initial(chart), 3600);
    if (path && path.length >= 18 && path.length <= 31 &&
        usesMechanics(chart, path, { current: true })) return { chart, par: path.length };
  }
  // A reflection preserves rules, topology and optimal path length.
  const flipX = random(2);
  const flipY = random(2);
  let rows = fallback.chart.rows.map(row => flipX ?
    [...row].reverse().join('').replace(/[<>]/g, value => value === '<' ? '>' : '<') : row);
  if (flipY) rows = rows.reverse().map(row => row.replace(/[v^]/g, value => value === 'v' ? '^' : 'v'));
  const chart = makeChart(rows, fallback.chart.wake);
  return { chart, par: fallback.par };
}

export function usesMechanics(chart, path, required) {
  let state = initial(chart);
  const used = { gate: false, current: false, wake: false };
  for (const move of path) {
    if (ARROWS.includes(chart.tiles[state.ship])) used.current = true;
    if (chart.neighbors[state.ship].some(i => state.trail.includes(i))) used.wake = true;
    state = step(chart, state, move);
    if (chart.tiles[state.ship] === 'G') used.gate = true;
  }
  return Object.keys(required).every(key => !required[key] || used[key]);
}
