import { MAX_MOVES, RULESET, complete, initial, step, replay, solve, medal, daily, utcDate, validDate } from './engine.mjs';
import { CAMPAIGN } from './charts.mjs';
import { openStore, HULLS, totalStars, unlockedChart, awards, recordResult } from './save.mjs';
import { createRenderer, HULL_COLORS, relativeDirection, swipeDirection } from './render.mjs';
import { createAudio } from './audio.mjs';
import { connectTelegram } from './telegram.mjs';
import { T } from './text.mjs';

const $ = id => document.getElementById(id);
const icon = name => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const button = (action, label, { primary = false, glyph = '', value = '' } = {}) =>
  `<button class="button${primary ? ' primary' : ''}" type="button" data-action="${action}" data-value="${value}">${glyph ? icon(glyph) : ''}${label}</button>`;
const summary = value => `<p class="sheet-summary">${value}</p>`;
const actions = (...buttons) => `<div class="sheet-actions">${buttons.join('')}</div>`;
const stamp = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateLabel = date => stamp.format(new Date(date + 'T00:00:00Z'));
const chartCount = CAMPAIGN.length;
const board = $('board');
const sheet = $('sheet');
const render = createRenderer(board);
const audio = createAudio($('score'));
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let local;
try { local = window.localStorage; } catch {}
const store = openStore(local, chartCount);
const data = store.data;
const dailyCache = new Map();
let run = null, dialog = '', pending = null, result = null, toastTimer, winTimer;
let playScreen = false, storageWarned = false, freeHint = -1, pointer = null, viewedDate = utcDate(), copyReturn = null;
const telegram = connectTelegram(pauseOnHide);

const stars = count => `<span class="stars" aria-label="${T.buoysOf(count, 3)} ${T.stars.toLowerCase()}">${[0, 1, 2].map(i =>
  `<span class="${i < count ? 'filled' : 'empty'}">${icon('star')}</span>`).join('')}</span>`;
const active = () => run && run.states.at(-1);
const finished = () => run && complete(run.chart, active());
const reduced = () => data.settings.motion || motionPreference.matches;
const audioSettings = () => data.settings.muted ? { sound: false, music: false } : data.settings;

function persist() {
  if (store.save(data) || storageWarned) return;
  storageWarned = true;
  toast(T.storage);
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3900);
}

function staticText() {
  document.querySelectorAll('[data-text]').forEach(node => { node.textContent = T[node.dataset.text]; });
  document.querySelectorAll('[data-label]').forEach(node => {
    node.setAttribute('aria-label', T[node.dataset.label]);
    if (node.tagName === 'BUTTON') node.title = T[node.dataset.label];
  });
}

function chartFor(mode, id) {
  if (mode === 'campaign') return CAMPAIGN[id];
  if (!dailyCache.has(id)) {
    const options = CAMPAIGN.slice(12, 20);
    const serial = Math.floor(Date.parse(id + 'T00:00Z') / 86400000);
    dailyCache.set(id, daily(id, options[serial % options.length]));
  }
  return dailyCache.get(id);
}

function showHome() {
  clearTimeout(winTimer);
  playScreen = false;
  run = result = null;
  closeSheet(false);
  render.clear();
  $('play').hidden = true;
  $('home').hidden = false;
  document.body.classList.remove('sailing');
  populateHome();
  audio.sync(audioSettings(), false);
  window.scrollTo(0, 0);
}

function populateHome() {
  const date = utcDate();
  $('home-date').textContent = dateLabel(date);
  $('home-date').dateTime = date;
  const clears = Object.keys(data.campaign).length;
  $('home-cleared').textContent = T.clearedOf(clears, chartCount);
  $('home-stars').textContent = totalStars(data);
  $('campaign-cta').textContent = data.runs.campaign?.moves.length || clears ? T.continue : T.start;
  updateAudioButton();
}

