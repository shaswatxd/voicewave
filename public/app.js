(() => {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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
  let noiseGateNode = null;
  let analyserNode = null;
  let masterGainNode = null;
  let peers = {};
  let peerStreams = {};
  let mySocketId = null;
  let roomId = null;
  let isCreator = false;
  let isMuted = false;
  let isDeafened = false;
  let isHandRaised = false;
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

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function switchScreen(screen) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${screen}`).classList.add('active');
  }

  function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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

  async function getMediaStream() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      return true;
    } catch (err) {
      toast('Microphone access denied', 'error');
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
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(localStream);

    micGainNode = audioContext.createGain();
    micGainNode.gain.value = 1;

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;

    source.connect(micGainNode);
    micGainNode.connect(analyserNode);

    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 0.8;
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
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[socketId] = { pc, name };

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
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
        toast(`Connection to ${name} failed`, 'error');
      }
    };

    return pc;
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

    const myCard = createUserCard(mySocketId, window.userName || 'You', isMuted, true, true);
    grid.appendChild(myCard);

    peersList.forEach(p => {
      const card = createUserCard(p.socketId, p.name, p.muted, p.isCreator, false);
      grid.appendChild(card);
    });

    $('#participant-count').textContent = peersList.length + 1;
    startSpeakingPoll();
  }

  function createUserCard(socketId, name, muted, isCreator, isLocal) {
    const card = document.createElement('div');
    card.className = `user-card ${muted ? 'muted' : ''}`;
    card.dataset.socket = socketId;
    card.dataset.name = name;

    const avatarColor = getAvatarColor(name);
    const initial = getInitial(name);

    card.innerHTML = `
      <div class="user-avatar" style="background:${avatarColor};">${initial}</div>
      <div class="user-name">${name}${isLocal ? ' (You)' : ''}</div>
      <div class="user-status">
        <div class="status-dot ${muted ? 'muted' : 'idle'}"></div>
        ${muted ? 'Muted' : 'Connected'}
      </div>
      <div class="user-status-icons">
        ${muted ? '<span class="status-icon">🔇</span>' : ''}
        ${isCreator ? '<span class="status-icon">👑</span>' : ''}
      </div>
      <div class="audio-meter">
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
        <div class="meter-bar"></div>
      </div>
      ${!isLocal && isCreator ? `<div class="user-kick" data-kick="${socketId}" title="Kick user">✕</div>` : ''}
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
          span.textContent = '🔇';
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
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      mySocketId = socket.id;
      toast('Connected to server', 'success');
    });

    socket.on('disconnect', () => {
      toast('Disconnected from server', 'error');
    });

    socket.on('room-joined', async (data) => {
      roomId = data.roomId;
      isCreator = data.isCreator;
      switchScreen('room');
      $('#room-id-display').textContent = roomId;

      roomStartTime = Date.now();
      if (roomTimer) clearInterval(roomTimer);
      roomTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - roomStartTime) / 1000);
        $('#room-timer').textContent = formatTime(elapsed);
      }, 1000);

      await getMediaStream();
      if (localStream) {
        setupAudioProcessing();
        enumerateDevices();
      }

      data.peers.forEach(p => {
        createPeerConnection(p.socketId, p.name);
        addPeerToGrid(p.socketId, p.name, p.muted, p.isCreator);
        createOffer(p.socketId);
      });

      renderUserGrid(data.peers);

      if (window.electronAPI) {
        window.electronAPI.updateRoomState(true);
      }

      startAfkTimer();
      toast(`Joined room ${roomId}`, 'success');
    });

    socket.on('room-not-found', () => toast('Room not found', 'error'));
    socket.on('room-wrong-password', () => toast('Wrong password', 'error'));
    socket.on('room-full', () => toast('Room is full', 'error'));
    socket.on('room-requires-password', () => {
      $('#password-modal').classList.add('open');
    });
    socket.on('room-has-password', (data) => {
      if (data.hasPassword) {
        $('#password-modal').classList.add('open');
      }
    });

    socket.on('peer-joined', (data) => {
      createPeerConnection(data.socketId, data.name);
      addPeerToGrid(data.socketId, data.name, data.muted, data.isCreator);
      toast(`${data.name} joined`, 'info');
    });

    socket.on('peer-left', (data) => {
      const name = peers[data.socketId]?.name || 'Someone';
      removePeerFromGrid(data.socketId);
      toast(`${name} left`, 'info');
    });

    socket.on('peer-muted', (data) => {
      updatePeerMuted(data.socketId, data.muted);
    });

    socket.on('new-creator', (data) => {
      isCreator = data.socketId === mySocketId;
      toast(isCreator ? 'You are now the room creator' : 'New creator assigned', 'info');
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
      }
    });

    socket.on('peer-hand-raised', (data) => {
      toast(`${peers[data.socketId]?.name || 'Someone'} raised their hand`, 'info');
    });

    socket.on('peer-hand-lowered', () => {});

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
    el.className = 'chat-msg';
    el.dataset.msgid = data.msgId;

    let fileHtml = '';
    if (data.file) {
      if (data.file.type?.startsWith('image/')) {
        fileHtml = `<div style="margin-top:6px;"><img src="${data.file.data}" style="max-width:100%;border-radius:6px;" /></div>`;
      } else {
        fileHtml = `<div style="margin-top:6px;"><a href="${data.file.data}" download="${data.file.name}" style="color:var(--cyan);font-size:0.78rem;">📎 ${data.file.name}</a></div>`;
      }
    }

    el.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-name">${data.name}</span>
        <span class="chat-msg-time">${time}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(data.text)}</div>
      ${fileHtml}
      ${isOwn || isCreator ? `<div class="chat-msg-delete" data-delete="${data.msgId}">Delete</div>` : ''}
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
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    socket.emit('user-muted', { roomId, muted: isMuted });

    const btn = $('#btn-mute');
    btn.classList.toggle('muted-state', isMuted);
    btn.querySelector('.control-label').textContent = isMuted ? 'Unmute' : 'Mute';
    btn.querySelector('.control-icon').textContent = isMuted ? '🔇' : '🎙️';

    const myCard = $(`[data-socket="${mySocketId}"]`);
    if (myCard) myCard.classList.toggle('muted', isMuted);

    if (window.electronAPI) window.electronAPI.updateMuteState(isMuted);
  }

  function toggleDeafen() {
    if (!localStream) return;
    isDeafened = !isDeafened;

    if (isDeafened && !isMuted) toggleMute();
    if (!isDeafened && isMuted) toggleMute();

    Object.values(peerStreams).forEach(stream => {
      stream.getAudioTracks().forEach(t => t.enabled = !isDeafened);
    });

    const btn = $('#btn-deafen');
    btn.classList.toggle('muted-state', isDeafened);
    btn.querySelector('.control-label').textContent = isDeafened ? 'Undeafen' : 'Deafen';
    btn.querySelector('.control-icon').textContent = isDeafened ? '🔇' : '🎧';

    if (window.electronAPI) window.electronAPI.updateDeafenState(isDeafened);
  }

  function toggleHand() {
    isHandRaised = !isHandRaised;
    socket.emit(isHandRaised ? 'raise-hand' : 'lower-hand', { roomId });

    const btn = $('#btn-hand');
    btn.classList.toggle('active', isHandRaised);
    toast(isHandRaised ? 'Hand raised' : 'Hand lowered', 'info');
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

  function playSound(soundId) {
    const frequencies = {
      airhorn: 440, clap: 800, laugh: 600, ding: 1000,
      bruh: 150, sad: 300, win: 880, drum: 100,
      fart: 200, pop: 600
    };
    const freq = frequencies[soundId] || 440;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = soundId === 'drum' ? 'square' : 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);

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
      URL.revokeObjectURL(url);
    };
    mediaRecorder.start();
    isRecording = true;
    $('#btn-record').classList.add('active');
    toast('Recording started', 'info');
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      $('#btn-record').classList.remove('active');
      toast('Recording saved', 'success');
    }
  }

  function leaveRoom() {
    if (roomId) {
      socket.emit('leave-room', { roomId });
    }
    if (roomTimer) clearInterval(roomTimer);
    if (pollInterval) clearInterval(pollInterval);
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
    isDeafened = false;
    isHandRaised = false;
    isRecording = false;
    chatOpen = false;
    unreadCount = 0;

    if (window.electronAPI) {
      window.electronAPI.updateRoomState(false);
    }

    switchScreen('lobby');
  }

  function sendMessage() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;

    const msgId = `${mySocketId}-${Date.now()}`;
    socket.emit('chat-message', {
      roomId,
      name: window.userName || 'Anonymous',
      text,
      timestamp: Date.now(),
      msgId
    });
    input.value = '';
    socket.emit('typing-stop', { roomId });
  }

  function sendFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      toast('File too large (max 5MB)', 'error');
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
      connectSocket();
      socket.on('connect', () => {
        socket.emit('join-room', { roomId: code, userName: name, muted: false, joinOnly: false, password });
      });
    });

    $('#btn-join').addEventListener('click', () => {
      const name = $('#join-name').value.trim();
      const code = $('#join-code').value.trim();
      if (!name) return toast('Enter your name', 'error');
      if (!code) return toast('Enter room code', 'error');
      window.userName = name;

      if (!socket || !socket.connected) {
        connectSocket();
        socket.on('connect', () => {
          socket.emit('join-room', { roomId: code, userName: name, muted: false, joinOnly: true });
        });
      } else {
        socket.emit('join-room', { roomId: code, userName: name, muted: false, joinOnly: true });
      }
    });

    $('#modal-submit').addEventListener('click', () => {
      const password = $('#modal-password').value;
      const code = $('#join-code').value.trim();
      if (socket && socket.connected) {
        socket.emit('join-room', { roomId: code, userName: window.userName, muted: false, joinOnly: true, password });
      }
      $('#password-modal').classList.remove('open');
    });

    $('#modal-cancel').addEventListener('click', () => {
      $('#password-modal').classList.remove('open');
    });

    $('#btn-copy-room').addEventListener('click', copyInviteLink);
    $('#btn-invite').addEventListener('click', copyInviteLink);

    $('#btn-leave').addEventListener('click', leaveRoom);

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
      socket.emit('typing-start', { roomId });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => socket.emit('typing-stop', { roomId }), 2000);
    });

    $$('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $('#chat-input');
        input.value += btn.dataset.emoji;
        input.focus();
      });
    });

    $('#btn-soundboard').addEventListener('click', () => {
      $('#soundboard-modal').classList.add('open');
    });
    $('#soundboard-close').addEventListener('click', () => {
      $('#soundboard-modal').classList.remove('open');
    });
    $$('.sound-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound(btn.dataset.sound);
        toast(`Playing ${SOUNDS[btn.dataset.sound]}`, 'info');
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
    });

    document.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        socket.emit('delete-chat-message', { roomId, msgId: delBtn.dataset.delete });
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target.dataset.peerVolume !== undefined) {
        const peerId = e.target.dataset.peerVolume;
        const stream = peerStreams[peerId];
        if (stream) {
          stream.getAudioTracks().forEach(t => {
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const gain = ctx.createGain();
            gain.gain.value = e.target.value / 100;
            source.connect(gain);
            gain.connect(ctx.destination);
          });
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 'm': toggleMute(); break;
        case 'd': toggleDeafen(); break;
        case 'h': toggleHand(); break;
        case 'c': toggleChat(); break;
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

  document.addEventListener('DOMContentLoaded', initEventListeners);
})();
