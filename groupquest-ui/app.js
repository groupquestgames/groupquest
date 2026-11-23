'use strict';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const gameById = new Map(games.map((game) => [game.id, game]));
const stateKey = 'groupquest_app_v1';
const pages = ['home', 'games', 'ranking', 'profile'];
const categories = ['all', 'action', 'puzzle', 'strategy', 'favorites'];
const player = $('player');
const resetDialog = $('reset-dialog');

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function count(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function knownIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => gameById.has(id)))] : [];
}

const persisted = readStorage(stateKey) ?? {};
const state = {
  ...persisted,
  lang: persisted.lang === 'uk' || persisted.lang === 'en' ? persisted.lang : '',
  played: count(persisted.played),
  favorites: knownIds(persisted.favorites),
  sound: typeof persisted.sound === 'boolean' ? persisted.sound : true,
  motion: typeof persisted.motion === 'boolean' ? persisted.motion : true,
  recent: knownIds(persisted.recent).slice(0, 5),
  uniquePlayed: knownIds(persisted.uniquePlayed),
};

let telegram;
let language = selectedLanguage();
let page = 'home';
let category = 'all';
let currentGame;
let playerTimer;
let toastTimer;
let audio;

function selectedLanguage() {
  const preferred = telegram?.initDataUnsafe?.user?.language_code || navigator.language;
  return state.lang || (preferred?.split('-')[0].toLowerCase() === 'uk' ? 'uk' : 'en');
}

function t(key, values = {}) {
  return (strings[language][key] ?? strings.en[key] ?? key)
    .replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

function format(number) {
  return new Intl.NumberFormat(language).format(number);
}

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
}

function notify(message) {
  const toast = $('toast');
  clearTimeout(toastTimer);
  toast.hidden = false;
  toast.textContent = message;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function save() {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
    return true;
  } catch {
    notify(t('storageError'));
    return false;
  }
}

function feedback() {
  if (!state.sound) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try {
    audio ??= new Context();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    const now = audio.currentTime;
    oscillator.frequency.value = 480;
    volume.gain.setValueAtTime(0.022, now);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
  } catch { /* Audio availability does not affect actions. */ }
}

function setIdentity() {
  const user = telegram?.initDataUnsafe?.user;
  const firstName = typeof user?.first_name === 'string' ? user.first_name.trim() : '';
  const lastName = typeof user?.last_name === 'string' ? user.last_name.trim() : '';
  const name = [firstName, lastName].filter(Boolean).join(' ') || t('guest');
  $('greeting').textContent = firstName ? t('welcome', { name: firstName }) : t('welcomeGuest');
  $('profile-name').textContent = name;
  for (const avatar of [$('header-avatar'), $('profile-avatar')]) {
    const initial = Array.from(name)[0]?.toLocaleUpperCase(language) || 'G';
    avatar.textContent = initial;
    if (typeof user?.photo_url !== 'string' || !user.photo_url.startsWith('https://')) continue;
    const photo = new Image();
    photo.alt = '';
    photo.referrerPolicy = 'no-referrer';
    photo.addEventListener('error', () => { avatar.textContent = initial; }, { once: true });
    photo.src = user.photo_url;
    avatar.replaceChildren(photo);
  }
}

function syncFavoriteButtons() {
  for (const button of document.querySelectorAll('[data-fav]')) {
    const game = gameById.get(button.dataset.fav);
    const favorite = state.favorites.includes(game.id);
    button.setAttribute('aria-pressed', favorite);
    button.setAttribute('aria-label', t(favorite ? 'removeGame' : 'saveGame', { name: game.title }));
  }
}

function cover(game) {
  const src = game.cover ?? `groupquest-ui/art/${game.art}.webp`;
  const square = game.id === 'pulse';
  return `<img src="${src}" alt="" width="480" height="${square ? 480 : 270}"${square ? ' class="pulse-cover"' : ''} loading="lazy" decoding="async">`;
}

function playButton(game, label, style = 'secondary') {
  return `<button type="button" class="button ${style} card-play" data-play="${game.id}">${icon('play')}${t(label)}</button>`;
}