function updateAudioButton() {
  const node = $('audio-button');
  const muted = data.settings.muted || (!data.settings.sound && !data.settings.music);
  const label = muted ? T.unmute : T.mute;
  node.innerHTML = icon(muted ? 'muted' : 'sound');
  node.title = label;
  node.setAttribute('aria-label', label);
  node.setAttribute('aria-pressed', String(muted));
}

function showSheet(type, title, content) {
  dialog = type;
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = content;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  audio.sync(audioSettings(), type === 'pause');
}

function closeSheet(focus = true) {
  dialog = '';
  if (sheet.open) sheet.close();
  if (focus && playScreen) board.focus({ preventScroll: true });
  audio.sync(audioSettings(), false);
}

function dismissSheet() {
  if (dialog === 'result') showHome();
  else if (dialog === 'copy' && copyReturn === 'daily') showDaily(viewedDate, pending?.target);
  else if (result) showResult();
  else if (dialog === 'help') pause();
  else closeSheet();
}

function begin(mode, id, target = null, replace = false) {
  if (mode === 'campaign' && (id < 0 || id > unlockedChart(data, chartCount))) return;
  if (mode === 'daily' && (!validDate(id) || id > utcDate())) return;
  const saved = data.runs[mode];
  if (!replace && saved?.moves.length && saved.id !== id) {
    pending = { mode, id, target };
    showSheet('replace', T.resumeTitle, summary(T.replaceNote) +
      actions(button('cancel-replace', T.cancel), button('confirm-replace', T.replace, { primary: true })));
    return;
  }

  const { chart, par } = chartFor(mode, id);
  const resume = !replace && saved?.id === id;
  const route = resume ? replay(chart, saved.moves) : null;
  const restorable = route && !complete(chart, route.at(-1));
  run = {
    mode, id, chart, par, states: restorable ? route : [initial(chart)],
    moves: restorable ? saved.moves.slice() : [],
    assisted: Boolean(restorable && saved.assisted),
    target: target ?? (restorable ? saved.target : null)
  };
  if (mode === 'daily' && run.target < par) run.target = null;
  result = null;
  pending = null;
  clearTimeout(winTimer);
  freeHint = -1;
  playScreen = true;
  $('home').hidden = true;
  $('play').hidden = false;
  document.body.classList.add('sailing');
  closeSheet();
  window.scrollTo(0, 0);
  $('chart-category').textContent = mode === 'campaign' ? T.chapterNames[Math.floor(id / 4)] : T.daily;
  $('chart-title').textContent = mode === 'campaign' ? T.chartNames[id] : dateLabel(id);
  $('par').textContent = par;
  showLegend();
  snapshot();
  refresh();
}

function snapshot() {
  const { mode, id, moves, assisted, target } = run;
  data.runs[mode] = { id, moves: moves.slice(), assisted, target };
  persist();
}

function notices(message, warning = false) {
  if (!message) {
    const state = active();
    const first = run.mode === 'campaign' && run.id === 0;
    const stuck = [0, 1, 2, 3].every(direction => step(run.chart, state, direction).error);
    if (finished()) message = T.docked;
    else if (stuck) { message = T.stranded; warning = true; }
    else if (first && run.moves.length === 0) message = T.firstMove;
    else if (first && state.ship === run.chart.buoys[0] && state.lit === 0) message = T.firstBuoy;
    else if (first && state.ship === run.chart.dock && state.lit === run.chart.all) message = T.firstDock;
    else if (state.lit === run.chart.all) message = T.allLit;
    else if (run.mode === 'campaign' && run.id < 4) message = T.lessons[run.id];
    else message = run.target ? T.invite(run.target) : T.aim;
  }
  $('notice').textContent = message;
  $('notice').dataset.tone = warning ? 'warn' : '';
}

