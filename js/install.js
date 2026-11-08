'use strict';
/* Instalacao PWA e atualizacoes seguras que respeitam musica tocando. */
(() => {
  const $ = id => document.getElementById(id);
  const native = !!(window.RadioHitsAndroid && window.RadioHitsAndroid.playQueue);
  const installed = () => navigator.standalone === true ||
    !!window.matchMedia?.('(display-mode: standalone)')?.matches;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const banner = $('pwa-install-banner');
  const notice = $('pwa-update-notice');
  const dialog = $('pwa-install-dialog');
  const installButton = $('pwa-install-button');
  let installPrompt = null, updatePending = false, reloading = false;
  let registration = null, lastCheck = 0, lastSWCheck = 0;
  const revision = document.querySelector('meta[name="radiohits-revision"]')?.content || '';
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('radiohits-install-dismissed') === '1'; } catch (_) {}
  function showInstall() {
    if (!banner) return;
    banner.hidden = native || installed() || dismissed || !(mobile || installPrompt);
    if (installButton) installButton.textContent = installPrompt ? 'Instalar aplicativo' : 'Como instalar';
  }
  function showHelp() { if (dialog?.showModal) dialog.showModal(); }
  window.addEventListener('beforeinstallprompt', event => {
    if (native || installed()) return;
    event.preventDefault(); installPrompt = event; showInstall();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null; if (banner) banner.hidden = true;
  });
  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return showHelp();
    const event = installPrompt; installPrompt = null;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice?.outcome === 'accepted') { if (banner) banner.hidden = true; }
      else showInstall();
    } catch (_) { showHelp(); }
  });
  $('pwa-install-help')?.addEventListener('click', showHelp);
  $('pwa-install-close')?.addEventListener('click', () => dialog?.close());
  $('pwa-install-dismiss')?.addEventListener('click', () => {
    dismissed = true;
    try { sessionStorage.setItem('radiohits-install-dismissed','1'); } catch (_) {}
    showInstall();
  });
  showInstall();
  function safeToRefresh() {
    if (typeof window.RadioHitsMayReload === 'function') return window.RadioHitsMayReload();
    const audio = $('audio'); return !audio || audio.paused || audio.ended;
  }
  function applySafeUpdate() {
    if (!updatePending || reloading || document.hidden) return;
    if (safeToRefresh()) { reloading = true; location.reload(); }
    else if (notice) notice.hidden = false;
  }
  function newUpdateAvailable() {
    updatePending = true;
    if (notice) notice.hidden = false;
    applySafeUpdate();
  }
  $('pwa-update-now')?.addEventListener('click', () => {
    if (!updatePending) return;
    reloading = true; location.reload(); // usuario pode interromper manualmente
  });
  async function checkVersion() {
    if (!revision || navigator.onLine === false || reloading) return;
    const now = Date.now();
    if (now - lastCheck < 30 * 60_000) return;
    lastCheck = now;
    try {
      const response = await fetch('./app-version.json', {cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data.revision === 'string' && data.revision !== revision) newUpdateAvailable();
    } catch (_) { /* Sem rede: manter a interface atual. */ }
  }
  async function checkUpdates() {
    await checkVersion();
    if (registration && !native && navigator.onLine !== false && Date.now()-lastSWCheck >= 6 * 60 * 60_000) {
      lastSWCheck=Date.now();
      try { await registration.update(); } catch (_) {}
    }
    applySafeUpdate();
  }
  window.addEventListener('online', checkUpdates);
  window.addEventListener('focus', checkUpdates);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkUpdates();
  });
  $('audio')?.addEventListener('pause', applySafeUpdate);
  $('audio')?.addEventListener('ended', applySafeUpdate);
  // A ponte Media3 do APK nao utiliza necessariamente o elemento audio do DOM.
  window.setInterval(() => { if (updatePending) applySafeUpdate(); }, 3000);
  window.setInterval(() => { if (!document.hidden) checkUpdates(); }, 30 * 60_000);
  if ('serviceWorker' in navigator && secure && !native) {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      newUpdateAvailable();
    });
    window.addEventListener('load', async () => {
      try {
        registration = await navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'});
        await checkUpdates();
      } catch (_) { /* O app segue utilizavel sem SW. */ }
    });
  } else {
    // O APK le a interface online e verifica a nova versao sem instalar PWA dentro do WebView.
    window.addEventListener('load', checkUpdates);
  }
})();