// Card markup only uses the bundled catalog and translation strings.
function card(game) {
  return `<article class="game-card">
    <div class="game-art${game.id === 'pulse' ? ' game-art-square' : ''}">
      ${cover(game)}
      <button type="button" class="icon-button card-save" data-fav="${game.id}">${icon('heart')}</button>
    </div>
    <div class="card-copy">
      <span class="overline">${t(game.category)}</span>
      <h3>${game.title}</h3><p>${game[language]}</p>
      ${playButton(game, 'play')}
    </div>
  </article>`;
}

function compactCard(game, label = 'play') {
  return `<article class="compact-game">
    ${cover(game)}
    <div><h3>${game.title}</h3><p>${t(game.category)}</p></div>
    <button type="button" class="button secondary" data-play="${game.id}">${icon('play')}${t(label)}</button>
  </article>`;
}

function renderCatalog() {
  const query = $('game-search').value.trim().toLowerCase();
  const sort = $('sort').value;
  const filtered = games.filter((game) => {
    const matchesCategory = category === 'all' || game.category === category ||
      (category === 'favorites' && state.favorites.includes(game.id));
    return matchesCategory && [game.title, game.en, game.uk, t(game.category)].some((text) => text.toLowerCase().includes(query));
  });
  if (sort === 'az') filtered.sort((a, b) => a.title.localeCompare(b.title, 'en'));
  if (sort === 'recent') {
    const recentOrder = new Map(state.recent.map((id, index) => [id, index]));
    filtered.sort((a, b) => (recentOrder.get(a.id) ?? games.length) - (recentOrder.get(b.id) ?? games.length));
  }
  const plural = new Intl.PluralRules(language).select(filtered.length);
  const countLabel = 'result' + plural[0].toUpperCase() + plural.slice(1);
  $('result-count').textContent = t(strings[language][countLabel] ? countLabel : 'resultMany', { count: format(filtered.length) });
  $('catalog-grid').innerHTML = filtered.map(card).join('');
  $('catalog-empty').hidden = filtered.length > 0;
  $('catalog-empty-title').textContent = t(category === 'favorites' && !query ? 'noFavorites' : 'noResults');
  syncFavoriteButtons();
}

function updateFilters() {
  for (const button of $('filters').children) {
    button.textContent = t(button.dataset.filter);
    button.setAttribute('aria-pressed', button.dataset.filter === category);
  }
}

function recordRows() {
  const pulse = readStorage('gq_pulseshift_v1');
  const lumen = readStorage('groupquest_lumen_vault_v2');
  const moon = readStorage('gq_moonfall_v1_profile');
  const echo = readStorage('gq_echobound_meta_v1');
  const forge = readStorage('gq_voidforge_v1');
  const wakeward = readStorage('groupquest.wakeward');
  const wakewardRecords = wakeward?.version === 1 ? wakeward.campaign : null;
  const charts = Object.values(wakewardRecords ?? {}).filter((record) => count(record?.best)).length;
  return [
    ['pulse', 'score', pulse?.best],
    ['orbit', 'score', readStorage('orbit_merge_best')],
    ['lumen', 'chambers', count(lumen?.unlocked) > 1 ? lumen.unlocked : 0],
    ['wakeward', 'charts', charts],
    ['moonfall', 'score', moon?.bestScore],
    ['moonfall', 'wave', moon?.bestWave],
    ['prism', 'score', readStorage('gq_prism_best')],
    ['echo', 'act', count(echo?.bestAct) > 1 ? echo.bestAct : 0],
    ['citadel', 'score', readStorage('gq_citadel_best')],
    ['void', 'score', forge?.best],
    ['spot', 'score', readStorage('gq_best')],
  ].filter(([, , value]) => count(value));
}