function refresh(animate = false, message, warning) {
  if (!run) return;
  const state = active();
  const { chart, mode, id } = run;
  let hint = freeHint;
  if (hint < 0 && mode === 'campaign' && id === 0 && !finished()) {
    const path = solve(chart, state);
    if (path?.length) hint = chart.neighbors[state.ship][path[0]];
  }
  const litCount = chart.buoys.filter(index => state.lit & chart.buoyMask[index]).length;
  $('moves').textContent = run.moves.length;
  $('buoys').textContent = T.buoysOf(litCount, chart.buoys.length);
  const coordinate = index => T.coordinate(index % chart.size, Math.floor(index / chart.size));
  $('board-state').textContent = T.boardState(coordinate(state.ship), coordinate(state.barge), litCount, chart.buoys.length);
  document.querySelector('[data-action=undo]').disabled = !run.moves.length || finished();
  document.querySelector('[data-action=hint]').disabled = finished();
  document.querySelector('[data-action=restart]').disabled = !run.moves.length || finished();
  notices(message, warning);
  render.update({ chart, state, hint, reduced: reduced(), hull: HULL_COLORS[data.settings.hull] }, animate);
}

function activeLegend() {
  const chart = run?.chart;
  return T.rules.filter(([symbol]) => {
    if (!chart) return true;
    if (symbol === 'wake') return chart.wake > 0;
    if (symbol === 'current') return /[<>v^]/.test(chart.tiles);
    if (symbol === 'gate') return chart.tiles.includes('G');
    return true;
  }).map(([symbol, title, details]) =>
    `<div class="rule">${icon(symbol)}<div><strong>${title}</strong>${details}</div></div>`).join('');
}

function showLegend() {
  $('legend').innerHTML = activeLegend();
}

function steer(direction) {
  if (!playScreen || sheet.open || finished() || direction < 0) return;
  if (run.moves.length >= MAX_MOVES) { notices(T.tooLong, true); return; }
  const state = active();
  const next = step(run.chart, state, direction);
  if (next.error) {
    notices(T[next.error], true);
    audio.play('blocked', audioSettings());
    telegram.haptic('blocked');
    return;
  }
  freeHint = -1;
  run.moves.push(direction);
  run.states.push(next);
  const won = finished();
  const sound = won ? 'dock' : next.lit !== state.lit ? 'light' : 'turn';
  if (won) deliver();
  else snapshot();
  refresh(true);
  audio.play(sound, audioSettings());
  if (sound !== 'turn') telegram.haptic(sound);
}

function undo() {
  if (!run.moves.length || finished()) return;
  run.moves.pop();
  run.states.pop();
  freeHint = -1;
  snapshot();
  refresh(true);
  audio.play('rewind', audioSettings());
}

function advise() {
  const path = solve(run.chart, active(), Infinity);
  if (!path?.length) {
    notices(T.noRoute, true);
    return;
  }
  const free = run.mode === 'campaign' && run.id === 0;
  freeHint = run.chart.neighbors[active().ship][path[0]];
  if (!free && !run.assisted) {
    run.assisted = true;
    snapshot();
  }
  refresh(false, free ? T.markHint : T.hinted);
}

function deliver() {
  const { mode, id, moves, par, assisted, target } = run;
  const count = moves.length;
  const grade = medal(count, par, assisted);
  const newRecord = recordResult(data, mode, id, count, grade);
  data.runs[mode] = null;
  persist();
  result = { mode, id, count, grade, newRecord, target };
  winTimer = setTimeout(() => {
    if (result && !sheet.open) showResult();
  }, reduced() ? 50 : 500);
}

