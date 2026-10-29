'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const nativeBridge = typeof window.RadioHitsAndroid !== 'undefined' && !!window.RadioHitsAndroid.playQueue;
  function createNativeAudio() {
    const events = new EventTarget();
    let source='', position=0, duration=0, ready=0, paused=true, ended=false, volume=.75, error=null;
    let nativeId='', nativeMode='';
    function emit(type) { events.dispatchEvent(new Event(type)); }
    window.RadioHitsAndroidState = function(info) {
      if (!info || typeof info !== 'object') return;
      const wasPaused = paused;
      const oldId = nativeId;
      nativeId = info.id || '';
      nativeMode = info.mode || '';
      paused = !!info.paused;
      ended = !!info.ended;
      error = info.error ? {code:2} : null;
      if (info.src && (source === '' || (info.id && oldId !== info.id))) source = info.src;
      if (Number.isFinite(Number(info.position))) position = Math.max(0,Number(info.position));
      if (Number(info.duration) > 0) duration = Number(info.duration);
      if (Number(info.readyState) > 0) ready = Number(info.readyState);
      if (wasPaused !== paused) emit(paused?'pause':'play');
      emit('timeupdate');
      if (error) emit('error');
      if (typeof state !== 'undefined' && state.loaded && nativeId && trackById(nativeId)) {
        const changed = state.currentId !== nativeId;
        if (changed) {
          state.currentId = nativeId;
          if (nativeMode === 'radio' || nativeMode === 'ondemand') state.mode = nativeMode;
          if (state.mode === 'ondemand') state.queueIndex = Math.max(0,state.queue.indexOf(nativeId));
          renderPlayer(); renderRadio(); renderExplore(); renderQueue(); 
        }
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
        const request={
          mode:state.mode,id:selected,index,positionMs:Math.round(position*1000),
          volume:state.volume,shuffle:state.shuffle && state.mode !== 'radio',
          repeat:state.repeat==='all',
          tracks:tracks.map(t=>({
            id:t.id,title:t.title,artist:t.artist,
            src:new URL(t.src,document.baseURI).href
          }))
        };
        window.RadioHitsAndroid.playQueue(JSON.stringify(request));
        paused=false;ended=false;emit('play');
        return Promise.resolve();
      }
    };
  }
  const audio = nativeBridge ? createNativeAudio() : $('audio');
  const offline = window.RadioHitsOffline;
  let offlineSources = new Set(), offlineLoading = Promise.resolve(), offlineLoadVersion = 0, activeOfflineId = null;
  const STORAGE = 'pulso-radio-v1';
  const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (_) { saved = {}; }

  const state = {
    tracks: [], mode: 'radio', view: 'radio', currentId: null,
    radioOrder: [], radioIndex: 0, query: '', genre: 'Todos',
    favorites: new Set(Array.isArray(saved.favorites) ? saved.favorites : []),
    playlists: saved.playlists && typeof saved.playlists === 'object' && !Array.isArray(saved.playlists) ? saved.playlists : {},
    selectedPlaylist: null, pendingAddId: null,
    queue: [], queueIndex: 0, shuffle: false, repeat: 'off',
    volume: Number.isFinite(Number(saved.volume)) ? Math.min(1, Math.max(0, Number(saved.volume))) : .75,
    previousVolume: .75, pendingSeek: null, playRequested: false, toastTimer: null, loaded: false,
  };
  audio.volume = state.volume;
  $('volume').value = Math.round(state.volume * 100);
  setRangeFill($('volume'));

  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ favorites: [...state.favorites], playlists: state.playlists, volume: state.volume })); } catch (_) { /* Storage may be unavailable. */ }
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function icon(name, cls='icon') { return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
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
    const available = playableTracks();
    return state.radioOrder.length ? state.radioOrder.map(id => available.find(t => t.id === id)).filter(Boolean) : available;
  }
  function getRadioInfo(now = Date.now()) {
    const tracks = radioTracks();
    if (!tracks.length) return null;
    const total = tracks.reduce((n, t) => n + Number(t.duration), 0);
    if (total <= 0) return null;
    let pos = ((((now - EPOCH) / 1000) % total) + total) % total;
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
    const saveButton = t.downloadAllowed === true
      ? `<button class="icon-button ${stored?'is-liked':''}" data-action="offline-toggle" data-id="${escapeHtml(t.id)}" title="${stored?'Excluir cópia offline':'Baixar para ouvir offline'}" aria-label="${stored?'Excluir download de':'Baixar'} ${escapeHtml(t.title)}">${icon(stored?'trash':'download')}</button>`
      : '';
    return `<div class="track-row ${active ? 'is-active':''}"><button class="track-main track-main-play" data-action="play-track" data-id="${escapeHtml(t.id)}" aria-label="Tocar ${escapeHtml(t.title)}"><img src="${art(t)}" alt="" loading="lazy"><span class="track-text"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.artist)}</small></span></button><span class="track-genre">${escapeHtml(t.genre)}</span><span class="track-duration">${timeFmt(t.duration)}</span><div class="track-actions"><button class="icon-button ${liked?'is-liked':''}" data-action="like-track" data-id="${escapeHtml(t.id)}" title="${liked?'Remover dos favoritos':'Favoritar'}" aria-label="${liked?'Desfavoritar':'Favoritar'} ${escapeHtml(t.title)}">${icon('heart')}</button><button class="icon-button" data-action="add-playlist" data-id="${escapeHtml(t.id)}" title="Adicionar à playlist" aria-label="Adicionar ${escapeHtml(t.title)} a uma playlist">${icon('plus')}</button>${saveButton}</div></div>`;
  }
  function visibleTracks() {
    const query = state.query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return state.tracks.filter(t => {
      if (state.genre !== 'Todos' && t.genre !== state.genre) return false;
      if (!query) return true;
      return `${t.title} ${t.artist} ${t.genre}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query);
    });
  }
  function renderExplore() {
    const tracks = visibleTracks();
    $('discover-grid').innerHTML = tracks.slice(0, 4).map(card).join('') || empty('Nenhuma faixa encontrada', 'Experimente outra busca.');
    $('all-tracks').innerHTML = tracks.map(songRow).join('') || empty('Sem resultados', 'Experimente outro gênero ou termo.');
    $('explore-track-count').textContent = `${tracks.length} ${tracks.length === 1 ? 'faixa' : 'faixas'}`;
    $('preview-grid').innerHTML = state.tracks.slice(0, 4).map(card).join('') || empty('Biblioteca vazia','Adicione MP3 na pasta músicas.');
    const genres = ['Todos', ...new Set(state.tracks.map(t => t.genre).filter(Boolean))];
    $('genre-filters').innerHTML = genres.map(g => `<button data-action="genre" data-genre="${escapeHtml(g)}" class="${state.genre === g ? 'is-active' : ''}">${escapeHtml(g)}</button>`).join('');
    $('sidebar-track-count').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'faixa' : 'faixas'}`;
    renderOffline();
  }
  function renderOffline() {
    const saved = state.tracks.filter(t=>offlineSources.has(offline.absolute(t.src)));
    const count = $('offline-count'), area = $('offline-tracks');
    if (count) count.textContent = saved.length + ' salva(s) · ' + state.tracks.filter(t=>t.downloadAllowed===true).length + ' disponíveis';
    if (area) area.innerHTML = saved.length ? saved.map(songRow).join('') :
      empty('Nenhuma música salva offline','Baixe uma faixa autorizada pelo ícone de download.');
  }
  async function syncOffline() {
    try { offlineSources=await offline.list(); renderExplore();renderFavorites();renderPlaylists(); }
    catch(e){console.warn('Offline:',e);}
  }
  async function toggleOffline(id,button) {
    const t=trackById(id);
    if (!t || t.downloadAllowed!==true) return toast('Download não autorizado para esta faixa.');
    const url=offline.absolute(t.src);
    button.disabled=true;
    try {
      if (offlineSources.has(url)) {
        await offline.remove(t); offlineSources.delete(url);
        toast('Download removido.');
      } else {
        toast('Baixando ' + t.title + '...');
        await offline.download(t, (percent)=>{
          button.title=percent===null?'Baixando...':'Baixando: '+percent+'%';
        });
        if (!offline.isNative) { offlineSources.add(url);toast('Música salva offline.'); }
        else toast('Download iniciado.');
      }
    } catch(e){toast(e.message||'Falha ao baixar.');}
    finally {button.disabled=false;renderExplore();renderFavorites();renderPlaylists();}
  }
  offline.onChange(async e=>{
    if(['done','deleted','error'].includes(e.type)){
      await syncOffline();
      if(e.type==='done')toast('Download concluído.');
      if(e.type==='error')toast('Falha: '+(e.message||'verifique a internet.'));
    }
  });
  function renderFavorites() {
    const tracks = state.tracks.filter(t => state.favorites.has(t.id));
    $('favorite-tracks').innerHTML = tracks.length ? tracks.map(songRow).join('') : empty('Seus favoritos aparecerão aqui', 'Toque no coração de qualquer faixa para guardar.', 'Explorar faixas');
  }
  function renderPlaylists() {
    const names = Object.keys(state.playlists);
    $('playlist-grid').innerHTML = names.length ? names.map((name,i) => {
      const ids = Array.isArray(state.playlists[name]) ? state.playlists[name] : [];
      const cover = trackById(ids[0])?.cover || './assets/capas/padrao.svg';
      return `<button class="playlist-tile ${state.selectedPlaylist === name?'is-selected':''}" data-action="open-playlist" data-playlist="${escapeHtml(name)}"><img src="${escapeHtml(cover)}" alt=""><strong>${escapeHtml(name)}</strong><small>${ids.length} ${ids.length===1?'música':'músicas'}</small></button>`;
    }).join('') : empty('Crie sua primeira playlist','Depois adicione faixas usando o botão + no catálogo.');
    const name = state.selectedPlaylist;
    if (!name || !Object.prototype.hasOwnProperty.call(state.playlists,name)) { $('playlist-detail').innerHTML = ''; return; }
    const ids = Array.isArray(state.playlists[name]) ? state.playlists[name] : [];
    const tracks = ids.map(trackById).filter(Boolean);
    $('playlist-detail').innerHTML = `<div class="playlist-detail-tools"><h3>${escapeHtml(name)}</h3><button class="outline-button" data-action="play-playlist" data-playlist="${escapeHtml(name)}">${icon('play','icon icon-filled')} Tocar playlist</button></div>${tracks.length ? tracks.map(t => `${songRow(t)}<div style="display:flex;justify-content:flex-end"><button class="side-add" data-action="remove-playlist-song" data-id="${escapeHtml(t.id)}" data-playlist="${escapeHtml(name)}">Remover desta playlist</button></div>`).join('') : empty('Playlist vazia','Adicione faixas usando o catálogo.')}`;
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
  function setPlayVisuals() {
    const playing = !audio.paused && !audio.ended;
    const playIcon = playing ? 'pause' : 'play';
    $('player-play').innerHTML = icon(playIcon, 'icon icon-filled');
    $('player-play').setAttribute('aria-label', playing?'Pausar':'Reproduzir');
    $('station-play').innerHTML = `${icon(playIcon,'icon icon-filled')}<span>${playing && state.mode==='radio'?'Pausar rádio':'Escutar agora'}</span>`;
    $('hero-radio-play').innerHTML = `${icon(playing && state.mode==='radio'?'pause':'play','icon icon-filled')}<span>${playing && state.mode==='radio'?'Pausar rádio':'Ouvir rádio'}</span>`;
    $('station-play').classList.toggle('is-playing', playing && state.mode === 'radio');
    document.querySelector('.station-card').classList.toggle('is-playing', playing && state.mode === 'radio');
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
  function loadTrack(t, seekTo=0) {
    if (!t) return false;
    const target=new URL(t.src,document.baseURI).href;
    const serial=++offlineLoadVersion;
    if (!nativeBridge && offlineSources.has(target)) {
      state.pendingSeek=Number(seekTo)||0;
      offlineLoading=offline.playableSource(t).then(localURL=>{
        if(serial!==offlineLoadVersion)return;
        if(audio.src!==localURL||activeOfflineId!==t.id){
          audio.src=localURL;audio.load();activeOfflineId=t.id;
        } else if(audio.readyState>=1) {
          audio.currentTime=Number(seekTo)||0;state.pendingSeek=null;
        }
      });
    } else {
      offlineLoading=Promise.resolve();
      activeOfflineId=null;
      if(audio.src!==target){
        state.pendingSeek=Number(seekTo)||0;
        audio.src=target;audio.load();
        if(nativeBridge){audio.currentTime=Number(seekTo)||0;state.pendingSeek=null;}
      } else if(Number.isFinite(Number(seekTo))){
        if(audio.readyState>=1){try{audio.currentTime=Number(seekTo);}catch(_){state.pendingSeek=Number(seekTo);}}
        else state.pendingSeek=Number(seekTo);
      }
    }
    state.currentId=t.id;
    updateMediaSession(t);
    renderPlayer();
    return true;
  }
  async function requestPlay() {
    try {await offlineLoading;} catch(e){console.warn('Falha no offline',e);}
    if (!audio.src) return;
    state.playRequested = true;
    try { await audio.play(); } catch (err) {
      state.playRequested = false;
      if (err?.name !== 'AbortError') toast('Não foi possível iniciar. Verifique o áudio ou toque em reproduzir.');
      setPlayVisuals();
    }
  }
  function playRadio() {
    const info = getRadioInfo();
    if (!info) { toast('Ainda não há músicas na rádio.'); return; }
    state.mode = 'radio';
    loadTrack(info.track, info.offset);
    requestPlay();
    renderRadio(info); renderQueue(info); renderExplore(); renderPlayer();
  }
  function toggleRadio() {
    if (state.mode === 'radio' && !audio.paused) audio.pause();
    else playRadio();
  }
  function selectSong(id, queueIds) {
    const t = trackById(id); if (!t) return;
    state.mode = 'ondemand';
    const ids = [...new Set((queueIds || visibleTracks().map(t=>t.id)).filter(id => Boolean(trackById(id))))];
    state.queue = ids.includes(id) ? ids : [id, ...ids];
    state.queueIndex = state.queue.indexOf(id);
    loadTrack(t, 0); requestPlay();
    renderQueue(); renderExplore(); renderFavorites(); renderPlayer();
  }
  function togglePlayback() {
    if (!state.loaded) return;
    if (!audio.paused) { audio.pause(); return; }
    if (state.mode === 'radio') { playRadio(); return; }
    const t = trackById(state.currentId) || state.tracks[0];
    if (!t) return toast('Adicione músicas para começar.');
    if (!audio.src || audio.src !== new URL(t.src, document.baseURI).href) loadTrack(t, 0);
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
    if (!trackById(id)) return;
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
      if (!name) return;
      if (Object.prototype.hasOwnProperty.call(state.playlists, name)) return toast('Já existe uma playlist com esse nome.');
      state.playlists[name] = []; state.selectedPlaylist = name;
      if (state.pendingAddId && trackById(state.pendingAddId)) state.playlists[name].push(state.pendingAddId);
      state.pendingAddId = null;
      persist(); $('modal').close(); navigate('playlists'); toast('Playlist criada!');
    });
    $('new-playlist-name').focus();
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
      case 'add-playlist': showPlaylistChooser(id); break;
      case 'switch-explore': navigate('explorar'); break;
      case 'genre': state.genre = el.dataset.genre; renderExplore(); break;
      case 'open-playlist': state.selectedPlaylist=el.dataset.playlist;renderPlaylists();break;
      case 'play-playlist': { const ids = (state.playlists[el.dataset.playlist] || []).filter(id => trackById(id)); if (!ids.length) return toast('A playlist está vazia.'); selectSong(ids[0],ids); break; }
      case 'remove-playlist-song': { const ids=state.playlists[el.dataset.playlist] || []; state.playlists[el.dataset.playlist]=ids.filter(x=>x!==id);persist();renderPlaylists();toast('Música removida desta playlist');break; }
      case 'choose-playlist': { const name=el.dataset.playlist, id=state.pendingAddId; if (!Object.prototype.hasOwnProperty.call(state.playlists,name)) break; if (!state.playlists[name].includes(id)) state.playlists[name].push(id);persist();state.pendingAddId=null;$('modal').close();toast('Adicionada à playlist');renderPlaylists();break; }
      case 'new-playlist': createPlaylistDialog();break;
      case 'close-modal': $('modal').close();break;
    }
  }
  document.addEventListener('click', e => {
    const nav=e.target.closest('[data-view]'); if (nav) return navigate(nav.dataset.view);
    const action=e.target.closest('[data-action]'); if (action) handleAction(action);
  });
  $('hero-radio-play').addEventListener('click', toggleRadio);
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
  $('volume').addEventListener('input', e => {state.volume=Number(e.target.value)/100;audio.volume=state.volume;setRangeFill(e.target);renderPlayer();persist();});
  $('volume-button').addEventListener('click', () => {
    if (state.volume > 0) {state.previousVolume=state.volume;state.volume=0;} else state.volume=state.previousVolume||.75;
    audio.volume=state.volume;$('volume').value=Math.round(state.volume*100);setRangeFill($('volume'));renderPlayer();persist();
  });
  $('queue-open').addEventListener('click', () => $('queue-panel').classList.toggle('is-open'));
  $('queue-close').addEventListener('click', () => $('queue-panel').classList.remove('is-open'));
  $('create-playlist').addEventListener('click', () => {state.pendingAddId=null;createPlaylistDialog();});
  $('open-add-guide').addEventListener('click', guide);
  $('about-button').addEventListener('click', about);
  $('modal-close').addEventListener('click', () => $('modal').close());
  $('modal').addEventListener('click', e => {if(e.target===$('modal')) $('modal').close();});
  $('search').addEventListener('input', e => {state.query=e.target.value; state.genre='Todos'; navigate('explorar');});
  document.addEventListener('keydown', e => {
    if (e.key==='/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName) && !$('modal').open) {e.preventDefault();$('search').focus();}
    if (e.code==='Space' && !['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName) && !$('modal').open) {e.preventDefault();togglePlayback();}
  });
  audio.addEventListener('loadedmetadata', () => {
    if (state.pendingSeek !== null) {
      const duration = Number.isFinite(audio.duration) ? audio.duration : Number.MAX_SAFE_INTEGER;
      try { audio.currentTime = Math.max(0,Math.min(state.pendingSeek,Math.max(0,duration-.03))); } catch (_) { /* metadata race */ }
      state.pendingSeek=null;
    }
    updateProgress();
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('play', setPlayVisuals);
  audio.addEventListener('pause', setPlayVisuals);
  audio.addEventListener('ended', () => {if(state.mode==='radio')playRadio(); else nextTrack(false);});
  audio.addEventListener('error', () => {if (audio.error && state.playRequested) toast('Falha ao carregar o áudio. Confira o arquivo no GitHub.');});
  $('today-label').textContent = new Intl.DateTimeFormat('pt-BR', {day:'2-digit', month:'long', year:'numeric'}).format(new Date());

  function tick() {
    if (!state.loaded) return;
    if (state.mode === 'radio') {
      const info = getRadioInfo();
      if (info) {
        if (info.track.id !== state.currentId) {
          const shouldResume = !audio.paused;
          state.currentId=info.track.id;
          if (shouldResume) {loadTrack(info.track, info.offset);requestPlay();}
          renderPlayer();renderRadio(info);renderQueue(info);
        } else if (!audio.paused && audio.readyState>=2 && Math.abs(audio.currentTime-info.offset) > 4) {
          try { audio.currentTime=info.offset; } catch (_) { /* ignore */ }
        }
        $('station-clock').textContent=clockFmt(new Date());
        updateProgress();
      }
    }
  }
  setInterval(tick, 1000);
  setInterval(() => {if(state.loaded && state.mode==='radio') {const info=getRadioInfo();renderRadio(info);renderQueue(info);}}, 15000);

  async function init() {
    try {
      const response = await fetch('./catalogo.json?atualizado=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw new Error('HTTP '+response.status);
      const data=await response.json();
      if (!Array.isArray(data.tracks)) throw new Error('Catálogo inválido');
      state.tracks=data.tracks.filter(t => t && t.id && t.title && t.src && Number(t.duration)>0)
        .map(t=>({...t,artist:t.artist||'Artista independente',genre:t.genre||'Outros',cover:t.cover||'./assets/capas/padrao.svg',duration:Number(t.duration)}));
      state.radioOrder=Array.isArray(data.radioOrder)?data.radioOrder:[];
      state.loaded=true;
      const info=getRadioInfo();
      state.currentId=info?.track?.id||state.tracks[0]?.id||null;
      if (state.currentId) state.queue=state.tracks.map(t=>t.id);
      renderRadio(info);renderExplore();renderFavorites();renderPlaylists();renderQueue(info);renderPlayer();
      syncOffline();
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
    if (!manual && Date.now() - lastCatalogCheck < 90000) return;
    checkingCatalog = true;
    lastCatalogCheck = Date.now();
    const button = $('refresh-library');
    if (button) { button.disabled = true; button.textContent = 'Verificando...'; }
    try {
      const response = await fetch('./catalogo.json?atualizado=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data.tracks)) throw new Error('Catálogo inválido');
      const updated = data.tracks.filter(t => t && t.id && t.title && t.src && Number(t.duration) > 0)
        .map(t => ({...t,artist:t.artist||'Artista independente',genre:t.genre||'Outros',
          cover:t.cover||'./assets/capas/padrao.svg',duration:Number(t.duration)}));
      const oldIds = new Set(state.tracks.map(t => t.id));
      const additions = updated.filter(t => !oldIds.has(t.id)).length;
      const signature = tracks => JSON.stringify(tracks.map(t => [t.id,t.title,t.artist,t.src,t.duration,t.genre]));
      const orderChanged = JSON.stringify(state.radioOrder) !== JSON.stringify(data.radioOrder || []);
      if (signature(updated) !== signature(state.tracks) || orderChanged) {
        state.tracks = updated;
        state.radioOrder = Array.isArray(data.radioOrder) ? data.radioOrder : [];
        if (!trackById(state.currentId)) state.currentId = getRadioInfo()?.track?.id || updated[0]?.id || null;
        state.queue = state.queue.filter(id => trackById(id));
        if (!state.queue.length) { state.queue = updated.map(t=>t.id); state.queueIndex = 0; }
        else state.queueIndex = Math.max(0, state.queue.indexOf(state.currentId));
        const info = getRadioInfo();
        renderRadio(info); renderExplore(); renderFavorites(); renderPlaylists(); renderQueue(info); renderPlayer();
        toast(additions ? additions + ' nova(s) música(s) encontrada(s)!' : 'Biblioteca atualizada.');
      } else if (manual) {
        toast('Sua biblioteca já está atualizada: ' + updated.length + ' músicas.');
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
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshCatalog(false);
  });
  window.addEventListener('focus', () => refreshCatalog(false));
  setInterval(() => { if (!document.hidden) refreshCatalog(false); }, 300000);
  init();
  // PWA: caches only the app shell, never predownloads the music library.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