function renderActivity() {
  const favoriteGames = games.filter((game) => state.favorites.includes(game.id));
  const stats = [['launches', state.played], ['unique', state.uniquePlayed.length], ['saved', favoriteGames.length]]
    .map(([label, value]) => `<div class="metric"><span>${t(label)}</span><strong>${format(value)}</strong></div>`).join('');
  for (const id of ['home-stats', 'profile-stats']) $(id).innerHTML = stats;

  const level = t('level', { level: format(Math.floor(state.played / 10) + 1) });
  const xp = state.played % 10 * 10;
  const xpLabel = t('xp', { current: format(xp) });
  const progress = `<div class="level-label"><strong>${level}</strong><span>${xpLabel}</span></div>
    <progress max="100" value="${xp}" aria-label="${level}, ${xpLabel}"></progress>`;
  for (const id of ['home-level', 'profile-level']) $(id).innerHTML = progress;

  const [latest, ...recent] = state.recent.map((id) => gameById.get(id));
  $('continue-section').hidden = !latest;
  $('continue-game').innerHTML = latest ? compactCard(latest, 'resume') : '';
  $('recent-section').hidden = recent.length === 0;
  $('recent-games').innerHTML = recent.map((game) => compactCard(game)).join('');
  $('profile-favorites').innerHTML = favoriteGames.length
    ? favoriteGames.map((game) => compactCard(game)).join('')
    : `<p class="muted">${t('noFavorites')}</p>`;

  const achievements = [
    ['firstLaunch', state.played >= 1],
    ['tenLaunches', state.played >= 10],
    ['twentyFiveLaunches', state.played >= 25],
    ['firstFavorite', favoriteGames.length >= 1],
  ];
  $('achievements').innerHTML = achievements.map(([name, unlocked]) => `<div class="achievement ${unlocked ? 'is-unlocked' : ''}">
    ${icon(unlocked ? 'award' : 'lock')}<strong>${t(name)}</strong><small>${t(unlocked ? 'unlocked' : 'locked')}</small></div>`).join('');

  const today = new Date().toLocaleDateString('en-CA');
  const dailyBest = count(readStorage('gq_pulseshift_v1')?.dailyBest?.[today]);
  $('daily-status').innerHTML = icon(dailyBest ? 'check' : 'clock') +
    (dailyBest ? t('dailyBest', { score: format(dailyBest) }) : t('dailyReady'));

  const records = recordRows();
  const recordMarkup = records.length ? `<dl class="record-list">${records.map(([id, label, value]) =>
    `<div class="record"><dt>${gameById.get(id).title}<span>${t(label)}</span></dt><dd>${format(Number(value))}</dd></div>`).join('')}</dl>`
    : `<p class="muted">${t('noRecords')}</p>`;
  for (const id of ['ranking-records', 'profile-records']) $(id).innerHTML = recordMarkup;
}

function translate() {
  language = selectedLanguage();
  root.lang = language;
  root.dataset.motion = state.motion ? 'on' : 'off';
  for (const element of document.querySelectorAll('[data-label]')) element.textContent = t(element.dataset.label);
  for (const element of document.querySelectorAll('[data-aria]')) element.setAttribute('aria-label', t(element.dataset.aria));
  for (const element of document.querySelectorAll('[data-placeholder]')) element.placeholder = t(element.dataset.placeholder);
  $('direct-game').title = t('openDirect');
  $('language').value = language;
  $('sound').checked = state.sound;
  $('motion').checked = state.motion;
  setIdentity();
  updateFilters();
  $('recommended-games').innerHTML = ['orbit', 'lumen', 'wakeward'].map((id) => card(gameById.get(id))).join('');
  renderCatalog();
  renderActivity();
  updateFullscreen();
}

