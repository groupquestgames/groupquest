function findWebApp() {
  if (window.Telegram?.WebApp) return window.Telegram.WebApp;
  try { return window.parent.Telegram?.WebApp; } catch { return null; }
}

export function connectTelegram(onPause) {
  let webApp;
  const embedded = window.parent !== window;
  const syncInsets = () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const offset = Math.max(0, Number(webApp?.safeAreaInset?.[side]) || 0,
        Number(webApp?.contentSafeAreaInset?.[side]) || 0);
      document.documentElement.style.setProperty('--tg-' + side, offset + 'px');
    }
  };

  function connect() {
    webApp = findWebApp();
    if (!webApp || embedded) return;
    try { webApp.ready(); webApp.expand(); } catch {}
    syncInsets();
    for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'fullscreenFailed']) {
      try { webApp.onEvent(event, syncInsets); } catch {}
    }
    try { webApp.onEvent('deactivated', onPause); } catch {}
  }

  connect();
  const params = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  if (!webApp && !embedded && (params.has('tgWebAppVersion') || query.has('tgWebAppVersion') ||
      params.has('tgWebAppData') || window.TelegramWebviewProxy)) {
    const sdk = document.createElement('script');
    sdk.src = 'https://telegram.org/js/telegram-web-app.js';
    sdk.async = true;
    sdk.addEventListener('load', connect, { once: true });
    document.head.append(sdk);
  }

  const nativeFullscreen = () => !embedded && webApp?.isVersionAtLeast?.('8.0') &&
    typeof webApp.requestFullscreen === 'function';

  return {
    haptic(type) {
      try {
        if (type === 'light' || type === 'dock') webApp?.HapticFeedback?.notificationOccurred('success');
        if (type === 'blocked') webApp?.HapticFeedback?.impactOccurred('light');
      } catch {}
    },
    share(url, text) {
      if (!webApp?.platform || webApp.platform === 'unknown' || !webApp.openTelegramLink) return false;
      try {
        const share = new URL('https://t.me/share/url');
        share.searchParams.set('url', url);
        share.searchParams.set('text', text);
        webApp.openTelegramLink(share.href);
        return true;
      } catch { return false; }
    },
    isFullscreen() {
      return Boolean(webApp?.isFullscreen || document.fullscreenElement || document.webkitFullscreenElement);
    },
    canFullscreen() {
      return Boolean(nativeFullscreen() || document.fullscreenEnabled || document.webkitFullscreenEnabled);
    },
    async fullscreen(onError) {
      try {
        if (nativeFullscreen()) {
          const reject = () => {
            webApp.offEvent?.('fullscreenFailed', reject);
            onError();
          };
          webApp.onEvent?.('fullscreenFailed', reject);
          setTimeout(() => webApp.offEvent?.('fullscreenFailed', reject), 2000);
          if (webApp.isFullscreen) webApp.exitFullscreen();
          else webApp.requestFullscreen();
        } else if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
        else onError();
      } catch { onError(); }
    }
  };
}
