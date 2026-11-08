'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const nativeBridge = typeof window.RadioHitsAndroid !== 'undefined' && !!window.RadioHitsAndroid.playQueue;
  function createNativeAudio() {
    const events = new EventTarget();
    let source='', position=0, duration=0, ready=0, paused=true, ended=false, volume=.75, error=null;
    let nativeId='', nativeMode='', nativeIsLocal=false;
    let lastErrorCode=0;
    function emit(type) { events.dispatchEvent(new Event(type)); }
    window.RadioHitsAndroidState = function(info) {
      if (!info || typeof info !== 'object') return;
      const wasPaused = paused;
      const oldId = nativeId;
      nativeId = info.id || '';
      nativeMode = info.mode || '';
      nativeIsLocal = info.isLocal === true;
      paused = !!info.paused;
      if (nativeMode === 'radio') radioWantsPlayback = !paused;
      ended = !!info.ended;
      const code=info.error ? Number(info.errorCode)||2 : 0;
      error=code ? {code} : null;
      if (info.src && (source === '' || (info.id && oldId !== info.id))) source = info.src;
      if (Number.isFinite(Number(info.position))) position = Math.max(0,Number(info.position));
      if (Number(info.duration) > 0) duration = Number(info.duration);
      if (Number(info.readyState) > 0) ready = Number(info.readyState);
      if (typeof state !== 'undefined') state.buffering = info.buffering === true;
      if (wasPaused !== paused) emit(paused?'pause':'play');
      emit('timeupdate');
      if (error && code !== lastErrorCode) emit('error');
      lastErrorCode=code;
      if (info.buffering && !paused && !error)
        setPreloadStatus('Preparando áudio no Android...');
      else if (error && !paused)
        setPreloadStatus('Conexão interrompida · tentando recuperar');
      if (typeof state !== 'undefined' && state.loaded && nativeId && trackById(nativeId)) {
        const changed = state.currentId !== nativeId || state.mode !== nativeMode;
        if (nativeMode === 'radio' || nativeMode === 'ondemand') state.mode=nativeMode;
        if (changed) state.currentId=nativeId;
        let queueChanged=false;
        if (nativeMode === 'ondemand' && Array.isArray(info.queueIds) && info.queueIds.length) {
          const ids=info.queueIds.filter(id=>typeof id==='string' && trackById(id));
          if (ids.length && JSON.stringify(ids)!==JSON.stringify(state.queue)) {
            state.queue=ids;
            queueChanged=true;
          }
          state.queueIndex=Math.max(0,Math.min(state.queue.length-1,Number(info.index)||0));
          state.shuffle=info.shuffle===true;
          state.repeat=info.repeat===2 ? 'all' : info.repeat===1 ? 'one':'off';
        }
        if(changed || queueChanged) {
          renderPlayer();renderRadio();renderExplore();renderQueue();
        }
        setPlayVisuals();
      }
    };
    return {
      get src() { return source; }, set src(value) { source=String(value);position=0;duration=0;ready=1;paused=true; },
      get currentTime() { return position; },
      set currentTime(value) { position=Math.max(0,Number(value)||0); try {window.RadioHitsAndroid.seek(position);} catch (_){} emit('timeupdate'); },
      get duration() { return duration; },
      get readyState() { return ready; },
      get paused() { return paused; },
      get ended() { return ended; },
      get error() { return error; },
      get playbackRate() { return 1; },
      get volume() { return volume; },
      set volume(v) { volume=Math.max(0,Math.min(1,Number(v)||0)); try {window.RadioHitsAndroid.volume(volume);} catch(_){} },
      addEventListener(type,callback) { events.addEventListener(type,callback); },
      load() {ready=1;queueMicrotask(()=>emit('loadedmetadata')); },
      pause() { paused=true;window.RadioHitsAndroid.pause();emit('pause'); },
      play() {
        const tracks = state.mode === 'radio'
            ? radioTracks()
            : state.queue.map(id=>trackById(id)).filter(Boolean);
        const selected = state.currentId;
        if (!tracks.length) return Promise.reject(new Error('Biblioteca vazia'));
        const index = Math.max(0,tracks.findIndex(t=>t.id===selected));
        // Retomar a mesma faixa não precisa destruir a fila nem o buffer nativo.
        const resumeTarget = new URL(tracks[index].src, document.baseURI).href;
        if (state.mode !== 'radio' && nativeId === selected && nativeMode === state.mode && source === resumeTarget
            && (!offlineSources.has(resumeTarget) || nativeIsLocal)
            && !ended && typeof window.RadioHitsAndroid.resume === 'function') {
          window.RadioHitsAndroid.resume();
          paused=false; emit('play');
          return Promise.resolve();
        }
        const request={
          mode:state.mode,id:selected,index,positionMs:Math.round(position*1000),
          epochMs:Number(state.radioPlayback?.epochMs??state.radioSchedule?.epochMs)||EPOCH,
          scheduleRevision:state.radioPlayback?.revision||state.radioSchedule?.revision||'legacy',
          volume:state.volume,leveling:state.leveling,shuffle:state.shuffle && state.mode !== 'radio',
          repeat:state.repeat==='all',
          tracks:tracks.map(t=>({
            id:t.id,title:t.title,artist:t.artist,
            src:new URL(t.src,document.baseURI).href,gainDb:Number(t.gainDb)||0,
            durationMs:Math.max(0,Math.round(Number(t.duration)*1000))
          }))
        };
        window.RadioHitsAndroid.playQueue(JSON.stringify(request));
        paused=false;ended=false;emit('play');
        return Promise.resolve();
      }
    };
  }
  let audio = nativeBridge ? createNativeAudio() : $('audio');
  window.RadioHitsMayReload = () => !audio.src || audio.paused || audio.ended;
  window.RadioHitsPauseForSleep = () => {
    if (state.mode === 'radio') { radioWantsPlayback = false; state.radioPlayback = null; }
    state.playRequested = false;
    if (!audio.paused) audio.pause();
    setPlayVisuals();
  };
  // O navegador prepara uma segunda saída para trocar de faixa sem reiniciar
  // o download no instante da transição. No APK, o Media3 já prepara a fila.
  let standby = null;
  let primedTrackId = null;
  let preloadGeneration = 0;
  let lastPreloadAttempt = 0;
  let radioWantsPlayback = false;
  // Em aparelhos com pouca RAM, evite manter um segundo decodificador.
  const lowMemoryDevice = Number(navigator.deviceMemory || 4) <= 2;
  if (!nativeBridge && !lowMemoryDevice
      && !/iP(?:hone|ad|od)/.test(navigator.userAgent || '')) {
    standby = document.createElement('audio');
    standby.preload = 'auto';
    standby.style.display = 'none';
    standby.setAttribute('aria-hidden', 'true');
    document.body.appendChild(standby);
  }
  const offline = window.RadioHitsOffline;
  let offlineSources = new Set(), offlineLoading = Promise.resolve(), offlineLoadVersion = 0, activeOfflineId = null;
  const activeDownloads = new Map();
  const pausedDownloads = new Set();
  function showDownloadProgress(url, percent) {
    activeDownloads.set(url, percent);
    document.querySelectorAll('[data-action="offline-toggle"]').forEach(btn => {
      const track = trackById(btn.dataset.id);
      if (!track || offline.absolute(track.src) !== url) return;
      btn.disabled = !offline.supportsJobs;
      const span = btn.querySelector('span');
      if (span) span.textContent = offline.supportsJobs ? 'Pausar' :
        percent === null ? 'Baixando...' : 'Baixando ' + percent + '%';
    });
  }
  const STORAGE = 'pulso-radio-v1';
  const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (_) { saved = {}; }

  const state = {
    tracks: [], mode: 'radio', view: 'radio', currentId: null,
    radioOrder: [], radioSchedule: {epochMs:EPOCH,revision:'legacy'}, radioPlayback: null, radioIndex: 0, query: '', genre: 'Todos', folder: 'Todas',
    favorites: new Set(Array.isArray(saved.favorites) ? saved.favorites : []),
    playlists: saved.playlists && typeof saved.playlists === 'object' && !Array.isArray(saved.playlists) ? saved.playlists : {},
    selectedPlaylist: null, pendingAddId: null, buffering: false,
    queue: [], queueIndex: 0, shuffle: false, repeat: 'off',
    volume: Number.isFinite(Number(saved.volume)) ? Math.min(1, Math.max(0, Number(saved.volume))) : .75,
    leveling: saved.leveling !== false,
    previousVolume: .75, pendingSeek: null, playRequested: false, toastTimer: null, loaded: false,
  };
  applyVolumeForTrack();
  $('volume').value = Math.round(state.volume * 100);
  setRangeFill($('volume'));

  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ favorites: [...state.favorites], playlists: state.playlists, volume: state.volume, leveling: state.leveling })); } catch (_) { /* Storage may be unavailable. */ }
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function icon(name, cls='icon') { return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
  function libraryDuration(seconds) {
    const whole = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(whole / 3600), minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    return hours ? `${hours}h ${String(minutes).padStart(2, '0')}min` : minutes ? `${minutes}min ${String(secs).padStart(2, '0')}s` : `${secs}s`;
  }
  function timeFmt(sec) {
    if (!Number.isFinite(Number(sec))) return '0:00';
    sec = Math.max(0, Math.floor(Number(sec)));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  function clockFmt(date) { return new Intl.DateTimeFormat('pt-BR', {hour:'2-digit', minute:'2-digit'}).format(date); }
  function trackById(id) { return state.tracks.find(t => t.id === id); }
  function setRangeFill(input) {
    const min = Number(input.min) || 0, max = Number(input.max) || 100, val = Number(input.value) || 0;
    input.style.setProperty('--range-progress', `${((val - min) / (max - min)) * 100}%`);
  }
  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('is-visible');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2800);
  }
  function empty(message, subtitle, action='') {
    return `<div class="empty-state"><strong>${escapeHtml(message)}</strong><p>${escapeHtml(subtitle)}</p>${action ? `<button data-action="switch-explore">${escapeHtml(action)}</button>` : ''}</div>`;
  }
  function playableTracks() { return state.tracks.filter(t => t.src && Number(t.duration) > 0); }
  function radioTracks() {
    // Atualizações não devem trocar o áudio no meio de uma transmissão ativa.
    if (state.radioPlayback && state.mode === 'radio' && radioWantsPlayback)
      return state.radioPlayback.tracks;
    const available = playableTracks();
    const byId = new Map(available.map(t => [t.id,t]));
    return state.radioOrder.length ? state.radioOrder.map(id => byId.get(id)).filter(Boolean) : available;
  }
  function getRadioInfo(now = Date.now()) {
    const tracks = radioTracks();
    if (!tracks.length) return null;
    const total = tracks.reduce((n, t) => n + Number(t.duration), 0);
    if (total <= 0) return null;
    const epoch = Number(state.radioPlayback?.epochMs ?? state.radioSchedule?.epochMs) || EPOCH;
    let pos = ((((now - epoch) / 1000) % total) + total) % total;
    for (let i = 0; i < tracks.length; i++) {
      const duration = Number(tracks[i].duration);
      if (pos < duration || i === tracks.length - 1) return { track: tracks[i], index: i, offset: Math.min(pos, Math.max(0, duration - .05)), remaining: duration - pos, tracks };
      pos -= duration;
    }
    return null;
  }
  function queueFutureRadio(info, howMany=3) {
    if (!info) return [];
    let inSeconds = info.remaining;
    return Array.from({length:howMany}, (_,i) => {
      const track = info.tracks[(info.index + i + 1) % info.tracks.length];
      const item = {track, when: new Date(Date.now() + inSeconds * 1000)};
      inSeconds += Number(track.duration);
      return item;
    });
  }
  function art(t) { return escapeHtml(t?.cover || './assets/capas/padrao.svg'); }
  function card(t) {
    return `<button class="album-card" data-action="play-track" data-id="${escapeHtml(t.id)}" aria-label="Tocar ${escapeHtml(t.title)}"><div class="album-thumb"><img src="${art(t)}" alt="Capa de ${escapeHtml(t.title)}" loading="lazy"><span class="album-overlay">${icon('play', 'icon icon-filled')}</span></div><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist)}</span></button>`;
  }
  function songRow(t) {
    const liked = state.favorites.has(t.id), active = state.currentId === t.id && state.mode === 'ondemand';
    const stored = offlineSources.has(offline.absolute(t.src));
    const downloading = activeDownloads.has(offline.absolute(t.src));
    const percentage = activeDownloads.get(offline.absolute(t.src));
    const paused = !stored && pausedDownloads.has(offline.absolute(t.src));
    const label = stored ? 'Salva' :
      downloading ? offline.supportsJobs ? 'Pausar' :
        percentage === null ? 'Baixando...' : 'Baixando ' + percentage + '%' :
      paused ? 'Retomar' : 'Baixar';
    const saveButton = `<button class="download-track-button ${stored?'is-downloaded':''}" data-action="offline-toggle" data-id="${escapeHtml(t.id)}" title="${stored?'Excluir cópia offline':downloading?'Pausar download':paused?'Retomar download':'Baixar para ouvir offline'}" aria-label="${label} ${escapeHtml(t.title)}" ${downloading&&!offline.supportsJobs?'disabled':''}>${icon(stored?'trash':downloading&&offline.supportsJobs?'pause':'download')}<span>${label}</span></button>`;
    const cancelButton = offline.supportsJobs && !stored && (downloading || paused)
      ? `<button class="download-cancel-button" data-action="download-cancel" data-id="${escapeHtml(t.id)}" title="Cancelar e apagar download parcial" aria-label="Cancelar download de ${escapeHtml(t.title)}">Cancelar</button>` : '';
    return `<div class="track-row ${active ? 'is-active':''}"><button class="track-main track-main-play" data-action="play-track" data-id="${escapeHtml(t.id)}" aria-label="Tocar ${escapeHtml(t.title)}"><img src="${art(t)}" alt="" loading="lazy"><span class="track-text"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.artist)}</small></span></button><span class="track-genre">${escapeHtml(t.genre)}</span><span class="track-duration">${timeFmt(t.duration)}</span><div class="track-actions"><button class="icon-button ${liked?'is-liked':''}" data-action="like-track" data-id="${escapeHtml(t.id)}" title="${liked?'Remover dos favoritos':'Favoritar'}" aria-label="${liked?'Desfavoritar':'Favoritar'} ${escapeHtml(t.title)}">${icon('heart')}</button><button class="icon-button" data-action="add-playlist" data-id="${escapeHtml(t.id)}" title="Adicionar à playlist" aria-label="Adicionar ${escapeHtml(t.title)} a uma playlist">${icon('plus')}</button>${saveButton}${cancelButton}</div></div>`;
  }
  function libraryTracks() { return state.tracks.filter(t => !t.isJingle); }
  const FOLDER_LABELS = {
    'as melhores 80 e 90': 'Anos 80 e 90',
    'malhacao-internacional-2003': 'Malhação Internacional 2003',
    'classicos': 'Clássicos', 'romanticas': 'Românticas',
    'mpb': 'MPB', 'hip hop': 'Hip Hop',
    'rock': 'Rock', 'dance': 'Dance', 'pop': 'Pop',
    'country': 'Country', 'reggae': 'Reggae',
    'religiosas': 'Música Religiosa',
    'avulsas': 'Avulsas'
  };
  // As pastas vêm do caminho real de cada arquivo no catálogo.
  function trackFolder(track) {
    const match = String(track?.src || '').match(/^\.?\/?musicas\/([^/?#]+)\//i);
    if (!match) return 'Avulsas';
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }
  function folderLabel(name) {
    return FOLDER_LABELS[String(name).toLowerCase()] || String(name).replace(/[-_]+/g, ' ');
  }
  function musicFolders() {
    const folders = new Map();
    libraryTracks().forEach(t => {
      const id = trackFolder(t);
      if (!folders.has(id)) folders.set(id, {id, label: folderLabel(id), count: 0});
      folders.get(id).count++;
    });
    return [...folders.values()].sort((a,b) => a.label.localeCompare(b.label, 'pt-BR'));
  }
  function renderFolders() {
    const folders = musicFolders();
    if (state.folder !== 'Todas' && !folders.some(f => f.id === state.folder))
      state.folder = 'Todas';
    const cards = [{id:'Todas',label:'Todas as músicas',count:libraryTracks().length},...folders];
    $('music-folder-grid').innerHTML = cards.map(f => {
      const selected = state.folder === f.id && state.genre === 'Todos';
      const label = f.count === 1 ? '1 faixa' : f.count + ' faixas';
      return '<button type="button" class="folder-card '+(selected?'is-active':'')+'" data-action="folder" data-folder="'+escapeHtml(f.id)+'" aria-label="Explorar '+escapeHtml(f.label)+', '+label+'" aria-pressed="'+selected+'"><span class="folder-card-icon">'+icon(f.id==='Todas'?'grid':'folder')+'</span><span class="folder-card-text"><strong>'+escapeHtml(f.label)+'</strong><small>'+label+'</small></span>'+icon('arrow','icon folder-arrow')+'</button>';
    }).join('');
    $('music-folder-count').textContent = folders.length + (folders.length===1?' pasta':' pastas');
  }
  function visibleTracks() {
    const query = state.query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return libraryTracks().filter(t => {
      if (state.folder !== 'Todas' && trackFolder(t) !== state.folder) return false;
      if (state.genre !== 'Todos' && t.genre !== state.genre) return false;
      if (!query) return true;
      return (t.title+' '+t.artist+' '+t.genre+' '+folderLabel(trackFolder(t))).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query);
    });
  }
  function renderExplore() {
    renderFolders();
    const tracks = visibleTracks();
    // Descoberta local baseada nos gêneros favoritos, sem perfil remoto.
    const favoriteGenres = new Map();
    libraryTracks().filter(t => state.favorites instanceof Set && state.favorites.has(t.id)).forEach(t =>
      favoriteGenres.set(t.genre, (favoriteGenres.get(t.genre) || 0) + 1));
    const suggested = [...tracks].sort((a,b) =>
      (favoriteGenres.get(b.genre)||0) - (favoriteGenres.get(a.genre)||0));
    $('discover-grid').innerHTML = suggested.slice(0, 4).map(card).join('') ||
      empty('Nenhuma faixa encontrada', 'Experimente outra busca.');
    $('all-tracks').innerHTML = tracks.map(songRow).join('') || empty('Sem resultados', 'Experimente outra pasta, gênero ou termo.');
    $('explore-selection-title').textContent = state.folder !== 'Todas' ? folderLabel(state.folder) :
      state.genre !== 'Todos' ? state.genre : 'Todas as faixas';
    $('explore-track-count').textContent = tracks.length+' '+(tracks.length === 1 ? 'faixa' : 'faixas')+' · '+libraryDuration(tracks.reduce((n,t)=>n+Number(t.duration),0));
    $('play-selection').disabled = tracks.length === 0;
    $('preview-grid').innerHTML = libraryTracks().slice(0, 4).map(card).join('') || empty('Biblioteca vazia','Adicione MP3 na pasta músicas.');
    const genres = ['Todos', ...new Set(libraryTracks().map(t => t.genre).filter(Boolean))];
    $('genre-filters').innerHTML = genres.map(g => '<button data-action="genre" data-genre="'+escapeHtml(g)+'" class="'+(state.genre===g?'is-active':'')+'" aria-pressed="'+(state.genre===g)+'">'+escapeHtml(g)+'</button>').join('');
    $('sidebar-track-count').textContent = libraryTracks().length+' '+(libraryTracks().length===1?'faixa':'faixas');
    const clock = $('sidebar-library-runtime');
    if (clock) clock.textContent = libraryDuration(libraryTracks().reduce((n,t)=>n+Number(t.duration),0)) + ' de música';
    renderOffline();
  }
  function renderOffline() {
    const available = libraryTracks().filter(t => t.src && Number(t.duration) > 0);
    const saved = libraryTracks().filter(t => offlineSources.has(offline.absolute(t.src)));
    const count = $('offline-count'), area = $('offline-tracks');
    const availableCount = $('offline-available-count');
    const availableArea = $('offline-available-tracks');
    const summary = $('offline-dashboard-summary');
    if (summary) summary.textContent = `${available.length} músicas disponíveis para baixar · ${saved.length} salvas no dispositivo`;
    if (availableCount) availableCount.textContent = `${available.length} faixas`;
    if (availableArea) availableArea.innerHTML = available.length ? available.map(songRow).join('') :
      empty('Nenhum áudio disponível','Atualize o catálogo e verifique a conexão.');
    if (count) count.textContent = `${saved.length} salva(s) neste dispositivo`;
    if (area) area.innerHTML = saved.length ? saved.map(songRow).join('') :
      empty('Nenhuma música salva offline','Em Disponíveis para baixar, use o botão Baixar.');
  }
  function jumpToDownloads(targetId='offline-available') {
    navigate('explorar');
    const target = $(targetId);
    if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function updateConnectionNotice() {
    const notice = $('offline-network-notice');
    if (!notice) return;
    const disconnected = navigator.onLine === false;
    notice.hidden = !disconnected;
    if (disconnected) notice.textContent = 'Sem conexão. A rádio online pode parar quando o áudio carregado acabar. Para ouvir sem internet, escolha uma música já baixada em Explorar → Minhas músicas offline.';
    if (disconnected) setPreloadStatus('Sem internet · apenas áudio já carregado');
    else if (nativeBridge) setPreloadStatus('Android: fila gerenciada pelo player nativo');
    else if (!standby) setPreloadStatus('Pré-carga não disponível neste navegador');
  }
  async function syncOffline() {
    try { offlineSources=await offline.list(); renderExplore();renderFavorites();renderPlaylists(); }
    catch(e){console.warn('Offline:',e);}
  }
  async function toggleOffline(id,button) {
    const t=trackById(id);
    if (!t || !t.src) return toast('Música não encontrada no catálogo.');
    const url=offline.absolute(t.src);
    if (activeDownloads.has(url)) {
      if (!offline.supportsJobs) return;
      await offline.pause(t);
      activeDownloads.delete(url);
      pausedDownloads.add(url);
      renderExplore(); renderFavorites(); renderPlaylists();
      return toast('Download pausado. Toque em Retomar para continuar.');
    }
    if (pausedDownloads.has(url)) pausedDownloads.delete(url);
    button.disabled=true;
    try {
      if (offlineSources.has(url)) {
        await offline.remove(t); offlineSources.delete(url);
        toast('Download removido.');
      } else {
        showDownloadProgress(url,null);
        toast('Baixando ' + t.title + '...');
        await offline.download(t, (percent)=>{
          showDownloadProgress(url,percent);
        });
        if (!offline.isNative) { offlineSources.add(url);toast('Música salva offline.'); }
        else toast('Download iniciado.');
      }
    } catch(e){
      activeDownloads.delete(url);
      toast(e.message||'Falha ao baixar.');
    }
    finally {
      if (!offline.isNative) activeDownloads.delete(url);
      button.disabled=false;renderExplore();renderFavorites();renderPlaylists();
    }
  }
  async function cancelDownload(id) {
    const track=trackById(id);
    if (!track || !offline.supportsJobs) return;
    const url=offline.absolute(track.src);
    await offline.cancel(track);
    activeDownloads.delete(url);
    pausedDownloads.delete(url);
    renderExplore(); renderFavorites(); renderPlaylists();
    toast('Download cancelado.');
  }
  let checkingJobs=false;
  async function refreshNativeDownloadJobs() {
    if (!offline.supportsJobs || checkingJobs) return;
    checkingJobs=true;
    try {
      const jobs=await offline.jobs();
      const active=new Map(), paused=new Set();
      for (const job of jobs) {
        if (!job || typeof job.url !== 'string' || !offline.isCatalogAudio(job.url)) continue;
        if (job.state === 'paused') paused.add(job.url);
        else if (job.state === 'running' || job.state === 'queued')
          active.set(job.url, Number.isFinite(job.percent) && job.percent>=0 ? job.percent : null);
      }
      const prior=Array.from(activeDownloads.keys()).sort().join('|')+';'+Array.from(pausedDownloads).sort().join('|');
      const next=Array.from(active.keys()).sort().join('|')+';'+Array.from(paused).sort().join('|');
      activeDownloads.clear(); pausedDownloads.clear();
      for (const [url,percent] of active) activeDownloads.set(url,percent);
      for (const url of paused) pausedDownloads.add(url);
      if (prior!==next) {
        await syncOffline();
        renderExplore();renderFavorites();renderPlaylists();
      } else if (activeDownloads.size) {
        for (const [url,percent] of activeDownloads) showDownloadProgress(url,percent);
      }
    } catch (error) { console.warn('Fila offline:',error); }
    finally { checkingJobs=false; }
  }
  if (offline.supportsJobs) {
    setInterval(()=>{ if (!document.hidden) refreshNativeDownloadJobs(); },4000);
    window.addEventListener('focus',refreshNativeDownloadJobs);
  }
  offline.onChange(async e=>{
    if (e.type === 'paused' || e.type === 'canceled') {
      if (e.url) {
        activeDownloads.delete(e.url);
        if (e.type==='paused') pausedDownloads.add(e.url);
        else pausedDownloads.delete(e.url);
      }
      return;
    }
    if (e.type === 'started' || e.type === 'progress') {
      if(e.url) showDownloadProgress(e.url,Number.isFinite(Number(e.percent)) ? Number(e.percent) : null);
      return;
    }
    if(['done','deleted','error'].includes(e.type)){
      if(e.url) {activeDownloads.delete(e.url); pausedDownloads.delete(e.url);}
      await syncOffline();
      if(e.type==='done')toast('Download concluído e disponível offline.');
      if(e.type==='error')toast('Falha: '+(e.message||'verifique a internet.'));
    }
  });
  function renderFavorites() {
    const tracks = libraryTracks().filter(t => state.favorites.has(t.id));
    $('favorite-tracks').innerHTML = tracks.length ? tracks.map(songRow).join('') : empty('Seus favoritos aparecerão aqui', 'Toque no coração de qualquer faixa para guardar.', 'Explorar faixas');
  }
  function renderPlaylists() {
    const names = Object.keys(state.playlists);
    const backupControls = '<div class="playlist-detail-tools"><button class="outline-button" data-action="backup-library">Copiar backup da biblioteca</button><button class="outline-button" data-action="restore-library">Restaurar backup</button></div>';
    $('playlist-grid').innerHTML = names.length ? names.map((name,i) => {
      const ids = Array.isArray(state.playlists[name]) ? state.playlists[name] : [];
      const cover = trackById(ids[0])?.cover || './assets/capas/padrao.svg';
      return `<button class="playlist-tile ${state.selectedPlaylist === name?'is-selected':''}" data-action="open-playlist" data-playlist="${escapeHtml(name)}"><img src="${escapeHtml(cover)}" alt=""><strong>${escapeHtml(name)}</strong><small>${ids.length} ${ids.length===1?'música':'músicas'}</small></button>`;
    }).join('') : empty('Crie sua primeira playlist','Depois adicione faixas usando o botão + no catálogo.');
    const name = state.selectedPlaylist;
    if (!name || !Object.prototype.hasOwnProperty.call(state.playlists,name)) { $('playlist-detail').innerHTML = backupControls; return; }
    const ids = Array.isArray(state.playlists[name]) ? state.playlists[name] : [];
    const tracks = ids.map(trackById).filter(Boolean);
    $('playlist-detail').innerHTML = backupControls + `<div class="playlist-detail-tools"><h3>${escapeHtml(name)}</h3><button class="outline-button" data-action="play-playlist" data-playlist="${escapeHtml(name)}">${icon('play','icon icon-filled')} Tocar playlist</button></div>${tracks.length ? tracks.map(t => `${songRow(t)}<div style="display:flex;justify-content:flex-end"><button class="side-add" data-action="remove-playlist-song" data-id="${escapeHtml(t.id)}" data-playlist="${escapeHtml(name)}">Remover desta playlist</button></div>`).join('') : empty('Playlist vazia','Adicione faixas usando o catálogo.')}`;
  }
  function renderRadio(info = getRadioInfo()) {
    if (!info) {
      $('station-title').textContent = 'Nenhuma música disponível';
      $('station-artist').textContent = 'Adicione arquivos à pasta músicas';
      $('radio-up-next').innerHTML = empty('Sem programação', 'Adicione MP3 para iniciar a rádio.');
      return;
    }
    $('station-title').textContent = info.track.title;
    $('station-artist').textContent = info.track.artist;
    $('station-cover').src = info.track.cover;
    $('station-cover').alt = `Capa de ${info.track.title}`;
    $('station-clock').textContent = clockFmt(new Date());
    $('radio-up-next').innerHTML = queueFutureRadio(info).map(item => `<div class="up-next-item"><img src="${art(item.track)}" alt=""><div><strong>${escapeHtml(item.track.title)}</strong><small>${escapeHtml(item.track.artist)}</small></div><time datetime="${item.when.toISOString()}">${clockFmt(item.when)}</time></div>`).join('');
  }
  function renderQueue(info = getRadioInfo()) {
    if (state.mode === 'radio') {
      $('queue-mode').textContent = 'Programação da rádio';
      $('queue-items').innerHTML = info ? [{track:info.track, when:new Date(), current:true}, ...queueFutureRadio(info, 5)].map(item => `<div class="queue-item ${item.current?'is-current':''}"><img src="${art(item.track)}" alt=""><div class="queue-item-copy"><strong>${escapeHtml(item.track.title)}</strong><small>${escapeHtml(item.track.artist)}</small></div><time>${item.current?'Agora':clockFmt(item.when)}</time></div>`).join('') : empty('Sem faixas', 'Adicione músicas para começar.');
    } else {
      $('queue-mode').textContent = 'Fila pessoal';
      const ids = state.queue.slice(state.queueIndex);
      $('queue-items').innerHTML = ids.length ? ids.map((id,i) => {
        const t = trackById(id); if (!t) return '';
        return `<button class="queue-item ${i===0?'is-current':''}" data-action="play-queued" data-index="${state.queueIndex + i}"><img src="${art(t)}" alt=""><span class="queue-item-copy"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.artist)}</small></span><time>${i===0?'Agora':timeFmt(t.duration)}</time></button>`;
      }).join('') : empty('Fila vazia', 'Escolha uma música para começar.');
    }
  }
  // Compensação conservadora EBU R128: atenuação por faixa, sem ganho positivo.
  function gainFactor(track) {
    if (!state.leveling || !track) return 1;
    const db = Number(track.gainDb);
    return Number.isFinite(db) ? Math.pow(10,Math.max(-10,Math.min(0,db))/20) : 1;
  }
  function applyVolumeForTrack(track=trackById(state.currentId)) {
    if (nativeBridge) {
      // O Media3 aplica o ganho de cada faixa, inclusive ao mudar de música
      // com a tela bloqueada. O controle aqui é apenas o volume mestre.
      audio.volume=state.volume;
      if (window.RadioHitsAndroid.setLeveling)
        window.RadioHitsAndroid.setLeveling(state.leveling);
    } else {
      audio.volume=Math.min(1,Math.max(0,state.volume*gainFactor(track)));
      if (standby) standby.volume=Math.min(1,Math.max(0,
        state.volume*gainFactor(trackById(primedTrackId))));
    }
  }
  function setPlayVisuals() {
    const playing = !audio.paused && !audio.ended;
    const loading = !!state.buffering && !!state.currentId && (playing || state.playRequested) && !audio.error;
    const playIcon = playing ? 'pause' : 'play';
    $('player-play').innerHTML = icon(playIcon, 'icon icon-filled');
    $('player-play').setAttribute('aria-label', playing?'Pausar':'Reproduzir');
    $('station-play').innerHTML = `${icon(playIcon,'icon icon-filled')}<span>${playing && state.mode==='radio'?'Pausar rádio':'Escutar agora'}</span>`;
    $('hero-radio-play').innerHTML = `${icon(playing && state.mode==='radio'?'pause':'play','icon icon-filled')}<span>${playing && state.mode==='radio'?'Pausar rádio':'Ouvir rádio'}</span>`;
    $('station-play').classList.toggle('is-playing', playing && state.mode === 'radio');
    document.querySelector('.station-card').classList.toggle('is-playing', playing && state.mode === 'radio');
    // O vinil acompanha a reprodução real, não apenas o modo selecionado.
    const visualTrack=trackById(state.currentId) || getRadioInfo()?.track;
    const cover=$('vinyl-cover');
    if (cover) {
      const source=visualTrack?.cover || './assets/capas/padrao.svg';
      if (cover.getAttribute('src') !== source) cover.setAttribute('src',source);
    }
    // Evita composicao grafica em abas ocultas e no Android em segundo plano.
    const animateVinyl = playing && !loading && !!state.currentId && !document.hidden;
    $('vinyl-deck')?.classList.toggle('is-playing', animateVinyl);
    $('player-shell')?.classList.toggle('is-playing', animateVinyl);
    $('vinyl-deck')?.classList.toggle('is-buffering', loading && !document.hidden);
    $('player-shell')?.classList.toggle('is-buffering', loading && !document.hidden);
    const status=$('vinyl-status');
    if (status) {
      const message = loading ? 'CARREGANDO' : audio.error ? 'ERRO NO ÁUDIO' :
        playing ? 'TOCANDO' : state.currentId ? 'PAUSADO' : 'PRONTO';
      if (status.textContent !== message) status.textContent=message;
    }
    $('vinyl-play-hit')?.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproduzir música');
  }
  function renderPlayer() {
    const current = trackById(state.currentId) || getRadioInfo()?.track;
    if (current) {
      $('player-title').textContent = current.title;
      $('player-artist').textContent = current.artist;
      $('player-cover').src = current.cover;
      $('player-cover').alt = `Capa de ${current.title}`;
      const liked = state.favorites.has(current.id);
      $('player-like').classList.toggle('is-liked', liked);
      $('player-like').title = liked ? 'Remover dos favoritos' : 'Favoritar';
    }
    $('player-mode').textContent = state.mode === 'radio' ? 'RÁDIO' : 'MINHA ESCOLHA';
    $('previous').disabled = state.mode === 'radio';
    $('next').disabled = state.mode === 'radio';
    $('shuffle').disabled = state.mode === 'radio';
    $('repeat').disabled = state.mode === 'radio';
    $('seek').disabled = state.mode === 'radio';
    $('shuffle').classList.toggle('is-active', state.shuffle && state.mode==='ondemand');
    $('repeat').classList.toggle('is-active', state.repeat!=='off' && state.mode==='ondemand');
    $('repeat-one').classList.toggle('is-visible', state.repeat==='one' && state.mode==='ondemand');
    $('volume-button').innerHTML = icon(state.volume === 0 ? 'muted' : 'volume');
    const levelingButton=$('leveling-toggle');
    if (levelingButton) {
      levelingButton.setAttribute('aria-pressed',String(state.leveling));
      levelingButton.classList.toggle('is-active',state.leveling);
      levelingButton.title=state.leveling?'Desativar volume equilibrado':'Ativar volume equilibrado';
    }
    setPlayVisuals(); updateProgress();
  }
  function updateProgress() {
    const radio = state.mode === 'radio' ? getRadioInfo() : null;
    const cur = trackById(state.currentId);
    const duration = radio ? Number(radio.track.duration) : Number.isFinite(audio.duration) ? audio.duration : Number(cur?.duration || 0);
    const progress = radio ? radio.offset : Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    $('elapsed').textContent = timeFmt(progress);
    $('total').textContent = timeFmt(duration);
    $('seek').value = duration > 0 ? Math.max(0, Math.min(1000, Math.round(progress / duration * 1000))) : 0;
    setRangeFill($('seek'));
    if (!nativeBridge && 'mediaSession' in navigator && cur) {
      try { navigator.mediaSession.setPositionState({duration: Math.max(.01,duration), playbackRate: audio.playbackRate, position: Math.min(Math.max(0, progress), Math.max(.01, duration))}); } catch (_) { /* unsupported */ }
    }
  }
  function updateMediaSession(t) {
    if (nativeBridge || !('mediaSession' in navigator) || !t) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title:t.title, artist:t.artist, album:state.mode==='radio'?'Radio Hits':'Biblioteca Radio Hits', artwork:[{src:new URL(t.cover, document.baseURI).href,sizes:'512x512',type:'image/svg+xml'}] });
      navigator.mediaSession.setActionHandler('play', () => togglePlayback());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayback());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    } catch (_) { /* unsupported browser */ }
  }
  // Executado próximo ao fim da faixa. Não faz pré-download de toda a biblioteca.
  // Em conexões com economia de dados, mantém o carregamento tradicional.
  function setPreloadStatus(message) {
    const el=$('preload-status');
    if(el && el.textContent!==message) el.textContent=message;
  }
  function clearStandby() {
    if (!standby) return;
    setPreloadStatus('Pré-carga nos últimos 25 s');
    ++preloadGeneration;
    primedTrackId = null;
    standby.pause();
    standby.removeAttribute('src');
    standby.load();
    offline.releaseUnused?.([audio.src]);
  }
  function nextToPrepare() {
    if (!state.loaded || (state.shuffle && state.mode !== 'radio')
        || (state.repeat === 'one' && state.mode !== 'radio')) return null;
    if (state.mode === 'radio') {
      const info = getRadioInfo();
      if (!info || info.remaining > 25 || info.remaining < 0) return null;
      return info.tracks[(info.index + 1) % info.tracks.length] || null;
    }
    if (!Number.isFinite(audio.duration) || !Number.isFinite(audio.currentTime)
        || audio.duration - audio.currentTime > 25) return null;
    const nextIndex = state.queueIndex + 1;
    const id = nextIndex < state.queue.length ? state.queue[nextIndex]
      : state.repeat === 'all' ? state.queue[0] : null;
    return id && id !== state.currentId ? trackById(id) : null;
  }
  function prepareNextAudio() {
    if (!standby || audio.paused || audio.ended || !state.loaded || document.hidden) return;
    if (navigator.connection?.saveData) {
      setPreloadStatus('Economia de dados: sem pré-carga');
      return;
    }
    if (Date.now() - lastPreloadAttempt < 2000) return;
    lastPreloadAttempt = Date.now();
    const next = nextToPrepare();
    if (!next || next.id === primedTrackId) return;
    const generation = ++preloadGeneration;
    primedTrackId = next.id;
    setPreloadStatus('Preparando próxima faixa...');
    offline.playableSource(next).then(src => {
      if (generation !== preloadGeneration || !standby || primedTrackId !== next.id) return;
      const pending = standby;
      pending.addEventListener('canplay', () => {
        if (generation === preloadGeneration && pending === standby && primedTrackId === next.id)
          setPreloadStatus('Próxima pronta para iniciar');
      },{once:true});
      standby.src = src;
      standby.volume = Math.min(1,state.volume*gainFactor(next));
      standby.preload = 'auto';
      standby.load();
      offline.releaseUnused?.([audio.src,standby.src]);
    }).catch(error => {
      if (generation === preloadGeneration) {
        primedTrackId = null;
        setPreloadStatus('Pré-carga indisponível · usando streaming');
        console.warn('Pré-carregamento indisponível:', error);
      }
    });
  }
  function usePreparedAudio(track, seekTo) {
    if (!standby || primedTrackId !== track.id || standby.readyState < 2) return false;
    const old = audio;
    audio = standby;
    standby = old;
    primedTrackId = null;
    ++preloadGeneration;
    audio.volume = Math.min(1,state.volume*gainFactor(track));
    old.pause();
    old.removeAttribute('src');
    old.load();
    offline.releaseUnused?.([audio.src]);
    state.pendingSeek = Number(seekTo) || 0;
    if (audio.readyState >= 1) {
      try {
        audio.currentTime = Math.max(0,Math.min(state.pendingSeek,
          Number.isFinite(audio.duration) ? Math.max(0,audio.duration-.03) : state.pendingSeek));
        state.pendingSeek = null;
      } catch (_) { /* metadados ainda não disponíveis */ }
    }
    return true;
  }
  function loadTrack(t, seekTo=0) {
    if (!t) return false;
    const target=new URL(t.src,document.baseURI).href;
    const serial=++offlineLoadVersion;
    if (!nativeBridge && usePreparedAudio(t, seekTo)) {
      offlineLoading = Promise.resolve();
      activeOfflineId = offlineSources.has(target) ? t.id : null;
    } else if (!nativeBridge && offlineSources.has(target)) {
      clearStandby();
      state.pendingSeek=Number(seekTo)||0;
      offlineLoading=offline.playableSource(t).then(localURL=>{
        if(serial!==offlineLoadVersion)return;
        if(audio.src!==localURL||activeOfflineId!==t.id){
          audio.src=localURL;audio.load();activeOfflineId=t.id;
          offline.releaseUnused?.([audio.src,standby?.src]);
        } else if(audio.readyState>=1) {
          audio.currentTime=Number(seekTo)||0;state.pendingSeek=null;
          offline.releaseUnused?.([audio.src,standby?.src]);
        }
      });
    } else {
      if (!nativeBridge) clearStandby();
      offlineLoading=Promise.resolve();
      activeOfflineId=null;
      if(audio.src!==target){
        state.pendingSeek=Number(seekTo)||0;
        audio.src=target;audio.load();
        offline.releaseUnused?.([audio.src,standby?.src]);
        if(nativeBridge){audio.currentTime=Number(seekTo)||0;state.pendingSeek=null;}
      } else if(Number.isFinite(Number(seekTo))){
        if(audio.readyState>=1){try{audio.currentTime=Number(seekTo);}catch(_){state.pendingSeek=Number(seekTo);}}
        else state.pendingSeek=Number(seekTo);
        offline.releaseUnused?.([audio.src,standby?.src]);
      }
    }
    state.currentId=t.id;
    state.buffering = true;
    applyVolumeForTrack(t);
    updateMediaSession(t);
    renderPlayer();
    return true;
  }
  async function requestPlay() {
    try {await offlineLoading;} catch(e){console.warn('Falha no offline',e);}
    if (!audio.src) return;
    state.playRequested = true;
    setPlayVisuals();
    try { await audio.play(); } catch (err) {
      state.buffering = false;
      state.playRequested = false;
      if (err?.name !== 'AbortError') toast('Não foi possível iniciar. Verifique o áudio ou toque em reproduzir.');
      setPlayVisuals();
    }
  }
  function playRadio() {
    // Ao pressionar Rádio, o ouvinte adere conscientemente à nova revisão.
    // Durante a transmissão, a programação em uso fica congelada.
    state.radioPlayback=null;
    const info = getRadioInfo();
    if (!info) { toast('Ainda não há músicas na rádio.'); return; }
    state.mode = 'radio';
    radioWantsPlayback = true;
    state.radioPlayback = {
      tracks:info.tracks,
      epochMs:Number(state.radioSchedule?.epochMs)||EPOCH,
      revision:state.radioSchedule?.revision||'legacy'
    };
    loadTrack(info.track, info.offset);
    requestPlay();
    renderRadio(info); renderQueue(info); renderExplore(); renderPlayer();
  }
  function toggleRadio() {
    if (state.mode === 'radio' && !audio.paused) {
      radioWantsPlayback = false;
      state.radioPlayback = null;
      audio.pause();
    } else playRadio();
  }
  function selectSong(id, queueIds) {
    const t = trackById(id); if (!t || t.isJingle) return;
    state.mode = 'ondemand';
    radioWantsPlayback = false;
    state.radioPlayback = null;
    const ids = [...new Set((queueIds || visibleTracks().map(t=>t.id)).filter(id => Boolean(trackById(id))))];
    state.queue = ids.includes(id) ? ids : [id, ...ids];
    state.queueIndex = state.queue.indexOf(id);
    loadTrack(t, 0); requestPlay();
    renderQueue(); renderExplore(); renderFavorites(); renderPlayer();
  }
  function togglePlayback() {
    if (!state.loaded) return;
    if (!audio.paused) {
      if (state.mode === 'radio') { radioWantsPlayback = false; state.radioPlayback = null; }
      audio.pause(); return;
    }
    if (state.mode === 'radio') { playRadio(); return; }
    const t = trackById(state.currentId) || libraryTracks()[0];
    if (!t) return toast('Adicione músicas para começar.');
    // Não reinicie arquivos locais blob: quando o usuário só quer retomar a faixa.
    if (!audio.src || (audio.src !== new URL(t.src, document.baseURI).href && activeOfflineId !== t.id)) loadTrack(t, 0);
    requestPlay();
  }
  function nextTrack(manual=false) {
    if (state.mode === 'radio') return;
    if (state.repeat === 'one' && !manual) { audio.currentTime = 0; requestPlay(); return; }
    if (state.shuffle && state.queue.length > 1) {
      const rest = state.queue.filter(id => id !== state.currentId);
      const id = rest[Math.floor(Math.random() * rest.length)];
      state.queueIndex = state.queue.indexOf(id);
    } else if (state.queueIndex + 1 < state.queue.length) state.queueIndex++;
    else if (state.repeat === 'all') state.queueIndex = 0;
    else { audio.pause(); audio.currentTime = 0; updateProgress(); return; }
    const t = trackById(state.queue[state.queueIndex]);
    if (t) { loadTrack(t, 0); requestPlay(); renderQueue(); renderExplore(); renderFavorites(); }
  }
  function prevTrack() {
    if (state.mode === 'radio') return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    state.queueIndex = Math.max(0, state.queueIndex - 1);
    const t = trackById(state.queue[state.queueIndex]);
    if (t) { loadTrack(t, 0); requestPlay(); renderQueue(); renderExplore(); }
  }
  function navigate(view) {
    if (!['radio','explorar','favoritos','playlists'].includes(view)) return;
    state.view = view;
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('is-hidden', el.id !== `view-${view}`));
    document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('is-active', el.dataset.view === view));
    if (view === 'explorar') renderExplore();
    if (view === 'favoritos') renderFavorites();
    if (view === 'playlists') renderPlaylists();
    if (view === 'radio') renderRadio();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function toggleLike(id) {
    if (!trackById(id) || trackById(id).isJingle) return;
    if (state.favorites.has(id)) { state.favorites.delete(id); toast('Removida dos favoritos'); }
    else { state.favorites.add(id); toast('Adicionada aos favoritos'); }
    persist(); renderPlayer(); renderExplore(); renderFavorites(); renderPlaylists();
  }
  function openModal(title, content) {
    $('modal-heading').textContent = title; $('modal-body').innerHTML = content; $('modal').showModal();
  }
  function createPlaylistDialog() {
    openModal('Criar playlist', `<form id="new-playlist-form"><label for="new-playlist-name">Nome da playlist</label><input type="text" id="new-playlist-name" name="name" placeholder="Ex.: Minhas favoritas" maxlength="55" required autofocus><button type="submit" class="primary-action">Criar coleção</button></form>`);
    $('new-playlist-form').addEventListener('submit', e => {
      e.preventDefault(); const name = String(new FormData(e.currentTarget).get('name') || '').trim();
      if (!name || ['__proto__','prototype','constructor'].includes(name)) return toast('Escolha outro nome para a playlist.');
      if (Object.prototype.hasOwnProperty.call(state.playlists, name)) return toast('Já existe uma playlist com esse nome.');
      state.playlists[name] = []; state.selectedPlaylist = name;
      if (state.pendingAddId && trackById(state.pendingAddId)) state.playlists[name].push(state.pendingAddId);
      state.pendingAddId = null;
      persist(); $('modal').close(); navigate('playlists'); toast('Playlist criada!');
    });
    $('new-playlist-name').focus();
  }
  // Backup portátil sem conta/servidor. IDs inexistentes são ignorados no restore.
  function exportLibrary() {
    return JSON.stringify({
      format: 'radio-hits-library', version: 1,
      favorites: [...state.favorites].filter(id => trackById(id) && !trackById(id).isJingle),
      playlists: Object.fromEntries(Object.entries(state.playlists)
        .filter(([name,ids]) => name && !['__proto__','prototype','constructor'].includes(name) && Array.isArray(ids))
        .map(([name,ids]) => [name,[...new Set(ids.filter(id => trackById(id) && !trackById(id).isJingle))].slice(0,10000)]))
    }, null, 2);
  }
  function restoreLibrary(text) {
    const data = JSON.parse(text);
    if (!data || data.format !== 'radio-hits-library' || data.version !== 1
        || !Array.isArray(data.favorites) || !data.playlists
        || typeof data.playlists !== 'object' || Array.isArray(data.playlists))
      throw new Error('Formato de backup inválido');
    const validId = id => typeof id === 'string' && trackById(id) && !trackById(id).isJingle;
    const playlists = Object.create(null);
    for (const [name, ids] of Object.entries(data.playlists)) {
      if (!name || name.length > 55 || ['__proto__','prototype','constructor'].includes(name) || !Array.isArray(ids)) continue;
      if (Object.keys(playlists).length >= 200) break;
      playlists[name] = [...new Set(ids.filter(validId))].slice(0, 10000);
    }
    state.playlists = playlists;
    state.favorites = new Set(data.favorites.filter(validId));
    state.selectedPlaylist = null;
    persist();renderFavorites();renderPlaylists();renderExplore();renderPlayer();
  }
  async function backupLibrary() {
    const content = exportLibrary();
    try {
      await navigator.clipboard.writeText(content);
      toast('Backup copiado. Guarde o texto em local seguro.');
    } catch (_) {
      openModal('Backup da biblioteca', '<p>Copie e guarde este texto para restaurar suas listas em outro aparelho.</p><textarea id="backup-text" rows="9" readonly></textarea>');
      $('backup-text').value = content;
      $('backup-text').focus();$('backup-text').select();
    }
  }
  function restoreLibraryDialog() {
    openModal('Restaurar biblioteca', '<p>Cole o backup gerado no outro aparelho. As playlists e favoritos atuais serão substituídos. Arquivos não existentes neste catálogo serão ignorados.</p><form id="restore-form"><textarea name="backup" rows="9" maxlength="2000000" required aria-label="Conteúdo do backup"></textarea><button class="primary-action" type="submit">Restaurar playlists e favoritos</button></form>');
    $('restore-form').addEventListener('submit', e => {
      e.preventDefault();
      try {
        restoreLibrary(String(new FormData(e.currentTarget).get('backup') || ''));
        $('modal').close();toast('Biblioteca restaurada neste aparelho.');
      } catch (error) { toast('Backup inválido: '+error.message); }
    });
  }
  function showPlaylistChooser(id) {
    state.pendingAddId = id;
    const names = Object.keys(state.playlists);
    if (!names.length) { createPlaylistDialog(); return; }
    openModal('Adicionar à playlist', `<p>Escolha em qual coleção guardar esta música.</p>${names.map(name=>`<button class="playlist-option" data-action="choose-playlist" data-playlist="${escapeHtml(name)}">${escapeHtml(name)} ${icon('plus')}</button>`).join('')}<button class="outline-button" data-action="new-playlist">${icon('plus')} Criar outra playlist</button>`);
  }
  function guide() {
    openModal('Adicionar suas músicas', `<p>Este site funciona sem servidor. Os arquivos MP3 ficam dentro do seu repositório GitHub.</p><ol><li>Envie os arquivos <code>.mp3</code>, <code>.ogg</code> ou <code>.m4a</code> para a pasta <code>musicas/</code>.</li><li>Opcional: ajuste títulos, artistas e capas em <code>musicas/metadados.json</code>.</li><li>Ao publicar, o GitHub Actions gera automaticamente o catálogo e atualiza a biblioteca e a rádio.</li></ol><p>Limite importante: o GitHub Pages publica até 1 GB por site. Use apenas músicas próprias ou autorizadas.</p><button class="primary-action" data-action="close-modal">Entendi</button>`);
  }
  function about() {
    openModal('Sobre a Radio Hits', `<p><strong>Radio Hits v1.1</strong> reúne rádio sincronizada por horário e biblioteca sob demanda. Feito com HTML, CSS e JavaScript, sem serviços de terceiros.</p><p>É uma demonstração: não há DJ ao vivo, contas ou sincronização de playlists entre dispositivos. Favoritos e playlists ficam no navegador.</p><p>As faixas de exemplo são composições instrumentais originais feitas exclusivamente para testar o projeto.</p>`);
  }
  function handleAction(el) {
    const id = el.dataset.id;
    switch(el.dataset.action) {
      case 'play-track': selectSong(id); break;
      case 'play-queued': { const i = Number(el.dataset.index); if (Number.isInteger(i) && state.queue[i]) { state.queueIndex=i; const t=trackById(state.queue[i]); loadTrack(t,0);requestPlay();renderQueue();renderExplore(); } break; }
      case 'like-track': toggleLike(id); break;
      case 'offline-toggle': toggleOffline(id,el); break;
      case 'download-cancel': cancelDownload(id); break;
      case 'open-downloads': jumpToDownloads(); break;
      case 'open-offline-available': jumpToDownloads('offline-available'); break;
      case 'open-offline-saved': jumpToDownloads('offline-library'); break;
      case 'add-playlist': showPlaylistChooser(id); break;
      case 'switch-explore': navigate('explorar'); break;
      case 'genre':
        state.folder='Todas';
        state.genre=el.dataset.genre;
        renderExplore();
        $('track-catalog-section').scrollIntoView({behavior:'smooth',block:'start'});
        break;
      case 'back-to-folders': $('music-folders').scrollIntoView({behavior:'smooth',block:'start'}); break;
      case 'play-selection': {
        const tracks=visibleTracks();
        if (!tracks.length) return toast('Não há músicas nesta seleção.');
        selectSong(tracks[0].id,tracks.map(t=>t.id));
        break;
      }
      case 'folder':
        if (el.dataset.folder !== 'Todas' && !musicFolders().some(f=>f.id===el.dataset.folder)) break;
        state.folder=el.dataset.folder;
        state.genre='Todos';
        renderExplore();
        $('track-catalog-section').scrollIntoView({behavior:'smooth',block:'start'});
        break;
      case 'open-playlist': state.selectedPlaylist=el.dataset.playlist;renderPlaylists();break;
      case 'play-playlist': { const ids = (state.playlists[el.dataset.playlist] || []).filter(id => trackById(id)); if (!ids.length) return toast('A playlist está vazia.'); selectSong(ids[0],ids); break; }
      case 'remove-playlist-song': { const ids=state.playlists[el.dataset.playlist] || []; state.playlists[el.dataset.playlist]=ids.filter(x=>x!==id);persist();renderPlaylists();toast('Música removida desta playlist');break; }
      case 'choose-playlist': { const name=el.dataset.playlist, id=state.pendingAddId; if (!Object.prototype.hasOwnProperty.call(state.playlists,name)) break; if (!state.playlists[name].includes(id)) state.playlists[name].push(id);persist();state.pendingAddId=null;$('modal').close();toast('Adicionada à playlist');renderPlaylists();break; }
      case 'new-playlist': createPlaylistDialog();break;
      case 'backup-library': backupLibrary();break;
      case 'restore-library': restoreLibraryDialog();break;
      case 'close-modal': $('modal').close();break;
    }
  }
  document.addEventListener('click', e => {
    const nav=e.target.closest('[data-view]'); if (nav) return navigate(nav.dataset.view);
    const action=e.target.closest('[data-action]'); if (action) handleAction(action);
  });
  $('hero-radio-play').addEventListener('click', toggleRadio);
  $('vinyl-play-hit').addEventListener('click', togglePlayback);
  $('station-play').addEventListener('click', toggleRadio);
  $('player-play').addEventListener('click', togglePlayback);
  $('next').addEventListener('click', () => nextTrack(true));
  $('previous').addEventListener('click', prevTrack);
  $('shuffle').addEventListener('click', () => {state.shuffle=!state.shuffle;renderPlayer();toast(state.shuffle?'Modo aleatório ativado':'Modo aleatório desativado');});
  $('repeat').addEventListener('click', () => {state.repeat=state.repeat==='off'?'all':state.repeat==='all'?'one':'off';renderPlayer();toast({all:'Repetir toda a fila',one:'Repetir música atual',off:'Repetição desligada'}[state.repeat]);});
  $('player-like').addEventListener('click', () => {if (state.currentId) toggleLike(state.currentId);});
  $('seek').addEventListener('input', e => {
    if (state.mode==='radio'||!Number.isFinite(audio.duration)||!audio.duration) return;
    const desired = Number(e.target.value)/1000*audio.duration;
    $('elapsed').textContent=timeFmt(desired);setRangeFill(e.target);
  });
  $('seek').addEventListener('change', e => {
    if (state.mode==='radio'||!Number.isFinite(audio.duration)||!audio.duration) return;
    audio.currentTime=Number(e.target.value)/1000*audio.duration;updateProgress();
  });
  $('volume').addEventListener('input', e => {state.volume=Number(e.target.value)/100;applyVolumeForTrack();setRangeFill(e.target);renderPlayer();persist();});
  $('leveling-toggle').addEventListener('click', () => {
    state.leveling=!state.leveling;
    applyVolumeForTrack();
    persist(); renderPlayer();
    toast(state.leveling?'Volume equilibrado ativado':'Volume equilibrado desativado');
  });
  $('volume-button').addEventListener('click', () => {
    if (state.volume > 0) {state.previousVolume=state.volume;state.volume=0;} else state.volume=state.previousVolume||.75;
    applyVolumeForTrack();$('volume').value=Math.round(state.volume*100);setRangeFill($('volume'));renderPlayer();persist();
  });
  $('queue-open').addEventListener('click', () => $('queue-panel').classList.toggle('is-open'));
  $('queue-close').addEventListener('click', () => $('queue-panel').classList.remove('is-open'));
  $('create-playlist').addEventListener('click', () => {state.pendingAddId=null;createPlaylistDialog();});
  $('open-add-guide').addEventListener('click', guide);
  $('about-button').addEventListener('click', about);
  $('modal-close').addEventListener('click', () => $('modal').close());
  $('modal').addEventListener('click', e => {if(e.target===$('modal')) $('modal').close();});
  $('search').addEventListener('input', e => {state.query=e.target.value; if(state.view!=='explorar') navigate('explorar'); else renderExplore();});
  document.addEventListener('keydown', e => {
    if (e.key==='/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName) && !$('modal').open) {e.preventDefault();$('search').focus();}
    if (e.code==='Space' && !['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName) && !$('modal').open) {e.preventDefault();togglePlayback();}
  });
  function bindAudioEvents(element) {
    element.addEventListener('loadstart', () => {
      if (element !== audio) return;
      state.buffering=true;setPlayVisuals();
    });
    for (const eventName of ['waiting','stalled','seeking']) {
      element.addEventListener(eventName, () => {
        if (element !== audio) return;
        state.buffering=true;setPlayVisuals();
      });
    }
    for (const eventName of ['playing','canplay','seeked']) {
      element.addEventListener(eventName, () => {
        if (element !== audio) return;
        state.buffering=false;setPlayVisuals();
      });
    }
    element.addEventListener('loadedmetadata', () => {
      if (element !== audio) return;
      if (state.pendingSeek !== null) {
        const duration = Number.isFinite(audio.duration) ? audio.duration : Number.MAX_SAFE_INTEGER;
        try {
          audio.currentTime = Math.max(0,Math.min(state.pendingSeek,Math.max(0,duration-.03)));
          state.pendingSeek = null;
        } catch (_) { /* tentar no próximo evento */ }
      }
      updateProgress();
    });
    element.addEventListener('timeupdate', () => {
      if (element !== audio) return;
      updateProgress();
      prepareNextAudio();
    });
    element.addEventListener('play', () => {
      if (element === audio) { setPlayVisuals(); prepareNextAudio(); }
    });
    element.addEventListener('pause', () => { if (element === audio) {state.playRequested=false;state.buffering=false;setPlayVisuals();} });
    element.addEventListener('ended', () => {
      if (element !== audio) return;
      state.buffering=false;setPlayVisuals();
      if (state.mode === 'radio') {
        // Não reinicie a mesma música quando o áudio terminar alguns
        // milissegundos antes do relógio da programação mudar.
        tick();
      } else nextTrack(false);
    });
    element.addEventListener('error', () => {
      if (element === audio) { state.buffering=false;setPlayVisuals(); }
      if (element === audio && audio.error && state.playRequested)
        toast(nativeBridge
          ? 'Falha no áudio. Se a rede não voltar, toque em reproduzir para tentar novamente.'
          : 'Falha ao carregar o áudio. Confira o arquivo no GitHub.');
    });
  }
  bindAudioEvents(audio);
  if (standby) bindAudioEvents(standby);
  $('today-label').textContent = new Intl.DateTimeFormat('pt-BR', {day:'2-digit', month:'long', year:'numeric'}).format(new Date());

  function tick() {
    if (!state.loaded || (nativeBridge && document.hidden)) return;
    if (state.mode === 'radio') {
      const info = getRadioInfo();
      if (info) {
        if (info.track.id !== state.currentId) {
          if (nativeBridge && !audio.paused && !audio.ended) {
            // Media3 já faz a transição na fila; a WebView não deve recarregá-la.
            renderRadio(info);
          } else {
            state.currentId = info.track.id;
            if (radioWantsPlayback) { loadTrack(info.track, info.offset); requestPlay(); }
            renderPlayer(); renderRadio(info); renderQueue(info);
          }
        } else if (!nativeBridge && !audio.paused && !audio.ended && audio.readyState>=2
          && Math.abs(audio.currentTime-info.offset) > 4) {
          try { audio.currentTime=info.offset; } catch (_) { /* ignore */ }
        }
        prepareNextAudio();
        $('station-clock').textContent=clockFmt(new Date());
        updateProgress();
      }
    }
  }
  setInterval(tick, 1000);
  setInterval(() => {if(state.loaded && state.mode==='radio' && !document.hidden) {const info=getRadioInfo();renderRadio(info);renderQueue(info);}}, 15000);

  async function init() {
    try {
      const response = await fetch('./catalogo.json');
      if (!response.ok) throw new Error('HTTP '+response.status);
      const data=await response.json();
      if (nativeBridge && window.RadioHitsAndroid.saveCatalog) {
        try { window.RadioHitsAndroid.saveCatalog(JSON.stringify(data)); } catch (_) {}
      }
      if (!Array.isArray(data.tracks)) throw new Error('Catálogo inválido');
      state.tracks=data.tracks.filter(t => t && t.id && t.title && t.src && Number(t.duration)>0)
        .map(t=>({...t,artist:t.artist||'Artista independente',genre:t.genre||'Outros',cover:t.cover||'./assets/capas/padrao.svg',duration:Number(t.duration)}));
      state.radioOrder=Array.isArray(data.radioOrder)?data.radioOrder:[];
      state.radioSchedule=data.radioSchedule && Number.isSafeInteger(Number(data.radioSchedule.epochMs)) ? data.radioSchedule : {epochMs:EPOCH,revision:'legacy'};
      state.loaded=true;
      const info=getRadioInfo();
      state.currentId=info?.track?.id||state.tracks[0]?.id||null;
      if (state.currentId) state.queue=libraryTracks().map(t=>t.id);
      renderRadio(info);renderExplore();renderFavorites();renderPlaylists();renderQueue(info);renderPlayer();
      syncOffline();
      refreshNativeDownloadJobs();
      if (nativeBridge && window.RadioHitsAndroid.state) {
        try {
          const current=JSON.parse(await window.RadioHitsAndroid.state());
          if(current && window.RadioHitsAndroidState) window.RadioHitsAndroidState(current);
        } catch (error) { console.warn('Estado nativo indisponível:',error); }
      }
    } catch (err) {
      console.error('Radio Hits: falha no catálogo',err);
      $('station-title').textContent='Não foi possível carregar o catálogo';
      $('station-artist').textContent='Abra com servidor HTTP, não usando file://';
      $('radio-up-next').innerHTML=empty('Catálogo indisponível','Verifique catalogo.json e a publicação do site.');
      toast('Não foi possível abrir catalogo.json');
    }
  }
  // Atualiza a biblioteca sem descarregar as músicas e sem reiniciar a reprodução.
  let checkingCatalog = false;
  let lastCatalogCheck = 0;
  async function refreshCatalog(manual = false) {
    if (!state.loaded || checkingCatalog) return;
    if (!manual && Date.now() - lastCatalogCheck < 60*60*1000) return;
    checkingCatalog = true;
    lastCatalogCheck = Date.now();
    const button = $('refresh-library');
    if (button) { button.disabled = true; button.textContent = 'Verificando...'; }
    try {
      const response = await fetch(manual ? './catalogo.json?atualizado='+Date.now() : './catalogo.json', manual ? {cache:'reload'} : {});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (nativeBridge && window.RadioHitsAndroid.saveCatalog) {
        try {window.RadioHitsAndroid.saveCatalog(JSON.stringify(data));} catch (_) {}
      }
      if (!Array.isArray(data.tracks)) throw new Error('Catálogo inválido');
      const updated = data.tracks.filter(t => t && t.id && t.title && t.src && Number(t.duration) > 0)
        .map(t => ({...t,artist:t.artist||'Artista independente',genre:t.genre||'Outros',
          cover:t.cover||'./assets/capas/padrao.svg',duration:Number(t.duration)}));
      const oldIds = new Set(state.tracks.map(t => t.id));
      const additions = updated.filter(t => !t.isJingle && !oldIds.has(t.id)).length;
      const signature = tracks => JSON.stringify(tracks.map(t => [t.id,t.title,t.artist,t.src,t.duration,t.genre,t.cover,t.year,t.downloadAllowed,t.gainDb,t.loudnessLufs,t.isJingle]));
      const orderChanged = JSON.stringify(state.radioOrder) !== JSON.stringify(data.radioOrder || [])
        || (state.radioSchedule?.revision||'legacy') !== (data.radioSchedule?.revision||'legacy');
      if (signature(updated) !== signature(state.tracks) || orderChanged) {
        state.tracks = updated;
        state.radioOrder = Array.isArray(data.radioOrder) ? data.radioOrder : [];
        state.radioSchedule = data.radioSchedule && Number.isSafeInteger(Number(data.radioSchedule.epochMs)) ? data.radioSchedule : {epochMs:EPOCH,revision:'legacy'};
        if (!trackById(state.currentId)) state.currentId = getRadioInfo()?.track?.id || updated[0]?.id || null;
        state.queue = state.queue.filter(id => trackById(id) && !trackById(id).isJingle);
        if (!state.queue.length) { state.queue = libraryTracks().map(t=>t.id); state.queueIndex = 0; }
        else state.queueIndex = Math.max(0, state.queue.indexOf(state.currentId));
        const info = getRadioInfo();
        applyVolumeForTrack();
        renderRadio(info); renderExplore(); renderFavorites(); renderPlaylists(); renderQueue(info); renderPlayer();
        toast(state.radioPlayback && state.mode==='radio'
          ? 'Nova programação disponível. A rádio atual continua; reinicie para atualizar.'
          : additions ? additions + ' nova(s) música(s) encontrada(s)!' : 'Biblioteca atualizada.');
      } else if (manual) {
        toast('Sua biblioteca já está atualizada: ' + updated.filter(t=>!t.isJingle).length + ' músicas.');
      }
    } catch (error) {
      console.error('Radio Hits: falha ao atualizar músicas', error);
      if (manual) toast('Não foi possível atualizar as músicas. Verifique sua conexão.');
    } finally {
      checkingCatalog = false;
      if (button) { button.disabled = false; button.textContent = 'Atualizar músicas'; }
    }
  }
  $('refresh-library').addEventListener('click', () => refreshCatalog(true));
  window.addEventListener('online', updateConnectionNotice);
  window.addEventListener('offline', updateConnectionNotice);
  updateConnectionNotice();
  document.addEventListener('visibilitychange', () => {
    setPlayVisuals();
    if (document.hidden && standby) clearStandby();
    if (!document.hidden) {
      tick();
      refreshCatalog(false);
    }
  });
  window.addEventListener('focus', () => refreshCatalog(false));
  setInterval(() => { if (!document.hidden) refreshCatalog(false); }, 60*60*1000);
  init();
})();