function go(next, focus = true) {
  if (next === page) {
    if (focus) $('main').scrollTo(0, 0);
    return;
  }
  page = next;
  for (const id of pages) $(id).hidden = id !== page;
  for (const button of document.querySelectorAll('.nav-items [data-go]')) {
    if (button.dataset.go === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (next === 'games') renderCatalog();
  if (next === 'profile' || next === 'ranking') renderActivity();
  $('main').scrollTo(0, 0);
  if (focus) $(page).querySelector('h1').focus({ preventScroll: true });
}

function setPlayerStatus(status) {
  $('player-loading').hidden = status !== 'loading';
  $('player-error').hidden = status !== 'error';
}

function loadFrame(game) {
  clearTimeout(playerTimer);
  player.querySelector('iframe')?.remove();
  const frame = document.createElement('iframe');
  frame.title = game.title;
  frame.allow = 'fullscreen';
  const url = new URL(game.file, location.href);
  url.searchParams.set('v', 'game-quality-1');
  $('direct-game').href = url.href;
  setPlayerStatus('loading');
  const showError = () => {
    clearTimeout(playerTimer);
    frame.remove();
    setPlayerStatus('error');
  };
  frame.addEventListener('load', () => {
    if (!frame.isConnected) return;
    if (location.protocol !== 'file:') {
      try {
        const title = frame.contentDocument?.title;
        if (!title || /^(404|page not found)/i.test(title) || frame.contentWindow.location.pathname !== url.pathname) {
          showError();
          return;
        }
      } catch {
        showError();
        return;
      }
    }
    clearTimeout(playerTimer);
    frame.style.visibility = '';
    setPlayerStatus('ready');
  }, { once: true });
  frame.addEventListener('error', showError, { once: true });
  frame.style.visibility = 'hidden';
  frame.src = url.href;
  player.querySelector('.player-body').prepend(frame);
  playerTimer = setTimeout(showError, 10000);
}

let launchControl;

function openGame(game, addHistory = false, trigger = null) {
  if (currentGame?.id === game.id) return;
  if (addHistory) {
    history.pushState({ groupquestPlayer: true }, '', '#play-' + game.id);
    state.played += 1;
    state.recent = [game.id, ...state.recent.filter((id) => id !== game.id)].slice(0, 5);
    state.uniquePlayed = [...new Set([...state.uniquePlayed, game.id])];
    save();
    feedback();
  }
  currentGame = game;
  launchControl = trigger;
  $('player-title').textContent = game.title;
  if (!player.open) player.showModal();
  loadFrame(game);
  telegram?.BackButton?.show?.();
}

function dismissGame() {
  if (!currentGame) return;
  clearTimeout(playerTimer);
  currentGame = undefined;
  player.querySelector('iframe')?.remove();
  player.close();
  telegram?.BackButton?.hide?.();
  const launchId = launchControl?.dataset.play;
  const launchSection = launchControl?.closest('section');
  renderActivity();
  if ($('sort').value === 'recent' && page === 'games') renderCatalog();
  const updatedControl = launchSection?.querySelector(`[data-play="${launchId}"]`);
  const focusTarget = launchControl?.isConnected ? launchControl : updatedControl ?? $(page).querySelector('h1');
  focusTarget.focus({ preventScroll: true });
  launchControl = null;
}

function closeGame() {
  if (history.state?.groupquestPlayer && location.hash.startsWith('#play-')) {
    history.back();
    return;
  }
  if (location.hash.startsWith('#play-')) history.replaceState(null, '', location.pathname + location.search);
  dismissGame();
}

function handleGameLocation() {
  const game = location.hash.startsWith('#play-') && gameById.get(location.hash.slice(6));
  if (game) openGame(game);
  else dismissGame();
}

function toggleFavorite(game, control) {
  const favorite = !state.favorites.includes(game.id);
  state.favorites = favorite ? [...state.favorites, game.id] : state.favorites.filter((id) => id !== game.id);
  if (save()) notify(t(favorite ? 'added' : 'removed', { name: game.title }));
  feedback();
  syncFavoriteButtons();
  renderActivity();
  if (category === 'favorites') {
    const wasFocused = document.activeElement === control && $('catalog-grid').contains(control);
    renderCatalog();
    if (wasFocused) {
      const target = $('catalog-grid').querySelector('[data-fav]') ||
        $('filters').querySelector('[data-filter="favorites"]');
      target.focus({ preventScroll: true });
    }
  }
}

function updateFullscreen() {
  const supported = Boolean(telegram?.requestFullscreen && telegram?.exitFullscreen &&
    (!telegram.isVersionAtLeast || telegram.isVersionAtLeast('8.0')));
  $('fullscreen-setting').hidden = !supported;
  const label = telegram?.isFullscreen ? 'exitFullscreen' : 'enterFullscreen';
  $('fullscreen').dataset.label = label;
  $('fullscreen').textContent = t(label);
}

function syncTelegramViewport() {
  for (const side of ['top', 'right', 'bottom', 'left']) {
    root.style.setProperty('--tg-' + side, count(telegram.safeAreaInset?.[side]) + 'px');
    root.style.setProperty('--tg-content-' + side, count(telegram.contentSafeAreaInset?.[side]) + 'px');
  }
  if (Number.isFinite(telegram.viewportHeight) && telegram.viewportHeight > 0) {
    root.style.setProperty('--tg-viewport', telegram.viewportHeight + 'px');
  }
}

function syncTelegramColors() {
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  for (const method of ['setHeaderColor', 'setBackgroundColor', 'setBottomBarColor']) {
    try { telegram[method]?.(background); } catch { /* Method availability varies by client. */ }
  }
}

function initTelegram() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp || telegram === webApp || !webApp.platform || webApp.platform === 'unknown') return;
  telegram = webApp;
  try { telegram.ready?.(); } catch { /* The browser app can still run. */ }
  try { telegram.expand?.(); } catch { /* Some clients manage expansion themselves. */ }
  telegram.BackButton?.onClick?.(closeGame);
  if (player.open) telegram.BackButton?.show?.();
  for (const event of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged']) {
    telegram.onEvent?.(event, syncTelegramViewport);
  }
  telegram.onEvent?.('themeChanged', syncTelegramColors);
  telegram.onEvent?.('fullscreenChanged', () => {
    syncTelegramViewport();
    updateFullscreen();
  });
  telegram.onEvent?.('fullscreenFailed', () => notify(t('fullscreenError')));
  syncTelegramColors();
  syncTelegramViewport();
  translate();
}