function showResult() {
  const { mode, id, count, grade, newRecord, target } = result;
  const campaign = mode === 'campaign';
  const next = campaign && id + 1 < chartCount;
  const caption = [T.resultBronze, T.resultSilver, T.resultGold][grade - 1];
  const challenge = !target || count > target ? '' : summary(count === target ? T.matched : T.beat);
  const best = newRecord ? `<p class="best">${T.newRecord}</p>` : `<p>${T.best} · ${T.targetMoves(data[mode][id].best)}</p>`;
  showSheet('result', T.docked,
    `<div class="debrief">${stars(grade)}<h3>${caption}</h3><p>${T.targetMoves(count)}</p>${best}</div>` +
    (campaign && !next ? summary(T.campaignDone) : '') + challenge +
    actions(next ? button('next', T.next, { primary: true, glyph: 'sail' }) :
      campaign ? button('home', T.home, { primary: true }) :
        button('share-result', T.share, { primary: true, glyph: 'share' }), button('retry', T.retry)) +
    (!campaign || next ? button('home', T.home) : ''));
}

function showCharts() {
  const unlock = unlockedChart(data, chartCount);
  const rows = CAMPAIGN.map((_, id) => {
    const record = data.campaign[id];
    return (id % 4 === 0 ? `<h3>${T.chapterNames[id / 4]}</h3>` : '') +
      `<button class="item" type="button" data-action="chart" data-value="${id}" ${id > unlock ? 'disabled' : ''}>
        <span class="item-index">${String(id + 1).padStart(2, '0')}</span><strong class="grow">${T.chartNames[id]}</strong>
        ${id > unlock ? icon('lock') : stars(record?.stars ?? 0)}
      </button>`;
  });
  showSheet('charts', T.charts, `<div class="campaign-list">${rows.join('')}</div>`);
  const current = $('sheet-body').querySelector(`[data-value="${unlock}"]`);
  if (unlock >= 4) sheet.scrollTop = current.offsetTop - 120;
}

function showDaily(date = utcDate(), target = null) {
  viewedDate = date;
  pending = { mode: 'daily', id: date, target };
  const today = utcDate();
  const record = data.daily[date];
  const best = record ? `${T.best} · ${T.targetMoves(record.best)}` : T.noRecord;
  const { par } = chartFor('daily', date);
  const prior = Array.from({ length: 8 }, (_, days) => utcDate(new Date(Date.parse(today) - days * 86400000)))
    .filter(value => value !== date).slice(0, 7);
  const rows = prior.map(value => `<button class="item" type="button" data-action="pick-day" data-value="${value}">
    <strong>${dateLabel(value)}${value === today ? ' · ' + T.today : ''}</strong>
    <span class="meta">${data.daily[value] ? T.targetMoves(data.daily[value].best) : ''}</span></button>`).join('');
  const canResume = data.runs.daily?.id === date && data.runs.daily.moves.length;
  showSheet('daily', T.daily,
    `<div class="debrief"><h3>${dateLabel(date)}</h3><p>${T.target} ${T.targetMoves(par)}</p><p>${best}</p></div>` +
    (target && target >= par ? summary(T.invite(target)) : '') +
    actions(button('begin-day', canResume ? T.resume : T.start, { primary: true, glyph: 'sail' }),
      button('share-daily', T.share, { glyph: 'share' })) +
    summary(T.dailyNote) + `<h3 class="sheet-section">${T.pastCharts}</h3><div class="item-list">${rows}</div>`);
}

function showLog() {
  const earned = awards(data, chartCount);
  const achievements = T.awardNames.map((name, index) => `<div class="item">
    ${icon(earned[index] ? 'check' : 'lock')}<div class="grow"><strong>${name}</strong><small>${T.awardDetails[index]}</small></div>
    <span class="meta">${earned[index] ? T.unlocked : T.locked}</span></div>`).join('');
  const tally = totalStars(data);
  const finishes = HULLS.map((threshold, id) => {
    const equipped = data.settings.hull === id;
    const locked = threshold > tally;
    return `<button class="item" type="button" data-action="hull" data-value="${id}" ${equipped || locked ? 'disabled' : ''}>
      <span class="swatch" style="--swatch:${HULL_COLORS[id]}"></span>
      <div class="grow"><strong>${T.hullNames[id]}</strong>${locked ? `<small>${T.unlockLabel(threshold)}</small>` : ''}</div>
      <span class="meta">${equipped ? T.equipped : locked ? T.locked : T.equip}</span></button>`;
  }).join('');
  showSheet('log', T.log,
    summary(`${T.dailyClears} · ${Object.keys(data.daily).length}`) +
    `<h3 class="sheet-section">${T.awards}</h3><div class="item-list">${achievements}</div>` +
    `<h3 class="sheet-section">${T.hulls}</h3><div class="item-list">${finishes}</div>`);
}

