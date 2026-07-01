(() => {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ];

  const AVATAR_COLORS = [
    'linear-gradient(135deg,#22d3ee,#06b6d4)',
    'linear-gradient(135deg,#a855f7,#7c3aed)',
    'linear-gradient(135deg,#ec4899,#db2777)',
    'linear-gradient(135deg,#22c55e,#16a34a)',
    'linear-gradient(135deg,#f59e0b,#d97706)',
    'linear-gradient(135deg,#ef4444,#dc2626)',
    'linear-gradient(135deg,#3b82f6,#2563eb)',
    'linear-gradient(135deg,#8b5cf6,#7c3aed)'
  ];

  const SOUNDS = {
    airhorn: '📯', clap: '👏', laugh: '😂', ding: '🔔',
    bruh: '💀', sad: '😢', win: '🏆', drum: '🥁',
    fart: '💨', pop: '🎈'
  };

  const UI_SOUNDS = {
    play(type) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'join') {
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(554, now + 0.08);
          osc.frequency.setValueAtTime(659, now + 0.16);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.005, now + 0.35);
          osc.start();
          osc.stop(now + 0.35);
        } else if (type === 'leave') {
          osc.frequency.setValueAtTime(587, now);
          osc.frequency.exponentialRampToValueAtTime(293, now + 0.25);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.005, now + 0.25);
          osc.start();
          osc.stop(now + 0.25);
        } else if (type === 'msg') {
          osc.frequency.setValueAtTime(784, now);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.005, now + 0.12);
          osc.start();
          osc.stop(now + 0.12);
        } else if (type === 'hand') {
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(698, now + 0.06);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.005, now + 0.22);
          osc.start();
          osc.stop(now + 0.22);
        }
      } catch (e) {
        console.warn('Web Audio Sound failed:', e);
      }
    }
  };

  let socket = null;
  let localStream = null;
  let audioContext = null;
  let micGainNode = null;
  let analyserNode = null;
  let masterGainNode = null;
  let peers = {};
  let peerStreams = {};
  let peerForceMuted = {};
  let mySocketId = null;
  let roomId = null;
  let roomPassword = null;
  let isCreator = false;
  let isMuted = false;
  let isForceMuted = false;
  let isDeafened = false;
  let wasMutedBeforeDeafen = false;
  let roomTimer = null;
  let roomStartTime = null;
  let chatOpen = false;
  let unreadCount = 0;
  let typingTimeout = null;
  let afkTimeout = null;
  let isAfk = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let speakingTimeout = null;
  let pollInterval = null;
  let pendingFile = null;
  let userAvatar = null; // base64 data URL or null

  // ── NEW STATE VARIABLES ──
  let localTheme = localStorage.getItem('vw_theme') || 'dark';
  let replyingTo = null; // { msgId, name, text }
  let whispersTarget = null; // { socketId, name }
  let pttEnabled = false;
  let pttKey = 'Space';
  let pttKeyPressed = false;
  let myStatus = 'online';
  let echoCancellationEnabled = true;
  let lowBandwidthEnabled = false;
  let handRaised = false;

  let visualizerCanvas = null;
  let visualizerCtx = null;
  let visualizerDrawLoop = null;
  let pinnedMessages = [];
  let activePolls = [];
  let roomPermissions = { allowChat: true, allowMic: true };
  let roomModerators = [];
  let isRoomLocked = false;
  let qualityStatsInterval = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toast-container').appendChild(el);
    setTimeout(() => {
      el.classList.add('fade-out');
      el.addEventListener('animationend', () => el.remove());
    }, 3200);
  }

  function switchScreen(screen) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${screen}`).classList.add('active');
  }

  function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function getInitial(name) {
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  function loadAvatar() {
    try {
      const saved = localStorage.getItem('vw_avatar');
      if (saved) {
        userAvatar = saved;
        updateProfileAvatar();
      }
    } catch (e) { /* ignore */ }
  }

  function saveAvatar(dataUrl) {
    userAvatar = dataUrl;
    try {
      localStorage.setItem('vw_avatar', dataUrl);
    } catch (e) {
      toast('Avatar too large to save', 'error');
    }
    updateProfileAvatar();
  }

  function removeAvatar() {
    userAvatar = null;
    try { localStorage.removeItem('vw_avatar'); } catch (e) { /* ignore */ }
    updateProfileAvatar();
  }

  function updateProfileAvatar() {
    const initial = $('#profile-avatar-initial');
    const img = $('#profile-avatar-img');
    const removeBtn = $('#btn-remove-avatar');
    const nameEl = $('#profile-name');

    if (userAvatar) {
      img.src = userAvatar;
      img.style.display = 'block';
      initial.style.display = 'none';
      removeBtn.style.display = 'inline-flex';
    } else {
      img.style.display = 'none';
      initial.style.display = 'block';
      removeBtn.style.display = 'none';
    }

    if (window.userName) {
      initial.textContent = getInitial(window.userName);
      nameEl.textContent = window.userName;
    }
  }

  function handleAvatarUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Please select an image file', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('Image must be under 2MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height, 200);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        saveAvatar(dataUrl);
        toast('Avatar updated!', 'success');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function getMediaStream(deviceId) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Microphone not available (use HTTPS)', 'error');
        return false;
      }
      const constraints = {
        audio: {
          echoCancellation: echoCancellationEnabled,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
          sampleSize: 16
        }
      };
      if (deviceId) {
        constraints.audio.deviceId = { exact: deviceId };
      }
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[VoiceWave] Mic stream acquired, tracks:', localStream.getAudioTracks().map(t => t.label));

      // Enforce PTT mute on start if PTT is enabled
      if (pttEnabled) {
        localStream.getAudioTracks().forEach(t => t.enabled = false);
      } else {
        localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      }

      return true;
    } catch (err) {
      console.error('[VoiceWave] getUserMedia error:', err);
      toast('Microphone access denied: ' + (err.message || err.name), 'error');
      return false;
    }
  }

  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputSelect = $('#input-device');
      const outputSelect = $('#output-device');
      inputSelect.innerHTML = '';
      outputSelect.innerHTML = '';
      devices.filter(d => d.kind === 'audioinput').forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Mic ${inputSelect.options.length + 1}`;
        inputSelect.appendChild(opt);
      });
      devices.filter(d => d.kind === 'audiooutput').forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Speaker ${outputSelect.options.length + 1}`;
        outputSelect.appendChild(opt);
      });
    } catch (err) {
      console.warn('enumerateDevices error:', err);
    }
  }

  function setupAudioProcessing() {
    if (!localStream) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(e => console.warn('[VoiceWave] AudioContext resume error:', e));
    }
    const source = audioContext.createMediaStreamSource(localStream);

    micGainNode = audioContext.createGain();
    micGainNode.gain.value = $('#mic-gain') ? ($('#mic-gain').value / 100) : 1;

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    source.connect(micGainNode);
    micGainNode.connect(analyserNode);

    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = $('#master-volume') ? ($('#master-volume').value / 100) : 1;

    startVisualizer();
  }

  function pollSpeaking() {
    if (!analyserNode || (isMuted && !pttKeyPressed)) return;
    const data = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(data);
    const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
    const threshold = parseInt($('#noise-threshold')?.value || 12);

    const myCard = $(`[data-socket="${mySocketId}"]`);
    if (myCard) {
      const bars = myCard.querySelectorAll('.meter-bar');
      const level = Math.min(5, Math.floor(rms / 15));
      bars.forEach((bar, i) => {
        bar.classList.toggle('active', i < level);
        bar.classList.toggle('high', i >= 3 && i < level);
      });
      // Toggle avatar speaking animation class
      const avatarContainer = myCard.querySelector('.user-avatar');
      if (avatarContainer) {
        avatarContainer.classList.toggle('speaking', rms > threshold);
      }
    }
  }

  function createPeerConnection(socketId, name) {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });
    peers[socketId] = { pc, name };

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
      applyBandwidthLimit(pc);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { to: socketId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      peerStreams[socketId] = e.streams[0];
      updateUserCardAudio(socketId, e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        toast(`Connection to ${name} failed, retrying...`, 'error');
        renegotiatePeer(socketId);
      }
    };

    return pc;
  }

  function applyBandwidthLimit(pc) {
    pc.getSenders().forEach(sender => {
      if (sender.track && sender.track.kind === 'audio') {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        if (lowBandwidthEnabled) {
          params.encodings[0].maxBitrate = 16000; // limit to 16 kbps
        } else {
          delete params.encodings[0].maxBitrate;
        }
        sender.setParameters(params).catch(err => console.warn('Bitrate limit error:', err));
      }
    });
  }

  async function renegotiatePeer(socketId) {
    const peer = peers[socketId];
    if (!peer) return;
    const pc = peer.pc;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: socketId, offer: pc.localDescription });
    } catch (err) {
      console.error('[VoiceWave] renegotiate error:', err);
    }
  }

  async function addStreamToPeers() {
    if (!localStream) return;
    for (const [socketId, peer] of Object.entries(peers)) {
      const pc = peer.pc;
      const senders = pc.getSenders();
      const hasAudioSender = senders.some(s => s.track && s.track.kind === 'audio');
      if (!hasAudioSender) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
        applyBandwidthLimit(pc);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { to: socketId, offer: pc.localDescription });
        } catch (err) {
          console.error('[VoiceWave] Renegotiation failed:', err);
        }
      }
    }
  }

  async function createOffer(socketId) {
    const pc = peers[socketId]?.pc;
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: socketId, offer: pc.localDescription });
    } catch (err) {
      console.error('createOffer error:', err);
    }
  }

  async function handleOffer(socketId, offer) {
    let peer = peers[socketId];
    if (!peer) {
      const name = 'Peer';
      createPeerConnection(socketId, name);
      peer = peers[socketId];
    }
    const pc = peer.pc;
    try {
      if (localStream) {
        const senders = pc.getSenders();
        const hasAudioSender = senders.some(s => s.track && s.track.kind === 'audio');
        if (!hasAudioSender) {
          localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
          });
          applyBandwidthLimit(pc);
        }
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: socketId, answer: pc.localDescription });
    } catch (err) {
      console.error('handleOffer error:', err);
    }
  }

  async function handleAnswer(socketId, answer) {
    const pc = peers[socketId]?.pc;
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('handleAnswer error:', err);
    }
  }

  async function handleIceCandidate(socketId, candidate) {
    const pc = peers[socketId]?.pc;
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('handleIceCandidate error:', err);
    }
  }

  function updateUserCardAudio(socketId, stream) {
    const card = $(`[data-socket="${socketId}"]`);
    if (!card) return;
    let audio = card.querySelector('audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      card.appendChild(audio);
    }
    audio.srcObject = stream;
    if (isDeafened) audio.volume = 0;
  }

  function isCreatorLocal() {
    return isCreator;
  }

  function isModLocal() {
    return roomModerators.includes(window.userName);
  }

  function renderUserGrid(peersList) {
    const grid = $('#user-grid');
    grid.innerHTML = '';

    const myCard = createUserCard(mySocketId, window.userName || 'You', isMuted, isCreator, true, userAvatar, false, myStatus, handRaised, roomModerators.includes(window.userName));
    grid.appendChild(myCard);

    peersList.forEach(p => {
      peerForceMuted[p.socketId] = p.forceMuted || false;
      const card = createUserCard(p.socketId, p.name, p.muted, p.isCreator, false, p.avatar || null, p.forceMuted, p.status || 'online', p.handRaised || false, p.isModerator || false);
      grid.appendChild(card);
      if (peers[p.socketId]) {
        peers[p.socketId].avatar = p.avatar || null;
        peers[p.socketId].status = p.status || 'online';
        peers[p.socketId].isModerator = p.isModerator || false;
      }
    });

    $('#participant-count').textContent = peersList.length + 1;
    updateParticipantsDropdown();
    startSpeakingPoll();
  }

  function createUserCard(socketId, name, muted, isCreator, isLocal, avatar, forceMuted, status = 'online', handRaisedState = false, isMod = false) {
    const card = document.createElement('div');
    card.className = `user-card ${muted ? 'muted' : ''} ${isCreator ? 'is-admin' : ''} ${isMod && !isCreator ? 'is-mod' : ''}`;
    card.dataset.socket = socketId;
    card.dataset.name = name;

    const avatarColor = getAvatarColor(name);
    const initial = getInitial(name);
    const avatarHtml = avatar
      ? `<div class="user-avatar" style="background:${avatarColor};"><img src="${escapeHtml(avatar)}" alt=""></div>`
      : `<div class="user-avatar" style="background:${avatarColor};">${escapeHtml(initial)}</div>`;

    let muteBtnHtml = '';
    const iAmCreator = isCreatorLocal();
    const iAmMod = isModLocal();
    const isAdmin = iAmCreator || iAmMod;

    if (!isLocal && isAdmin) {
      const banBtnHtml = `<div class="user-kick" data-ban="${socketId}" title="Ban user" style="background:rgba(239,68,68,0.15); color:#ef4444; border-color:rgba(239,68,68,0.3); margin-right:4px;">🔨</div>`;
      const hostBtnHtml = iAmCreator ? `<div class="user-kick" data-transfer="${socketId}" title="Transfer Host" style="background:rgba(34,211,238,0.15); color:#22d3ee; border-color:rgba(34,211,238,0.3); margin-right:4px;">👑</div>` : '';
      const modBtnHtml = iAmCreator ? `<div class="user-kick" data-mod-toggle="${socketId}" title="${isMod ? 'Demote Moderator' : 'Promote Moderator'}" style="background:rgba(168,85,247,0.15); color:#a855f7; border-color:rgba(168,85,247,0.3); margin-right:4px;">🛡️</div>` : '';
      const muteAction = (muted && forceMuted) ? 'Unmute' : 'Mute';
      const muteSymbol = (muted && forceMuted) ? '🔇' : '🔊';

      muteBtnHtml = `
        <div class="user-actions" style="opacity: 0; display:flex; gap:4px;">
          ${banBtnHtml}
          ${hostBtnHtml}
          ${modBtnHtml}
          <div class="user-kick" data-kick="${socketId}" title="Kick user">✕</div>
          <div class="user-mute-btn" data-force-mute="${socketId}" title="${muteAction} user">${muteSymbol}</div>
        </div>
      `;
    } else if (!isLocal) {
      muteBtnHtml = `
        <div class="user-actions" style="opacity: 0;">
          <div class="user-mute-btn" data-whisper="${socketId}" title="Whisper Private DM">💬</div>
        </div>
      `;
    }

    const statusMap = {
      online: { color: '#22c55e', text: 'Online' },
      idle: { color: '#eab308', text: 'Idle' },
      dnd: { color: '#ef4444', text: 'Do Not Disturb' }
    };
    const s = statusMap[status] || statusMap.online;

    const qualityHtml = isLocal ? '' : `
      <div class="connection-quality good" title="Ping: Checking...">
        <div class="connection-bar"></div>
        <div class="connection-bar"></div>
        <div class="connection-bar"></div>
        <div class="connection-bar"></div>
      </div>
    `;

    const handRaisedHtml = handRaisedState ? `<div class="hand-raise-badge">✋</div>` : '';

    card.innerHTML = `
      ${qualityHtml}
      ${handRaisedHtml}
      ${avatarHtml}
      <div class="user-name">${escapeHtml(name)}${isLocal ? ' (You)' : ''}</div>
      <div class="user-status">
        <div class="status-dot" style="background:${s.color};"></div>
        ${muted ? 'Muted' : s.text}
      </div>
      <div class="user-status-icons">
        ${muted ? '<span class="status-icon" style="color:#ef4444;">Muted</span>' : ''}
        ${isCreator ? '<span class="status-icon admin-badge">Admin</span>' : ''}
        ${isMod && !isCreator ? '<span class="status-icon admin-badge" style="background:rgba(168,85,247,0.15); color:#a855f7; border-color:rgba(168,85,247,0.2);">Mod</span>' : ''}
      </div>
      <div class="audio-meter">
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
      </div>
      ${muteBtnHtml}
      ${!isLocal ? `<div class="user-volume"><input type="range" min="0" max="100" value="80" data-peer-volume="${socketId}"></div>` : ''}
    `;

    return card;
  }

  function addPeerToGrid(socketId, name, muted, isCreator, avatar, forceMuted, status = 'online', handRaisedState = false, isMod = false) {
    const grid = $('#user-grid');
    const existing = grid.querySelector(`[data-socket="${socketId}"]`);
    if (existing) existing.remove();

    peerForceMuted[socketId] = forceMuted || false;
    const card = createUserCard(socketId, name, muted, isCreator, false, avatar || null, forceMuted, status, handRaisedState, isMod);
    grid.appendChild(card);

    const count = grid.querySelectorAll('.user-card').length;
    $('#participant-count').textContent = count;
    updateParticipantsDropdown();
  }

  function removePeerFromGrid(socketId) {
    const card = $(`[data-socket="${socketId}"]`);
    if (card) card.remove();

    if (peers[socketId]) {
      peers[socketId].pc.close();
      delete peers[socketId];
    }
    delete peerStreams[socketId];
    delete peerForceMuted[socketId];

    const count = $('#user-grid').querySelectorAll('.user-card').length;
    $('#participant-count').textContent = count;
    updateParticipantsDropdown();
  }

  function updateParticipantsDropdown() {
    const list = $('#pd-list');
    if (!list) return;
    list.innerHTML = '';

    const cards = $$('#user-grid .user-card');
    const finalList = [];
    cards.forEach(card => {
      const imgEl = card.querySelector('.user-avatar img');
      const dotEl = card.querySelector('.status-dot');
      let statusStr = 'online';
      if (dotEl) {
        if (dotEl.style.background.includes('#eab308')) statusStr = 'idle';
        if (dotEl.style.background.includes('#ef4444')) statusStr = 'dnd';
      }
      finalList.push({
        socketId: card.dataset.socket,
        name: card.dataset.name,
        muted: card.classList.contains('muted'),
        isCreator: card.classList.contains('is-admin'),
        isLocal: card.dataset.socket === mySocketId,
        avatar: imgEl ? imgEl.src : null,
        status: statusStr
      });
    });

    finalList.forEach(p => {
      const item = document.createElement('div');
      item.className = 'pd-item';
      const statusColors = { online: 'speaking', idle: 'idle', dnd: 'muted' };
      const dotClass = p.muted ? 'muted' : (statusColors[p.status] || 'idle');
      const avatarHtml = p.avatar
        ? `<img src="${escapeHtml(p.avatar)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
        : `<div class="pd-dot ${dotClass}"></div>`;
      item.innerHTML = `
        ${avatarHtml}
        <div class="pd-name">${escapeHtml(p.name)}${p.isLocal ? '<span class="pd-you">(You)</span>' : ''}</div>
        ${p.isCreator ? '<span class="pd-admin">Admin</span>' : ''}
      `;
      list.appendChild(item);
    });
  }

  function updatePeerMuted(socketId, muted, forceMuted) {
    const card = $(`[data-socket="${socketId}"]`);
    if (!card) return;
    card.classList.toggle('muted', muted);
    const statusDot = card.querySelector('.status-dot');
    if (statusDot && muted) statusDot.style.background = '#ef4444';

    const icons = card.querySelector('.user-status-icons');
    if (icons) {
      const mi = icons.querySelector('.muted-icon');
      if (muted && !mi) {
        const span = document.createElement('span');
        span.className = 'status-icon muted-icon';
        span.style.color = '#ef4444';
        span.textContent = 'Muted';
        icons.appendChild(span);
      } else if (!muted && mi) {
        mi.remove();
      }
    }
  }

  function startSpeakingPoll() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollSpeaking, 100);
  }

  // ── PING STATS MONITORING ──
  function startQualityMonitoring() {
    if (qualityStatsInterval) clearInterval(qualityStatsInterval);
    qualityStatsInterval = setInterval(() => {
      if (!roomId) return;
      Object.entries(peers).forEach(async ([socketId, peer]) => {
        const pc = peer.pc;
        if (!pc || pc.connectionState !== 'connected') return;
        try {
          const stats = await pc.getStats();
          let rtt = 0;
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = report.currentRoundTripTime * 1000;
            }
          });
          const card = $(`[data-socket="${socketId}"]`);
          if (card) {
            const qualityIndicator = card.querySelector('.connection-quality');
            if (qualityIndicator) {
              qualityIndicator.className = 'connection-quality';
              if (rtt > 0) {
                if (rtt < 100) qualityIndicator.classList.add('good');
                else if (rtt < 240) qualityIndicator.classList.add('fair');
                else qualityIndicator.classList.add('poor');
                qualityIndicator.title = `Ping: ${Math.round(rtt)}ms`;
              } else {
                qualityIndicator.classList.add('good');
              }
            }
          }
        } catch (e) {}
      });
    }, 4000);
  }

  // ── SOUNDBOARD PLAY SYNTH ──
  function playSynthSound(soundId) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      if (soundId === 'ding') {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.frequency.setValueAtTime(987.77, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(now + 1.0);
      } else if (soundId === 'pop') {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.frequency.setValueAtTime(350, now); osc.frequency.exponentialRampToValueAtTime(1100, now + 0.08);
        gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(now + 0.08);
      } else if (soundId === 'clap') {
        const bufferSize = ctx.sampleRate * 0.12; const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource(); noise.buffer = buffer;
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        noise.connect(gain); gain.connect(ctx.destination);
        noise.start();
      } else if (soundId === 'airhorn') {
        for (let i = 0; i < 4; i++) {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.type = 'sawtooth'; osc.frequency.value = 220 + (i * 3.2);
          gain.gain.setValueAtTime(0.05, now); gain.gain.setValueAtTime(0.05, now + 0.35);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(); osc.stop(now + 0.45);
        }
      } else if (soundId === 'fart') {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(110, now); osc.frequency.linearRampToValueAtTime(55, now + 0.3);
        gain.gain.setValueAtTime(0.18, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(now + 0.3);
      } else if (soundId === 'drum') {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.frequency.setValueAtTime(160, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.12);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(now + 0.12);
      } else if (soundId === 'win') {
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.08, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(now + idx * 0.08); osc.stop(now + idx * 0.08 + 0.3);
        });
      } else if (soundId === 'sad') {
        const notes = [392.00, 369.99, 349.23, 311.13];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);
          gain.gain.setValueAtTime(0.08, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(now + idx * 0.12); osc.stop(now + idx * 0.12 + 0.45);
        });
      } else if (soundId === 'bruh') {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(140, now); osc.frequency.linearRampToValueAtTime(80, now + 0.35);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(now + 0.35);
      } else if (soundId === 'laugh') {
        for (let i = 0; i < 5; i++) {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.frequency.setValueAtTime(450 + Math.random() * 200, now + i * 0.07);
          gain.gain.setValueAtTime(0.08, now + i * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.1);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(now + i * 0.07); osc.stop(now + i * 0.07 + 0.1);
        }
      }
    } catch (e) {
      console.warn('Web Audio Sound failed:', e);
    }
  }

  function playSound(soundId) {
    try {
      const audio = new Audio(`/sounds/${soundId}.mp3`);
      audio.volume = 0.6;
      audio.play().catch(err => {
        console.warn('[VoiceWave] MP3 play failed, falling back to synth:', err);
        playSynthSound(soundId);
      });
      // Limit Sad sound effect duration to 5 seconds with a smooth fade out
      if (soundId === 'sad') {
        setTimeout(() => {
          let vol = audio.volume;
          const fade = setInterval(() => {
            if (vol > 0.05) {
              vol -= 0.05;
              audio.volume = Math.max(0, vol);
            } else {
              clearInterval(fade);
              audio.pause();
            }
          }, 50);
        }, 4500);
      }
    } catch (e) {
      playSynthSound(soundId);
    }
  }

  // ── CANVAS VISUALIZER FOR SETTINGS ──
  function startVisualizer() {
    if (!analyserNode) return;
    visualizerCanvas = $('#settings-audio-visualizer');
    if (!visualizerCanvas) return;
    visualizerCtx = visualizerCanvas.getContext('2d');
    visualizerCanvas.width = visualizerCanvas.offsetWidth || 300;
    visualizerCanvas.height = 40;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      if (!roomId) {
        cancelAnimationFrame(visualizerDrawLoop);
        return;
      }
      visualizerDrawLoop = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);

      const width = visualizerCanvas.width;
      const height = visualizerCanvas.height;

      visualizerCtx.fillStyle = 'rgba(6, 10, 18, 0.4)';
      visualizerCtx.fillRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height * 0.95;
        visualizerCtx.fillStyle = `rgb(${34 + (i * 2)}, ${211 - (i * 2)}, 238)`;
        visualizerCtx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    }
    draw();
  }

  // ── UPDATE LIGHT/DARK THEME ──
  function applyTheme(theme) {
    localTheme = theme;
    localStorage.setItem('vw_theme', theme);
    document.body.classList.toggle('light-theme', theme === 'light');

    const themeBtn = $('#tb-theme-toggle');
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'light'
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>` // Moon icon
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`; // Sun icon
    }
  }

  // ── UPDATE LOCK/PERMISSIONS UI ──
  function updateRoomLockButton() {
    const btn = $('#btn-room-lock');
    if (!btn) return;
    const isCreatorLocalUser = isCreatorLocal();
    const isModLocalUser = isModLocal();
    const isAdmin = isCreatorLocalUser || isModLocalUser;

    btn.style.display = isAdmin ? 'inline-flex' : 'none';
    btn.innerHTML = isRoomLocked
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
    btn.title = isRoomLocked ? 'Room is Locked' : 'Room is Open';
  }

  function updateRoomPermissionsInputs() {
    const btn = $('#btn-permissions-modal');
    if (btn) btn.style.display = isCreatorLocal() ? 'inline-flex' : 'none';

    const chatCheck = $('#perm-allow-chat');
    const micCheck = $('#perm-allow-mic');
    if (chatCheck) chatCheck.checked = roomPermissions.allowChat;
    if (micCheck) micCheck.checked = roomPermissions.allowMic;
  }

  function connectSocket() {
    if (socket && socket.connected) return;
    if (socket) { socket.disconnect(); socket = null; }

    socket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      mySocketId = socket.id;
      toast('Connected to server', 'success');
      if (window._pendingJoin) {
        socket.emit('join-room', window._pendingJoin);
        window._pendingJoin = null;
      }
    });

    socket.on('disconnect', (reason) => {
      $('#connecting-overlay').classList.remove('show');
      if (reason === 'io server disconnect') {
        toast('Disconnected by server (banned/kicked)', 'error');
      } else {
        toast('Disconnected from server', 'error');
      }
    });

    socket.on('connect_error', (e) => {
      $('#connecting-overlay').classList.remove('show');
      toast('Connection failed — check internet', 'error');
    });

    socket.on('room-joined', async (data) => {
      roomId = data.roomId;
      roomPassword = (window._pendingJoin && window._pendingJoin.password) || null;
      isCreator = data.isCreator;
      window._iAmCreator = isCreator;
      roomPermissions = data.permissions || { allowChat: true, allowMic: true };
      roomModerators = data.moderators || [];
      isRoomLocked = data.locked || false;
      pinnedMessages = data.pinned || [];
      activePolls = data.polls || [];

      // Render custom elements
      updateRoomLockButton();
      updateRoomPermissionsInputs();
      renderPinnedMessages();
      renderPollsList();

      switchScreen('room');
      $('#connecting-overlay').classList.remove('show');
      $('#room-id-display').textContent = roomId;

      roomStartTime = Date.now();
      if (roomTimer) clearInterval(roomTimer);
      roomTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - roomStartTime) / 1000);
        $('#room-timer').textContent = formatTime(elapsed);
      }, 1000);

      renderUserGrid(data.peers);

      // Restore past messages
      const msgContainer = $('#chat-messages');
      msgContainer.innerHTML = '';
      if (data.history && data.history.length > 0) {
        data.history.forEach(msg => addChatMessage(msg));
      }

      if (!localStream) {
        const gotMic = await getMediaStream();
        if (gotMic && localStream) {
          setupAudioProcessing();
          enumerateDevices();
        } else {
          toast('Mic not available — others won\'t hear you', 'error');
        }
      }

      for (const p of data.peers) {
        createPeerConnection(p.socketId, p.name);
        await createOffer(p.socketId);
      }

      if (window.electronAPI) {
        window.electronAPI.updateRoomState(true);
      }

      startAfkTimer();
      startQualityMonitoring();
      toast(`Joined room ${roomId}`, 'success');

      // Sync status
      if (myStatus !== 'online') {
        socket.emit('update-status', { roomId, status: myStatus });
      }
    });

    socket.on('room-not-found', () => { $('#connecting-overlay').classList.remove('show'); toast('Room not found', 'error'); });
    socket.on('room-wrong-password', () => { $('#connecting-overlay').classList.remove('show'); toast('Wrong password', 'error'); });
    socket.on('room-full', () => { $('#connecting-overlay').classList.remove('show'); toast('Room is full (max 30)', 'error'); });
    socket.on('room-locked-error', () => { $('#connecting-overlay').classList.remove('show'); toast('Room is currently locked!', 'error'); });
    socket.on('room-banned-error', () => { $('#connecting-overlay').classList.remove('show'); toast('You are banned from this room!', 'error'); });
    socket.on('room-warning', (data) => toast(data.message, 'info'));
    socket.on('room-requires-password', () => {
      $('#connecting-overlay').classList.remove('show');
      $('#password-modal').classList.add('open');
    });
    socket.on('room-has-password', (data) => {
      if (data.hasPassword) {
        $('#connecting-overlay').classList.remove('show');
        $('#password-modal').classList.add('open');
      }
    });

    socket.on('peer-joined', async (data) => {
      UI_SOUNDS.play('join');
      createPeerConnection(data.socketId, data.name);
      if (peers[data.socketId]) {
        peers[data.socketId].avatar = data.avatar || null;
        peers[data.socketId].status = data.status || 'online';
        peers[data.socketId].isModerator = data.isModerator || false;
      }
      addPeerToGrid(data.socketId, data.name, data.muted, data.isCreator, data.avatar, data.forceMuted, data.status, data.handRaised, data.isModerator);
      toast(`${data.name} joined`, 'info');
      if (localStream) {
        await addStreamToPeers();
      }
    });

    socket.on('peer-left', (data) => {
      UI_SOUNDS.play('leave');
      const name = peers[data.socketId]?.name || 'Someone';
      removePeerFromGrid(data.socketId);
      toast(`${name} left`, 'info');
    });

    socket.on('peer-muted', (data) => {
      const fMuted = data.forceMuted !== undefined ? data.forceMuted : false;
      peerForceMuted[data.socketId] = fMuted;
      updatePeerMuted(data.socketId, data.muted, fMuted);

      if (data.forced && data.socketId === mySocketId) {
        isForceMuted = data.muted;
        isMuted = data.muted;
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        const btn = $('#btn-mute');
        if (btn) {
          btn.classList.toggle('muted-state', isMuted);
          btn.querySelector('.control-label').textContent = isMuted ? 'Unmute' : 'Mic';
        }
        if (window.electronAPI) window.electronAPI.updateMuteState(isMuted);
        toast(data.muted ? 'You were muted by admin' : 'You were unmuted by admin', 'info');
      }
    });

    socket.on('new-creator', (data) => {
      isCreator = data.socketId === mySocketId;
      window._iAmCreator = isCreator;
      toast(isCreator ? 'You are now the room creator' : 'New creator assigned', 'info');
      updateRoomLockButton();
      updateRoomPermissionsInputs();
      renderUserGrid(Object.entries(peers).map(([id, p]) => ({
        socketId: id, name: p.name, muted: !!peerForceMuted[id], isCreator: id === data.socketId, avatar: p.avatar, status: p.status, isModerator: p.isModerator
      })));
    });

    // 🛡️ Moderation events
    socket.on('room-lock-changed', (data) => {
      isRoomLocked = data.locked;
      updateRoomLockButton();
      toast(isRoomLocked ? 'Room has been locked!' : 'Room is now unlocked.', 'info');
    });

    socket.on('permissions-updated', (data) => {
      roomPermissions = data.permissions;
      updateRoomPermissionsInputs();
      toast('Room permissions updated.', 'info');

      // Enforce microphone permissions
      const isAdmin = isCreator || roomModerators.includes(window.userName);
      if (!roomPermissions.allowMic && !isAdmin) {
        if (!isMuted) {
          toggleMute();
          toast('Microphone disabled by host.', 'error');
        }
      }
    });

    socket.on('moderators-updated', (data) => {
      roomModerators = data.moderators;
      toast('Moderators updated.', 'info');
      updateRoomLockButton();
      // Redraw list to show new Mod badges
      renderUserGrid(Object.entries(peers).map(([id, p]) => ({
        socketId: id, name: p.name, muted: !!peerForceMuted[id], isCreator: id === roomId, avatar: p.avatar, status: p.status, isModerator: roomModerators.includes(p.name)
      })));
    });

    socket.on('user-banned-notification', (data) => {
      toast(`${data.name} was banned.`, 'error');
    });

    socket.on('kicked-banned', () => {
      toast('You have been banned from this room by admin.', 'error');
      leaveRoom();
    });

    socket.on('peer-status-updated', (data) => {
      if (peers[data.socketId]) peers[data.socketId].status = data.status;
      const card = $(`[data-socket="${data.socketId}"]`);
      if (card) {
        const dot = card.querySelector('.status-dot');
        const statusColors = { online: '#22c55e', idle: '#eab308', dnd: '#ef4444' };
        if (dot) dot.style.background = statusColors[data.status] || '#22c55e';
      }
      updateParticipantsDropdown();
    });

    socket.on('peer-hand-raised', (data) => {
      UI_SOUNDS.play('hand');
      const card = $(`[data-socket="${data.socketId}"]`);
      if (card) {
        // Toggle hand raised badge
        const badge = card.querySelector('.hand-raise-badge');
        if (data.raised && !badge) {
          const div = document.createElement('div');
          div.className = 'hand-raise-badge';
          div.textContent = '✋';
          card.appendChild(div);
        } else if (!data.raised && badge) {
          badge.remove();
        }
      }
      if (data.raised && data.socketId !== mySocketId) {
        toast(`${data.name} raised hand! ✋`, 'info');
      }
    });

    socket.on('permission-error', (data) => {
      toast(data.message, 'error');
    });

    socket.on('chat-message', (data) => {
      UI_SOUNDS.play('msg');
      addChatMessage(data);
      if (!chatOpen && data.socketId !== mySocketId) {
        unreadCount++;
        updateChatBadge();
      }
    });

    socket.on('chat-message-deleted', (data) => {
      const msg = $(`[data-msgid="${data.msgId}"]`);
      if (msg) msg.remove();
    });

    socket.on('message-reactions-updated', (data) => {
      const msg = $(`[data-msgid="${data.msgId}"]`);
      if (msg) renderMessageReactions(msg, data.reactions);
    });

    socket.on('pinned-messages-updated', (data) => {
      pinnedMessages = data.pinned;
      renderPinnedMessages();
      toast('Pinned messages updated.', 'success');
    });

    socket.on('poll-created', (poll) => {
      activePolls.push(poll);
      renderPollsList();
      toast(`New Poll by ${poll.creator}: "${poll.question}"`, 'info');
    });

    socket.on('poll-updated', (poll) => {
      const idx = activePolls.findIndex(p => p.id === poll.id);
      if (idx > -1) activePolls[idx] = poll;
      renderPollsList();
    });

    socket.on('typing-start', (data) => {
      if (data.socketId !== mySocketId) {
        const card = $(`[data-socket="${data.socketId}"]`);
        const name = card?.dataset.name || 'Someone';
        $('#typing-user').textContent = name;
        $('#typing-indicator').style.display = 'flex';
      }
    });

    socket.on('typing-stop', (data) => {
      if (data.socketId !== mySocketId) {
        $('#typing-indicator').style.display = 'none';
      }
    });

    socket.on('peer-afk', (data) => {
      const card = $(`[data-socket="${data.socketId}"]`);
      if (card) {
        const statusIcons = card.querySelector('.user-status-icons');
        if (statusIcons) {
          const existingAfk = statusIcons.querySelector('.afk-icon');
          if (data.afk && !existingAfk) {
            const span = document.createElement('span');
            span.className = 'status-icon afk-icon';
            span.style.color = '#f59e0b';
            span.textContent = 'AFK';
            statusIcons.appendChild(span);
          } else if (!data.afk && existingAfk) {
            existingAfk.remove();
          }
        }
      }
    });

    socket.on('peer-soundboard-play', (data) => {
      playSound(data.soundId);
      const name = peers[data.socketId]?.name || 'Someone';
      toast(`${name} played ${SOUNDS[data.soundId] || data.soundId}`, 'info');
    });

    socket.on('kicked', () => {
      toast('You were kicked from the room', 'error');
      leaveRoom();
    });
  }

  // ── MESSAGES RENDERING WITH REPLIES & REACTIONS ──
  function addChatMessage(data) {
    const container = $('#chat-messages');
    const isOwn = data.socketId === mySocketId;
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = `chat-msg${isOwn ? ' own' : ''}${data.isWhisper ? ' whisper' : ''}`;
    el.dataset.msgid = data.msgId;

    let senderAvatar = isOwn ? userAvatar : (peers[data.socketId]?.avatar || null);
    const avatarHtml = senderAvatar
      ? `<img src="${escapeHtml(senderAvatar)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-right:6px;">`
      : '';

    let fileHtml = '';
    if (data.file) {
      if (data.file.type?.startsWith('image/')) {
        fileHtml = `<div style="margin-top:8px;"><img src="${escapeHtml(data.file.data)}" class="lightbox-trigger" style="max-width:100%; max-height:200px; border-radius:10px; border:1px solid rgba(255,255,255,0.06); cursor:pointer;" /></div>`;
      } else if (data.file.type?.startsWith('video/')) {
        fileHtml = `<div style="margin-top:8px;"><video src="${escapeHtml(data.file.data)}" controls preload="metadata" style="max-width:100%;max-height:220px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);"></video></div>`;
      } else {
        fileHtml = `<div class="chat-msg-file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><a href="${escapeHtml(data.file.data)}" download="${escapeHtml(data.file.name)}">${escapeHtml(data.file.name)}</a></div>`;
      }
    }

    // Embed reply quote context
    let replyContextHtml = '';
    if (data.replyTo) {
      replyContextHtml = `
        <div class="chat-msg-reply-context">
          <strong>@${escapeHtml(data.replyTo.name)}</strong>: ${escapeHtml(data.replyTo.text)}
        </div>
      `;
    }

    // Action Hover Box (reactions, reply, delete, pin)
    const isAdmin = isCreator || roomModerators.includes(window.userName);
    const deleteBtn = (isOwn || isAdmin) ? `<button class="msg-action-icon-btn" data-act-del="${data.msgId}" title="Delete Message">🗑️</button>` : '';
    const pinBtn = isAdmin ? `<button class="msg-action-icon-btn" data-act-pin="${data.msgId}" title="Pin Message">📌</button>` : '';
    const actionsHoverHtml = `
      <div class="chat-msg-actions-hover">
        <button class="msg-action-icon-btn" data-act-react="${data.msgId}" title="React">😀</button>
        <button class="msg-action-icon-btn" data-act-reply="${data.msgId}" title="Reply">↩️</button>
        ${pinBtn}
        ${deleteBtn}
      </div>
    `;

    // Whisper note
    const whisperLabel = data.isWhisper ? `<span style="font-size:0.65rem; padding:1px 4px; background:#eab308; color:#000; border-radius:4px; margin-left:4px;">Whisper to @${escapeHtml(data.toName)}</span>` : '';

    el.innerHTML = `
      ${replyContextHtml}
      ${actionsHoverHtml}
      <div class="chat-msg-header">
        <div style="display:flex;align-items:center;gap:4px;">
          ${avatarHtml}
          <span class="chat-msg-name">${escapeHtml(data.name)}</span>
          ${whisperLabel}
        </div>
        <span class="chat-msg-time">${time}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(data.text)}</div>
      ${fileHtml}
      <div class="msg-reactions"></div>
    `;

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    // Render reactions if payload has them
    if (data.reactions) renderMessageReactions(el, data.reactions);
  }

  function renderMessageReactions(msgElement, reactions) {
    const listContainer = msgElement.querySelector('.msg-reactions');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!reactions) return;

    Object.entries(reactions).forEach(([reaction, users]) => {
      if (users.length === 0) return;
      const btn = document.createElement('div');
      const isMine = users.includes(window.userName);
      btn.className = `msg-reaction-btn ${isMine ? 'active' : ''}`;
      btn.innerHTML = `<span>${reaction}</span> <span class="react-count">${users.length}</span>`;
      btn.title = `Reacted by: ${users.join(', ')}`;
      btn.addEventListener('click', () => {
        socket.emit('message-reaction', { roomId, msgId: msgElement.dataset.msgid, reaction });
      });
      listContainer.appendChild(btn);
    });
  }

  // ── PINNED MESSAGES UI ──
  function renderPinnedMessages() {
    const list = $('#pinned-messages-list');
    if (!list) return;
    list.innerHTML = '';

    if (pinnedMessages.length === 0) {
      list.innerHTML = `<div style="color:#6b7280; font-size:0.85rem; text-align:center;">No pinned messages in this room.</div>`;
      return;
    }

    pinnedMessages.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'chat-msg';
      item.style.border = '1px solid rgba(255,255,255,0.06)';
      item.style.padding = '10px';
      item.style.borderRadius = '8px';

      const unpinBtn = (isCreator || roomModerators.includes(window.userName))
        ? `<button class="btn btn-ghost btn-sm" data-unpin="${msg.msgId}" style="margin-top:6px; font-size:0.7rem; padding:4px 8px;">Unpin</button>`
        : '';

      item.innerHTML = `
        <div style="font-size:0.72rem; color:var(--muted); margin-bottom:4px;"><strong>@${escapeHtml(msg.name)}</strong>:</div>
        <div style="font-size:0.82rem; color:#f0f4ff;">${escapeHtml(msg.text)}</div>
        ${unpinBtn}
      `;
      list.appendChild(item);
    });
  }

  // ── POLLS UI ──
  function renderPollsList() {
    const list = $('#active-polls-list');
    if (!list) return;
    list.innerHTML = '';

    if (activePolls.length === 0) {
      list.innerHTML = `<div style="color:#6b7280; font-size:0.85rem; text-align:center;">No active polls in this room.</div>`;
      return;
    }

    activePolls.forEach(poll => {
      const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);

      const card = document.createElement('div');
      card.className = 'poll-card';

      let optionsHtml = '';
      poll.options.forEach((opt, idx) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
        const voted = opt.votes.includes(window.userName);

        optionsHtml += `
          <div class="poll-option-row" data-poll-id="${poll.id}" data-option-idx="${idx}">
            <div class="poll-option-bar-bg" style="${voted ? 'border-color:var(--cyan);' : ''}">
              <div class="poll-option-bar-fill" style="width:${pct}%;"></div>
              <div class="poll-option-text-row">
                <span>${voted ? '🔹 ' : ''}${escapeHtml(opt.text)}</span>
                <span>${opt.votes.length} votes (${pct}%)</span>
              </div>
            </div>
          </div>
        `;
      });

      card.innerHTML = `
        <div style="font-size:0.7rem; color:var(--purple); font-weight:700; text-transform:uppercase;">Poll by ${escapeHtml(poll.creator)}</div>
        <div style="font-size:0.95rem; font-weight:700; color:#fff;">${escapeHtml(poll.question)}</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
          ${optionsHtml}
        </div>
      `;
      list.appendChild(card);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function updateChatBadge() {
    const badge = $('#chat-badge');
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    $('#chat-panel').classList.toggle('open', chatOpen);
    if (chatOpen) {
      unreadCount = 0;
      updateChatBadge();
      $('#chat-input').focus();
    }
  }

  function toggleMute() {
    if (!localStream) return;
    if (isForceMuted) {
      toast('You are muted by admin', 'error');
      return;
    }
    isMuted = !isMuted;

    // In PTT mode, mute toggle behaves normally but enforces mic status
    if (pttEnabled) {
      localStream.getAudioTracks().forEach(t => t.enabled = false);
    } else {
      localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    }

    socket.emit('user-muted', { roomId, muted: isMuted });

    const btn = $('#btn-mute');
    btn.classList.toggle('muted-state', isMuted);
    btn.querySelector('.control-label').textContent = isMuted ? 'Unmute' : 'Mic';

    const myCard = $(`[data-socket="${mySocketId}"]`);
    if (myCard) myCard.classList.toggle('muted', isMuted);

    if (window.electronAPI) window.electronAPI.updateMuteState(isMuted);
  }

  function toggleDeafen() {
    if (!localStream) return;
    isDeafened = !isDeafened;

    if (isDeafened) {
      wasMutedBeforeDeafen = isMuted;
      if (!isMuted) toggleMute();
    } else {
      if (!wasMutedBeforeDeafen && isMuted) toggleMute();
    }

    $$('#user-grid .user-card audio').forEach(audio => {
      audio.volume = isDeafened ? 0 : 1;
    });

    const btn = $('#btn-deafen');
    btn.classList.toggle('muted-state', isDeafened);
    btn.querySelector('.control-label').textContent = isDeafened ? 'Undeafen' : 'Deafen';

    if (window.electronAPI) window.electronAPI.updateDeafenState(isDeafened);
  }

  function startAfkTimer() {
    const resetAfk = () => {
      if (isAfk) {
        isAfk = false;
        socket.emit('afk-status', { roomId, afk: false });
      }
      clearTimeout(afkTimeout);
      afkTimeout = setTimeout(() => {
        isAfk = true;
        socket.emit('afk-status', { roomId, afk: true });
      }, 300000);
    };
    ['mousemove', 'keydown', 'click', 'scroll'].forEach(e => {
      document.addEventListener(e, resetAfk, { passive: true });
    });
    resetAfk();
  }

  function startRecording() {
    if (!localStream) return;
    recordedChunks = [];
    try {
      mediaRecorder = new MediaRecorder(localStream, { mimeType: 'audio/webm;codecs=opus' });
    } catch {
      mediaRecorder = new MediaRecorder(localStream);
    }
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voicewave-${roomId}-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    mediaRecorder.start();
    isRecording = true;
    $('#btn-record').classList.add('active');
    $('#record-label').textContent = 'Stop';
    toast('Recording started', 'info');
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      $('#btn-record').classList.remove('active');
      $('#record-label').textContent = 'Record';
      toast('Recording saved', 'success');
    }
  }

  function leaveRoom() {
    if (roomId) {
      socket.emit('leave-room', { roomId });
    }
    if (roomTimer) clearInterval(roomTimer);
    if (pollInterval) clearInterval(pollInterval);
    if (afkTimeout) clearTimeout(afkTimeout);
    if (typingTimeout) clearTimeout(typingTimeout);
    if (speakingTimeout) clearTimeout(speakingTimeout);
    if (qualityStatsInterval) clearInterval(qualityStatsInterval);
    if (mediaRecorder && isRecording) mediaRecorder.stop();

    cancelAnimationFrame(visualizerDrawLoop);

    Object.values(peers).forEach(p => p.pc.close());
    peers = {};
    peerStreams = {};
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    if (audioContext) audioContext.close();
    audioContext = null;
    roomId = null;
    roomPassword = null;
    isMuted = false;
    isForceMuted = false;
    isDeafened = false;
    wasMutedBeforeDeafen = false;
    isRecording = false;
    chatOpen = false;
    unreadCount = 0;
    handRaised = false;

    // Reset button states
    const muteBtn = $('#btn-mute');
    if (muteBtn) { muteBtn.classList.remove('muted-state'); muteBtn.querySelector('.control-label').textContent = 'Mic'; }
    const deafenBtn = $('#btn-deafen');
    if (deafenBtn) { deafenBtn.classList.remove('muted-state'); deafenBtn.querySelector('.control-label').textContent = 'Deafen'; }
    const chatPanel = $('#chat-panel');
    if (chatPanel) chatPanel.classList.remove('open');

    if (window.electronAPI) {
      window.electronAPI.updateRoomState(false);
    }

    switchScreen('lobby');
  }

  function sendMessage() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text && !pendingFile) return;

    // Check chat permission
    if (!roomPermissions.allowChat && !isCreator && !roomModerators.includes(window.userName)) {
      toast('Chatting is disabled by host.', 'error');
      return;
    }

    const msgId = `${mySocketId}-${Date.now()}`;
    const msgData = {
      roomId,
      name: window.userName || 'Anonymous',
      text: text || (pendingFile ? `📎 ${pendingFile.name}` : ''),
      timestamp: Date.now(),
      msgId
    };

    // Attach reply quote if active
    if (replyingTo) {
      msgData.replyTo = replyingTo;
      cancelReply();
    }

    // Attach whisper tag if DM is active
    if (whispersTarget) {
      msgData.whisperTo = whispersTarget.socketId;
    }

    if (pendingFile) {
      const isVideo = pendingFile.type?.startsWith('video/');
      const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
      const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (pendingFile.size > maxSize) {
        toast(isVideo ? 'Video too large (max 100MB)' : 'File too large (max 10MB)', 'error');
        pendingFile = null;
        input.value = '';
        input.placeholder = 'Send a message...';
        return;
      }
      const fileToSend = pendingFile;
      pendingFile = null;
      const reader = new FileReader();
      reader.onload = () => {
        msgData.file = { name: fileToSend.name, type: fileToSend.type, data: reader.result };
        socket.emit('chat-message', msgData);
      };
      reader.readAsDataURL(fileToSend);
    } else {
      socket.emit('chat-message', msgData);
    }

    input.value = '';
    input.placeholder = 'Send a message...';
    socket.emit('typing-stop', { roomId });
  }

  function cancelReply() {
    replyingTo = null;
    $('#reply-banner').style.display = 'none';
  }

  function getInviteLink() {
    let link = `${window.location.origin}/app?room=${roomId}`;
    if (roomPassword) link += `&password=${encodeURIComponent(roomPassword)}`;
    return link;
  }

  function copyInviteLink() {
    const link = getInviteLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        toast('Invite link copied!', 'success');
      }).catch(() => {
        fallbackCopy(link);
      });
    } else {
      fallbackCopy(link);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Invite link copied!', 'success');
    } catch (e) {
      toast('Failed to copy link', 'error');
    }
    document.body.removeChild(ta);
  }

  // ── DRAG & DROP FOR CHAT PANEL ──
  function setupDragAndDrop() {
    const dropZone = document.body;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        if (roomId && chatOpen) $('#chat-panel').style.border = '2px dashed var(--cyan)';
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        $('#chat-panel').style.border = '';
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      if (!roomId || !chatOpen) return;
      const file = e.dataTransfer.files[0];
      if (file) handleChatFileInput(file);
    }, false);
  }

  function handleChatFileInput(file) {
    const isVideo = file.type?.startsWith('video/');
    const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
    if (isVideo && !isElectron) {
      toast('Video sharing is only available in the desktop app', 'error');
      return;
    }
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast(isVideo ? 'Video too large (max 100MB)' : 'File too large (max 10MB)', 'error');
      return;
    }
    pendingFile = file;
    const input = $('#chat-input');
    input.value = `📎 ${file.name}`;
    input.placeholder = 'Press Send to share file...';
    input.focus();
  }

  // ── LINK PREVIEWS GENERATOR ──
  // Client-side quick preview helper
  function detectLinksAndCreatePreview(url) {
    // Simple frontend preview card constructor
    const el = document.createElement('div');
    el.style.cssText = 'margin-top:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; display:flex; flex-direction:column; gap:4px; max-width:280px;';

    let hostname = 'link';
    try { hostname = new URL(url).hostname; } catch(e) {}

    el.innerHTML = `
      <div style="font-size:0.65rem; color:var(--cyan); text-transform:uppercase; font-weight:700;">Link Preview</div>
      <a href="${escapeHtml(url)}" target="_blank" style="font-size:0.8rem; color:#f0f4ff; font-weight:600; text-decoration:none; word-break:break-all;">${escapeHtml(hostname)}</a>
      <div style="font-size:0.7rem; color:var(--muted);">Click to open webpage in your browser.</div>
    `;
    return el;
  }

  function initEventListeners() {
    if ('ontouchstart' in window && window.innerWidth <= 768) {
      const eb = $('#emoji-bar');
      if (eb) eb.style.display = 'none';
    }

    // Set Initial Theme
    applyTheme(localTheme);

    // Drag and Drop
    setupDragAndDrop();

    // Theme triggers
    $('#lobby-theme-toggle')?.addEventListener('click', () => applyTheme(localTheme === 'dark' ? 'light' : 'dark'));
    $('#tb-theme-toggle')?.addEventListener('click', () => applyTheme(localTheme === 'dark' ? 'light' : 'dark'));

    // Status Select trigger
    $('#profile-status-select')?.addEventListener('change', (e) => {
      myStatus = e.target.value;
      if (roomId && socket && socket.connected) {
        socket.emit('update-status', { roomId, status: myStatus });
      }
      // Update local card
      const dot = $(`[data-socket="${mySocketId}"] .status-dot`);
      const statusColors = { online: '#22c55e', idle: '#eab308', dnd: '#ef4444' };
      if (dot) dot.style.background = statusColors[myStatus] || '#22c55e';
    });

    // PTT Enabled trigger
    $('#setting-ptt-enabled')?.addEventListener('change', (e) => {
      pttEnabled = e.target.checked;
      $('#ptt-key-container').style.display = pttEnabled ? 'block' : 'none';
      if (localStream) {
        if (pttEnabled) {
          localStream.getAudioTracks().forEach(t => t.enabled = false);
        } else {
          localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        }
      }
      toast(pttEnabled ? 'Push-to-Talk Enabled' : 'PTT Disabled', 'info');
    });

    // PTT Key select
    $('#setting-ptt-key')?.addEventListener('change', (e) => {
      pttKey = e.target.value;
    });

    // Echo cancellation trigger
    $('#setting-echo-cancellation')?.addEventListener('change', async (e) => {
      echoCancellationEnabled = e.target.checked;
      if (localStream) {
        // Reacquire stream to apply constraints
        const oldId = $('#input-device')?.value;
        localStream.getTracks().forEach(t => t.stop());
        await getMediaStream(oldId);
        setupAudioProcessing();
        // Replace in all peers
        const newTrack = localStream.getAudioTracks()[0];
        for (const [sid, peer] of Object.entries(peers)) {
          const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) await sender.replaceTrack(newTrack);
        }
        toast('Echo Cancellation constraints updated.', 'success');
      }
    });

    // Low bandwidth toggle
    $('#setting-low-bandwidth')?.addEventListener('change', (e) => {
      lowBandwidthEnabled = e.target.checked;
      Object.values(peers).forEach(peer => applyBandwidthLimit(peer.pc));
      toast(lowBandwidthEnabled ? 'Low Bandwidth Mode Active' : 'Normal Bandwidth Mode Active', 'info');
    });

    // Hand Raise trigger
    $('#btn-hand-raise')?.addEventListener('click', () => {
      handRaised = !handRaised;
      $('#btn-hand-raise').classList.toggle('active', handRaised);
      socket.emit('hand-raise', { roomId, raised: handRaised });

      const card = $(`[data-socket="${mySocketId}"]`);
      if (card) {
        const badge = card.querySelector('.hand-raise-badge');
        if (handRaised && !badge) {
          const div = document.createElement('div');
          div.className = 'hand-raise-badge'; div.textContent = '✋';
          card.appendChild(div);
        } else if (!handRaised && badge) {
          badge.remove();
        }
      }
    });

    // Room Lock trigger
    $('#btn-room-lock')?.addEventListener('click', () => {
      socket.emit('toggle-lock', { roomId, locked: !isRoomLocked });
    });

    // Permissions modal closing/opening
    $('#btn-permissions-modal')?.addEventListener('click', () => {
      updateRoomPermissionsInputs();
      $('#permissions-modal').classList.add('open');
    });
    $('#permissions-close')?.addEventListener('click', () => $('#permissions-modal').classList.remove('open'));
    $('#perm-allow-chat')?.addEventListener('change', (e) => {
      socket.emit('toggle-permission', { roomId, permission: 'allowChat', value: e.target.checked });
    });
    $('#perm-allow-mic')?.addEventListener('change', (e) => {
      socket.emit('toggle-permission', { roomId, permission: 'allowMic', value: e.target.checked });
    });

    // Active Polls modal trigger
    $('#btn-active-polls-trigger')?.addEventListener('click', () => {
      renderPollsList();
      $('#active-polls-modal').classList.add('open');
    });
    $('#active-polls-close')?.addEventListener('click', () => $('#active-polls-modal').classList.remove('open'));

    // Create Polls Modal
    $('#btn-polls-trigger')?.addEventListener('click', () => {
      const isCreatorLocalUser = isCreatorLocal();
      const isModLocalUser = isModLocal();
      if (!isCreatorLocalUser && !isModLocalUser) {
        toast('Only admin or mods can create polls.', 'error');
        return;
      }
      $('#poll-question').value = '';
      const container = $('#poll-options-container');
      container.innerHTML = `
        <label>Options</label>
        <input type="text" class="poll-option-input" placeholder="Option 1" style="margin-bottom:8px;">
        <input type="text" class="poll-option-input" placeholder="Option 2" style="margin-bottom:8px;">
      `;
      $('#polls-modal').classList.add('open');
    });
    $('#polls-close')?.addEventListener('click', () => $('#polls-modal').classList.remove('open'));

    $('#btn-add-poll-option')?.addEventListener('click', () => {
      const inputs = $$('.poll-option-input');
      if (inputs.length >= 6) return toast('Maximum 6 options allowed', 'error');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'poll-option-input';
      input.placeholder = `Option ${inputs.length + 1}`;
      input.style.marginBottom = '8px';
      $('#poll-options-container').appendChild(input);
    });

    $('#polls-submit')?.addEventListener('click', () => {
      const q = $('#poll-question').value.trim();
      const optInputs = $$('.poll-option-input');
      const opts = [];
      optInputs.forEach(i => {
        if (i.value.trim()) opts.push(i.value.trim());
      });

      if (!q) return toast('Question required', 'error');
      if (opts.length < 2) return toast('At least 2 options required', 'error');

      socket.emit('create-poll', { roomId, question: q, options: opts });
      $('#polls-modal').classList.remove('open');
    });

    // Pinned messages trigger
    $('#btn-pinned-messages-trigger')?.addEventListener('click', () => {
      renderPinnedMessages();
      $('#pinned-messages-modal').classList.add('open');
    });
    $('#pinned-messages-close')?.addEventListener('click', () => $('#pinned-messages-modal').classList.remove('open'));

    // Soundboard trigger
    $('#btn-soundboard-trigger')?.addEventListener('click', () => {
      $('#soundboard-modal').classList.add('open');
    });
    $('#soundboard-close')?.addEventListener('click', () => $('#soundboard-modal').classList.remove('open'));

    $$('.sound-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const soundId = btn.dataset.sound;
        playSound(soundId);
        socket.emit('soundboard-play', { roomId, soundId });
        $('#soundboard-modal').classList.remove('open');
      });
    });

    // Chat search trigger
    $('#chat-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const msgs = $$('#chat-messages .chat-msg');
      msgs.forEach(msg => {
        const text = msg.querySelector('.chat-msg-text')?.textContent.toLowerCase() || '';
        const name = msg.querySelector('.chat-msg-name')?.textContent.toLowerCase() || '';
        if (text.includes(q) || name.includes(q)) {
          msg.style.display = '';
        } else {
          msg.style.display = 'none';
        }
      });
    });

    // Reply cancel trigger
    $('#btn-cancel-reply')?.addEventListener('click', cancelReply);

    // Lightbox image triggers
    document.addEventListener('click', (e) => {
      const imgTrigger = e.target.closest('.lightbox-trigger');
      if (imgTrigger) {
        $('#lightbox-img').src = imgTrigger.src;
        $('#lightbox-download').href = imgTrigger.src;
        $('#lightbox-download').download = `image-${Date.now()}.png`;
        $('#lightbox-modal').classList.add('open');
      }
      const lightboxModal = e.target.closest('#lightbox-modal');
      if (lightboxModal && !e.target.closest('#lightbox-img') && !e.target.closest('#lightbox-download')) {
        $('#lightbox-modal').classList.remove('open');
      }
    });

    // Avatar upload
    const avatarWrapper = $('#profile-avatar-wrapper');
    const avatarInput = $('#avatar-input');
    const removeAvatarBtn = $('#btn-remove-avatar');

    if (avatarWrapper && avatarInput) {
      avatarWrapper.addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleAvatarUpload(file);
        avatarInput.value = '';
      });
    }
    if (removeAvatarBtn) {
      removeAvatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeAvatar();
        toast('Avatar removed', 'info');
      });
    }

    // Load saved avatar on init
    loadAvatar();

    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        $(`#tab-${tab.dataset.tab}`).classList.add('active');
      });
    });

    const updateProfileName = (name) => {
      window.userName = name;
      const nameEl = $('#profile-name');
      const initialEl = $('#profile-avatar-initial');
      if (nameEl) nameEl.textContent = name || 'Set your name to start';
      if (initialEl) initialEl.textContent = getInitial(name);
    };
    $('#create-name').addEventListener('input', (e) => updateProfileName(e.target.value.trim()));
    $('#join-name').addEventListener('input', (e) => updateProfileName(e.target.value.trim()));

    $('#btn-create').addEventListener('click', () => {
      const name = $('#create-name').value.trim();
      if (!name) return toast('Enter your name', 'error');
      window.userName = name;
      const code = generateRoomId();
      const password = $('#create-password').value;
      $('#connecting-overlay').classList.add('show');
      setTimeout(() => { if ($('#connecting-overlay').classList.contains('show')) { $('#connecting-overlay').classList.remove('show'); toast('Connection timed out', 'error'); } }, 15000);
      window._pendingJoin = { roomId: code, userName: name, muted: false, joinOnly: false, password, avatar: userAvatar || null };
      connectSocket();
    });

    $('#btn-join').addEventListener('click', () => {
      const name = $('#join-name').value.trim();
      const code = $('#join-code').value.trim().toUpperCase();
      const password = $('#join-password').value;
      if (!name) return toast('Enter your name', 'error');
      if (!code) return toast('Enter room code', 'error');
      window.userName = name;
      $('#connecting-overlay').classList.add('show');
      setTimeout(() => { if ($('#connecting-overlay').classList.contains('show')) { $('#connecting-overlay').classList.remove('show'); toast('Connection timed out', 'error'); } }, 15000);

      if (!socket || !socket.connected) {
        window._pendingJoin = { roomId: code, userName: name, muted: false, joinOnly: true, password, avatar: userAvatar || null };
        connectSocket();
      } else {
        socket.emit('join-room', { roomId: code, userName: name, muted: false, joinOnly: true, password, avatar: userAvatar || null });
      }
    });

    $('#modal-submit').addEventListener('click', () => {
      const password = $('#modal-password').value;
      const code = $('#join-code').value.trim().toUpperCase();
      window._pendingJoin = { roomId: code, userName: window.userName, muted: false, joinOnly: true, password, avatar: userAvatar || null };
      if (socket && socket.connected) {
        socket.emit('join-room', { roomId: code, userName: window.userName, muted: false, joinOnly: true, password, avatar: userAvatar || null });
      }
      $('#password-modal').classList.remove('open');
      $('#connecting-overlay').classList.add('show');
      setTimeout(() => { if ($('#connecting-overlay').classList.contains('show')) { $('#connecting-overlay').classList.remove('show'); toast('Connection timed out', 'error'); } }, 15000);
    });

    $('#modal-cancel').addEventListener('click', () => {
      $('#password-modal').classList.remove('open');
    });

    $('#btn-invite').addEventListener('click', copyInviteLink);

    $('#btn-participants').addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = $('#participants-dropdown');
      dd.classList.toggle('open');
      if (dd.classList.contains('open')) updateParticipantsDropdown();
    });

    document.addEventListener('click', (e) => {
      const dd = $('#participants-dropdown');
      if (dd && !e.target.closest('#participants-dropdown') && !e.target.closest('#btn-participants')) {
        dd.classList.remove('open');
      }
    });

    $('#btn-leave').addEventListener('click', () => {
      $('#leave-modal').classList.add('open');
    });
    $('#leave-confirm').addEventListener('click', () => {
      $('#leave-modal').classList.remove('open');
      leaveRoom();
    });
    $('#leave-cancel').addEventListener('click', () => {
      $('#leave-modal').classList.remove('open');
    });

    $('#btn-mute').addEventListener('click', toggleMute);
    $('#btn-deafen').addEventListener('click', toggleDeafen);

    $('#btn-chat-toggle').addEventListener('click', toggleChat);
    $('#btn-close-chat').addEventListener('click', toggleChat);

    $('#btn-send').addEventListener('click', sendMessage);
    $('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    $('#chat-input').addEventListener('input', () => {
      if (!socket || !roomId) return;
      socket.emit('typing-start', { roomId });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => socket.emit('typing-stop', { roomId }), 2000);
    });

    $('#chat-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleChatFileInput(file);
      e.target.value = '';
    });

    $$('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $('#chat-input');
        input.value += btn.dataset.emoji;
        input.focus();
      });
    });

    $('#btn-record').addEventListener('click', () => {
      if (isRecording) stopRecording();
      else startRecording();
    });

    $('#btn-settings').addEventListener('click', () => {
      $('#settings-modal').classList.add('open');
    });
    $('#settings-close').addEventListener('click', () => {
      $('#settings-modal').classList.remove('open');
    });

    $('#master-volume').addEventListener('input', (e) => {
      if (masterGainNode) masterGainNode.gain.value = e.target.value / 100;
      $('#master-volume-val').textContent = e.target.value + '%';
    });

    $('#mic-gain').addEventListener('input', (e) => {
      if (micGainNode) micGainNode.gain.value = e.target.value / 100;
      $('#mic-gain-val').textContent = e.target.value + '%';
    });

    $('#noise-threshold').addEventListener('input', (e) => {
      $('#noise-threshold-val').textContent = e.target.value;
    });

    $('#input-device').addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (!deviceId) return;
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      const gotMic = await getMediaStream(deviceId);
      if (gotMic && localStream) {
        setupAudioProcessing();
        const newTrack = localStream.getAudioTracks()[0];
        for (const [sid, peer] of Object.entries(peers)) {
          const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) await sender.replaceTrack(newTrack);
        }
        toast('Input device changed', 'success');
      }
    });

    $('#output-device').addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (!deviceId) return;
      const audios = $$('#user-grid audio');
      for (const audio of audios) {
        if (audio.setSinkId) {
          try {
            await audio.setSinkId(deviceId);
          } catch (err) {
            console.warn('setSinkId error:', err);
          }
        }
      }
      toast('Output device changed', 'success');
    });

    $$('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });

    // ── CLICK EVENTS FOR REPLIES, REACTIONS, PINS, BANS, MODERATORS, WHISPERS ──
    document.addEventListener('click', (e) => {
      // 1. Kick User
      const kickBtn = e.target.closest('[data-kick]');
      if (kickBtn) {
        const targetId = kickBtn.dataset.kick;
        const card = $(`[data-socket="${targetId}"]`);
        const name = card?.dataset.name || 'this user';
        $('#kick-user-name').textContent = `Kick ${name} from the room?`;
        $('#kick-confirm').onclick = () => {
          socket.emit('kick-user', { roomId, targetId });
          $('#kick-modal').classList.remove('open');
        };
        $('#kick-cancel').onclick = () => $('#kick-modal').classList.remove('open');
        $('#kick-modal').classList.add('open');
      }

      // 2. Ban User
      const banBtn = e.target.closest('[data-ban]');
      if (banBtn) {
        const targetId = banBtn.dataset.ban;
        const name = $(`[data-socket="${targetId}"]`)?.dataset.name || 'user';
        if (confirm(`Ban ${name} permanently from this room?`)) {
          socket.emit('ban-user', { roomId, targetId });
        }
      }

      // 3. Transfer Host
      const transBtn = e.target.closest('[data-transfer]');
      if (transBtn) {
        const targetId = transBtn.dataset.transfer;
        const name = $(`[data-socket="${targetId}"]`)?.dataset.name || 'user';
        if (confirm(`Transfer room ownership to ${name}?`)) {
          socket.emit('transfer-creator', { roomId, targetId });
        }
      }

      // 4. Toggle Moderator
      const modBtn = e.target.closest('[data-mod-toggle]');
      if (modBtn) {
        const targetId = modBtn.dataset.modToggle;
        const name = $(`[data-socket="${targetId}"]`)?.dataset.name || 'user';
        const isCurrentlyMod = roomModerators.includes(name);
        socket.emit('toggle-moderator', { roomId, targetName: name, value: !isCurrentlyMod });
      }

      // 5. Force Mute
      const forceMuteBtn = e.target.closest('[data-force-mute]');
      if (forceMuteBtn) {
        const targetId = forceMuteBtn.dataset.forceMute;
        const card = $(`[data-socket="${targetId}"]`);
        const isMutedState = card?.classList.contains('muted');
        if (isMutedState) {
          if (!peerForceMuted[targetId]) {
            toast('User muted themselves — cannot unmute', 'error');
            return;
          }
          socket.emit('force-unmute', { roomId, targetId });
        } else {
          socket.emit('force-mute', { roomId, targetId });
        }
      }

      // 6. Whisper Trigger on User Card
      const whisperBtn = e.target.closest('[data-whisper]');
      if (whisperBtn) {
        const targetId = whisperBtn.dataset.whisper;
        const name = $(`[data-socket="${targetId}"]`)?.dataset.name || 'user';
        whispersTarget = { socketId: targetId, name };

        // Show indicator in Chat Panel
        if (!chatOpen) toggleChat();
        const input = $('#chat-input');
        input.value = '';
        input.placeholder = `Whisper to @${name}...`;
        input.focus();
        toast(`Whispering to ${name}`, 'info');
      }

      // 7. Message Action: Delete Message
      const actDel = e.target.closest('[data-act-del]');
      if (actDel) {
        socket.emit('delete-chat-message', { roomId, msgId: actDel.dataset.actDel });
      }

      // 8. Message Action: Pin Message
      const actPin = e.target.closest('[data-act-pin]');
      if (actPin) {
        socket.emit('pin-message', { roomId, msgId: actPin.dataset.actPin, pin: true });
      }

      // 9. Message Action: Reply Message
      const actReply = e.target.closest('[data-act-reply]');
      if (actReply) {
        const msgId = actReply.dataset.actReply;
        const msgEl = $(`[data-msgid="${msgId}"]`);
        const author = msgEl.querySelector('.chat-msg-name')?.textContent || 'User';
        const text = msgEl.querySelector('.chat-msg-text')?.textContent || '';

        replyingTo = { msgId, name: author, text };
        $('#reply-banner-text').textContent = `Replying to @${author}: "${text.slice(0, 30)}..."`;
        $('#reply-banner').style.display = 'flex';
        $('#chat-input').focus();
      }

      // 10. Message Action: Add Reaction Popup
      const actReact = e.target.closest('[data-act-react]');
      if (actReact) {
        const msgId = actReact.dataset.actReact;
        const existingPopup = $('.reaction-select-popup');
        if (existingPopup) existingPopup.remove();

        const popup = document.createElement('div');
        popup.className = 'reaction-select-popup';
        popup.innerHTML = `
          <span data-react="😂">😂</span>
          <span data-react="👍">👍</span>
          <span data-react="🔥">🔥</span>
          <span data-react="❤️">❤️</span>
          <span data-react="😢">😢</span>
        `;
        e.target.parentElement.appendChild(popup);

        const handleReactionClick = (clickEvent) => {
          const reactSpan = clickEvent.target.closest('[data-react]');
          if (reactSpan) {
            socket.emit('message-reaction', { roomId, msgId, reaction: reactSpan.dataset.react });
            popup.remove();
          }
        };
        popup.addEventListener('click', handleReactionClick);
      } else {
        // Remove any open reaction popups if clicked elsewhere
        const openPopup = $('.reaction-select-popup');
        if (openPopup && !e.target.closest('.reaction-select-popup')) openPopup.remove();
      }

      // 11. Unpin Message from list
      const unpinBtnEl = e.target.closest('[data-unpin]');
      if (unpinBtnEl) {
        socket.emit('pin-message', { roomId, msgId: unpinBtnEl.dataset.unpin, pin: false });
      }

      // 12. Cast Vote on Poll options
      const optRow = e.target.closest('.poll-option-row');
      if (optRow) {
        const pollId = optRow.dataset.pollId;
        const optionIndex = parseInt(optRow.dataset.optionIdx);
        socket.emit('cast-vote', { roomId, pollId, optionIndex });
      }
    });

    // Delete chat message
    document.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        socket.emit('delete-chat-message', { roomId, msgId: delBtn.dataset.delete });
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target.dataset.peerVolume !== undefined) {
        const peerId = e.target.dataset.peerVolume;
        const card = $(`[data-socket="${peerId}"]`);
        if (card) {
          const audio = card.querySelector('audio');
          if (audio) audio.volume = e.target.value / 100;
        }
      }
    });

    // ── PUSH TO TALK HOTKEY & SYSTEM SHORTCUT LISTENERS ──
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Handle Push to Talk Activation
      if (pttEnabled && e.code === pttKey) {
        if (!pttKeyPressed) {
          pttKeyPressed = true;
          if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
          const pttLabel = $('#btn-mute .control-label');
          if (pttLabel) pttLabel.textContent = 'PTT ON';
        }
      }

      switch (e.key.toLowerCase()) {
        case 'm': if (!pttEnabled) toggleMute(); break;
        case 'd': toggleDeafen(); break;
        case 'c': toggleChat(); break;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Handle PTT Deactivation
      if (pttEnabled && e.code === pttKey) {
        pttKeyPressed = false;
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = false);
        const pttLabel = $('#btn-mute .control-label');
        if (pttLabel) pttLabel.textContent = 'PTT OFF';
      }
    });

    if (window.electronAPI) {
      window.electronAPI.onTrayMuteToggle(() => toggleMute());
      window.electronAPI.onTrayDeafenToggle(() => toggleDeafen());
      window.electronAPI.onTrayLeaveRoom(() => leaveRoom());
    }

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const passParam = urlParams.get('password');
    if (roomParam) {
      $('#join-code').value = roomParam;
      if (passParam) {
        $('#password-group').style.display = 'block';
        $('#join-password').value = passParam;
      }
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      $('[data-tab="join"]').classList.add('active');
      $('#tab-join').classList.add('active');
    }
  }

  if (window.electronAPI && window.electronAPI.isElectron) {
    const updateSection = $('#update-section');
    const updateLabel = $('#update-label');
    const btnCheck = $('#btn-check-update');
    const btnDownload = $('#btn-download-update');
    const btnInstall = $('#btn-install-update');
    const progressBar = $('#update-progress-bar');
    const progressFill = $('#update-progress-fill');
    const progressText = $('#update-progress-text');

    updateSection.style.display = 'block';

    btnCheck.addEventListener('click', () => {
      btnCheck.style.display = 'none';
      btnDownload.style.display = 'none';
      btnInstall.style.display = 'none';
      window.electronAPI.checkForUpdates();
    });

    window.electronAPI.onUpdateStatus((data) => {
      switch (data.status) {
        case 'checking':
          updateLabel.textContent = 'Checking for updates...';
          updateLabel.style.color = '#d1d5db';
          btnCheck.style.display = 'none';
          btnDownload.style.display = 'none';
          btnInstall.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          break;
        case 'available':
          updateLabel.textContent = `Update v${data.version} available`;
          updateLabel.style.color = '#22d3ee';
          btnCheck.style.display = 'none';
          btnDownload.style.display = 'inline-flex';
          btnInstall.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          toast(`Update v${data.version} available!`, 'info');
          break;
        case 'downloading':
          updateLabel.textContent = 'Downloading update...';
          updateLabel.style.color = '#d1d5db';
          btnDownload.style.display = 'none';
          progressBar.style.display = 'block';
          progressText.style.display = 'block';
          progressFill.style.width = data.percent + '%';
          progressText.textContent = data.percent + '%';
          break;
        case 'ready':
          updateLabel.textContent = 'Update ready to install';
          updateLabel.style.color = '#22c55e';
          btnInstall.style.display = 'inline-flex';
          btnDownload.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          toast('Update downloaded — click Close & Install', 'success');
          break;
        case 'up-to-date':
          updateLabel.textContent = `App is up to date (v${window.APP_VERSION || '1.0.2'})`;
          updateLabel.style.color = '#6b7280';
          btnCheck.style.display = 'inline-flex';
          btnDownload.style.display = 'none';
          btnInstall.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          break;
        case 'error':
          updateLabel.textContent = 'Update check failed';
          updateLabel.style.color = '#ef4444';
          btnCheck.style.display = 'inline-flex';
          btnDownload.style.display = 'none';
          btnInstall.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          break;
      }
    });

    btnDownload.addEventListener('click', () => window.electronAPI.downloadUpdate());
    btnInstall.addEventListener('click', () => window.electronAPI.installUpdate());
  }

  document.addEventListener('DOMContentLoaded', initEventListeners);
})();