function loadTelegram() {
  if (window.Telegram?.WebApp) {
    initTelegram();
    return;
  }
  const launch = new URLSearchParams(location.hash.slice(1));
  const fromTelegram = launch.has('tgWebAppPlatform') || launch.has('tgWebAppData') || launch.has('tgWebAppVersion');
  let storedPlatform;
  try {
    // The SDK keeps the launch data in session storage when the page hash changes.
    storedPlatform = JSON.parse(sessionStorage.getItem('__telegram__initParams'))?.tgWebAppPlatform;
  } catch { /* Storage may be unavailable. */ }
  if (!fromTelegram && !window.TelegramWebviewProxy && (!storedPlatform || storedPlatform === 'unknown')) return;
  const sdk = document.createElement('script');
  sdk.src = 'https://telegram.org/js/telegram-web-app.js';
  sdk.async = true;
  sdk.addEventListener('load', initTelegram, { once: true });
  document.head.append(sdk);
}

for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = icon(element.dataset.icon);
for (const key of categories) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary filter';
  button.dataset.filter = key;
  $('filters').append(button);
}

document.addEventListener('click', (event) => {
  const control = event.target.closest('button');
  if (!control) return;
  const { go: next, play, fav, filter } = control.dataset;
  if (next) {
    go(next);
  } else if (play) {
    openGame(gameById.get(play), true, control);
  } else if (fav) {
    toggleFavorite(gameById.get(fav), control);
  } else if (filter) {
    category = filter;
    updateFilters();
    renderCatalog();
  }
});

$('quick-search').addEventListener('click', () => {
  go('games', false);
  $('game-search').scrollIntoView({ block: 'nearest' });
  $('game-search').focus({ preventScroll: true });
});
document.querySelector('.skip').addEventListener('click', (event) => {
  event.preventDefault();
  $('main').focus({ preventScroll: true });
});
$('game-search').addEventListener('input', renderCatalog);
$('sort').addEventListener('change', renderCatalog);
$('clear-filters').addEventListener('click', () => {
  category = 'all';
  $('game-search').value = '';
  updateFilters();
  renderCatalog();
  $('game-search').focus();
});
$('language').addEventListener('change', (event) => {
  state.lang = event.target.value;
  translate();
  save();
});
$('motion').addEventListener('change', (event) => {
  state.motion = event.target.checked;
  root.dataset.motion = state.motion ? 'on' : 'off';
  save();
});
$('sound').addEventListener('change', (event) => {
  state.sound = event.target.checked;
  feedback();
  save();
});
$('fullscreen').addEventListener('click', () => {
  try {
    if (telegram.isFullscreen) telegram.exitFullscreen();
    else telegram.requestFullscreen();
  } catch {
    notify(t('fullscreenError'));
  }
});
$('share').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.hash = '';
  const data = { title: 'GroupQuest', text: t('shareText'), url: url.href };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    notify(t('linkCopied'));
  } catch { window.prompt(t('copyLink'), data.url); }
});
$('reset').addEventListener('click', () => {
  resetDialog.returnValue = '';
  resetDialog.showModal();
});
resetDialog.addEventListener('close', () => {
  if (resetDialog.returnValue !== 'reset') return;
  Object.assign(state, { played: 0, favorites: [], recent: [], uniquePlayed: [] });
  if (save()) notify(t('resetDone'));
  renderActivity();
  renderCatalog();
});
$('close-player').addEventListener('click', closeGame);
$('retry-game').addEventListener('click', () => { if (currentGame) loadFrame(currentGame); });
player.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeGame();
});
window.addEventListener('popstate', handleGameLocation);
window.addEventListener('pageshow', renderActivity);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderActivity(); });
translate();
loadTelegram();
handleGameLocation();