function showSettings() {
  const rows = ['sound', 'music', 'motion'].map(key => `<button class="item" type="button"
    data-action="toggle" data-value="${key}" aria-pressed="${data.settings[key]}">
    <strong>${T[key]}</strong><span class="meta">${data.settings[key] ? T.on : T.off}</span></button>`).join('');
  showSheet('settings', T.settings, `<div class="item-list">${rows}</div>` +
    (telegram.canFullscreen() ? button('fullscreen', telegram.isFullscreen() ? T.leaveFullscreen : T.fullscreen) : '') +
    button('close', T.done, { primary: true }));
}

function pause() {
  if (!playScreen || finished()) return;
  showSheet('pause', T.paused, actions(button('close', T.resume, { primary: true }),
    button('home', T.home)) + button('help', T.help, { glyph: 'compass' }));
}

function pauseOnHide() {
  if (!sheet.open) pause();
  audio.sync(audioSettings(), true);
}

async function share(date, moves) {
  const from = dialog;
  const offline = location.protocol === 'file:';
  const message = moves ? T.challenge(moves, date) : T.shareDaily(date);
  let payload = message;
  if (!offline) {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('daily', date);
    url.searchParams.set('rules', RULESET);
    if (moves) url.searchParams.set('moves', moves);
    payload = url.href;
    if (telegram.share(payload, message)) return;
    if (navigator.share) {
      try { await navigator.share({ title: T.title, text: message, url: payload }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
  }
  if (dialog !== from) return;
  copyReturn = from;
  const label = offline ? T.offlineShare : T.shareLink;
  showSheet('copy', label,
    summary(offline ? T.offlineNote : message) +
    `<input class="copy-input" id="share-url" aria-label="${label}" readonly>` +
    button('copy', offline ? T.offlineShare : T.copyLink, { primary: true }));
  $('share-url').value = payload;
  $('share-url').select();
}

const handlers = {
  home: showHome,
  campaign: () => begin('campaign', data.runs.campaign?.id ?? unlockedChart(data, chartCount)),
  chart: id => begin('campaign', Number(id)),
  charts: showCharts,
  daily: () => showDaily(),
  'pick-day': date => showDaily(date),
  'begin-day': () => { if (pending) begin(pending.mode, pending.id, pending.target); },
  'confirm-replace': () => { if (pending) begin(pending.mode, pending.id, pending.target, true); },
  'cancel-replace': () => pending?.mode === 'daily' ? showDaily(pending.id, pending.target) : showCharts(),
  'share-result': () => share(result.id, data.daily[result.id].best),
  'share-daily': () => share(viewedDate, data.daily[viewedDate]?.best),
  copy: async () => {
    const input = $('share-url');
    try {
      await navigator.clipboard.writeText(input.value);
      const copyButton = sheet.querySelector('[data-action=copy]');
      if (copyButton) copyButton.textContent = location.protocol === 'file:' ? T.inviteCopied : T.shared;
    } catch {
      input.select();
      $('sheet-body').querySelector('.sheet-summary').textContent = location.protocol === 'file:' ? T.offlineCopy : T.copyManual;
    }
  },
  log: showLog,
  hull: value => {
    const id = Number(value);
    if (HULLS[id] > totalStars(data)) return;
    data.settings.hull = id;
    persist();
    showLog();
  },
  settings: showSettings,
  mute: () => {
    if (!data.settings.sound && !data.settings.music) {
      data.settings.sound = data.settings.music = true;
      data.settings.muted = false;
    } else data.settings.muted = !data.settings.muted;
    persist();
    updateAudioButton();
    audio.sync(audioSettings(), false);
  },
  toggle: key => {
    data.settings[key] = !data.settings[key];
    if (key !== 'motion' && data.settings[key]) data.settings.muted = false;
    persist();
    updateAudioButton();
    showSettings();
    sheet.querySelector(`[data-value="${key}"]`)?.focus({ preventScroll: true });
    refresh();
  },
  fullscreen: () => telegram.fullscreen(() => {
    if (dialog !== 'settings') return;
    sheet.querySelector('.sheet-summary')?.remove();
    $('sheet-body').insertAdjacentHTML('beforeend', summary(T.fullscreenUnavailable));
  }),
  close: dismissSheet,
  pause,
  help: () => showSheet('help', T.help, summary(T.steer) + `<div class="item-list">${activeLegend()}</div>` +
    button('close', T.done, { primary: true })),
  undo,
  hint: advise,
  restart: () => showSheet('restart', T.restartTitle, summary(T.restartNote) +
    actions(button('close', T.cancel), button('restart-now', T.restart, { primary: true }))),
  'restart-now': () => begin(run.mode, run.id, run.target, true),
  retry: () => begin(run.mode, run.id, run.target, true),
  next: () => begin('campaign', run.id + 1)
};

document.addEventListener('click', event => {
  const control = event.target.closest('button[data-action]');
  if (!control || control.disabled) return;
  audio.unlock();
  handlers[control.dataset.action]?.(control.dataset.value);
});
sheet.addEventListener('cancel', event => { event.preventDefault(); dismissSheet(); });
const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
document.addEventListener('keydown', event => {
  if (!playScreen || sheet.open || finished() || event.metaKey || event.altKey || event.ctrlKey) return;
  const direction = keys.indexOf(event.key);
  if (direction >= 0) {
    event.preventDefault();
    if (!event.repeat) { audio.unlock(); steer(direction); }
  }
  if (event.repeat) return;
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
  if (event.key === 'Escape') pause();
});
board.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || sheet.open || finished()) return;
  audio.unlock();
  board.focus({ preventScroll: true });
  board.setPointerCapture(event.pointerId);
  pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
board.addEventListener('pointercancel', () => { pointer = null; });
board.addEventListener('lostpointercapture', () => { pointer = null; });
board.addEventListener('pointerup', event => {
  if (!pointer || pointer.id !== event.pointerId || !run) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  const tile = render.point(event.clientX, event.clientY, run.chart.size);
  pointer = null;
  if (Math.hypot(dx, dy) > 19) steer(swipeDirection(dx, dy));
  else if (tile >= 0) steer(relativeDirection(run.chart, active().ship, tile));
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseOnHide();
  else { render.refresh(); audio.sync(audioSettings(), dialog === 'pause'); if (!playScreen) populateHome(); }
});
document.addEventListener('fullscreenchange', () => { if (dialog === 'settings') showSettings(); });
window.addEventListener('resize', render.refresh);
window.addEventListener('focus', () => { if (!playScreen) populateHome(); });
motionPreference.addEventListener?.('change', () => refresh());

staticText();
populateHome();
if (store.recovered) toast(T.recovery);
const query = new URLSearchParams(location.search);
const date = query.get('daily');
if (date !== null) {
  const moves = Number(query.get('moves'));
  const validRules = !query.has('rules') || query.get('rules') === RULESET;
  if (validDate(date) && date <= utcDate() && validRules) {
    showDaily(date, Number.isInteger(moves) && moves > 0 && moves <= MAX_MOVES ? moves : null);
  } else toast(T.noShared);
}
