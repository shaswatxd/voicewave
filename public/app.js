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

  let socket = null;
  let localStream = null;
  let audioContext = null;
  let micGainNode = null;
  let analyserNode = null;
  let masterGainNode = null;
  let peers = {};
  let peerStreams = {};
  let mySocketId = null;
  let roomId = null;
  let isCreator = false;
  let isMuted = false;
  let isForceMuted = false;
  let isDeafened = false;
  let isHandRaised = false;
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

  async function getMediaStream(deviceId) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Microphone not available (use HTTPS)', 'error');
        return false;
      }
      const constraints = {
        audio: {
          echoCancellation: true,
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
    // Resume AudioContext if suspended (common in Electron)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(e => console.warn('[VoiceWave] AudioContext resume error:', e));
    }
    const source = audioContext.createMediaStreamSource(localStream);

    micGainNode = audioContext.createGain();
    micGainNode.gain.value = 1;

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    analyserNode.smoothingTimeConstant = 0.8;

    source.connect(micGainNode);
    micGainNode.connect(analyserNode);

    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 1;
  }

  function pollSpeaking() {
    if (!analyserNode || isMuted) return;
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
    }

    if (rms > threshold) {
      if (speakingTimeout) clearTimeout(speakingTimeout);
      speakingTimeout = setTimeout(() => {}, 250);
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
        console.log(`[VoiceWave] Added track ${track.kind} (${track.label}) to peer ${socketId}`);
      });
    } else {
      console.warn(`[VoiceWave] localStream is null when creating peer connection for ${socketId}`);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { to: socketId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      console.log(`[VoiceWave] Received track from ${socketId}`, e.track.kind);
      peerStreams[socketId] = e.streams[0];
      updateUserCardAudio(socketId, e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[VoiceWave] Peer ${socketId} connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        toast(`Connection to ${name} failed, retrying...`, 'error');
        // Attempt ICE restart
        renegotiatePeer(socketId);
      }
    };

    return pc;
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

  // Add tracks to peers that were created before localStream was available
  async function addStreamToPeers() {
    if (!localStream) return;
    for (const [socketId, peer] of Object.entries(peers)) {
      const pc = peer.pc;
      const senders = pc.getSenders();
      const hasAudioSender = senders.some(s => s.track && s.track.kind === 'audio');
      if (!hasAudioSender) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
          console.log(`[VoiceWave] Late-added track ${track.kind} to peer ${socketId}`);
        });
        // Renegotiate since we added tracks
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { to: socketId, offer: pc.localDescription });
        } catch (err) {
          console.error('[VoiceWave] Renegotiation after late track add failed:', err);
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
      // Ensure our tracks are added before answering
      if (localStream) {
        const senders = pc.getSenders();
        const hasAudioSender = senders.some(s => s.track && s.track.kind === 'audio');
        if (!hasAudioSender) {
          localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`[VoiceWave] Added track before answering offer from ${socketId}`);
          });
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

  function renderUserGrid(peersList) {
    const grid = $('#user-grid');
    grid.innerHTML = '';

    const myCard = createUserCard(mySocketId, window.userName || 'You', isMuted, isCreator, true);
    grid.appendChild(myCard);

    peersList.forEach(p => {
      const card = createUserCard(p.socketId, p.name, p.muted, p.isCreator, false);
      grid.appendChild(card);
    });

    $('#participant-count').textContent = peersList.length + 1;
    updateParticipantsDropdown();
    startSpeakingPoll();
  }

  function createUserCard(socketId, name, muted, isCreator, isLocal) {
    const card = document.createElement('div');
    card.className = `user-card ${muted ? 'muted' : ''} ${isCreator ? 'is-admin' : ''}`;
    card.dataset.socket = socketId;
    card.dataset.name = name;

    const avatarColor = getAvatarColor(name);
    const initial = getInitial(name);

    card.innerHTML = `
      <div class="user-avatar" style="background:${avatarColor};">${escapeHtml(initial)}</div>
      <div class="user-name">${escapeHtml(name)}${isLocal ? ' (You)' : ''}</div>
      <div class="user-status">
        <div class="status-dot ${muted ? 'muted' : 'idle'}"></div>
        ${muted ? 'Muted' : 'Connected'}
      </div>
      <div class="user-status-icons">
        ${muted ? '<span class="status-icon" style="color:#ef4444;">Muted</span>' : ''}
        ${isCreator ? '<span class="status-icon admin-badge">Admin</span>' : ''}
      </div>
      <div class="audio-meter">
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
      </div>
      ${!isLocal && window._iAmCreator ? `<div class="user-actions"><div class="user-kick" data-kick="${socketId}" title="Kick user">✕</div><div class="user-mute-btn" data-force-mute="${socketId}" title="${muted ? 'Unmute user' : 'Mute user'}">${muted ? '🔇' : '🔊'}</div></div>` : ''}
      ${!isLocal ? `<div class="user-volume"><input type="range" min="0" max="100" value="80" data-peer-volume="${socketId}"></div>` : ''}
    `;

    return card;
  }

  function addPeerToGrid(socketId, name, muted, isCreator) {
    const grid = $('#user-grid');
    const existing = grid.querySelector(`[data-socket="${socketId}"]`);
    if (existing) existing.remove();

    const card = createUserCard(socketId, name, muted, isCreator, false);
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

    const count = $('#user-grid').querySelectorAll('.user-card').length;
    $('#participant-count').textContent = count;
    updateParticipantsDropdown();
  }

  function updateParticipantsDropdown() {
    const list = $('#pd-list');
    if (!list) return;
    list.innerHTML = '';

    const me = { socketId: mySocketId, name: window.userName || 'You', muted: isMuted, isCreator: isCreator };
    const all = [me, ...Object.values(peers).map(p => ({ socketId: p.socketId || p.pc?.id, name: p.name, muted: false, isCreator: false }))];

    const cards = $$('#user-grid .user-card');
    const finalList = [];
    cards.forEach(card => {
      finalList.push({
        socketId: card.dataset.socket,
        name: card.dataset.name,
        muted: card.classList.contains('muted'),
        isCreator: card.classList.contains('is-admin'),
        isLocal: card.dataset.socket === mySocketId
      });
    });

    finalList.forEach(p => {
      const item = document.createElement('div');
      item.className = 'pd-item';
      const dotClass = p.muted ? 'muted' : 'idle';
      item.innerHTML = `
        <div class="pd-dot ${dotClass}"></div>
        <div class="pd-name">${escapeHtml(p.name)}${p.isLocal ? '<span class="pd-you">(You)</span>' : ''}</div>
        ${p.isCreator ? '<span class="pd-admin">Admin</span>' : ''}
      `;
      list.appendChild(item);
    });
  }

  function updatePeerMuted(socketId, muted) {
    const card = $(`[data-socket="${socketId}"]`);
    if (!card) return;
    card.classList.toggle('muted', muted);
    const statusDot = card.querySelector('.status-dot');
    const statusText = card.querySelector('.user-status');
    if (statusDot) statusDot.className = `status-dot ${muted ? 'muted' : 'idle'}`;
    if (statusText) {
      const icons = card.querySelector('.user-status-icons');
      if (muted) {
        if (!icons.querySelector('.muted-icon')) {
          const span = document.createElement('span');
          span.className = 'status-icon muted-icon';
          span.style.color = '#ef4444';
          span.textContent = 'Muted';
          icons.appendChild(span);
        }
      } else {
        const mi = icons?.querySelector('.muted-icon');
        if (mi) mi.remove();
      }
    }
  }

  function startSpeakingPoll() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollSpeaking, 100);
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
        toast('Disconnected by server (file too large?)', 'error');
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
      isCreator = data.isCreator;
      window._iAmCreator = isCreator;
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

      // Get mic stream FIRST, then create peer connections
      if (!localStream) {
        const gotMic = await getMediaStream();
        if (gotMic && localStream) {
          setupAudioProcessing();
          enumerateDevices();
        } else {
          toast('Mic not available — others won\'t hear you', 'error');
        }
      }

      // Now create peer connections WITH the stream already available
      for (const p of data.peers) {
        createPeerConnection(p.socketId, p.name);
        await createOffer(p.socketId);
      }

      if (window.electronAPI) {
        window.electronAPI.updateRoomState(true);
      }

      startAfkTimer();
      toast(`Joined room ${roomId}`, 'success');
    });

    socket.on('room-not-found', () => { $('#connecting-overlay').classList.remove('show'); toast('Room not found', 'error'); });
    socket.on('room-wrong-password', () => { $('#connecting-overlay').classList.remove('show'); toast('Wrong password', 'error'); });
    socket.on('room-full', () => { $('#connecting-overlay').classList.remove('show'); toast('Room is full (max 30)', 'error'); });
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
      createPeerConnection(data.socketId, data.name);
      addPeerToGrid(data.socketId, data.name, data.muted, data.isCreator);
      toast(`${data.name} joined`, 'info');
      // If we somehow don't have the stream on peer connections, add it now
      if (localStream) {
        await addStreamToPeers();
      }
    });

    socket.on('peer-left', (data) => {
      const name = peers[data.socketId]?.name || 'Someone';
      removePeerFromGrid(data.socketId);
      toast(`${name} left`, 'info');
    });

    socket.on('peer-muted', (data) => {
      updatePeerMuted(data.socketId, data.muted);
      // Handle force mute on self — update local state and UI
      if (data.forced && data.socketId === mySocketId) {
        isForceMuted = data.muted;
        isMuted = data.muted;
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        const btn = $('#btn-mute');
        if (btn) {
          btn.classList.toggle('muted-state', isMuted);
          btn.querySelector('.control-label').textContent = isMuted ? 'Unmute' : 'Mic';
          btn.querySelector('.control-icon').innerHTML = isMuted
            ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 0"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>'
            : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
        }
        if (window.electronAPI) window.electronAPI.updateMuteState(isMuted);
        toast(data.muted ? 'You were muted by admin' : 'You were unmuted by admin', 'info');
      }
    });

    socket.on('new-creator', (data) => {
      isCreator = data.socketId === mySocketId;
      window._iAmCreator = isCreator;
      toast(isCreator ? 'You are now the room creator' : 'New creator assigned', 'info');
      const grid = $('#user-grid');
      const cards = grid.querySelectorAll('.user-card');
      cards.forEach(card => {
        const sid = card.dataset.socket;
        const name = card.dataset.name;
        const muted = card.classList.contains('muted');
        const cardIsCreator = sid === data.socketId;
        const cardIsLocal = sid === mySocketId;
        const newCard = createUserCard(sid, name, muted, cardIsCreator, cardIsLocal);
        card.replaceWith(newCard);
        if (peerStreams[sid]) {
          updateUserCardAudio(sid, peerStreams[sid]);
        }
      });
    });

    socket.on('offer', async (data) => {
      await handleOffer(data.from, data.offer);
    });

    socket.on('answer', async (data) => {
      await handleAnswer(data.from, data.answer);
    });

    socket.on('ice-candidate', async (data) => {
      await handleIceCandidate(data.from, data.candidate);
    });

    socket.on('chat-message', (data) => {
      addChatMessage(data);
      if (!chatOpen && data.socketId !== mySocketId) {
        unreadCount++;
        updateChatBadge();
      }
    });

    socket.on('chat-message-deleted', (data) => {
      const msg = $(`[data-msgid="${data.msgId}"]`);
      if (msg) {
        if (data.isCreator || data.deletedBy === mySocketId) {
          msg.remove();
        } else {
          msg.querySelector('.chat-msg-text').textContent = '[Message deleted]';
        }
      }
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
        const status = card.querySelector('.user-status');
        if (status) {
          const dot = status.querySelector('.status-dot');
          if (dot) dot.className = `status-dot ${data.afk ? 'idle' : 'idle'}`;
        }
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

    socket.on('peer-hand-raised', (data) => {
      toast(`${peers[data.socketId]?.name || 'Someone'} raised their hand`, 'info');
    });

    socket.on('peer-hand-lowered', (data) => {
      const name = peers[data.socketId]?.name || 'Someone';
      toast(`${name} lowered hand`, 'info');
    });

    socket.on('peer-soundboard-play', (data) => {
      const name = peers[data.socketId]?.name || 'Someone';
      toast(`${name} played ${SOUNDS[data.soundId] || data.soundId}`, 'info');
    });

    socket.on('kicked', () => {
      toast('You were kicked from the room', 'error');
      leaveRoom();
    });
  }

  function addChatMessage(data) {
    const container = $('#chat-messages');
    const isOwn = data.socketId === mySocketId;
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = `chat-msg${isOwn ? ' own' : ''}`;
    el.dataset.msgid = data.msgId;

    let fileHtml = '';
    if (data.file) {
      if (data.file.type?.startsWith('image/')) {
        fileHtml = `<div style="margin-top:8px;"><img src="${data.file.data}" style="max-width:100%;border-radius:10px;border:1px solid rgba(255,255,255,0.06);" /></div>`;
      } else {
        fileHtml = `<div class="chat-msg-file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><a href="${data.file.data}" download="${escapeHtml(data.file.name)}">${escapeHtml(data.file.name)}</a></div>`;
      }
    }

    el.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-name">${escapeHtml(data.name)}</span>
        <span class="chat-msg-time">${time}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(data.text)}</div>
      ${fileHtml}
      ${isOwn || isCreator ? `<div class="chat-msg-delete" data-delete="${data.msgId}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Delete</div>` : ''}
    `;

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
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
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    socket.emit('user-muted', { roomId, muted: isMuted });

    const btn = $('#btn-mute');
    btn.classList.toggle('muted-state', isMuted);
    btn.querySelector('.control-label').textContent = isMuted ? 'Unmute' : 'Mic';
    btn.querySelector('.control-icon').innerHTML = isMuted
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 0"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';

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

    // Use audio.volume on <audio> elements instead of disabling remote tracks
    $$('#user-grid .user-card audio').forEach(audio => {
      audio.volume = isDeafened ? 0 : 1;
    });

    const btn = $('#btn-deafen');
    btn.classList.toggle('muted-state', isDeafened);
    btn.querySelector('.control-label').textContent = isDeafened ? 'Undeafen' : 'Deafen';
    btn.querySelector('.control-icon').innerHTML = isDeafened
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M21 14.4A9.8 9.8 0 0 0 16.5 3.5"/><path d="M3 18v-6a9 9 0 0 1 16.5-6.4"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>';

    if (window.electronAPI) window.electronAPI.updateDeafenState(isDeafened);
  }

  function toggleHand() {
    if (!socket || !roomId) return;
    isHandRaised = !isHandRaised;
    socket.emit(isHandRaised ? 'raise-hand' : 'lower-hand', { roomId });

    const btn = $('#btn-hand');
    if (btn) {
      btn.classList.toggle('hand-raised', isHandRaised);
      btn.querySelector('.control-icon').textContent = isHandRaised ? '✋' : '🤚';
    }
    toast(isHandRaised ? 'Hand raised ✋' : 'Hand lowered', 'info');
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

  let soundAudioCtx = null;

  function playSound(soundId) {
    const frequencies = {
      airhorn: 440, clap: 800, laugh: 600, ding: 1000,
      bruh: 150, sad: 300, win: 880, drum: 100,
      fart: 200, pop: 600
    };
    const freq = frequencies[soundId] || 440;
    if (!soundAudioCtx) soundAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (soundAudioCtx.state === 'suspended') soundAudioCtx.resume();
    const osc = soundAudioCtx.createOscillator();
    const gain = soundAudioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = soundId === 'drum' ? 'square' : 'sine';
    gain.gain.setValueAtTime(0.3, soundAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, soundAudioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(soundAudioCtx.destination);
    osc.start();
    osc.stop(soundAudioCtx.currentTime + 0.5);

    socket.emit('soundboard-play', { roomId, soundId });
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
    if (mediaRecorder && isRecording) mediaRecorder.stop();

    Object.values(peers).forEach(p => p.pc.close());
    peers = {};
    peerStreams = {};
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    if (audioContext) audioContext.close();
    audioContext = null;
    roomId = null;
    isMuted = false;
    isForceMuted = false;
    isDeafened = false;
    isHandRaised = false;
    wasMutedBeforeDeafen = false;
    isRecording = false;
    chatOpen = false;
    unreadCount = 0;

    // Reset button states
    const muteBtn = $('#btn-mute');
    if (muteBtn) { muteBtn.classList.remove('muted-state'); muteBtn.querySelector('.control-label').textContent = 'Mic'; }
    const deafenBtn = $('#btn-deafen');
    if (deafenBtn) { deafenBtn.classList.remove('muted-state'); deafenBtn.querySelector('.control-label').textContent = 'Deafen'; }
    const handBtn = $('#btn-hand');
    if (handBtn) { handBtn.classList.remove('hand-raised'); }
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

    const msgId = `${mySocketId}-${Date.now()}`;
    const msgData = {
      roomId,
      name: window.userName || 'Anonymous',
      text: text || (pendingFile ? `📎 ${pendingFile.name}` : ''),
      timestamp: Date.now(),
      msgId
    };

    if (pendingFile) {
      if (pendingFile.size > 2 * 1024 * 1024) {
        toast('File too large (max 2MB for chat)', 'error');
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

  function sendFile(file) {
    if (file.size > 2 * 1024 * 1024) {
      toast('File too large (max 2MB for chat)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const msgId = `${mySocketId}-${Date.now()}`;
      socket.emit('chat-message', {
        roomId,
        name: window.userName || 'Anonymous',
        text: `📎 ${file.name}`,
        timestamp: Date.now(),
        msgId,
        file: { name: file.name, type: file.type, data: reader.result }
      });
    };
    reader.readAsDataURL(file);
  }

  function copyInviteLink() {
    const link = `${window.location.origin}/app?room=${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      toast('Invite link copied!', 'success');
    }).catch(() => {
      toast('Failed to copy link', 'error');
    });
  }

  function initEventListeners() {
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        $(`#tab-${tab.dataset.tab}`).classList.add('active');
      });
    });

    $('#btn-create').addEventListener('click', () => {
      const name = $('#create-name').value.trim();
      if (!name) return toast('Enter your name', 'error');
      window.userName = name;
      const code = generateRoomId();
      const password = $('#create-password').value;
      $('#connecting-overlay').classList.add('show');
      setTimeout(() => { if ($('#connecting-overlay').classList.contains('show')) { $('#connecting-overlay').classList.remove('show'); toast('Connection timed out', 'error'); } }, 15000);
      window._pendingJoin = { roomId: code, userName: name, muted: false, joinOnly: false, password };
      connectSocket();
    });

    $('#btn-join').addEventListener('click', () => {
      const name = $('#join-name').value.trim();
      const code = $('#join-code').value.trim().toUpperCase();
      if (!name) return toast('Enter your name', 'error');
      if (!code) return toast('Enter room code', 'error');
      window.userName = name;
      $('#connecting-overlay').classList.add('show');
      setTimeout(() => { if ($('#connecting-overlay').classList.contains('show')) { $('#connecting-overlay').classList.remove('show'); toast('Connection timed out', 'error'); } }, 15000);

      if (!socket || !socket.connected) {
        window._pendingJoin = { roomId: code, userName: name, muted: false, joinOnly: true };
        connectSocket();
      } else {
        socket.emit('join-room', { roomId: code, userName: name, muted: false, joinOnly: true });
      }
    });

    $('#modal-submit').addEventListener('click', () => {
      const password = $('#modal-password').value;
      const code = $('#join-code').value.trim().toUpperCase();
      if (socket && socket.connected) {
        socket.emit('join-room', { roomId: code, userName: window.userName, muted: false, joinOnly: true, password });
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
    $('#btn-hand').addEventListener('click', toggleHand);

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
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          toast('File too large (max 2MB for chat)', 'error');
          e.target.value = '';
          return;
        }
        pendingFile = file;
        const input = $('#chat-input');
        input.value = `📎 ${file.name}`;
        input.placeholder = 'Press Send to share file...';
        input.focus();
      }
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

    // Device change listeners
    $('#input-device').addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (!deviceId) return;
      // Stop old tracks
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      const gotMic = await getMediaStream(deviceId);
      if (gotMic && localStream) {
        setupAudioProcessing();
        // Replace track in all peer connections
        const newTrack = localStream.getAudioTracks()[0];
        for (const [sid, peer] of Object.entries(peers)) {
          const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) {
            await sender.replaceTrack(newTrack);
          }
        }
        toast('Input device changed', 'success');
      }
    });

    $('#output-device').addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (!deviceId) return;
      // Set output device on all audio elements
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

    document.addEventListener('click', (e) => {
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

      const muteBtn = e.target.closest('[data-force-mute]');
      if (muteBtn) {
        const targetId = muteBtn.dataset.forceMute;
        const card = $(`[data-socket="${targetId}"]`);
        const isMuted = card?.classList.contains('muted');
        if (isMuted) {
          socket.emit('force-unmute', { roomId, targetId });
        } else {
          socket.emit('force-mute', { roomId, targetId });
        }
      }
    });

    document.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        socket.emit('delete-chat-message', { roomId, msgId: delBtn.dataset.delete });
      }
    });

    // Peer volume — use audio.volume directly to avoid double-audio from Web Audio API
    document.addEventListener('input', (e) => {
      if (e.target.dataset.peerVolume !== undefined) {
        const peerId = e.target.dataset.peerVolume;
        const card = $(`[data-socket="${peerId}"]`);
        if (card) {
          const audio = card.querySelector('audio');
          if (audio) {
            audio.volume = e.target.value / 100;
          }
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 'm': toggleMute(); break;
        case 'd': toggleDeafen(); break;
        case 'c': toggleChat(); break;
        case 'h': toggleHand(); break;
      }
    });

    if (window.electronAPI) {
      window.electronAPI.onTrayMuteToggle(() => toggleMute());
      window.electronAPI.onTrayDeafenToggle(() => toggleDeafen());
      window.electronAPI.onTrayLeaveRoom(() => leaveRoom());
    }

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      $('#join-code').value = roomParam;
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
          toast('Update downloaded — restart to install', 'success');
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
