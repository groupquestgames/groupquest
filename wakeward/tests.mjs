import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, step, solve, complete, replay, makeChart, daily, validDate, utcDate, medal } from './engine.mjs';
import { CAMPAIGN } from './charts.mjs';
import { fresh, normalize, openStore, recordResult, unlockedChart, totalStars, awards } from './save.mjs';

test('all 24 campaign charts have an optimal solution and the target increases', () => {
  let previous = 0;
  for (const { chart, par } of CAMPAIGN) {
    const route = solve(chart);
    assert.equal(route?.length, par);
    assert(complete(chart, replay(chart, route).at(-1)));
    assert(par >= previous);
    previous = par;
  }
});

test('the skiff pulls the lantern, which alone lights buoys and docks', () => {
  const { chart } = CAMPAIGN[0];
  const [before, onBuoy, onDock, delivered] = replay(chart, [1, 2, 2]);
  assert.equal(onBuoy.barge, before.ship);
  assert.equal(onBuoy.lit, 0);
  assert.equal(onDock.lit, chart.all);
  assert.equal(onDock.ship, chart.dock);
  assert(!complete(chart, onDock));
  assert(complete(chart, delivered));
  assert.equal(replay(chart, [1, 2, 2, 1]), null);
  assert.equal(replay(chart, [9]), null);
});

test('reefs, the occupied tow tile, wake, currents and open/closed gates restrict movement', () => {
  const chart = makeChart(['S..G.','B.>..','...O.','.....','...D#'], 3);
  const start = initial(chart);
  assert.equal(step(chart, start, 0).error, 'reef');
  assert.equal(step(chart, start, 2).error, 'wake');
  const state = replay(chart, [1, 2, 1]).at(-1);
  assert.equal(step(chart, state, 0).error, 'current');
  assert.equal(step(chart, state, 3).error, 'wake');
  const nearGate = replay(chart, [1, 1]).at(-1);
  assert.equal(step(chart, nearGate, 1).error, 'gate');
  assert.equal(step(chart, { ...nearGate, lit: 1 }, 1).ship, 3);
  assert.equal(step(chart, state, 1).trail.length, 3);
  assert.equal(step(chart, { ship: 6, barge: 7, lit: 0, trail: [1] }, 0).error, 'wake');
});

test('366 daily seeds are valid and reproduce the same optimal routes', () => {
  const options = CAMPAIGN.slice(12, 20);
  const map = date => daily(date, options[Math.floor(Date.parse(date) / 86400000) % options.length]);
  const fingerprints = new Set();
  for (let i = 0; i < 366; i++) {
    const date = utcDate(new Date(Date.UTC(2026, 0, i + 1)));
    const { chart, par } = map(date);
    const route = solve(chart);
    assert.equal(route?.length, par, date);
    assert(complete(chart, replay(chart, route).at(-1)), date);
    assert(par >= 18 && par <= 31, date);
    fingerprints.add(chart.tiles);
    if (i % 35 === 0) assert.equal(chart.tiles, map(date).chart.tiles);
  }
  assert(fingerprints.size > 300);
  assert(!validDate('2026-02-29'));
  assert(validDate('2028-02-29'));
});

test('medals reward shortest routes, aid caps the medal, and undo can replay safely', () => {
  assert.equal(medal(14, 14, false), 3);
  assert.equal(medal(14, 14, true), 2);
  assert.equal(medal(17, 14, false), 2);
  assert.equal(medal(21, 14, false), 1);
  const { chart } = CAMPAIGN[0];
  const moves = [1, 2];
  moves.pop();
  assert.deepEqual(replay(chart, moves).at(-1), step(chart, initial(chart), 1));
});

test('versioned saves validate records, independent runs, ownership and settings', () => {
  const data = fresh();
  data.settings.hull = 1;
  data.settings.music = false;
  data.campaign[0] = { best: 3, stars: 3 };
  data.campaign[1] = { best: 0, stars: 4 };
  data.daily['2026-11-22'] = { best: 20, stars: 3 };
  data.daily['2026-11-32'] = { best: 20, stars: 3 };
  data.runs.campaign = { id: 1, moves: [0, 1], assisted: true };
  data.runs.daily = { id: '2026-11-23', moves: [4], assisted: true };
  const saved = normalize(data, 24);
  assert.equal(saved.settings.hull, 0);
  assert.equal(saved.settings.music, false);
  assert.deepEqual(saved.campaign, { 0: { best: 3, stars: 3 } });
  assert.deepEqual(Object.keys(saved.daily), ['2026-11-22']);
  assert.deepEqual(saved.runs.campaign.moves, [0, 1]);
  assert.equal(saved.runs.daily, null);
  assert.equal(normalize({ ...data, version: 2 }, 24), null);
});

test('saves reload, recover from a corrupt primary, and tolerate blocked storage', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const store = openStore(storage, 24);
  store.data.settings.sound = false;
  assert(store.save(store.data));
  store.data.runs.campaign = { id: 0, moves: [1], assisted: false };
  assert(store.save(store.data));
  assert.deepEqual(openStore(storage, 24).data.runs.campaign.moves, [1]);
  map.set('groupquest.wakeward', 'bad JSON');
  const backup = openStore(storage, 24);
  assert(backup.recovered);
  assert(!backup.data.settings.sound);
  const unavailable = openStore(null, 24);
  assert(!unavailable.available);
  assert(!unavailable.save(fresh()));
});

test('progress unlocks sequentially, tracks best medals independently, and earns all achievements', () => {
  const data = fresh();
  assert.equal(unlockedChart(data, 24), 0);
  assert(recordResult(data, 'campaign', 0, 8, 1));
  assert.equal(unlockedChart(data, 24), 1);
  assert(recordResult(data, 'campaign', 0, 3, 2));
  assert(!recordResult(data, 'campaign', 0, 3, 3));
  assert.deepEqual(data.campaign[0], { best: 3, stars: 3 });
  for (let i = 1; i < 24; i++) recordResult(data, 'campaign', i, CAMPAIGN[i].par, 3);
  for (let i = 1; i <= 3; i++) recordResult(data, 'daily', '2026-11-0' + i, 25, 2);
  assert.equal(totalStars(data), 72);
  assert.equal(unlockedChart(data, 24), 23);
  assert(awards(data, 24).every(Boolean));
});
