// ===== DualStream App =====
(function() {
  'use strict';

  // --- State ---
  const state = {
    playlist: [],
    currentIndex: -1,
    isPlaying: false,
    spotifyToken: null,
    spotifyPlayer: null,
    spotifyDeviceId: null,
    source: 'local' // 'local' | 'spotify'
  };

  // --- DOM Elements ---
  const $ = (s) => document.querySelector(s);
  const audio1 = $('#audio1');
  const audio2 = $('#audio2');

  // --- Device Enumeration ---
  async function enumerateDevices() {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    } catch (e) { /* user denied, still try enumerate */ }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      populateDeviceSelect('device1Select', outputs);
      populateDeviceSelect('device2Select', outputs);
    } catch (e) {
      console.error('Cannot enumerate devices:', e);
    }
  }

  function populateDeviceSelect(selectId, devices) {
    const sel = $(`#${selectId}`);
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Select audio device...</option>';
    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Device ${d.deviceId.slice(0,8)}`;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  }

  async function setAudioOutput(audioEl, deviceId, statusEl, statusTextEl) {
    if (!deviceId) {
      statusEl.className = 'device-status disconnected';
      statusTextEl.textContent = 'Not Selected';
      return;
    }
    if (typeof audioEl.setSinkId !== 'function') {
      statusEl.className = 'device-status disconnected';
      statusTextEl.textContent = 'Not Supported';
      return;
    }
    try {
      await audioEl.setSinkId(deviceId);
      statusEl.className = 'device-status connected';
      const label = $(`option[value="${deviceId}"]`)?.textContent || 'Connected';
      statusTextEl.textContent = label.length > 20 ? label.slice(0,18) + '…' : label;
    } catch (e) {
      console.error('setSinkId error:', e);
      statusEl.className = 'device-status disconnected';
      statusTextEl.textContent = 'Error';
    }
  }

  // --- Local File Handling ---
  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('audio/')) return;
      const url = URL.createObjectURL(file);
      state.playlist.push({ name: file.name.replace(/\.[^.]+$/, ''), url, file });
    });
    renderPlaylist();
    if (state.currentIndex === -1 && state.playlist.length > 0) loadTrack(0);
  }

  function renderPlaylist() {
    const container = $('#playlist');
    container.innerHTML = '';
    state.playlist.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = `playlist-item${i === state.currentIndex ? ' active' : ''}`;
      item.innerHTML = `
        <span class="track-num">${i + 1}</span>
        <div class="track-details"><p>${track.name}</p><span>${track.artist || 'Local File'}</span></div>
        <button class="remove-track" data-idx="${i}">&times;</button>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-track')) {
          state.playlist.splice(i, 1);
          if (state.currentIndex === i) { stopPlayback(); state.currentIndex = -1; }
          else if (state.currentIndex > i) state.currentIndex--;
          renderPlaylist();
          return;
        }
        loadTrack(i);
        play();
      });
      container.appendChild(item);
    });
  }

  function loadTrack(index) {
    if (index < 0 || index >= state.playlist.length) return;
    state.currentIndex = index;
    state.source = 'local';
    const track = state.playlist[index];
    audio1.src = track.url;
    audio2.src = track.url;
    $('#trackName').textContent = track.name;
    $('#trackArtist').textContent = track.artist || 'Local File';
    $('#albumArt').innerHTML = track.art
      ? `<img src="${track.art}" alt="Album Art">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    renderPlaylist();
  }

  // --- Playback Controls ---
  function play() {
    if (state.source === 'spotify') {
      if (state.spotifyPlayer) state.spotifyPlayer.resume();
      return;
    }
    if (!audio1.src) return;
    audio1.play().catch(() => {});
    audio2.currentTime = audio1.currentTime;
    audio2.play().catch(() => {});
    state.isPlaying = true;
    updatePlayButton();
    $('#equalizer').classList.add('playing');
  }

  function pause() {
    if (state.source === 'spotify') {
      if (state.spotifyPlayer) state.spotifyPlayer.pause();
      return;
    }
    audio1.pause();
    audio2.pause();
    state.isPlaying = false;
    updatePlayButton();
    $('#equalizer').classList.remove('playing');
  }

  function stopPlayback() {
    pause();
    audio1.src = '';
    audio2.src = '';
    $('#trackName').textContent = 'No track selected';
    $('#trackArtist').textContent = '—';
    $('#progressFill').style.width = '0';
    $('#progressThumb').style.left = '0';
    $('#currentTime').textContent = '0:00';
    $('#duration').textContent = '0:00';
  }

  function togglePlay() {
    state.isPlaying ? pause() : play();
  }

  function nextTrack() {
    if (state.source === 'spotify') { spotifyNext(); return; }
    if (state.playlist.length === 0) return;
    loadTrack((state.currentIndex + 1) % state.playlist.length);
    play();
  }

  function prevTrack() {
    if (state.source === 'spotify') { spotifyPrev(); return; }
    if (state.playlist.length === 0) return;
    loadTrack((state.currentIndex - 1 + state.playlist.length) % state.playlist.length);
    play();
  }

  function updatePlayButton() {
    const icon = state.isPlaying
      ? '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    $('#playBtn').innerHTML = icon;
  }

  function formatTime(s) {
    if (isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // --- Audio Sync ---
  audio1.addEventListener('timeupdate', () => {
    if (state.source !== 'local') return;
    const pct = (audio1.currentTime / audio1.duration) * 100 || 0;
    $('#progressFill').style.width = pct + '%';
    $('#progressThumb').style.left = pct + '%';
    $('#currentTime').textContent = formatTime(audio1.currentTime);
    $('#duration').textContent = formatTime(audio1.duration);
    // Removed aggressive audio2 sync here to prevent BT buffering dropouts
  });

  audio1.addEventListener('ended', () => { nextTrack(); });

  // --- Progress Bar Seeking ---
  const progressBar = $('#progressBar');
  let isSeeking = false;
  progressBar.addEventListener('mousedown', startSeek);
  progressBar.addEventListener('touchstart', startSeek, { passive: true });

  function startSeek(e) {
    isSeeking = true;
    seek(e);
    document.addEventListener('mousemove', seek);
    document.addEventListener('touchmove', seek, { passive: true });
    document.addEventListener('mouseup', endSeek);
    document.addEventListener('touchend', endSeek);
  }
  function seek(e) {
    if (!isSeeking) return;
    const rect = progressBar.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    if (state.source === 'local' && audio1.duration) {
      audio1.currentTime = pct * audio1.duration;
      audio2.currentTime = audio1.currentTime;
    } else if (state.source === 'spotify' && state.spotifyPlayer) {
      // Will seek on endSeek
    }
    $('#progressFill').style.width = (pct * 100) + '%';
    $('#progressThumb').style.left = (pct * 100) + '%';
  }
  function endSeek() {
    isSeeking = false;
    document.removeEventListener('mousemove', seek);
    document.removeEventListener('touchmove', seek);
    document.removeEventListener('mouseup', endSeek);
    document.removeEventListener('touchend', endSeek);
  }

  // --- Volume ---
  $('#volume1').addEventListener('input', (e) => {
    audio1.volume = e.target.value / 100;
    $('#vol1Val').textContent = e.target.value + '%';
  });
  $('#volume2').addEventListener('input', (e) => {
    audio2.volume = e.target.value / 100;
    $('#vol2Val').textContent = e.target.value + '%';
  });
  audio1.volume = 0.8;
  audio2.volume = 0.8;

  // --- Device Selection ---
  $('#device1Select').addEventListener('change', (e) => {
    setAudioOutput(audio1, e.target.value, $('#status1'), $('#statusText1'));
  });
  $('#device2Select').addEventListener('change', (e) => {
    setAudioOutput(audio2, e.target.value, $('#status2'), $('#statusText2'));
  });
  $('#refreshDevices').addEventListener('click', enumerateDevices);

  // --- Tabs ---
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $(`#${tab.dataset.tab}Tab`).classList.add('active');
    });
  });

  // --- Drag & Drop ---
  const dropZone = $('#dropZone');
  ['dragenter', 'dragover'].forEach(ev => {
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  });
  ['dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'));
  });
  dropZone.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
  dropZone.addEventListener('click', () => $('#filePicker').click());
  $('#filePickerBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#filePicker').click(); });
  $('#filePicker').addEventListener('change', (e) => handleFiles(e.target.files));

  // --- Modal ---
  $('#infoBtn').addEventListener('click', () => $('#infoModal').classList.add('show'));
  $('#closeModal').addEventListener('click', () => $('#infoModal').classList.remove('show'));
  $('#infoModal').addEventListener('click', (e) => { if (e.target === $('#infoModal')) $('#infoModal').classList.remove('show'); });

  // --- Player Controls ---
  $('#playBtn').addEventListener('click', togglePlay);
  $('#nextBtn').addEventListener('click', nextTrack);
  $('#prevBtn').addEventListener('click', prevTrack);

  // ===== SPOTIFY INTEGRATION =====
  const SPOTIFY_REDIRECT_URI = window.location.href.split('?')[0].split('#')[0];
  const SPOTIFY_SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';

  // PKCE helpers
  function generateRandomString(length) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').slice(0, length);
  }

  async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function spotifyLogin(clientId) {
    const verifier = generateRandomString(128);
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem('spotify_verifier', verifier);
    localStorage.setItem('spotify_client_id', clientId);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: SPOTIFY_REDIRECT_URI,
      scope: SPOTIFY_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  async function exchangeCode(code) {
    const verifier = localStorage.getItem('spotify_verifier');
    const clientId = localStorage.getItem('spotify_client_id');
    if (!verifier || !clientId) return;
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        code_verifier: verifier
      })
    });
    const data = await res.json();
    if (data.access_token) {
      state.spotifyToken = data.access_token;
      localStorage.setItem('spotify_token', data.access_token);
      localStorage.setItem('spotify_token_expiry', Date.now() + data.expires_in * 1000);
      initSpotifySDK();
      showSpotifyPlayer();
      // Clean URL
      window.history.replaceState({}, '', SPOTIFY_REDIRECT_URI);
    }
  }

  function showSpotifyPlayer() {
    $('#spotifyLogin').style.display = 'none';
    $('#spotifyPlayer').style.display = 'block';
    // Switch to Spotify tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="spotify"]').classList.add('active');
    $('#spotifyTab').classList.add('active');
    loadSpotifyUser();
  }

  async function loadSpotifyUser() {
    if (!state.spotifyToken) return;
    try {
      const res = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${state.spotifyToken}` }
      });
      const user = await res.json();
      const img = user.images?.[0]?.url;
      $('#spotifyUserInfo').innerHTML = `
        ${img ? `<img src="${img}" alt="">` : ''}
        <span>Connected as ${user.display_name}</span>`;
    } catch(e) { console.error(e); }
  }

  async function searchSpotify(query) {
    if (!state.spotifyToken || !query) return;
    try {
      const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
        headers: { 'Authorization': `Bearer ${state.spotifyToken}` }
      });
      const data = await res.json();
      const container = $('#searchResults');
      container.innerHTML = '';
      (data.tracks?.items || []).forEach(track => {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.innerHTML = `
          <img src="${track.album.images[2]?.url || track.album.images[0]?.url || ''}" alt="">
          <div class="search-item-info"><p>${track.name}</p><span>${track.artists.map(a => a.name).join(', ')}</span></div>`;
        item.addEventListener('click', () => playSpotifyTrack(track));
        container.appendChild(item);
      });
    } catch(e) { console.error(e); }
  }

  async function playSpotifyTrack(track) {
    if (!state.spotifyToken || !state.spotifyDeviceId) {
      alert('Spotify player not ready. Make sure you have Spotify Premium.');
      return;
    }
    state.source = 'spotify';
    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${state.spotifyDeviceId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${state.spotifyToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [track.uri] })
      });
      $('#trackName').textContent = track.name;
      $('#trackArtist').textContent = track.artists.map(a => a.name).join(', ');
      const art = track.album.images[0]?.url;
      $('#albumArt').innerHTML = art ? `<img src="${art}" alt="Album Art">` : '';
      state.isPlaying = true;
      updatePlayButton();
      $('#equalizer').classList.add('playing');
    } catch(e) { console.error(e); }
  }

  function spotifyNext() {
    if (!state.spotifyToken) return;
    fetch('https://api.spotify.com/v1/me/player/next', {
      method: 'POST', headers: { 'Authorization': `Bearer ${state.spotifyToken}` }
    });
  }
  function spotifyPrev() {
    if (!state.spotifyToken) return;
    fetch('https://api.spotify.com/v1/me/player/previous', {
      method: 'POST', headers: { 'Authorization': `Bearer ${state.spotifyToken}` }
    });
  }

  function initSpotifySDK() {
    if (document.querySelector('script[src*="spotify-player"]')) return;
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new Spotify.Player({
        name: 'DualStream',
        getOAuthToken: cb => cb(state.spotifyToken),
        volume: 0.8
      });

      player.addListener('ready', ({ device_id }) => {
        state.spotifyDeviceId = device_id;
        console.log('Spotify ready, device:', device_id);
        // Transfer playback
        fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${state.spotifyToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_ids: [device_id], play: false })
        });
      });

      player.addListener('player_state_changed', (s) => {
        if (!s) return;
        state.isPlaying = !s.paused;
        updatePlayButton();
        s.paused ? $('#equalizer').classList.remove('playing') : $('#equalizer').classList.add('playing');
        const track = s.track_window.current_track;
        if (track) {
          $('#trackName').textContent = track.name;
          $('#trackArtist').textContent = track.artists.map(a => a.name).join(', ');
          const art = track.album.images[0]?.url;
          if (art) $('#albumArt').innerHTML = `<img src="${art}" alt="Album Art">`;
        }
        // Progress
        const pct = (s.position / s.duration) * 100;
        $('#progressFill').style.width = pct + '%';
        $('#progressThumb').style.left = pct + '%';
        $('#currentTime').textContent = formatTime(s.position / 1000);
        $('#duration').textContent = formatTime(s.duration / 1000);
      });

      player.addListener('initialization_error', ({ message }) => console.error('Init error:', message));
      player.addListener('authentication_error', ({ message }) => console.error('Auth error:', message));
      player.addListener('account_error', ({ message }) => console.error('Account error (Premium required):', message));
      player.connect();
      state.spotifyPlayer = player;
    };
  }

  // Spotify UI events
  $('#spotifyConnectBtn').addEventListener('click', () => {
    const clientId = $('#clientIdInput').value.trim();
    if (!clientId) { alert('Please enter your Spotify Client ID'); return; }
    spotifyLogin(clientId);
  });
  $('#searchBtn').addEventListener('click', () => searchSpotify($('#searchInput').value));
  $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchSpotify(e.target.value); });

  // --- Check for Spotify OAuth callback ---
  const urlParams = new URLSearchParams(window.location.search);
  const spotifyCode = urlParams.get('code');
  if (spotifyCode) {
    exchangeCode(spotifyCode);
  } else {
    // Check for existing token
    const existingToken = localStorage.getItem('spotify_token');
    const expiry = localStorage.getItem('spotify_token_expiry');
    if (existingToken && expiry && Date.now() < parseInt(expiry)) {
      state.spotifyToken = existingToken;
      initSpotifySDK();
      showSpotifyPlayer();
    }
  }

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') nextTrack();
    if (e.code === 'ArrowLeft') prevTrack();
  });

  // --- Init ---
  enumerateDevices();
  navigator.mediaDevices?.addEventListener('devicechange', enumerateDevices);

  // ===== WEB BLUETOOTH API - DEVICE DISCOVERY =====
  async function scanBluetooth(targetCard) {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth is not supported in this browser.\n\nPlease use Chrome or Edge, and make sure you\'re on HTTPS or localhost.\n\nUse the Bluetooth Setup Guide to pair devices manually.');
      return;
    }
    const scanBtn = targetCard ? $(`#scan${targetCard}Btn`) : null;
    if (scanBtn) scanBtn.classList.add('scanning');

    try {
      // Request a Bluetooth device - this opens the native device picker!
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        // We request a generic access to trigger the picker
        // Audio devices will appear if they're in pairing mode
      });

      console.log('Bluetooth device selected:', device.name);

      // After user picks a device in the browser picker, the OS should
      // handle the pairing. Then refresh our audio device list.
      setTimeout(async () => {
        await enumerateDevices();
        // Try to auto-select the newly paired device
        if (device.name) {
          autoSelectDevice(device.name, targetCard);
        }
      }, 2000);

    } catch (e) {
      if (e.name !== 'NotFoundError') { // User cancelled - that's ok
        console.error('Bluetooth scan error:', e);
      }
    } finally {
      if (scanBtn) scanBtn.classList.remove('scanning');
    }
  }

  function autoSelectDevice(deviceName, targetCard) {
    const selectId = targetCard === '1' ? 'device1Select' : targetCard === '2' ? 'device2Select' : null;
    if (!selectId) return;
    const sel = $(`#${selectId}`);
    const normalizedName = deviceName.toLowerCase();
    for (const opt of sel.options) {
      if (opt.textContent.toLowerCase().includes(normalizedName)) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change'));
        break;
      }
    }
  }

  // Scan button on each card
  $('#scan1Btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    scanBluetooth('1');
  });
  $('#scan2Btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    scanBluetooth('2');
  });

  // ===== BLUETOOTH SETUP GUIDE MODAL =====
  const btModal = $('#btSetupModal');

  $('#btSetupBtn')?.addEventListener('click', () => {
    btModal.classList.add('show');
    // Auto-detect OS and switch tab
    const ua = navigator.userAgent.toLowerCase();
    let detectedOS = 'android';
    if (ua.includes('windows')) detectedOS = 'windows';
    else if (ua.includes('iphone') || ua.includes('ipad')) detectedOS = 'ios';
    else if (ua.includes('mac')) detectedOS = 'mac';
    switchBtTab(detectedOS);
  });

  $('#closeBtModal')?.addEventListener('click', () => btModal.classList.remove('show'));
  btModal?.addEventListener('click', (e) => { if (e.target === btModal) btModal.classList.remove('show'); });

  // BT tab switching
  document.querySelectorAll('.bt-tab').forEach(tab => {
    tab.addEventListener('click', () => switchBtTab(tab.dataset.os));
  });

  function switchBtTab(os) {
    document.querySelectorAll('.bt-tab').forEach(t => t.classList.toggle('active', t.dataset.os === os));
    document.querySelectorAll('.bt-os-guide').forEach(g => g.classList.toggle('active', g.dataset.os === os));
  }

  // Scan from modal
  $('#btScanFromModal')?.addEventListener('click', () => {
    btModal.classList.remove('show');
    scanBluetooth(null);
  });

})();
