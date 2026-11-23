import { MAX_MOVES, validDate } from './engine.mjs';

const KEY = 'groupquest.wakeward';
const BACKUP = KEY + '.backup';
export const VERSION = 1;
export const HULLS = [0, 9, 30, 57];

export function fresh() {
  return { version: VERSION, campaign: {}, daily: {}, runs: { campaign: null, daily: null },
    settings: { sound: true, music: true, motion: false, muted: false, hull: 0 } };
}

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const dayKey = key => validDate(key);
const chartKey = (key, count) => /^(0|[1-9]\d*)$/.test(key) && integer(Number(key), 0, count - 1);

function records(value, accept) {
  if (!object(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, record]) =>
    accept(key) && object(record) && integer(record.best, 1, MAX_MOVES) &&
    integer(record.stars, 1, 3)).map(([key, { best, stars }]) => [key, { best, stars }]));
}

export function normalize(value, count) {
  if (!object(value) || value.version !== VERSION) return null;
  const data = fresh();
  data.campaign = records(value.campaign, key => chartKey(key, count));
  data.daily = records(value.daily, dayKey);
  const settings = value.settings;
  if (object(settings)) {
    for (const key of ['sound', 'music', 'motion', 'muted']) {
      if (typeof settings[key] === 'boolean') data.settings[key] = settings[key];
    }
    if (integer(settings.hull, 0, HULLS.length - 1) && HULLS[settings.hull] <= totalStars(data)) {
      data.settings.hull = settings.hull;
    }
  }
  for (const mode of ['campaign', 'daily']) {
    const run = value.runs?.[mode];
    if (!object(run) || !(mode === 'campaign' ? integer(run.id, 0, count - 1) : dayKey(run.id)) ||
        !Array.isArray(run.moves) || run.moves.length > MAX_MOVES ||
        !run.moves.every(move => integer(move, 0, 3))) continue;
    if (mode === 'campaign' && run.id > unlockedChart(data, count)) continue;
    data.runs[mode] = {
      id: run.id, moves: run.moves.slice(), assisted: run.assisted === true,
      target: integer(run.target, 1, MAX_MOVES) ? run.target : null
    };
  }
  return data;
}

function read(raw, count) {
  try { return normalize(JSON.parse(raw), count); } catch { return null; }
}

export function openStore(storage, count) {
  let savedRaw;
  let data;
  let recovered = false;
  let available = true;
  try {
    savedRaw = storage.getItem(KEY);
    data = read(savedRaw, count);
    if (!data) {
      const previous = storage.getItem(BACKUP);
      data = read(previous, count);
      if (data) {
        savedRaw = previous;
        recovered = true;
      }
    }
  } catch { available = false; }

  return {
    data: data || fresh(),
    recovered,
    get available() { return available; },
    save(next) {
      const raw = JSON.stringify(next);
      try {
        storage.setItem(KEY, raw);
      } catch {
        available = false;
        return false;
      }
      // A failed backup write must never invalidate a successful primary write.
      if (read(savedRaw, count)) {
        try { storage.setItem(BACKUP, savedRaw); } catch {}
      }
      savedRaw = raw;
      available = true;
      return true;
    }
  };
}

export function totalStars(data) {
  return Object.values(data.campaign).reduce((sum, record) => sum + record.stars, 0);
}

export function unlockedChart(data, count) {
  let id = 0;
  while (id < count - 1 && data.campaign[id]) id++;
  return id;
}

export function awards(data, count) {
  const charts = Object.values(data.campaign);
  const gold = charts.filter(record => record.stars === 3).length;
  return [charts.length >= 1, gold >= 5, charts.length >= 12,
    charts.length >= count, Object.keys(data.daily).length >= 3, gold >= count];
}

export function recordResult(data, mode, id, moves, stars) {
  const previous = data[mode][id];
  data[mode][id] = {
    best: Math.min(previous?.best ?? Infinity, moves),
    stars: Math.max(previous?.stars ?? 0, stars)
  };
  return !previous || previous.best > moves;
}
