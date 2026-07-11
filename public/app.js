(() => {
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobileDevice) {
    document.documentElement.classList.add('is-mobile');
  }

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ];

  const SVG_CROWN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/></svg>`;
  const SVG_KICK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  const SVG_AUDIO = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  const SVG_MUTE = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

  // Curated static set — no external emoji API/CDN, keeps the app fully
  // offline-friendly and CSP-free.
  const EMOJI_CATEGORIES = {
    'Smileys': ['😀','😁','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😜','🤪','😎','🥳','😏','😴','🤯','🥺','😭','😤','😡','🤔','🤫','🙄','😬','🤐','😷','🤒','🥶'],
    'Gestures': ['👍','👎','👏','🙌','🙏','💪','🤝','👋','✌️','🤞','🤟','🤙','👌','✊','🫡','🤌','👉','👈','☝️','🖐️'],
    'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💗','💖','💘','😻'],
    'Objects': ['🔥','✨','🎉','🎊','💯','⭐','🌟','💤','💡','🎮','🎧','📷','🏆','🎵','🎤','⚡','💀','👻','🤖','🎁'],
    'Animals': ['🐶','🐱','🦊','🐻','🐼','🐨','🐸','🐵','🦁','🐯','🐷','🐔','🦄','🐝','🦋']
  };

  const STATUS_MAP = {
    online: { color: '#22c55e', text: 'Online' },
    idle: { color: '#eab308', text: 'Idle' },
    dnd: { color: '#ef4444', text: 'Do Not Disturb' }
  };

  // Shared admin quick-actions (transfer host / kick / force-mute) — used by
  // both the user-card hover actions and the profile popout, so clicks land
  // on the same document-level [data-*] delegated handlers either way.
  function buildAdminActionsHtml(socketId, muted, forceMuted) {
    const hostBtnHtml = `<button class="action-btn btn-host" data-transfer="${socketId}" title="Transfer Host">${SVG_CROWN}</button>`;
    const muteAction = (muted && forceMuted) ? 'Unmute' : 'Mute';
    const muteSymbol = (muted && forceMuted) ? SVG_MUTE : SVG_AUDIO;
    return `
      <div class="user-actions">
        ${hostBtnHtml}
        <button class="action-btn btn-kick" data-kick="${socketId}" title="Kick user">${SVG_KICK}</button>
        <button class="action-btn btn-mute" data-force-mute="${socketId}" title="${muteAction} user">${muteSymbol}</button>
      </div>
    `;
  }

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

  const STATUS_LABELS = { online: '🟢 Online', away: '🌙 Away', dnd: '🔴 Do Not Disturb', invisible: '⚪ Invisible' };

  const SOUNDS = {
    airhorn: '📯', clap: '👏', laugh: '😂', ding: '🔔',
    bruh: '💀', sad: '😢', win: '🏆', drum: '🥁',
    fart: '💨', pop: '🎈'
  };

  const UI_SOUNDS = {
    play(type) {
      if (!soundNotifications) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        const volumeMultiplier = soundboardVolume / 100;
        if (type === 'join') {
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(554, now + 0.08);
          osc.frequency.setValueAtTime(659, now + 0.16);
          gain.gain.setValueAtTime(0.08 * volumeMultiplier, now);
          gain.gain.exponentialRampToValueAtTime(0.005 * volumeMultiplier, now + 0.35);
          osc.start();
          osc.stop(now + 0.35);
        } else if (type === 'leave') {
          osc.frequency.setValueAtTime(587, now);
          osc.frequency.exponentialRampToValueAtTime(293, now + 0.25);
          gain.gain.setValueAtTime(0.08 * volumeMultiplier, now);
          gain.gain.exponentialRampToValueAtTime(0.005 * volumeMultiplier, now + 0.25);
          osc.start();
          osc.stop(now + 0.25);
        } else if (type === 'msg') {
          osc.frequency.setValueAtTime(784, now);
          gain.gain.setValueAtTime(0.05 * volumeMultiplier, now);
          gain.gain.exponentialRampToValueAtTime(0.005 * volumeMultiplier, now + 0.12);
          osc.start();
          osc.stop(now + 0.12);
        } else if (type === 'hand') {
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(698, now + 0.06);
          gain.gain.setValueAtTime(0.08 * volumeMultiplier, now);
          gain.gain.exponentialRampToValueAtTime(0.005 * volumeMultiplier, now + 0.22);
          osc.start();
          osc.stop(now + 0.22);
        } else if (type === 'mention') {
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.setValueAtTime(1108, now + 0.09);
          osc.frequency.setValueAtTime(1318, now + 0.18);
          gain.gain.setValueAtTime(0.09 * volumeMultiplier, now);
          gain.gain.exponentialRampToValueAtTime(0.005 * volumeMultiplier, now + 0.4);
          osc.start();
          osc.stop(now + 0.4);
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
  // ── Processed-mic pipeline (real gain + noise gate that peers actually hear) ──
  let micSourceNode = null;
  let noiseGateNode = null;
  let micDestinationNode = null;
  let processedMicTrack = null;
  let usingWorkletGate = false;
  let audioWorkletModulePromise = null;
  let fallbackGateAnalyser = null;
  let fallbackGateInterval = null;
  let fallbackGateThreshold = 0.05;
  let peers = {};
  let peerStreams = {};
  let peerForceMuted = {};
  let mySocketId = null;
  let roomId = null;
  let roomPassword = null;
  let isCreator = false;
  let connectingTimers = [];   // all pending timers for the current "connecting" session
  let midSessionErrorShown = false; // avoid one toast per background reconnect attempt
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
  let recordingTimer = null;
  let recordingStartTime = null;
  let speakingTimeout = null;
  let pollInterval = null;
  let pendingFile = null;
  let userAvatar = null; // base64 data URL or null

  // ── NEW STATE VARIABLES ──
  let localTheme = localStorage.getItem('vw_theme') || 'dark';
  let replyingTo = null; // { msgId, name, text }
  let pttEnabled = false;
  let pttKey = 'Space';
  let pttKeyPressed = false;
  let myStatus = localStorage.getItem('vw_status') || 'online';
  let echoCancellationEnabled = true;
  let lowBandwidthEnabled = false;
  let handRaised = false;

  let soundboardVolume = parseInt(localStorage.getItem('vw_sb_volume') || '60');
  let chatTextSize = localStorage.getItem('vw_chat_size') || 'medium';
  let roomWallpaper = localStorage.getItem('vw_wallpaper') || 'cosmic';
  let soundNotifications = localStorage.getItem('vw_sound_notifications') !== 'false';
  let myStatusText = localStorage.getItem('vw_status_text') || '';
  let myAvatarColor = localStorage.getItem('vw_avatar_color') || 'cyan';

  function getAvatarPayload() {
    if (userAvatar) {
      return userAvatar;
    }
    return `data:image/vw;metadata,${JSON.stringify({ color: myAvatarColor, statusText: myStatusText })}`;
  }

  function parseAvatarPayload(avatarStr) {
    if (!avatarStr) return { type: 'initials', color: 'cyan', statusText: '' };
    if (avatarStr.startsWith('data:image/vw;metadata,')) {
      try {
        const data = JSON.parse(avatarStr.substring('data:image/vw;metadata,'.length));
        return { type: 'initials', color: data.color || 'cyan', statusText: data.statusText || '' };
      } catch (e) {
        return { type: 'initials', color: 'cyan', statusText: '' };
      }
    }
    return { type: 'image', url: avatarStr, color: 'cyan', statusText: '' };
  }

  function getAvatarClass(colorName) {
    return `avatar-accent-${colorName}`;
  }

  function updateProfileAvatarColorOrText() {
    const avatarContainer = $('#profile-avatar');
    if (avatarContainer) {
      avatarContainer.classList.remove('avatar-accent-cyan', 'avatar-accent-purple', 'avatar-accent-pink', 'avatar-accent-green', 'avatar-accent-orange', 'avatar-accent-red', 'avatar-accent-blue');
      if (!userAvatar) {
        avatarContainer.classList.add(getAvatarClass(myAvatarColor));
        const colors = { cyan: '#22d3ee', purple: '#a855f7', pink: '#ec4899', green: '#22c55e', orange: '#f97316', red: '#ef4444', blue: '#3b82f6' };
        avatarContainer.style.background = `linear-gradient(135deg, ${colors[myAvatarColor] || '#22d3ee'}, ${colors[myAvatarColor] || '#22d3ee'}dd)`;
      } else {
        avatarContainer.style.background = '';
      }
    }
  }

  function createBannerParticles() {
    // Removed - banner is now clean and static
  }

  function updateProfileDisplayName() {
    const initial = $('#profile-avatar-initial');
    if (initial && window.userName) {
      initial.textContent = getInitial(window.userName);
    }
  }

  function updateProfileStatusDot() {
    const dot = $('#profile-online-dot');
    if (!dot) return;
    dot.className = 'profile-online-dot';
    if (myStatus === 'away') dot.classList.add('status-away');
    else if (myStatus === 'dnd') dot.classList.add('status-dnd');
    else if (myStatus === 'invisible') dot.classList.add('status-invisible');
  }

  function initProfile() {
    createBannerParticles();
    updateProfileDisplayName();
    updateProfileStatusDot();
    updateProfileAvatarColorOrText();
  }

  // ── SCREEN SHARE STATE (Discord-style: many people can stream at once) ──
  let screenStream = null;
  let isScreenSharing = false;
  let screenShares = {};        // socketId -> { socketId, name, streamId } — every live share in the room
  let remoteScreenStreams = {}; // socketId -> MediaStream — received screen streams
  let focusedShareId = null;    // which share is on the big stage
  let viewerDismissedFocus = false; // viewer explicitly closed their view — don't auto re-focus them onto a share
  let watcherCounts = {};       // sharerSocketId -> live viewer count (Discord Go-Live style)
  let lastWatchingEmit = undefined; // last focusedShareId we told the server we're watching
  let connectingWaitTimer = null; // "still connecting" message escalation for the stage-waiting spinner
  let connectingWaitFor = null;
  let manualShareFocus = localStorage.getItem('vw_manual_share_focus') !== '0'; // default ON: don't auto-open others' shares until clicked
  let stageVolume = parseInt(localStorage.getItem('vw_stage_volume') || '100');
  let shareResolution = localStorage.getItem('vw_share_res') || '1080';
  let shareFps = parseInt(localStorage.getItem('vw_share_fps') || '30');
  let shareOptimize = localStorage.getItem('vw_share_optimize') || 'auto';
  let selectedScreenSource = null;
  let pickerSourceType = 'screen';
  let micAcquirePromise = null; // pre-acquired mic promise (started on join click)
  let remoteAnalysers = {};     // socketId -> AnalyserNode for remote speaking detection

  let pinnedMessages = [];
  let activePolls = [];
  let roomPermissions = { allowChat: true, allowMic: true };
  let roomModerators = [];
  let isRoomLocked = false;
  let qualityStatsInterval = null;

  // ── Desktop/browser notifications ──
  let desktopNotificationsEnabled = localStorage.getItem('vw_desktop_notifications') === 'true';

  // ── Read receipts ──
  let lastOwnMsgId = null;
  let lastSeenEmitTimeout = null;

  // ── Slash commands ──
  let pendingActionMessage = false;

  // ── Invite link ──
  let currentInviteToken = null;
  let pendingInviteToken = null; // captured from a shared invite link's ?inv= param

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function toast(msg, type = 'info', action = null) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    if (action) {
      el.classList.add('has-action');
      const textSpan = document.createElement('span');
      textSpan.textContent = msg;
      el.appendChild(textSpan);

      const btn = document.createElement('button');
      btn.className = 'toast-action-btn';
      btn.textContent = action.text;
      btn.onclick = (e) => {
        e.stopPropagation();
        action.callback();
        el.classList.add('fade-out');
        el.addEventListener('animationend', () => el.remove());
      };
      el.appendChild(btn);
    } else {
      el.textContent = msg;
    }
    $('#toast-container').appendChild(el);
    const duration = action ? 7000 : 3200;
    setTimeout(() => {
      if (el.parentNode) {
        el.classList.add('fade-out');
        el.addEventListener('animationend', () => el.remove());
      }
    }, duration);
  }

  // Desktop app gets native OS notifications (fires even minimized to tray);
  // browser gets the standard Web Notification API, gated on permission.
  function notifyUser(title, body) {
    if (!desktopNotificationsEnabled) return;
    if (window.electronAPI && window.electronAPI.isElectron) {
      window.electronAPI.notify(title, body);
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  }

  function switchScreen(screen) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${screen}`).classList.add('active');
  }

  function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'; // Exclude '0' and '1' to avoid visual confusion
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

  // Generic wiring for the button+menu custom dropdowns (status, avatar
  // color) — replaces native <select>, whose open option list can't be
  // themed and renders with jarring OS-default colors.
  function initCustomSelect(wrapId, menuId, onSelect) {
    const wrap = $(`#${wrapId}`);
    const menu = $(`#${menuId}`);
    if (!wrap || !menu) return;
    const trigger = wrap.querySelector('.custom-select-trigger');

    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      $$('.custom-select.open').forEach(el => { if (el !== wrap) el.classList.remove('open'); });
      wrap.classList.toggle('open');
    });

    menu.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', () => {
        menu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        wrap.classList.remove('open');
        onSelect(opt.dataset.value);
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest(`#${wrapId}`)) wrap.classList.remove('open');
    });
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
    const nameEl = $('#profile-display-name-input');

    if (userAvatar) {
      img.src = userAvatar;
      img.style.display = 'block';
      initial.style.display = 'none';
      removeBtn.style.display = 'inline-flex';
    } else {
      img.style.display = 'none';
      img.src = '';
      initial.style.display = 'block';
      removeBtn.style.display = 'none';
    }

    if (window.userName) {
      initial.textContent = getInitial(window.userName);
      if (nameEl && nameEl.tagName === 'INPUT') {
        nameEl.value = window.userName;
      }
    }
    updateProfileAvatarColorOrText();
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Microphone not available (needs HTTPS)', 'error');
      return false;
    }

    const baseAudio = () => ({
      echoCancellation: { ideal: echoCancellationEnabled },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 24 },
      channelCount: { ideal: 1 }
    });

    // Fall back gracefully: exact device -> preferred constraints -> plain audio
    const attempts = [];
    if (deviceId) attempts.push({ audio: { ...baseAudio(), deviceId: { exact: deviceId } } });
    attempts.push({ audio: baseAudio() });
    attempts.push({ audio: true });

    let lastErr = null;
    for (const constraints of attempts) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('[VoiceWave] Mic stream acquired, tracks:', localStream.getAudioTracks().map(t => t.label));

        // Enforce PTT mute on start if PTT is enabled
        if (pttEnabled) {
          localStream.getAudioTracks().forEach(t => t.enabled = false);
        } else {
          localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        }
        setMicBanner(false);
        return true;
      } catch (err) {
        lastErr = err;
        // Permission denied — retrying with other constraints won't help
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') break;
      }
    }

    console.error('[VoiceWave] getUserMedia error:', lastErr);
    await reportMicError(lastErr);
    setMicBanner(true);
    return false;
  }

  async function reportMicError(err) {
    const name = err ? err.name : '';
    const settingsBtn = $('#mic-banner-settings');
    if (settingsBtn) settingsBtn.style.display = 'none';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      if (window.electronAPI && window.electronAPI.getMicAccessStatus) {
        try {
          const status = await window.electronAPI.getMicAccessStatus();
          if (status === 'denied' || status === 'restricted') {
            toast('Windows has blocked the microphone — enable it in Settings → Privacy → Microphone', 'error');
            if (settingsBtn && window.electronAPI.openMicSettings) settingsBtn.style.display = 'inline-flex';
            return;
          }
        } catch (e) { /* ignore */ }
        toast('Microphone access denied — check your system privacy settings', 'error');
        if (settingsBtn && window.electronAPI.openMicSettings) settingsBtn.style.display = 'inline-flex';
      } else {
        toast('Mic blocked — click the 🔒 lock icon in the address bar and allow the microphone', 'error');
      }
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      toast('No microphone found — plug one in and hit Retry', 'error');
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      toast('Microphone is busy — close other apps using it and hit Retry', 'error');
    } else {
      toast('Microphone error: ' + (err && (err.message || err.name) || 'unknown'), 'error');
    }
  }

  function setMicBanner(show) {
    const banner = $('#mic-banner');
    if (banner) banner.classList.toggle('show', !!show && !!roomId);
  }

  async function retryMic() {
    if (localStream) return;
    micAcquirePromise = null;
    const deviceId = $('#input-device')?.value;
    const ok = await getMediaStream(deviceId || undefined);
    if (ok && localStream) {
      await setupAudioProcessing();
      enumerateDevices();
      await addStreamToPeers();
      if (socket && roomId) socket.emit('user-muted', { roomId, muted: isMuted });
      toast('Microphone connected!', 'success');
    }
  }

  // Start acquiring the mic as soon as the user clicks Join/Create so the
  // permission prompt and device warm-up run in parallel with the socket
  // connection instead of after it — makes joining feel much faster.
  function preacquireMic() {
    if (localStream) return Promise.resolve(true);
    if (!micAcquirePromise) {
      const deviceId = $('#input-device')?.value;
      micAcquirePromise = getMediaStream(deviceId || undefined);
    }
    return micAcquirePromise;
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

  // Maps the #noise-threshold slider (5-40, same domain as the visual RMS
  // meter) to a dB range, then to linear amplitude, so one control drives
  // both the existing speaking-indicator AND the real outgoing gate.
  function noiseThresholdToLinear(sliderValue) {
    const v = parseFloat(sliderValue);
    const db = -50 + ((v - 5) / (40 - 5)) * (-18 - -50); // 5→-50dBFS, 40→-18dBFS
    return Math.pow(10, db / 20);
  }

  function teardownMicPipeline() {
    if (fallbackGateInterval) { clearInterval(fallbackGateInterval); fallbackGateInterval = null; }
    [micSourceNode, micGainNode, analyserNode, noiseGateNode, fallbackGateAnalyser, micDestinationNode].forEach(node => {
      if (node) { try { node.disconnect(); } catch (e) {} }
    });
    if (processedMicTrack) { try { processedMicTrack.stop(); } catch (e) {} }
    micSourceNode = null;
    noiseGateNode = null;
    fallbackGateAnalyser = null;
    micDestinationNode = null;
    processedMicTrack = null;
  }

  async function createNoiseGateNode(ctx) {
    try {
      if (!ctx.audioWorklet) throw new Error('AudioWorklet unsupported');
      if (!audioWorkletModulePromise) {
        audioWorkletModulePromise = ctx.audioWorklet.addModule('/audio-gate-worklet.js');
      }
      await audioWorkletModulePromise;
      const node = new AudioWorkletNode(ctx, 'noise-gate-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit'
      });
      usingWorkletGate = true;
      return node;
    } catch (e) {
      console.warn('[VoiceWave] AudioWorklet gate unavailable, using fallback gate:', e);
      usingWorkletGate = false;
      audioWorkletModulePromise = null;
      return createFallbackGateNode(ctx);
    }
  }

  function createFallbackGateNode(ctx) {
    const gateGainNode = ctx.createGain();
    gateGainNode.gain.value = 1;
    fallbackGateAnalyser = ctx.createAnalyser();
    fallbackGateAnalyser.fftSize = 512;
    micGainNode.connect(fallbackGateAnalyser); // side-chain tap, not in the main signal path

    const data = new Float32Array(fallbackGateAnalyser.fftSize);
    let currentGain = 1;
    fallbackGateInterval = setInterval(() => {
      fallbackGateAnalyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) sumSquares += data[i] * data[i];
      const rms = Math.sqrt(sumSquares / data.length);
      const target = rms > fallbackGateThreshold ? 1 : 0;
      const timeConstant = target > currentGain ? 0.01 : 0.15; // fast open, slow close
      currentGain = target;
      gateGainNode.gain.setTargetAtTime(target, ctx.currentTime, timeConstant);
    }, 20);

    return gateGainNode;
  }

  function applyNoiseThreshold(sliderValue) {
    const linear = noiseThresholdToLinear(sliderValue);
    fallbackGateThreshold = linear;
    if (usingWorkletGate && noiseGateNode) {
      noiseGateNode.parameters.get('threshold').value = linear;
    }
  }

  async function setupAudioProcessing() {
    if (!localStream) return;
    teardownMicPipeline();
    const ctx = ensureAudioContext();

    micSourceNode = ctx.createMediaStreamSource(localStream);

    micGainNode = ctx.createGain();
    micGainNode.gain.value = $('#mic-gain') ? ($('#mic-gain').value / 100) : 1;
    micGainNode.channelCount = 1;
    micGainNode.channelCountMode = 'explicit';

    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    micSourceNode.connect(micGainNode);
    micGainNode.connect(analyserNode);

    noiseGateNode = await createNoiseGateNode(ctx);
    micGainNode.connect(noiseGateNode);

    micDestinationNode = ctx.createMediaStreamDestination();
    noiseGateNode.connect(micDestinationNode);
    processedMicTrack = micDestinationNode.stream.getAudioTracks()[0];

    applyNoiseThreshold($('#noise-threshold') ? $('#noise-threshold').value : 12);

    if (!masterGainNode) {
      masterGainNode = ctx.createGain();
      masterGainNode.gain.value = $('#master-volume') ? ($('#master-volume').value / 100) : 1;
    }
  }

  // The track peers actually receive — the processed one when ready,
  // otherwise the raw device track (e.g. pipeline still initializing).
  function getOutgoingMicTrack() {
    return processedMicTrack || (localStream ? localStream.getAudioTracks()[0] : null);
  }
  function getOutgoingMicStream() {
    return micDestinationNode ? micDestinationNode.stream : localStream;
  }

  function applySpeakingLevel(card, rms, threshold) {
    if (!card) return;
    const bars = card.querySelectorAll('.meter-bar');
    const level = Math.min(5, Math.floor(rms / 15));
    bars.forEach((bar, i) => {
      bar.classList.toggle('active', i < level);
      bar.classList.toggle('high', i >= 3 && i < level);
    });
    const speaking = rms > threshold;
    const avatarContainer = card.querySelector('.user-avatar');
    if (avatarContainer) avatarContainer.classList.toggle('speaking', speaking);
    card.classList.toggle('speaking', speaking);
  }

  function analyserRms(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
  }

  function pollSpeaking() {
    const threshold = parseInt($('#noise-threshold')?.value || 12);

    // Local mic level
    if (analyserNode && (!isMuted || pttKeyPressed)) {
      applySpeakingLevel($(`[data-socket="${mySocketId}"]`), analyserRms(analyserNode), threshold);
    } else if (analyserNode) {
      applySpeakingLevel($(`[data-socket="${mySocketId}"]`), 0, threshold);
    }

    // Remote peers — light up whoever is talking
    Object.entries(remoteAnalysers).forEach(([socketId, analyser]) => {
      applySpeakingLevel($(`[data-socket="${socketId}"]`), isDeafened ? 0 : analyserRms(analyser), threshold);
    });
  }

  // ── PEER CONNECTIONS — "perfect negotiation" pattern ──
  // Every track add/remove triggers onnegotiationneeded, offers may cross in
  // flight (glare); the polite side rolls back, so renegotiation (screen
  // share start/stop, mic swaps) can never deadlock a connection.
  function createPeerConnection(socketId, name) {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 6
    });
    const peer = {
      pc, name,
      polite: mySocketId < socketId,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      iceDisconnectTimer: null,
      lastStats: null, // { lost, received } from the previous getStats() poll, for interval packet-loss %
      isRelayed: false,   // set once getStats() shows the active candidate pair is a TURN relay
      restartTimestamps: [] // recent restartIce() calls, to detect + break a reconnect loop
    };
    peers[socketId] = peer;

    let addedTracks = 0;
    const outgoingMicTrack = getOutgoingMicTrack();
    if (outgoingMicTrack) {
      pc.addTrack(outgoingMicTrack, getOutgoingMicStream());
      addedTracks++;
    }
    if (isScreenSharing && screenStream) {
      screenStream.getTracks().forEach(track => { pc.addTrack(track, screenStream); addedTracks++; });
    }
    if (addedTracks === 0) {
      // No mic yet — still open a receive-only channel so we can hear others
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    applyBandwidthLimit(pc, peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('offer', { to: socketId, offer: pc.localDescription });
      } catch (err) {
        console.error('[VoiceWave] negotiationneeded error:', err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { to: socketId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      // In a mesh, a video track arriving from peer X is always X's screen.
      // (System-audio tracks ride in the same stream as the video track.)
      const isScreen = e.track.kind === 'video' || stream.getVideoTracks().length > 0 ||
        (screenShares[socketId] && stream.id === screenShares[socketId].streamId);
      if (isScreen) {
        // Chromium's receiver-side jitter buffer defaults to a smoothness-
        // biased target (larger for 'detail'/'motion'-hinted content, which
        // the sender already sets on screen-share tracks) — that's the
        // actual source of "screen share feels delayed" complaints, not
        // encoding or bitrate. Ask for the lowest-latency playout target on
        // this receiver instead. Both the video track's ontrack and the
        // paired system-audio track's ontrack pass through this same
        // isScreen branch (they share one MediaStream), so one hint here
        // covers both — if only video were zeroed, Chromium's AV-sync
        // logic would just re-delay it to match audio's higher target.
        // Mic/voice-chat receivers below are intentionally left untouched.
        if ('playoutDelayHint' in e.receiver) {
          try { e.receiver.playoutDelayHint = 0; } catch (err) {}
        }
        remoteScreenStreams[socketId] = stream;
        if (!screenShares[socketId]) {
          // Tracks can land before the socket announcement — register a placeholder
          screenShares[socketId] = { socketId, name: peer.name || 'Someone', streamId: stream.id };
        }
        if (!focusedShareId && !manualShareFocus) focusedShareId = socketId;
        renderScreenShares();
        return;
      }
      peerStreams[socketId] = stream;
      updateUserCardAudio(socketId, stream);
      setupRemoteAnalyser(socketId, stream);
    };

    // Guards a bad path (e.g. a congested TURN relay) from restarting on an
    // endless disconnected → restart → disconnected cycle — a real "loop"
    // symptom, not just a stuck spinner. After too many restarts in a short
    // window we stop auto-restarting and tell the user plainly instead of
    // silently retrying forever.
    function tryRestartIce(reason) {
      const now = Date.now();
      peer.restartTimestamps = peer.restartTimestamps.filter(t => now - t < 30000);
      if (peer.restartTimestamps.length >= 4) {
        if (!peer.reconnectGaveUp) {
          peer.reconnectGaveUp = true;
          toast(`Having trouble staying connected to ${name} — their network connection may be unstable.`, 'error');
        }
        return;
      }
      peer.restartTimestamps.push(now);
      peer.reconnectGaveUp = false;
      try { pc.restartIce(); } catch (e) {}
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'disconnected') {
        // 'disconnected' is often self-healing within a few seconds (brief
        // Wi-Fi roam, NAT flap) — browsers wait 20-30s before escalating to
        // 'failed' on their own. Debounce a restart to beat that cliff
        // without restarting on every transient blip.
        clearTimeout(peer.iceDisconnectTimer);
        peer.iceDisconnectTimer = setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') tryRestartIce('disconnected-timeout');
        }, 3000);
      } else {
        clearTimeout(peer.iceDisconnectTimer);
        if (state === 'failed') tryRestartIce('failed');
        if (state === 'connected' || state === 'completed') {
          peer.restartTimestamps = [];
          peer.reconnectGaveUp = false;
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        toast(`Connection to ${name} lost, reconnecting...`, 'error');
        tryRestartIce('connectionstate-failed');
      }
    };

    return pc;
  }

  function currentShareBitrate() {
    if (lowBandwidthEnabled) return 800000;
    // Discord-like ladder: scale with resolution × frame rate
    const table = {
      '720':    { 15: 1500000, 30: 2500000, 60: 3500000 },
      '1080':   { 15: 2500000, 30: 4000000, 60: 6000000 },
      '1440':   { 15: 4000000, 30: 6000000, 60: 8000000 },
      'source': { 15: 4000000, 30: 6500000, 60: 9000000 }
    };
    const row = table[shareResolution] || table['1080'];
    return row[shareFps] || row[30];
  }

  function applyBandwidthLimit(pc, peer) {
    pc.getSenders().forEach(sender => {
      if (!sender.track) return;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      if (sender.track.kind === 'audio') {
        params.encodings[0].maxBitrate = lowBandwidthEnabled ? 16000 : 128000;
      } else if (sender.track.kind === 'video') {
        let bitrate = currentShareBitrate(); // screen share
        // The free/shared public TURN relay can't reliably sustain a high
        // screen-share bitrate — cap lower for a peer we've detected is
        // routed through it (see startQualityMonitoring), instead of the
        // connection silently stalling / cycling reconnects under congestion.
        if (peer && peer.isRelayed) bitrate = Math.min(bitrate, 1200000);
        params.encodings[0].maxBitrate = bitrate;
        // Keep resolution crisp and let the encoder drop frames first for
        // text content; for motion content prefer smooth frame rate.
        params.degradationPreference = (shareOptimize === 'motion' || (shareOptimize === 'auto' && shareFps >= 60))
          ? 'maintain-framerate' : 'maintain-resolution';
      }
      sender.setParameters(params).catch(err => console.warn('Bitrate limit error:', err));
    });
  }

  async function addStreamToPeers() {
    if (!localStream) return;
    const track = getOutgoingMicTrack();
    const stream = getOutgoingMicStream();
    for (const peer of Object.values(peers)) {
      const pc = peer.pc;
      const hasAudioSender = pc.getSenders().some(s => s.track && s.track.kind === 'audio');
      if (hasAudioSender) continue;
      // Reuse the recvonly transceiver when possible, otherwise add a fresh track
      const idleTx = pc.getTransceivers().find(t => t.receiver.track && t.receiver.track.kind === 'audio' && !t.sender.track);
      if (idleTx && track) {
        try {
          await idleTx.sender.replaceTrack(track);
          idleTx.direction = 'sendrecv';
        } catch (e) {
          pc.addTrack(track, stream);
        }
      } else if (track) {
        pc.addTrack(track, stream);
      }
      applyBandwidthLimit(pc, peer);
    }
  }

  async function handleOffer(socketId, offer) {
    let peer = peers[socketId];
    if (!peer) {
      createPeerConnection(socketId, 'Peer');
      peer = peers[socketId];
    }
    const pc = peer.pc;
    try {
      const offerCollision = peer.makingOffer || pc.signalingState !== 'stable';
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;

      await pc.setRemoteDescription(offer); // implicit rollback if needed
      await flushPendingCandidates(peer);
      await pc.setLocalDescription();
      socket.emit('answer', { to: socketId, answer: pc.localDescription });
    } catch (err) {
      console.error('handleOffer error:', err);
    }
  }

  async function handleAnswer(socketId, answer) {
    const peer = peers[socketId];
    if (!peer) return;
    try {
      // A late-arriving answer can be stale — if a competing offer already
      // rolled this connection back to 'stable' (or moved it elsewhere)
      // since we sent the offer this answer replies to, applying it now
      // fights the connection's actual current state and throws ("m-lines
      // order doesn't match"), corrupting the connection so tracks/renegotiation
      // never recover — surfacing as a share stuck on "Connecting to stream"
      // forever for that viewer. Only a pc still waiting on this exact
      // exchange (have-local-offer) should apply it; anything else is stale.
      if (peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription(answer);
      await flushPendingCandidates(peer);
    } catch (err) {
      console.error('handleAnswer error:', err);
    }
  }

  async function handleIceCandidate(socketId, candidate) {
    const peer = peers[socketId];
    if (!peer) return;
    // Queue candidates that arrive before the remote description is set —
    // they used to be dropped, causing slow or failed connections.
    if (!peer.pc.remoteDescription || !peer.pc.remoteDescription.type) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (err) {
      if (!peer.ignoreOffer) console.warn('addIceCandidate error:', err);
    }
  }

  async function flushPendingCandidates(peer) {
    const queued = peer.pendingCandidates.splice(0);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (err) {
        if (!peer.ignoreOffer) console.warn('addIceCandidate (queued) error:', err);
      }
    }
  }

  // ── SCREEN SHARE (desktop app broadcasts, every device can watch) ──
  function ensureAudioContext() {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function setupRemoteAnalyser(socketId, stream) {
    try {
      const ctx = ensureAudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      remoteAnalysers[socketId] = analyser;
    } catch (e) {
      console.warn('[VoiceWave] remote analyser failed:', e);
    }
  }

  let isSwitchingSource = false; // reuses the picker UI, but routes Go Live to a replaceTrack switch instead of a fresh start

  async function openScreenPicker(switching) {
    if (!window.electronAPI || !window.electronAPI.getScreenSources) {
      toast('Screen share is available in the desktop app only', 'error');
      return;
    }
    isSwitchingSource = !!switching;
    selectedScreenSource = null;
    $('#screen-picker-share').disabled = true;
    $('#screen-picker-share').textContent = isSwitchingSource ? 'Switch' : 'Go Live';
    // A switch keeps the original quality/audio policy — only the source changes.
    const quality = $('.picker-quality-row');
    const audioRow = $('#picker-audio-row');
    if (quality) quality.style.display = isSwitchingSource ? 'none' : '';
    if (!isSwitchingSource) {
      // Restore last-used quality choices
      const resSel = $('#picker-resolution');
      if (resSel) resSel.value = shareResolution;
      const fpsSel = $('#picker-fps');
      if (fpsSel) fpsSel.value = String(shareFps);
      const optSel = $('#picker-optimize');
      if (optSel) optSel.value = shareOptimize;
      if (audioRow) audioRow.style.display = navigator.userAgent.includes('Windows') ? 'flex' : 'none';
    } else if (audioRow) {
      audioRow.style.display = 'none';
    }
    $('#screen-picker-modal').classList.add('open');
    await loadScreenSources();
  }

  async function loadScreenSources() {
    const grid = $('#screen-source-grid');
    grid.innerHTML = `<div class="source-loading"><div class="connecting-spinner" style="width:28px;height:28px;"></div></div>`;
    try {
      const sources = await window.electronAPI.getScreenSources();
      const filtered = sources.filter(s => pickerSourceType === 'screen' ? s.isScreen : !s.isScreen);
      grid.innerHTML = '';
      if (filtered.length === 0) {
        grid.innerHTML = `<div class="source-loading" style="color:var(--muted);font-size:0.82rem;">Nothing to share here</div>`;
        return;
      }
      filtered.forEach(s => {
        const tile = document.createElement('button');
        tile.className = 'source-tile';
        tile.dataset.sourceId = s.id;
        tile.innerHTML = `
          <div class="source-thumb">${s.thumbnail ? `<img src="${s.thumbnail}" alt="">` : '🖥️'}</div>
          <div class="source-name">${s.appIcon ? `<img class="source-app-icon" src="${s.appIcon}" alt="">` : ''}<span>${escapeHtml(s.name)}</span></div>
        `;
        tile.addEventListener('click', () => {
          $$('.source-tile').forEach(t => t.classList.remove('selected'));
          tile.classList.add('selected');
          selectedScreenSource = s.id;
          $('#screen-picker-share').disabled = false;
        });
        grid.appendChild(tile);
      });
    } catch (err) {
      console.error('[VoiceWave] getScreenSources error:', err);
      grid.innerHTML = `<div class="source-loading" style="color:var(--danger);font-size:0.82rem;">Could not list screens</div>`;
    }
  }

  const SHARE_RESOLUTIONS = {
    '720':  { width: 1280, height: 720 },
    '1080': { width: 1920, height: 1080 },
    '1440': { width: 2560, height: 1440 }
    // 'source' = no constraint, capture native size
  };

  // Change resolution/FPS on an already-live share without restarting it —
  // applyConstraints() on the existing video track re-negotiates capture
  // parameters in place (no new getDisplayMedia prompt, no replaceTrack,
  // no viewer-visible glitch), unlike switching source which needs a whole
  // new stream.
  async function applyLiveQuality({ resolution, fps }) {
    if (!screenStream) return;
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) return;

    if (resolution !== undefined) shareResolution = resolution;
    if (fps !== undefined) shareFps = fps;
    localStorage.setItem('vw_share_res', shareResolution);
    localStorage.setItem('vw_share_fps', String(shareFps));

    const constraints = { frameRate: { ideal: shareFps, max: shareFps } };
    const res = SHARE_RESOLUTIONS[shareResolution];
    if (res) {
      constraints.width = { max: res.width };
      constraints.height = { max: res.height };
    }
    try {
      await videoTrack.applyConstraints(constraints);
      try { videoTrack.contentHint = shareFps >= 60 ? 'motion' : 'detail'; } catch (e) {}
      toast('Stream quality updated', 'success');
    } catch (err) {
      console.error('[VoiceWave] applyLiveQuality error:', err);
      toast('This capture source doesn\'t support that quality change', 'error');
    }
  }

  async function startScreenShare() {
    if (!selectedScreenSource) return;
    const withAudio = !!$('#picker-share-audio')?.checked;
    // Read + persist quality choices
    shareResolution = $('#picker-resolution')?.value || '1080';
    shareFps = parseInt($('#picker-fps')?.value || '30');
    shareOptimize = $('#picker-optimize')?.value || 'auto';
    localStorage.setItem('vw_share_res', shareResolution);
    localStorage.setItem('vw_share_fps', String(shareFps));
    localStorage.setItem('vw_share_optimize', shareOptimize);

    $('#screen-picker-modal').classList.remove('open');
    try {
      window.electronAPI.selectScreenSource(selectedScreenSource, withAudio);
      const videoConstraints = { frameRate: { ideal: shareFps, max: shareFps } };
      const res = SHARE_RESOLUTIONS[shareResolution];
      if (res) {
        videoConstraints.width = { max: res.width };
        videoConstraints.height = { max: res.height };
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: withAudio
      });
      screenStream = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const hint = shareOptimize === 'auto' ? (shareFps >= 60 ? 'motion' : 'detail') : shareOptimize;
        try { videoTrack.contentHint = hint; } catch (e) {}
        videoTrack.onended = () => stopScreenShare(); // window closed / capture killed
      }
      // Announce first so viewers learn the stream id before tracks arrive
      socket.emit('screen-share-start', { roomId, streamId: stream.id });
    } catch (err) {
      console.error('[VoiceWave] screen share error:', err);
      if (err && err.name !== 'NotAllowedError') {
        toast('Could not start screen share: ' + (err.message || err.name), 'error');
      }
      cleanupScreenStream();
    }
  }

  function switchScreenSource() {
    if (!isScreenSharing) return;
    openScreenPicker(true);
  }

  async function performSourceSwitch() {
    if (!selectedScreenSource || !screenStream) return;
    const withAudio = screenStream.getAudioTracks().length > 0;
    $('#screen-picker-modal').classList.remove('open');
    isSwitchingSource = false;
    try {
      window.electronAPI.selectScreenSource(selectedScreenSource, withAudio);
      const videoConstraints = { frameRate: { ideal: shareFps, max: shareFps } };
      const res = SHARE_RESOLUTIONS[shareResolution];
      if (res) {
        videoConstraints.width = { max: res.width };
        videoConstraints.height = { max: res.height };
      }
      const newStream = await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints, audio: withAudio });
      await applySourceSwitch(newStream);
    } catch (err) {
      console.error('[VoiceWave] screen source switch error:', err);
      if (err && err.name !== 'NotAllowedError') {
        toast('Could not switch source: ' + (err.message || err.name), 'error');
      }
      // Deliberately no cleanupScreenStream() here — a cancelled/failed
      // switch must leave the still-active original share untouched.
    }
  }

  // Swaps the video (and audio, if applicable) tracks into every existing
  // sender via replaceTrack() — same m-line, no renegotiation, no new
  // ontrack on receivers, so the switch is visually transparent to viewers
  // the instant it resolves.
  async function applySourceSwitch(newStream) {
    const oldVideoTrack = screenStream.getVideoTracks()[0];
    const oldAudioTrack = screenStream.getAudioTracks()[0];
    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];

    await Promise.all(Object.values(peers).map(peer => {
      const sender = peer.pc.getSenders().find(s => s.track === oldVideoTrack);
      return sender && newVideoTrack ? sender.replaceTrack(newVideoTrack).catch(() => {}) : Promise.resolve();
    }));

    if (oldAudioTrack) {
      await Promise.all(Object.values(peers).map(peer => {
        const sender = peer.pc.getSenders().find(s => s.track === oldAudioTrack);
        return sender ? sender.replaceTrack(newAudioTrack || null).catch(() => {}) : Promise.resolve();
      }));
    }
    // New source has audio but the original share didn't capture any —
    // adding a fresh sender would need addTrack (which DOES renegotiate),
    // out of scope for a "switch"; just don't send it.
    if (!oldAudioTrack && newAudioTrack) newAudioTrack.stop();

    // Clear the handler BEFORE stopping — stopping fires 'onended', which
    // would otherwise self-trigger a full stopScreenShare() right after a
    // successful switch.
    if (oldVideoTrack) { oldVideoTrack.onended = null; oldVideoTrack.stop(); }
    if (oldAudioTrack) { oldAudioTrack.onended = null; oldAudioTrack.stop(); }

    screenStream = newStream;
    if (newVideoTrack) {
      const hint = shareOptimize === 'auto' ? (shareFps >= 60 ? 'motion' : 'detail') : shareOptimize;
      try { newVideoTrack.contentHint = hint; } catch (e) {}
      newVideoTrack.onended = () => stopScreenShare();
    }
    Object.values(peers).forEach(peer => applyBandwidthLimit(peer.pc, peer));

    if (screenShares[mySocketId]) screenShares[mySocketId].streamId = newStream.id;
    if (socket && roomId) socket.emit('screen-share-switch', { roomId, streamId: newStream.id });
    renderScreenShares(); // picks up the new screenStream via getShareStream()
    toast('Switched source', 'success');
  }

  function beginBroadcastingScreen() {
    if (!screenStream) return;
    isScreenSharing = true;
    Object.values(peers).forEach(peer => {
      screenStream.getTracks().forEach(track => peer.pc.addTrack(track, screenStream));
      applyBandwidthLimit(peer.pc, peer);
    });
    screenShares[mySocketId] = screenShares[mySocketId] ||
      { socketId: mySocketId, name: window.userName || 'You', streamId: screenStream.id };
    focusedShareId = mySocketId; // jump to your own preview, like Discord
    const btn = $('#btn-screen-share');
    btn.classList.add('sharing');
    $('#screen-share-label').textContent = 'Stop';
    renderScreenShares();
    toast('You are live! 🖥️', 'success');
  }

  function stopScreenShare(silent) {
    if (!isScreenSharing && !screenStream) return;
    Object.values(peers).forEach(peer => {
      peer.pc.getSenders().forEach(sender => {
        if (sender.track && screenStream && screenStream.getTracks().includes(sender.track)) {
          try { peer.pc.removeTrack(sender); } catch (e) {}
        }
      });
    });
    cleanupScreenStream();
    if (!silent && socket && roomId) socket.emit('screen-share-stop', { roomId });
    delete screenShares[mySocketId];
    if (focusedShareId === mySocketId) focusedShareId = null;
    renderScreenShares();
  }

  // Freeze the stream on the viewer side (video.pause() in renderScreenShares)
  // rather than disabling the track — a disabled video track still sends
  // black frames per spec, the opposite of "hold the last real frame."
  // Bandwidth savings are a free add-on via a sender param trim, not the
  // mechanism that produces the freeze itself.
  function togglePauseScreenShare() {
    if (!isScreenSharing || !screenShares[mySocketId]) return;
    if (screenShares[mySocketId].paused) resumeScreenShare();
    else pauseScreenShare();
  }

  function pauseScreenShare() {
    const share = screenShares[mySocketId];
    if (!share || share.paused) return;
    share.paused = true;
    Object.values(peers).forEach(peer => {
      peer.pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'video' && screenStream && screenStream.getTracks().includes(sender.track)) {
          const params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.encodings[0].maxFramerate = 1;
          sender.setParameters(params).catch(() => {});
        }
      });
    });
    if (socket && roomId) socket.emit('screen-share-pause', { roomId });
    renderScreenShares();
  }

  function resumeScreenShare() {
    const share = screenShares[mySocketId];
    if (!share || !share.paused) return;
    share.paused = false;
    Object.values(peers).forEach(peer => applyBandwidthLimit(peer.pc, peer));
    if (socket && roomId) socket.emit('screen-share-resume', { roomId });
    renderScreenShares();
  }

  function cleanupScreenStream() {
    if (screenStream) {
      screenStream.getTracks().forEach(t => { t.onended = null; t.stop(); });
      screenStream = null;
    }
    isScreenSharing = false;
    const btn = $('#btn-screen-share');
    if (btn) {
      btn.classList.remove('sharing');
      $('#screen-share-label').textContent = 'Share';
    }
  }

  // ── STAGE RENDERING (multi-stream, Discord-style) ──
  function getShareStream(socketId) {
    if (socketId === mySocketId) return screenStream;
    return remoteScreenStreams[socketId] || null;
  }

  // "Connecting to stream" is normal for the first second or two, but if it
  // never resolves (e.g. a peer stuck behind a congested TURN relay) a bare
  // spinner forever looks broken rather than slow. Escalate the message
  // after a while instead of leaving it looking silently stuck.
  function clearConnectingWaitTimer() {
    if (connectingWaitTimer) { clearTimeout(connectingWaitTimer); connectingWaitTimer = null; }
    connectingWaitFor = null;
    const txt = $('#stage-waiting-text');
    if (txt) txt.textContent = 'Connecting to stream…';
  }

  function armConnectingWaitTimer(shareId) {
    if (connectingWaitFor === shareId) return; // already waiting on this one
    clearConnectingWaitTimer();
    connectingWaitFor = shareId;
    connectingWaitTimer = setTimeout(() => {
      const txt = $('#stage-waiting-text');
      if (txt && connectingWaitFor === shareId) {
        txt.textContent = 'Still connecting… their network connection may be slow or unstable.';
      }
    }, 12000);
  }

  function renderScreenShares() {
    const shares = Object.values(screenShares);
    const stage = $('#screen-stage');
    const room = document.getElementById('room');

    // Live badges on user cards
    $$('#user-grid .user-card').forEach(card => {
      card.classList.toggle('is-live', !!screenShares[card.dataset.socket]);
    });

    if (shares.length === 0) {
      stage.classList.remove('active', 'picker-compact');
      room.classList.remove('has-stage');
      const video = $('#stage-video');
      video.srcObject = null;
      $('#stage-waiting').classList.remove('show');
      $('#stage-thumbs').style.display = 'none';
      $('#stage-thumbs').innerHTML = '';
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      focusedShareId = null;
      viewerDismissedFocus = false;
      clearConnectingWaitTimer();
      return;
    }

    // Make sure something valid is focused. In manual "click to view" mode,
    // don't auto-jump to someone else's share — leave the stage unfocused
    // (a "pick a stream" prompt) until the viewer explicitly clicks a thumb.
    // Your OWN share (mySocketId) is exempt — that's your own action, not
    // an auto-displayed share of someone else's screen.
    if (focusedShareId && !screenShares[focusedShareId]) focusedShareId = null;
    if (!focusedShareId && !viewerDismissedFocus && (!manualShareFocus || shares.length === 1 && shares[0].socketId === mySocketId)) {
      focusedShareId = shares[0].socketId;
    }

    stage.classList.add('active');
    room.classList.add('has-stage');

    if (!focusedShareId) {
      // Manual mode, multiple shares live, nothing clicked yet — prompt to
      // pick one instead of auto-opening someone's screen for the viewer.
      $('#stage-sharer-name').textContent = `${shares.length} streams live — click one below to watch`;
      const countEl = $('#stage-count');
      if (countEl) countEl.style.display = 'none';
      const video = $('#stage-video');
      video.srcObject = null;
      $('#stage-waiting').classList.add('show', 'picker-mode');
      $('#stage-paused-badge').classList.remove('show');
      const waitingTxt = $('#stage-waiting-text');
      if (waitingTxt) waitingTxt.textContent = 'Click a stream below to watch';
      $('#stage-stop').style.display = isScreenSharing ? 'inline-flex' : 'none';
      $('#stage-pause').style.display = 'none';
      $('#stage-close-view').style.display = 'none';
      $('#stage-switch-source').style.display = 'none';
      const qualityWrapHidden = $('#stage-quality-wrap');
      if (qualityWrapHidden) qualityWrapHidden.style.display = 'none';
      const volWrap = $('#stage-volume-wrap');
      if (volWrap) volWrap.style.display = 'none';
      clearConnectingWaitTimer();
      renderStageThumbs(shares);
      // Mobile: don't let the "pick a stream" prompt eat the whole viewport
      // like an opened share would — collapse it to a slim tap-to-watch
      // strip (header + thumbnails only) until the user actually taps one.
      stage.classList.toggle('picker-compact', isMobileDevice);
      return;
    }
    stage.classList.remove('picker-compact');
    $('#stage-waiting').classList.remove('picker-mode');

    const share = screenShares[focusedShareId];
    const isLocal = focusedShareId === mySocketId;
    $('#stage-sharer-name').textContent = isLocal ? 'You are sharing your screen' : `${share.name}'s screen`;

    const countEl = $('#stage-count');
    if (countEl) {
      countEl.style.display = shares.length > 1 ? 'inline-flex' : 'none';
      countEl.textContent = `${shares.length} streams`;
    }

    // Live viewer count (Discord Go-Live style) — tell the server who we're
    // watching only when focus actually changes, not on every re-render.
    if (lastWatchingEmit !== focusedShareId && socket && roomId) {
      socket.emit('watching-share', { roomId, sharerSocketId: focusedShareId });
      lastWatchingEmit = focusedShareId;
    }
    updateWatcherBadge();

    // Main stage video
    const video = $('#stage-video');
    const stream = getShareStream(focusedShareId);
    if (stream) {
      if (video.srcObject !== stream) video.srcObject = stream;
      // Own preview stays muted so system audio doesn't double up
      video.muted = isLocal || isDeafened;
      video.volume = stageVolume / 100;
      // Paused-aware: this function re-runs on unrelated events too (e.g. a
      // THIRD person starting their own share re-renders everyone's stage)
      // — an unconditional .play() here would silently un-pause a share
      // someone deliberately paused. Only play when not paused; when
      // paused, let one frame land then freeze (some browsers can't
      // .pause() a video that's never played).
      if (share.paused) {
        if (video.paused === false) video.pause();
        else if (!video.srcObject || video.readyState < 2) {
          video.play().then(() => video.pause()).catch(() => {});
        }
      } else {
        video.play().catch(() => {
          const resume = () => {
            video.play().then(() => document.removeEventListener('click', resume)).catch(() => {});
          };
          document.addEventListener('click', resume);
        });
      }
      $('#stage-waiting').classList.remove('show');
      $('#stage-paused-badge').classList.toggle('show', !!share.paused);
      clearConnectingWaitTimer();
    } else {
      video.srcObject = null;
      $('#stage-waiting').classList.add('show');
      $('#stage-paused-badge').classList.remove('show');
      armConnectingWaitTimer(focusedShareId);
    }

    // Controls: sharer-only actions; volume only for remote audio
    $('#stage-stop').style.display = isScreenSharing ? 'inline-flex' : 'none';
    $('#stage-pause').style.display = isLocal && isScreenSharing ? 'inline-flex' : 'none';
    $('#stage-pause').classList.toggle('active', !!share.paused);
    $('#stage-pause').title = share.paused ? 'Resume sharing' : 'Pause sharing';
    $('#stage-close-view').style.display = !isLocal ? 'inline-flex' : 'none';
    $('#stage-switch-source').style.display = isLocal && isScreenSharing ? 'inline-flex' : 'none';
    const qualityWrap = $('#stage-quality-wrap');
    if (qualityWrap) qualityWrap.style.display = isLocal && isScreenSharing ? 'inline-flex' : 'none';
    const volWrap = $('#stage-volume-wrap');
    if (volWrap) volWrap.style.display = isLocal ? 'none' : 'flex';

    renderStageThumbs(shares);
  }

  function updateWatcherBadge() {
    const el = $('#stage-watchers');
    if (!el) return;
    const count = watcherCounts[focusedShareId] || 0;
    el.style.display = focusedShareId ? 'inline-flex' : 'none';
    el.textContent = `👁 ${count}`;
  }

  function renderStageThumbs(shares) {
    const strip = $('#stage-thumbs');
    if (!strip) return;
    // Nothing focused (manual click-to-view, unpicked) — always show the
    // strip, even for a single share, so there's something to click.
    const needsPicker = !focusedShareId;
    if (shares.length < 2 && !needsPicker) {
      strip.style.display = 'none';
      strip.innerHTML = '';
      return;
    }
    strip.style.display = 'flex';

    // Diff tiles so videos don't flicker on re-render
    const seen = new Set();
    shares.forEach(share => {
      seen.add(share.socketId);
      let tile = strip.querySelector(`[data-share="${share.socketId}"]`);
      if (!tile) {
        tile = document.createElement('button');
        tile.className = 'stage-thumb';
        tile.dataset.share = share.socketId;
        tile.innerHTML = `
          <video muted autoplay playsinline></video>
          <span class="stage-thumb-live">LIVE</span>
          <span class="stage-thumb-name"></span>
        `;
        tile.addEventListener('click', () => {
          focusedShareId = tile.dataset.share;
          viewerDismissedFocus = false;
          renderScreenShares();
        });
        strip.appendChild(tile);
      }
      tile.querySelector('.stage-thumb-name').textContent =
        share.socketId === mySocketId ? 'You' : share.name;
      tile.classList.toggle('focused', share.socketId === focusedShareId);
      const vid = tile.querySelector('video');
      const stream = getShareStream(share.socketId);
      if (stream && vid.srcObject !== stream) {
        vid.srcObject = stream;
        vid.play().catch(() => {});
      }
      if (share.paused) { if (vid.paused === false) vid.pause(); }
      else if (vid.paused) vid.play().catch(() => {});
    });
    strip.querySelectorAll('.stage-thumb').forEach(tile => {
      if (!seen.has(tile.dataset.share)) tile.remove();
    });
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

    // Set initial volume based on the volume slider value in the UI
    const slider = card.querySelector('[data-peer-volume]');
    if (slider) {
      audio.volume = slider.value / 100;
    } else {
      audio.volume = 0.8; // default to 80%
    }
    if (isDeafened) audio.volume = 0;

    // Apply the currently selected output device (speaker)
    const currentSinkId = $('#output-device')?.value;
    if (currentSinkId && audio.setSinkId) {
      audio.setSinkId(currentSinkId).catch(err => console.warn('setSinkId error:', err));
    }

    // Explicitly play and handle autoplay policies
    audio.play().catch(err => {
      console.warn('[VoiceWave] Autoplay blocked for user audio:', err);
      // Wait for a user click anywhere to resume/play audio
      const resumeAudio = () => {
        audio.play().then(() => {
          document.removeEventListener('click', resumeAudio);
        }).catch(e => console.error('[VoiceWave] Play failed after click:', e));
      };
      document.addEventListener('click', resumeAudio);
    });
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

    const myCard = createUserCard(mySocketId, window.userName || 'You', isMuted, isCreator, true, getAvatarPayload(), false, myStatus, handRaised, roomModerators.includes(window.userName));
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

    const parsed = parseAvatarPayload(avatar);
    const accentClass = getAvatarClass(parsed.color);
    const initial = getInitial(name);
    const avatarHtml = parsed.type === 'image'
      ? `<div class="user-avatar" style="background:${getAvatarColor(name)};"><img src="${escapeHtml(parsed.url)}" alt=""></div>`
      : `<div class="user-avatar ${accentClass}">${escapeHtml(initial)}</div>`;

    const muteBtnHtml = (!isLocal && isCreatorLocal())
      ? buildAdminActionsHtml(socketId, muted, forceMuted)
      : '';

    const s = STATUS_MAP[status] || STATUS_MAP.online;

    const qualityHtml = isLocal ? '' : `
      <div class="connection-quality good" title="Ping: Checking...">
        <div class="connection-bar"></div>
        <div class="connection-bar"></div>
        <div class="connection-bar"></div>
        <div class="connection-bar"></div>
      </div>
    `;

    const handRaisedHtml = handRaisedState ? `<div class="hand-raise-badge">✋</div>` : '';
    const statusTextHtml = parsed.statusText
      ? `<div class="status-text-display" title="${escapeHtml(parsed.statusText)}">${escapeHtml(parsed.statusText)}</div>`
      : '';

    card.innerHTML = `
      ${qualityHtml}
      ${handRaisedHtml}
      ${avatarHtml}
      <div class="user-name">${escapeHtml(name)}${isLocal ? ' (You)' : ''}</div>
      <div class="user-status">
        <div class="status-dot" style="background:${s.color};"></div>
        ${muted ? 'Muted' : s.text}
      </div>
      ${statusTextHtml}
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
      <div class="live-overlay">
        <button class="watch-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="margin-right:2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span class="watch-text-full">Watch Stream</span>
          <span class="watch-text-short">Watch</span>
        </button>
      </div>
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

    const count = grid.querySelectorAll('.user-card:not(.leaving)').length;
    $('#participant-count').textContent = count;
    updateParticipantsDropdown();
  }

  function removePeerFromGrid(socketId) {
    const card = $(`[data-socket="${socketId}"]`);
    if (card) {
      card.classList.add('leaving');
      card.addEventListener('animationend', () => card.remove(), { once: true });
      setTimeout(() => { if (card.isConnected) card.remove(); }, 450); // fallback
    }

    if (peers[socketId]) {
      clearTimeout(peers[socketId].iceDisconnectTimer);
      peers[socketId].pc.close();
      delete peers[socketId];
    }
    delete peerStreams[socketId];
    delete peerForceMuted[socketId];
    delete remoteAnalysers[socketId];

    const count = $('#user-grid').querySelectorAll('.user-card:not(.leaving)').length;
    $('#participant-count').textContent = count;
    updateParticipantsDropdown();
  }

  // ── USER PROFILE POPOUT ── reads straight from the already-rendered card
  // (avatar, status dot, badges) so there's no re-derivation/duplication of
  // avatar-parsing logic — just clone what's already correct in the DOM.
  function openProfilePopout(cardEl) {
    const socketId = cardEl.dataset.socket;
    const name = cardEl.dataset.name;
    const isLocalUser = socketId === mySocketId;
    const popout = $('#user-profile-popout');

    const avatarClone = cardEl.querySelector('.user-avatar').cloneNode(true);
    avatarClone.classList.add('upo-avatar-img');
    const isAdminUser = !!cardEl.querySelector('.admin-badge:not([style*="168,85,247"])');
    const isModUser = !!cardEl.querySelector('.admin-badge[style*="168,85,247"]');
    const statusColor = cardEl.querySelector('.status-dot')?.style.background || '#22c55e';
    const statusTextEl = cardEl.querySelector('.status-text-display');
    const isMuted = cardEl.classList.contains('muted');
    const forceMuted = !!peerForceMuted[socketId];

    const roleBadge = isAdminUser
      ? '<span class="status-icon admin-badge">Admin</span>'
      : isModUser
        ? '<span class="status-icon admin-badge" style="background:rgba(168,85,247,0.15); color:#a855f7; border-color:rgba(168,85,247,0.2);">Mod</span>'
        : '';

    const actionsHtml = (!isLocalUser && isCreatorLocal()) ? buildAdminActionsHtml(socketId, isMuted, forceMuted) : '';

    popout.innerHTML = `
      <div class="upo-header">
        <div class="upo-avatar-wrap"></div>
        <div class="upo-name">${escapeHtml(name)}${isLocalUser ? ' (You)' : ''}</div>
        <div class="upo-badges">
          ${roleBadge}
          ${isMuted ? '<span class="status-icon" style="color:#ef4444;">Muted</span>' : ''}
        </div>
        <div class="upo-status"><span class="status-dot" style="background:${statusColor};"></span>${statusTextEl ? escapeHtml(statusTextEl.title) : ''}</div>
      </div>
      ${actionsHtml ? `<div class="upo-actions">${actionsHtml}</div>` : ''}
    `;
    popout.querySelector('.upo-avatar-wrap').appendChild(avatarClone);

    popout.classList.add('open');

    // On narrow screens the popout becomes a fixed bottom sheet via CSS —
    // skip computed inline positioning so those rules aren't fought/overridden.
    if (window.innerWidth <= 640) {
      popout.style.left = '';
      popout.style.top = '';
      return;
    }

    const rect = cardEl.getBoundingClientRect();
    const popoutRect = popout.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - popoutRect.width / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - popoutRect.width - 10));
    let top = rect.bottom + 10;
    if (top + popoutRect.height > window.innerHeight - 10) top = rect.top - popoutRect.height - 10;
    popout.style.left = `${left}px`;
    popout.style.top = `${top}px`;
  }

  function closeProfilePopout() {
    $('#user-profile-popout')?.classList.remove('open');
  }

  function updateParticipantsDropdown() {
    const list = $('#pd-list');
    if (!list) return;
    list.innerHTML = '';

    const cards = $$('#user-grid .user-card:not(.leaving)');
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

    // Dynamic admin mute button update
    const muteBtn = card.querySelector('[data-force-mute]');
    if (muteBtn) {
      const isForceMutedNow = peerForceMuted[socketId];
      muteBtn.title = isForceMutedNow ? 'Unmute user' : 'Mute user';
      muteBtn.innerHTML = isForceMutedNow ? SVG_MUTE : SVG_AUDIO;
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
          let lost = 0, received = 0;
          let activeLocalId = null, activeRemoteId = null;
          const candidateTypes = {};
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = report.currentRoundTripTime * 1000;
              activeLocalId = report.localCandidateId;
              activeRemoteId = report.remoteCandidateId;
            }
            if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
              candidateTypes[report.id] = report.candidateType;
            }
            // Sum both audio (always present, at least recvonly) and video
            // (present while a screen share is flowing) inbound streams —
            // a fuller signal than audio alone during an active share.
            if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.kind === 'video')) {
              lost += report.packetsLost || 0;
              received += report.packetsReceived || 0;
            }
          });

          // Free/shared public TURN relay can't reliably sustain a high
          // screen-share bitrate — once we can see this peer's active path
          // is a relay, cap their video bitrate lower (applyBandwidthLimit)
          // instead of letting a congested relay silently stall/loop the
          // connection under a bitrate it was never going to sustain.
          const nowRelayed = candidateTypes[activeLocalId] === 'relay' || candidateTypes[activeRemoteId] === 'relay';
          if (nowRelayed && !peer.isRelayed) {
            peer.isRelayed = true;
            applyBandwidthLimit(pc, peer);
          } else if (!nowRelayed) {
            peer.isRelayed = false;
          }

          // Cumulative counters since connect — diff against the last poll
          // for an INTERVAL loss %, not a lifetime average (a lifetime ratio
          // would permanently discolor the badge after one early hiccup on
          // a long call). No baseline yet on the first poll → treat as 0,
          // same "unknown isn't bad" philosophy as rtt === 0 below.
          let lossPct = 0;
          if (peer.lastStats) {
            const deltaLost = Math.max(0, lost - peer.lastStats.lost);
            const deltaReceived = Math.max(0, received - peer.lastStats.received);
            const deltaTotal = deltaLost + deltaReceived;
            if (deltaTotal > 0) lossPct = (deltaLost / deltaTotal) * 100;
          }
          peer.lastStats = { lost, received };

          const card = $(`[data-socket="${socketId}"]`);
          if (card) {
            const qualityIndicator = card.querySelector('.connection-quality');
            if (qualityIndicator) {
              qualityIndicator.className = 'connection-quality';
              if (rtt > 0 || lossPct > 0) {
                // Worst-of-both — either dimension alone can ruin a call.
                if (rtt >= 240 || lossPct >= 8) qualityIndicator.classList.add('poor');
                else if (rtt >= 100 || lossPct >= 3) qualityIndicator.classList.add('fair');
                else qualityIndicator.classList.add('good');
                qualityIndicator.title = `Ping: ${Math.round(rtt)}ms · Loss: ${lossPct.toFixed(1)}%`;
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
      audio.volume = soundboardVolume / 100;
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

    const lobbyThemeBtn = $('#lobby-theme-toggle');
    if (lobbyThemeBtn) {
      lobbyThemeBtn.innerHTML = theme === 'light'
        ? '🌙 Switch to Dark Mode'
        : '☀️ Switch to Light Mode';
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

  // ── CONNECTING OVERLAY — owns its own timers so no call site can leave a
  // stale timeout armed after a legitimate dismiss (see dismissConnectingOverlay). ──
  function updateConnectingSub(text) {
    const el = $('#connecting-sub');
    if (el) el.textContent = text;
  }

  function beginConnecting() {
    const overlay = $('#connecting-overlay');
    if (overlay.classList.contains('show')) return; // already mid-attempt — don't stack timers
    overlay.classList.add('show');
    updateConnectingSub('Setting up your voice room');
    // The signaling host is free-tier and can cold-start in 30-90s — give it
    // a real runway instead of a flat cliff, with honest progressive status.
    connectingTimers.push(setTimeout(() => updateConnectingSub('Still connecting — server may be waking up…'), 8000));
    connectingTimers.push(setTimeout(() => updateConnectingSub('This can take up to a minute on a cold start…'), 25000));
    connectingTimers.push(setTimeout(() => {
      dismissConnectingOverlay();
      if (socket) socket.disconnect(); // deterministic stop — no silent background retry after giving up
      window._pendingJoin = null;
      toast("Couldn't reach the server — please try again", 'error');
    }, 55000));
  }

  function dismissConnectingOverlay() {
    connectingTimers.forEach(t => clearTimeout(t));
    connectingTimers = [];
    $('#connecting-overlay').classList.remove('show');
  }

  function connectSocket() {
    if (socket && socket.connected) return;
    if (socket) { socket.disconnect(); socket = null; }

    socket = io(window.location.origin, {
      // Polling first, then upgrade to websocket — some networks (corporate
      // proxies, strict firewalls, certain mobile hotspots) strip the
      // WebSocket upgrade handshake with no fallback if 'websocket' is tried
      // first. This is the connectivity-safe default; the extra polling
      // round-trip on connect is a few hundred ms, not the actual delay
      // users perceive as a "connecting loop".
      transports: ['polling', 'websocket']
    });

    socket.on('connect', () => {
      mySocketId = socket.id;
      midSessionErrorShown = false;
      toast('Connected to server', 'success');
      if (window._pendingJoin) {
        // Don't clear _pendingJoin here — only once the outcome is known
        // (room-joined or a room-error event). If this same connection
        // drops before the server responds (plausible mid cold-start),
        // the next successful 'connect' needs it to still be there to retry.
        socket.emit('join-room', window._pendingJoin);
      } else if (roomId) {
        // Auto-rejoin after a dropped connection — old peer connections are
        // stale (socket ids changed), so tear down and rebuild from scratch.
        Object.values(peers).forEach(p => { try { p.pc.close(); } catch (e) {} });
        peers = {};
        peerStreams = {};
        remoteAnalysers = {};
        toast('Reconnected — rejoining room…', 'info');
        socket.emit('join-room', { roomId, userName: window.userName, muted: isMuted, joinOnly: true, password: roomPassword, avatar: getAvatarPayload() });
      }
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        // Explicit ban/kick — server won't let us back in, no point retrying.
        dismissConnectingOverlay();
        window._pendingJoin = null;
        toast('Disconnected by server (banned/kicked)', 'error');
        return;
      }
      if ($('#connecting-overlay').classList.contains('show')) {
        // Mid-join drop — Socket.IO's built-in reconnection is already
        // retrying underneath; stay on the overlay instead of bailing.
        updateConnectingSub('Connection dropped — reconnecting…');
        return;
      }
      toast('Disconnected from server', 'error');
    });

    socket.on('connect_error', () => {
      if ($('#connecting-overlay').classList.contains('show')) {
        // Exactly what a cold free-tier host looks like on the first
        // attempt(s) — the staged messages + ceiling timer in
        // beginConnecting() already own this UX. Socket.IO keeps retrying
        // on its own default backoff; no need to react per-attempt here.
        return;
      }
      // A background reconnect during an already-established session —
      // surface it once, not once per retry attempt.
      if (!midSessionErrorShown) {
        midSessionErrorShown = true;
        toast('Connection issue — retrying…', 'error');
      }
    });

    socket.on('room-joined', async (data) => {
      roomId = data.roomId;
      roomPassword = (window._pendingJoin && window._pendingJoin.password) || roomPassword || null;
      window._pendingJoin = null; // outcome is now known — safe to clear
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
      dismissConnectingOverlay();
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
        // Mic acquisition was kicked off when the user clicked Join/Create —
        // usually it's already done by now, so joining feels instant.
        const gotMic = await preacquireMic();
        micAcquirePromise = null;
        if (gotMic && localStream) {
          await setupAudioProcessing();
          enumerateDevices();
        } else {
          toast('Mic not available — others won\'t hear you', 'error');
          setMicBanner(true);
        }
      }

      // Creating the connection adds tracks, which triggers negotiation
      // automatically (onnegotiationneeded) — no manual offer step needed.
      for (const p of data.peers) {
        createPeerConnection(p.socketId, p.name);
        if (peers[p.socketId]) peers[p.socketId].lastSeenAt = p.lastSeenAt || Date.now();
      }

      currentInviteToken = data.inviteToken || null;

      // Resume ongoing screen shares (people were already live)
      screenShares = {};
      remoteScreenStreams = {};
      focusedShareId = null;
      const existingShares = data.screenShares || (data.screenShare ? [data.screenShare] : []);
      existingShares.forEach(s => {
        if (s && s.socketId !== mySocketId) screenShares[s.socketId] = s;
      });
      if (isScreenSharing && screenStream) {
        // We reconnected mid-share — re-announce it
        socket.emit('screen-share-start', { roomId, streamId: screenStream.id });
      }
      renderScreenShares();

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

    const dismissWithPendingClear = () => { dismissConnectingOverlay(); window._pendingJoin = null; };
    socket.on('room-not-found', () => { dismissWithPendingClear(); toast('Room not found', 'error'); });
    socket.on('room-wrong-password', () => { dismissWithPendingClear(); toast('Wrong password', 'error'); });
    socket.on('room-full', () => { dismissWithPendingClear(); toast('Room is full (max 30)', 'error'); });
    socket.on('room-locked-error', () => { dismissWithPendingClear(); toast('Room is currently locked!', 'error'); });
    socket.on('room-banned-error', () => { dismissWithPendingClear(); toast('You are banned from this room!', 'error'); });
    socket.on('room-warning', (data) => toast(data.message, 'info'));
    socket.on('room-requires-password', () => {
      dismissWithPendingClear();
      $('#password-modal').classList.add('open');
    });
    socket.on('room-has-password', (data) => {
      if (data.hasPassword) {
        dismissWithPendingClear();
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
        peers[data.socketId].lastSeenAt = data.lastSeenAt || Date.now();
      }
      addPeerToGrid(data.socketId, data.name, data.muted, data.isCreator, data.avatar, data.forceMuted, data.status, data.handRaised, data.isModerator);
      toast(`${data.name} joined`, 'info');
      // Desktop-only extra: OS notification for joins while minimized — browser stays mention-only
      if (window.electronAPI && window.electronAPI.isElectron && document.hidden) {
        notifyUser(`${data.name} joined`, roomId);
      }
      if (localStream) {
        await addStreamToPeers();
      }
    });

    socket.on('peer-left', (data) => {
      UI_SOUNDS.play('leave');
      const name = peers[data.socketId]?.name || 'Someone';
      removePeerFromGrid(data.socketId);
      // Drop any stream they were sharing
      if (screenShares[data.socketId]) {
        delete screenShares[data.socketId];
        delete remoteScreenStreams[data.socketId];
        if (focusedShareId === data.socketId) focusedShareId = null;
        renderScreenShares();
      }
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

    socket.on('read-receipt-updated', (data) => {
      if (peers[data.socketId]) peers[data.socketId].lastSeenAt = data.lastSeenAt;
      updateSeenLabel();
    });

    socket.on('invite-expired', () => {
      dismissWithPendingClear();
      toast('This invite link has expired — ask the host for a new one', 'error');
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
      const mentionsMe = data.socketId !== mySocketId && messageMentionsMe(data.text);
      UI_SOUNDS.play(mentionsMe ? 'mention' : 'msg');
      addChatMessage(data);
      if (!chatOpen && data.socketId !== mySocketId) {
        unreadCount++;
        updateChatBadge();
      }
      if (mentionsMe && (!chatOpen || document.hidden)) {
        toast(`${data.name} mentioned you`, 'info');
        if (document.hidden) notifyUser(`${data.name} mentioned you`, data.text);
      }
    });

    socket.on('chat-message-deleted', (data) => {
      const msg = $(`[data-msgid="${data.msgId}"]`);
      if (msg) msg.remove();
    });

    socket.on('chat-message-edited', (data) => {
      const msgEl = $(`[data-msgid="${data.msgId}"]`);
      if (!msgEl) return;
      msgEl.dataset.rawText = data.text || '';
      const editInput = msgEl.querySelector('.chat-msg-edit-input');
      const textHtml = `${formatMessageText(data.text)} <span class="chat-msg-edited-tag">(edited)</span>`;
      if (editInput) {
        const textEl = document.createElement('div');
        textEl.className = 'chat-msg-text';
        textEl.innerHTML = textHtml;
        editInput.replaceWith(textEl);
      } else {
        const textEl = msgEl.querySelector('.chat-msg-text');
        if (textEl) textEl.innerHTML = textHtml;
      }
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

    // 🖥️ Screen share events (multiple simultaneous streams)
    socket.on('screen-share-started', (data) => {
      screenShares[data.socketId] = data;
      viewerDismissedFocus = false; // a fresh share should still be able to auto-focus per the usual rules
      if (data.socketId === mySocketId) {
        // Server approved our share — start pushing tracks (guard against
        // double-adds after a reconnect where tracks were re-added already)
        if (!isScreenSharing) beginBroadcastingScreen();
        else renderScreenShares();
        return;
      }
      renderScreenShares();
      toast(`${data.name} is live! 🖥️`, 'info', {
        text: 'Watch',
        callback: () => {
          focusedShareId = data.socketId;
          renderScreenShares();
        }
      });
    });

    socket.on('screen-share-stopped', (data) => {
      if (data.socketId !== mySocketId && screenShares[data.socketId]) {
        toast(`${screenShares[data.socketId].name}'s stream ended`, 'info');
      }
      delete screenShares[data.socketId];
      delete remoteScreenStreams[data.socketId];
      delete watcherCounts[data.socketId];
      if (focusedShareId === data.socketId) focusedShareId = null;
      if (lastWatchingEmit === data.socketId) lastWatchingEmit = undefined;
      renderScreenShares();
    });

    socket.on('watcher-count-updated', (data) => {
      watcherCounts[data.sharerSocketId] = data.count;
      if (focusedShareId === data.sharerSocketId) updateWatcherBadge();
    });

    socket.on('screen-share-paused', (data) => {
      if (screenShares[data.socketId]) {
        screenShares[data.socketId].paused = true;
        if (focusedShareId === data.socketId || data.socketId === mySocketId) renderScreenShares();
      }
    });

    socket.on('screen-share-resumed', (data) => {
      if (screenShares[data.socketId]) {
        screenShares[data.socketId].paused = false;
        if (focusedShareId === data.socketId || data.socketId === mySocketId) renderScreenShares();
      }
    });

    socket.on('screen-share-switched', (data) => {
      // Bookkeeping only — replaceTrack() means the receiver's existing
      // <video> just shows new pixels with no ontrack/renegotiation, so
      // there's nothing to re-render, just keep the streamId identity in
      // sync for isScreen classification.
      if (screenShares[data.socketId]) screenShares[data.socketId].streamId = data.streamId;
    });

    socket.on('screen-share-denied', (data) => {
      const msg = data && data.reason === 'limit'
        ? `Stream limit reached (${data.max} at once) — try again when someone stops`
        : `${data && data.name ? data.name + ' is already sharing' : 'Screen share denied'}`;
      toast(msg, 'error');
      cleanupScreenStream();
      delete screenShares[mySocketId];
      if (focusedShareId === mySocketId) focusedShareId = null;
      renderScreenShares();
    });

    socket.on('kicked', () => {
      toast('You were kicked from the room', 'error');
      leaveRoom();
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
  }

  // ── MESSAGES RENDERING WITH REPLIES & REACTIONS ──
  function getRoomParticipantNames() {
    const names = new Set();
    if (window.userName) names.add(window.userName);
    Object.values(peers).forEach(p => { if (p.name) names.add(p.name); });
    return names;
  }

  function messageMentionsMe(text) {
    if (!text || !window.userName) return false;
    const escapedName = window.userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`@${escapedName}\\b`).test(text);
  }

  function highlightMentions(escapedHtml) {
    const names = [...getRoomParticipantNames()];
    if (names.length === 0) return escapedHtml;
    // Longest names first so "@Ann" doesn't swallow part of "@Annie"
    const pattern = names
      .sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return escapedHtml.replace(new RegExp(`@(${pattern})\\b`, 'g'), (match, name) => {
      const isMe = name === window.userName;
      return `<span class="chat-mention${isMe ? ' chat-mention-me' : ''}">@${name}</span>`;
    });
  }

  // Lightweight markdown — bold/italic/strikethrough/code/quote/spoiler.
  // No real language-aware syntax highlighting (would need a library this
  // app doesn't depend on); code blocks/spans just get monospace styling.
  // Returns { html, codeStash } — html still has \x00CODE<n>\x00 placeholders;
  // callers must restore them LAST, after mentions/linkify, so nothing else
  // (a mention, a URL) can reach inside code content. Restoring early would
  // defeat the whole point of protecting it.
  function parseMarkdown(escapedHtml) {
    const codeStash = [];
    const stash = (html) => { codeStash.push(html); return `\x00CODE${codeStash.length - 1}\x00`; };

    let out = escapedHtml
      .replace(/```\w*\n?([\s\S]*?)```/g, (m, code) => stash(`<pre class="chat-code-block"><code>${code}</code></pre>`))
      .replace(/`([^`\n]+)`/g, (m, code) => stash(`<code class="chat-inline-code">${code}</code>`));

    // Blockquote — "&gt; text" (post-escape) at the start of a line
    out = out.replace(/^&gt; ?(.*)$/gm, '<blockquote class="chat-quote">$1</blockquote>');

    out = out
      .replace(/\*\*([^\n*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^\n_]+?)__/g, '<strong>$1</strong>')
      .replace(/\*([^\n*]+?)\*/g, '<em>$1</em>')
      .replace(/(?<!\w)_([^\n_]+?)_(?!\w)/g, '<em>$1</em>')
      .replace(/~~([^\n~]+?)~~/g, '<del>$1</del>')
      .replace(/\|\|([^\n|]+?)\|\|/g, '<span class="chat-spoiler" onclick="this.classList.add(\'revealed\')" title="Click to reveal">$1</span>');

    return { html: out, codeStash };
  }

  function formatMessageText(text) {
    // Escape → markdown (code protected via placeholders) → mentions →
    // linkify → restore code LAST — so a mention or URL regex can never
    // reach inside code content, and the URL regex (which stops at "<")
    // never straddles a mention/markdown tag either.
    const escaped = escapeHtml(text || '');
    const { html, codeStash } = parseMarkdown(escaped);
    const mentioned = highlightMentions(html);
    const linked = mentioned.replace(/(https?:\/\/[^\s<]+)/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`);
    return linked.replace(/\x00CODE(\d+)\x00/g, (m, i) => codeStash[Number(i)]);
  }

  function isChatNearBottom(container) {
    return container.scrollHeight - container.scrollTop - container.clientHeight < 90;
  }

  function scrollChatToBottom(smooth) {
    const container = $('#chat-messages');
    container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    const pill = $('#chat-scroll-pill');
    if (pill) pill.style.display = 'none';
  }

  function addChatMessage(data) {
    const container = $('#chat-messages');
    const isOwn = data.socketId === mySocketId;
    const wasNearBottom = isChatNearBottom(container);
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const isMentioned = !isOwn && messageMentionsMe(data.text);
    const el = document.createElement('div');
    el.className = `chat-msg${isOwn ? ' own' : ''}${data.isWhisper ? ' whisper' : ''}${isMentioned ? ' mentioned' : ''}`;
    el.dataset.msgid = data.msgId;
    el.dataset.timestamp = data.timestamp || Date.now();
    el.dataset.rawText = data.text || ''; // pre-markdown source, so edit/reply don't operate on rendered (formatted) text

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

    // Action Hover Box (reactions, reply, edit, delete, pin)
    const isAdmin = isCreator || roomModerators.includes(window.userName);
    const editBtn = isOwn && !data.file ? `<button class="msg-action-icon-btn" data-act-edit="${data.msgId}" title="Edit Message">✏️</button>` : '';
    const deleteBtn = (isOwn || isAdmin) ? `<button class="msg-action-icon-btn" data-act-del="${data.msgId}" title="Delete Message">🗑️</button>` : '';
    const pinBtn = isAdmin ? `<button class="msg-action-icon-btn" data-act-pin="${data.msgId}" title="Pin Message">📌</button>` : '';
    const actionsHoverHtml = `
      <div class="chat-msg-actions-hover">
        <button class="msg-action-icon-btn" data-act-react="${data.msgId}" title="React">😀</button>
        <button class="msg-action-icon-btn" data-act-reply="${data.msgId}" title="Reply">↩️</button>
        ${editBtn}
        ${pinBtn}
        ${deleteBtn}
      </div>
    `;

    // Whisper note
    const whisperLabel = data.isWhisper ? `<span style="font-size:0.65rem; padding:1px 4px; background:#eab308; color:#000; border-radius:4px; margin-left:4px;">Whisper to @${escapeHtml(data.toName)}</span>` : '';

    // "/me" action messages render as a single italic line, Discord/IRC-style
    const bodyHtml = data.isAction
      ? `<div class="chat-msg-text chat-msg-action"><em>* ${escapeHtml(data.name)} ${formatMessageText(data.text)} *</em></div>`
      : `
      <div class="chat-msg-header">
        <div style="display:flex;align-items:center;gap:4px;">
          ${avatarHtml}
          <span class="chat-msg-name">${escapeHtml(data.name)}</span>
          ${whisperLabel}
        </div>
        <span class="chat-msg-time">${time}</span>
      </div>
      <div class="chat-msg-text">${formatMessageText(data.text)}${data.edited ? ' <span class="chat-msg-edited-tag">(edited)</span>' : ''}</div>`;

    el.innerHTML = `
      ${replyContextHtml}
      ${actionsHoverHtml}
      ${bodyHtml}
      ${fileHtml}
      <div class="msg-reactions"></div>
      ${isOwn ? '<div class="chat-msg-seen" style="display:none;"></div>' : ''}
    `;

    container.appendChild(el);

    // Smart autoscroll: stick to the bottom unless the user scrolled up to
    // read history — then show a "New messages" pill instead of yanking them.
    if (isOwn || wasNearBottom || !chatOpen) {
      container.scrollTop = container.scrollHeight;
    } else {
      const pill = $('#chat-scroll-pill');
      if (pill) pill.style.display = 'inline-flex';
    }

    // Render reactions if payload has them
    if (data.reactions) renderMessageReactions(el, data.reactions);

    if (isOwn) {
      lastOwnMsgId = data.msgId;
      updateSeenLabel();
    }
    if (chatOpen && document.hasFocus()) scheduleChatSeenEmit();
  }

  // Shows "Seen" under the sender's own last message once any other peer's
  // last-seen timestamp catches up to it — WhatsApp-style, last bubble only
  // (not per-message) to keep the chat from getting visually noisy.
  function updateSeenLabel() {
    if (!lastOwnMsgId) return;
    const el = $(`[data-msgid="${lastOwnMsgId}"]`);
    const label = el?.querySelector('.chat-msg-seen');
    if (!label) return;
    const msgTimestamp = parseInt(el.dataset.timestamp || '0', 10);
    const seen = Object.values(peers).some(p => (p.lastSeenAt || 0) >= msgTimestamp);
    label.textContent = seen ? 'Seen' : '';
    label.style.display = seen ? 'block' : 'none';
  }

  // Debounced so a burst of incoming messages doesn't spam the server
  function scheduleChatSeenEmit() {
    if (!socket || !roomId) return;
    clearTimeout(lastSeenEmitTimeout);
    lastSeenEmitTimeout = setTimeout(() => {
      socket.emit('chat-seen', { roomId });
    }, 1000);
  }

  // Turns a message's text into an inline input (Enter to save, Escape to
  // cancel) — mirrors Discord's in-place message editing.
  function beginEditMessage(msgId) {
    const msgEl = $(`[data-msgid="${msgId}"]`);
    if (!msgEl) return;
    const textEl = msgEl.querySelector('.chat-msg-text');
    if (!textEl || textEl.querySelector('.chat-msg-edit-input')) return;
    // Raw pre-markdown source, not the rendered .textContent — otherwise
    // editing a "**bold**" message would silently strip the markdown syntax
    // (textContent only has the rendered "bold", not the original stars).
    const currentText = msgEl.dataset.rawText || '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-msg-edit-input';
    input.value = currentText;
    input.maxLength = 500;
    textEl.replaceWith(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    // Removing a focused input from the DOM fires 'blur' synchronously,
    // re-entering finish() a second time before input.isConnected has
    // updated — guard with a flag, not just the isConnected check, so
    // Escape (which replaces the input) can't trigger a double replaceWith().
    let finished = false;
    const finish = (save) => {
      if (finished || !input.isConnected) return;
      finished = true;
      const newText = input.value.trim();
      if (save && newText && newText !== currentText) {
        socket.emit('edit-chat-message', { roomId, msgId, text: newText });
      } else {
        input.replaceWith(textEl); // restore original, unedited view
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
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
      item.style.border = '1px solid var(--border)';
      item.style.padding = '10px';
      item.style.borderRadius = '8px';

      const unpinBtn = (isCreator || roomModerators.includes(window.userName))
        ? `<button class="btn btn-ghost btn-sm" data-unpin="${msg.msgId}" style="margin-top:6px; font-size:0.7rem; padding:4px 8px;">Unpin</button>`
        : '';

      item.innerHTML = `
        <div style="font-size:0.72rem; color:var(--muted); margin-bottom:4px;"><strong>@${escapeHtml(msg.name)}</strong>:</div>
        <div style="font-size:0.82rem; color:var(--text);">${escapeHtml(msg.text)}</div>
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
        <div style="font-size:0.95rem; font-weight:700; color:var(--text);">${escapeHtml(poll.question)}</div>
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
      scrollChatToBottom(false);
      scheduleChatSeenEmit();
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

    // Also silence screen share audio (unless it's our own muted preview)
    const stageVideo = $('#stage-video');
    if (stageVideo && focusedShareId !== mySocketId) stageVideo.muted = isDeafened;

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
    recordingStartTime = Date.now();
    $('#btn-record').classList.add('active');

    // Live timer tick
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const label = $('#record-label');
      if (label) label.textContent = `⏺ ${mm}:${ss}`;
    };
    updateTimer();
    recordingTimer = setInterval(updateTimer, 1000);

    toast('Recording started', 'info');
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
      recordingStartTime = null;
      $('#btn-record').classList.remove('active');
      $('#record-label').textContent = 'Record';
      toast('Recording saved', 'success');
    }
  }

  function leaveRoom() {
    if (isScreenSharing || screenStream) {
      stopScreenShare();
    }
    if (roomId) {
      socket.emit('leave-room', { roomId });
    }
    if (roomTimer) clearInterval(roomTimer);
    if (pollInterval) clearInterval(pollInterval);
    if (afkTimeout) clearTimeout(afkTimeout);
    if (typingTimeout) clearTimeout(typingTimeout);
    if (speakingTimeout) clearTimeout(speakingTimeout);
    if (qualityStatsInterval) clearInterval(qualityStatsInterval);
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    if (mediaRecorder && isRecording) mediaRecorder.stop();

    Object.values(peers).forEach(p => p.pc.close());
    peers = {};
    peerStreams = {};
    remoteAnalysers = {};
    screenShares = {};
    remoteScreenStreams = {};
    focusedShareId = null;
    renderScreenShares();
    setMicBanner(false);
    teardownMicPipeline();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    micAcquirePromise = null;
    if (audioContext) audioContext.close();
    audioContext = null;
    audioWorkletModulePromise = null; // new AudioContext next join needs the module re-registered
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

  // ── FULL EMOJI PICKER ──
  function initEmojiPicker() {
    const picker = $('#emoji-picker');
    const moreBtn = $('#btn-emoji-more');
    if (!picker || !moreBtn) return;

    picker.innerHTML = Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => `
      <div class="emoji-picker-category">
        <div class="emoji-picker-category-label">${category}</div>
        <div class="emoji-picker-grid">
          ${emojis.map(e => `<button class="emoji-picker-item" data-emoji="${e}">${e}</button>`).join('')}
        </div>
      </div>
    `).join('');

    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-picker-item');
      if (!btn) return;
      const input = $('#chat-input');
      input.value += btn.dataset.emoji;
      input.focus();
    });

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (picker.style.display !== 'none' && !e.target.closest('#emoji-picker') && !e.target.closest('#btn-emoji-more')) {
        picker.style.display = 'none';
      }
    });
  }

  // ── @MENTION AUTOCOMPLETE ──
  let mentionActiveIndex = 0;

  function getMentionQuery(input) {
    const caret = input.selectionStart;
    const uptoCaret = input.value.slice(0, caret);
    const match = uptoCaret.match(/(?:^|\s)@(\w*)$/);
    return match ? match[1] : null;
  }

  function updateMentionDropdown(input) {
    const query = getMentionQuery(input);
    const dropdown = $('#mention-dropdown');
    if (query === null) {
      dropdown.style.display = 'none';
      return;
    }
    const names = [...getRoomParticipantNames()].filter(n =>
      n.toLowerCase().startsWith(query.toLowerCase()) && n !== window.userName
    );
    if (names.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    mentionActiveIndex = 0;
    dropdown.innerHTML = names.map((n, i) =>
      `<div class="mention-item${i === 0 ? ' active' : ''}" data-name="${escapeHtml(n)}">@${escapeHtml(n)}</div>`
    ).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => insertMention(input, item.dataset.name));
    });
  }

  function insertMention(input, name) {
    const caret = input.selectionStart;
    const uptoCaret = input.value.slice(0, caret);
    const rest = input.value.slice(caret);
    const replaced = uptoCaret.replace(/@(\w*)$/, `@${name} `);
    input.value = replaced + rest;
    const newCaret = replaced.length;
    input.setSelectionRange(newCaret, newCaret);
    input.focus();
    $('#mention-dropdown').style.display = 'none';
  }

  function handleMentionDropdownKeydown(e) {
    const dropdown = $('#mention-dropdown');
    if (!dropdown || dropdown.style.display === 'none') return false;
    const items = [...dropdown.querySelectorAll('.mention-item')];
    if (items.length === 0) return false;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[mentionActiveIndex].classList.remove('active');
      mentionActiveIndex = e.key === 'ArrowDown'
        ? (mentionActiveIndex + 1) % items.length
        : (mentionActiveIndex - 1 + items.length) % items.length;
      items[mentionActiveIndex].classList.add('active');
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(e.target, items[mentionActiveIndex].dataset.name);
      return true;
    }
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      return true;
    }
    return false;
  }

  function initMentionAutocomplete() {
    document.addEventListener('click', (e) => {
      const dropdown = $('#mention-dropdown');
      if (dropdown && !e.target.closest('#mention-dropdown') && e.target.id !== 'chat-input') {
        dropdown.style.display = 'none';
      }
    });
  }

  // Chat commands — all client-side; /mute /unmute /kick just reuse the
  // existing socket events, which are already permission-checked server-side
  // (isCreator/isModerator), so the client-side isAdmin check here is only
  // a UX guard, not real enforcement.
  function runSlashCommand(raw) {
    const spaceIdx = raw.indexOf(' ');
    const cmd = (spaceIdx === -1 ? raw.slice(1) : raw.slice(1, spaceIdx)).toLowerCase();
    const arg = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1).trim();
    const input = $('#chat-input');
    const isAdmin = isCreator || roomModerators.includes(window.userName);

    switch (cmd) {
      case 'shrug':
        input.value = (arg ? arg + ' ' : '') + '¯\\_(ツ)_/¯';
        return false; // fall through to normal send with the rewritten text
      case 'me':
        if (!arg) { toast('Usage: /me <action>', 'error'); return true; }
        pendingActionMessage = true;
        input.value = arg;
        return false;
      case 'clear':
        $('#chat-messages').innerHTML = '';
        toast('Chat cleared (only for you)', 'info');
        return true;
      case 'mute':
      case 'unmute':
      case 'kick': {
        if (!isAdmin) { toast('Only the host or a moderator can do that', 'error'); return true; }
        if (!arg) { toast(`Usage: /${cmd} <name>`, 'error'); return true; }
        const match = Object.entries(peers).find(([, p]) => p.name?.toLowerCase() === arg.toLowerCase());
        if (!match) { toast(`User "${arg}" not found`, 'error'); return true; }
        const targetId = match[0];
        if (cmd === 'kick') socket.emit('kick-user', { roomId, targetId });
        else socket.emit(cmd === 'mute' ? 'force-mute' : 'force-unmute', { roomId, targetId });
        toast(`${cmd === 'kick' ? 'Kicked' : cmd === 'mute' ? 'Muted' : 'Unmuted'} ${arg}`, 'success');
        return true;
      }
      case 'help':
        toast('Commands: /me /shrug /clear /mute /unmute /kick /help', 'info');
        return true;
      default:
        toast(`Unknown command: /${cmd}`, 'error');
        return true;
    }
  }

  function sendMessage() {
    const input = $('#chat-input');
    let text = input.value.trim();
    if (!text && !pendingFile) return;

    if (text.startsWith('/') && !pendingFile) {
      if (runSlashCommand(text)) { input.value = ''; return; }
      text = input.value.trim();
      if (!text) return;
    }

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

    if (pendingActionMessage) {
      msgData.isAction = true;
      pendingActionMessage = false;
    }

    // Attach reply quote if active
    if (replyingTo) {
      msgData.replyTo = replyingTo;
      cancelReply();
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
    if (currentInviteToken) link += `&inv=${currentInviteToken}`;
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
    el.style.cssText = 'margin-top:8px; padding:10px; background:var(--glass); border:1px solid var(--border); border-radius:8px; display:flex; flex-direction:column; gap:4px; max-width:280px;';

    let hostname = 'link';
    try { hostname = new URL(url).hostname; } catch(e) {}

    el.innerHTML = `
      <div style="font-size:0.65rem; color:var(--cyan); text-transform:uppercase; font-weight:700;">Link Preview</div>
      <a href="${escapeHtml(url)}" target="_blank" style="font-size:0.8rem; color:var(--text); font-weight:600; text-decoration:none; word-break:break-all;">${escapeHtml(hostname)}</a>
      <div style="font-size:0.7rem; color:var(--muted);">Click to open webpage in your browser.</div>
    `;
    return el;
  }

  function applyChatTextSize(size) {
    const container = $('#chat-messages');
    if (!container) return;
    container.classList.remove('chat-size-small', 'chat-size-medium', 'chat-size-large');
    container.classList.add(`chat-size-${size}`);
  }

  function applyWallpaper(wp) {
    document.body.classList.remove('wp-cosmic', 'wp-obsidian', 'wp-forest', 'wp-glass');
    document.body.classList.add(`wp-${wp}`);
  }

  function loadLocalSettings() {
    const sbVolumeInput = $('#setting-soundboard-volume');
    if (sbVolumeInput) {
      sbVolumeInput.value = soundboardVolume;
      const sbVal = $('#soundboard-volume-val');
      if (sbVal) sbVal.textContent = soundboardVolume + '%';
    }

    const chatSizeSelect = $('#setting-chat-size');
    if (chatSizeSelect) {
      chatSizeSelect.value = chatTextSize;
    }
    applyChatTextSize(chatTextSize);

    const wallpaperSelect = $('#setting-wallpaper');
    if (wallpaperSelect) {
      wallpaperSelect.value = roomWallpaper;
    }
    applyWallpaper(roomWallpaper);

    const soundNotifyCheck = $('#setting-sound-notifications');
    if (soundNotifyCheck) {
      soundNotifyCheck.checked = soundNotifications;
    }

    const desktopNotifyCheck = $('#setting-desktop-notifications');
    if (desktopNotifyCheck) {
      desktopNotifyCheck.checked = desktopNotificationsEnabled;
    }

    const manualShareFocusCheck = $('#setting-manual-share-focus');
    if (manualShareFocusCheck) {
      manualShareFocusCheck.checked = manualShareFocus;
    }

    const statusTextInput = $('#profile-status-text');
    if (statusTextInput) {
      statusTextInput.value = myStatusText;
    }

    const AVATAR_COLOR_LABELS_INIT = { cyan: 'Cyan Glow', purple: 'Purple Haze', pink: 'Pink Punch', green: 'Emerald', orange: 'Sunset Amber', red: 'Ruby Flare', blue: 'Royal Blue' };
    const avatarColorLabel = $('#profile-avatar-color-trigger-label');
    if (avatarColorLabel) avatarColorLabel.textContent = AVATAR_COLOR_LABELS_INIT[myAvatarColor] || myAvatarColor;
    const avatarColorSwatch = $('#profile-avatar-color-swatch');
    if (avatarColorSwatch) avatarColorSwatch.className = `color-swatch ${getAvatarClass(myAvatarColor)}`;
    $(`#profile-avatar-color-menu [data-value="${myAvatarColor}"]`)?.classList.add('selected');

    const statusLabel = $('#profile-status-trigger-label');
    if (statusLabel) statusLabel.textContent = STATUS_LABELS[myStatus] || STATUS_LABELS.online;
    $(`#profile-status-menu [data-value="${myStatus}"]`)?.classList.add('selected');
    updateProfileStatusDot();
    updateProfileAvatarColorOrText();
  }

  function initEventListeners() {
    if ('ontouchstart' in window && window.innerWidth <= 768) {
      const eb = $('#emoji-bar');
      if (eb) eb.style.display = 'none';
    }

    // Set Initial Theme
    applyTheme(localTheme);

    // Load custom settings
    loadLocalSettings();

    // Drag and Drop
    setupDragAndDrop();

    // Theme triggers
    $('#lobby-theme-toggle')?.addEventListener('click', () => applyTheme(localTheme === 'dark' ? 'light' : 'dark'));
    $('#tb-theme-toggle')?.addEventListener('click', () => applyTheme(localTheme === 'dark' ? 'light' : 'dark'));

    // Status custom dropdown
    initCustomSelect('status-select-wrap', 'profile-status-menu', (value) => {
      myStatus = value;
      localStorage.setItem('vw_status', myStatus);
      $('#profile-status-trigger-label').textContent = STATUS_LABELS[value] || STATUS_LABELS.online;
      updateProfileStatusDot();
      if (roomId && socket && socket.connected) {
        socket.emit('update-status', { roomId, status: myStatus });
      }
      // Update local card
      const dot = $(`[data-socket="${mySocketId}"] .status-dot`);
      const statusColors = { online: '#22c55e', away: '#eab308', dnd: '#ef4444', invisible: '#94a3b8' };
      if (dot) dot.style.background = statusColors[myStatus] || '#22c55e';
      toast(`Status set to ${STATUS_LABELS[value] || value}`, 'info');
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
        await setupAudioProcessing();
        // Replace in all peers
        const newTrack = getOutgoingMicTrack();
        for (const [sid, peer] of Object.entries(peers)) {
          const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender && newTrack) await sender.replaceTrack(newTrack);
        }
        toast('Echo Cancellation constraints updated.', 'success');
      }
    });

    // Low bandwidth toggle
    $('#setting-low-bandwidth')?.addEventListener('change', (e) => {
      lowBandwidthEnabled = e.target.checked;
      Object.values(peers).forEach(peer => applyBandwidthLimit(peer.pc, peer));
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

    // ── SCREEN SHARE TRIGGERS (desktop app only) ──
    // Browser getDisplayMedia() screen-capture varies wildly across
    // browsers/OSes (permission prompts, missing system-audio support,
    // unreliable on mobile) — the desktop app's native picker is the only
    // properly-tested path, so sharing (starting a share) is desktop-only.
    // Browser users can still watch shares from desktop users just fine.
    const screenShareBtn = $('#btn-screen-share');
    const canShareScreen = !!(window.electronAPI && window.electronAPI.isElectron);
    if (screenShareBtn && canShareScreen) {
      screenShareBtn.style.display = 'flex';
      screenShareBtn.addEventListener('click', () => {
        if (isScreenSharing) stopScreenShare();
        else openScreenPicker();
      });
    }

    $$('.picker-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.picker-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        pickerSourceType = tab.dataset.sourceType;
        selectedScreenSource = null;
        $('#screen-picker-share').disabled = true;
        loadScreenSources();
      });
    });

    $('#screen-picker-cancel')?.addEventListener('click', () => {
      $('#screen-picker-modal').classList.remove('open');
      isSwitchingSource = false;
    });
    $('#screen-picker-share')?.addEventListener('click', () => {
      if (isSwitchingSource) performSourceSwitch();
      else startScreenShare();
    });

    $('#stage-stop')?.addEventListener('click', () => stopScreenShare());
    $('#stage-pause')?.addEventListener('click', () => togglePauseScreenShare());
    $('#stage-switch-source')?.addEventListener('click', switchScreenSource);
    // Viewer-only: stop watching without ending the sharer's stream — drops
    // back to the thumbnail picker (or fully collapses if it was the only share).
    $('#stage-close-view')?.addEventListener('click', () => {
      focusedShareId = null;
      viewerDismissedFocus = true;
      renderScreenShares();
    });

    $('#stage-quality')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = $('#stage-quality-dropdown');
      if (!dd) return;
      if (!dd.classList.contains('open')) {
        $('#live-resolution').value = shareResolution;
        $('#live-fps').value = String(shareFps);
      }
      dd.classList.toggle('open');
    });
    $('#live-resolution')?.addEventListener('change', (e) => applyLiveQuality({ resolution: e.target.value }));
    $('#live-fps')?.addEventListener('change', (e) => applyLiveQuality({ fps: parseInt(e.target.value) }));

    document.addEventListener('click', (e) => {
      const dd = $('#stage-quality-dropdown');
      if (dd && !e.target.closest('#stage-quality-dropdown') && !e.target.closest('#stage-quality')) {
        dd.classList.remove('open');
      }
    });
    $('#stage-fullscreen')?.addEventListener('click', () => {
      const wrap = $('#stage-video-wrap');
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        wrap.requestFullscreen().catch(() => {});
      }
    });
    $('#stage-video')?.addEventListener('dblclick', () => {
      $('#stage-fullscreen')?.click();
    });

    // Picture-in-Picture — keep watching a stream while using other apps
    $('#stage-pip')?.addEventListener('click', async () => {
      const video = $('#stage-video');
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (video && video.srcObject && video.requestPictureInPicture) {
          await video.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('[VoiceWave] PiP error:', err);
      }
    });

    // Per-stream volume (remote shares only; own preview is always muted)
    const stageVolSlider = $('#stage-volume');
    if (stageVolSlider) {
      stageVolSlider.value = stageVolume;
      stageVolSlider.addEventListener('input', (e) => {
        stageVolume = parseInt(e.target.value);
        localStorage.setItem('vw_stage_volume', String(stageVolume));
        const video = $('#stage-video');
        if (video) video.volume = stageVolume / 100;
      });
    }

    // Mic retry banner
    $('#mic-banner-retry')?.addEventListener('click', retryMic);
    $('#mic-banner-settings')?.addEventListener('click', () => window.electronAPI?.openMicSettings());

    // Chat "new messages" pill + scroll tracking
    $('#chat-scroll-pill')?.addEventListener('click', () => scrollChatToBottom(true));
    $('#chat-messages')?.addEventListener('scroll', () => {
      if (isChatNearBottom($('#chat-messages'))) {
        const pill = $('#chat-scroll-pill');
        if (pill) pill.style.display = 'none';
      }
    });

    // Paste an image straight into chat (screenshots etc.)
    $('#chat-input')?.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleChatFileInput(file);
          }
          break;
        }
      }
    });

    // Refresh device lists when hardware is plugged in / removed
    if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
      navigator.mediaDevices.ondevicechange = () => enumerateDevices();
    }

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

    // Create Polls Modal — reachable from the room header (desktop) and from
    // inside the chat panel (mobile, where the header trigger is hidden).
    function openCreatePollModal() {
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
    }
    $('#btn-polls-trigger')?.addEventListener('click', openCreatePollModal);
    $('#btn-create-poll-chat')?.addEventListener('click', openCreatePollModal);
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

    // Load saved username on init
    try {
      const savedName = localStorage.getItem('vw_username') || '';
      if (savedName) {
        window.userName = savedName;
        const createInput = $('#create-name');
        const joinInput = $('#join-name');
        const profileInput = $('#profile-display-name-input');
        if (createInput) createInput.value = savedName;
        if (joinInput) joinInput.value = savedName;
        if (profileInput) profileInput.value = savedName;
      }
    } catch (e) { /* ignore */ }

    // Load saved avatar on init
    loadAvatar();

    // Initialize profile features
    initProfile();

    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        $(`#tab-${tab.dataset.tab}`).classList.add('active');
      });
    });

    const updateProfileName = (name, originEl = null) => {
      window.userName = name;
      updateProfileDisplayName();
      try {
        localStorage.setItem('vw_username', name);
      } catch (e) { /* ignore */ }

      // Sync input fields
      const createInput = $('#create-name');
      const joinInput = $('#join-name');
      const profileInput = $('#profile-display-name-input');
      if (createInput && createInput !== originEl && createInput.value !== name) {
        createInput.value = name;
      }
      if (joinInput && joinInput !== originEl && joinInput.value !== name) {
        joinInput.value = name;
      }
      if (profileInput && profileInput !== originEl && profileInput.value !== name) {
        profileInput.value = name;
      }
    };
    $('#create-name').addEventListener('input', (e) => updateProfileName(e.target.value.trim(), e.target));
    $('#join-name').addEventListener('input', (e) => updateProfileName(e.target.value.trim(), e.target));
    const profileInput = $('#profile-display-name-input');
    if (profileInput) {
      profileInput.addEventListener('input', (e) => updateProfileName(e.target.value.trim(), e.target));
    }

    $('#btn-create').addEventListener('click', () => {
      const name = $('#create-name').value.trim();
      if (!name) return toast('Enter your name', 'error');
      window.userName = name;
      const code = generateRoomId();
      const password = $('#create-password').value;
      preacquireMic();
      beginConnecting();
      window._pendingJoin = { roomId: code, userName: name, muted: false, joinOnly: false, password, avatar: getAvatarPayload() };
      connectSocket();
    });

    $('#btn-join').addEventListener('click', () => {
      const name = $('#join-name').value.trim();
      let code = $('#join-code').value.trim().toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I');
      const password = $('#join-password').value;
      if (!name) return toast('Enter your name', 'error');
      if (!code) return toast('Enter room code', 'error');
      window.userName = name;
      preacquireMic();
      beginConnecting();

      if (!socket || !socket.connected) {
        window._pendingJoin = { roomId: code, userName: name, muted: false, joinOnly: true, password, avatar: getAvatarPayload(), inviteToken: pendingInviteToken };
        connectSocket();
      } else {
        socket.emit('join-room', { roomId: code, userName: name, muted: false, joinOnly: true, password, avatar: getAvatarPayload(), inviteToken: pendingInviteToken });
      }
    });

    $('#modal-submit').addEventListener('click', () => {
      const password = $('#modal-password').value;
      let code = $('#join-code').value.trim().toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I');
      window._pendingJoin = { roomId: code, userName: window.userName, muted: false, joinOnly: true, password, avatar: getAvatarPayload(), inviteToken: pendingInviteToken };
      $('#password-modal').classList.remove('open');
      beginConnecting();
      if (socket && socket.connected) {
        socket.emit('join-room', { roomId: code, userName: window.userName, muted: false, joinOnly: true, password, avatar: getAvatarPayload(), inviteToken: pendingInviteToken });
      } else {
        // Socket dropped while the password modal was open — reconnect
        // instead of leaving the overlay spinning with no attempt in flight.
        connectSocket();
      }
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

    // Profile popout — click any avatar (own or peer's) in the grid
    $('#user-grid')?.addEventListener('click', (e) => {
      const avatar = e.target.closest('.user-avatar');
      if (avatar) {
        const card = avatar.closest('.user-card');
        if (!card) return;
        e.stopPropagation();
        openProfilePopout(card);
        return;
      }
      // Click anywhere else on a LIVE card focuses that person's stream on
      // the stage — avatar stays reserved for the profile popout above.
      const liveCard = e.target.closest('.user-card.is-live');
      if (liveCard && !e.target.closest('.user-actions')) {
        const socketId = liveCard.dataset.socket;
        if (screenShares[socketId]) {
          focusedShareId = socketId;
          renderScreenShares();
        }
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#user-profile-popout') && !e.target.closest('.user-avatar')) {
        closeProfilePopout();
      }
    });

    // Keyboard shortcuts help modal
    $('#btn-shortcuts-help')?.addEventListener('click', () => {
      $('#shortcuts-modal').classList.add('open');
    });
    $('#shortcuts-close')?.addEventListener('click', () => {
      $('#shortcuts-modal').classList.remove('open');
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
      if (handleMentionDropdownKeydown(e)) return; // dropdown consumed the key
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    $('#chat-input').addEventListener('input', (e) => {
      if (!socket || !roomId) return;
      socket.emit('typing-start', { roomId });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => socket.emit('typing-stop', { roomId }), 2000);
      updateMentionDropdown(e.target);
    });

    initMentionAutocomplete();

    $('#chat-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleChatFileInput(file);
      e.target.value = '';
    });

    $$('.emoji-btn[data-emoji]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $('#chat-input');
        input.value += btn.dataset.emoji;
        input.focus();
      });
    });

    initEmojiPicker();

    $('#btn-record').addEventListener('click', () => {
      if (isRecording) stopRecording();
      else startRecording();
    });

    const closeSettings = () => {
      $('#settings-modal').classList.remove('open');
    };

    $('#btn-settings').addEventListener('click', async () => {
      $('#settings-modal').classList.add('open');
      if (!roomId) {
        // In lobby: check if we need to request permission to see device labels
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const needsPermission = devices.some(d => d.kind === 'audioinput' && !d.label);
          if (needsPermission) {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await enumerateDevices();
            tempStream.getTracks().forEach(t => t.stop());
          } else {
            await enumerateDevices();
          }
        } catch (err) {
          console.warn('Error enumerating/permission request in settings:', err);
          await enumerateDevices();
        }
      } else {
        // In room: just refresh device list
        await enumerateDevices();
      }
    });

    $('#settings-close').addEventListener('click', closeSettings);
    $('#settings-done')?.addEventListener('click', closeSettings);

    $('#master-volume').addEventListener('input', (e) => {
      if (masterGainNode) masterGainNode.gain.value = e.target.value / 100;
      $('#master-volume-val').textContent = e.target.value + '%';
    });

    $('#setting-soundboard-volume')?.addEventListener('input', (e) => {
      soundboardVolume = parseInt(e.target.value);
      localStorage.setItem('vw_sb_volume', soundboardVolume);
      $('#soundboard-volume-val').textContent = soundboardVolume + '%';
    });

    $('#setting-chat-size')?.addEventListener('change', (e) => {
      chatTextSize = e.target.value;
      localStorage.setItem('vw_chat_size', chatTextSize);
      applyChatTextSize(chatTextSize);
    });

    $('#setting-wallpaper')?.addEventListener('change', (e) => {
      roomWallpaper = e.target.value;
      localStorage.setItem('vw_wallpaper', roomWallpaper);
      applyWallpaper(roomWallpaper);
    });

    $('#setting-sound-notifications')?.addEventListener('change', (e) => {
      soundNotifications = e.target.checked;
      localStorage.setItem('vw_sound_notifications', soundNotifications);
    });

    $('#setting-desktop-notifications')?.addEventListener('change', (e) => {
      const enabling = e.target.checked;
      const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
      if (enabling && !isElectron && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          if (perm !== 'granted') {
            e.target.checked = false;
            toast('Notification permission denied', 'error');
          }
          desktopNotificationsEnabled = e.target.checked;
          localStorage.setItem('vw_desktop_notifications', desktopNotificationsEnabled);
        });
        return;
      }
      desktopNotificationsEnabled = enabling;
      localStorage.setItem('vw_desktop_notifications', desktopNotificationsEnabled);
    });

    $('#setting-manual-share-focus')?.addEventListener('change', (e) => {
      manualShareFocus = e.target.checked;
      localStorage.setItem('vw_manual_share_focus', manualShareFocus ? '1' : '0');
      if (Object.keys(screenShares).length) renderScreenShares();
    });

    $('#profile-status-text')?.addEventListener('input', (e) => {
      myStatusText = e.target.value.trim();
      localStorage.setItem('vw_status_text', myStatusText);
      updateProfileAvatarColorOrText();
      if (roomId && socket && socket.connected) {
        socket.emit('join-room', { roomId, userName: window.userName, muted: isMuted, joinOnly: true, password: roomPassword, avatar: getAvatarPayload() });
      }
    });

    const AVATAR_COLOR_LABELS = { cyan: 'Cyan Glow', purple: 'Purple Haze', pink: 'Pink Punch', green: 'Emerald', orange: 'Sunset Amber', red: 'Ruby Flare', blue: 'Royal Blue' };
    initCustomSelect('avatar-color-select-wrap', 'profile-avatar-color-menu', (value) => {
      myAvatarColor = value;
      localStorage.setItem('vw_avatar_color', myAvatarColor);
      $('#profile-avatar-color-trigger-label').textContent = AVATAR_COLOR_LABELS[value] || value;
      const swatch = $('#profile-avatar-color-swatch');
      if (swatch) {
        swatch.className = `color-swatch ${getAvatarClass(value)}`;
      }
      updateProfileAvatarColorOrText();
      if (roomId && socket && socket.connected) {
        socket.emit('join-room', { roomId, userName: window.userName, muted: isMuted, joinOnly: true, password: roomPassword, avatar: getAvatarPayload() });
      }
    });

    $('#mic-gain').addEventListener('input', (e) => {
      if (micGainNode) micGainNode.gain.value = e.target.value / 100;
      $('#mic-gain-val').textContent = e.target.value + '%';
    });

    $('#noise-threshold').addEventListener('input', (e) => {
      $('#noise-threshold-val').textContent = e.target.value;
      applyNoiseThreshold(e.target.value);
    });

    $('#input-device').addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (!deviceId) return;
      if (!localStream) return;
      localStream.getTracks().forEach(t => t.stop());
      const gotMic = await getMediaStream(deviceId);
      if (gotMic && localStream) {
        await setupAudioProcessing();
        const newTrack = getOutgoingMicTrack();
        for (const [sid, peer] of Object.entries(peers)) {
          const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender && newTrack) await sender.replaceTrack(newTrack);
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
        if (e.target === modal) {
          if (modal.id === 'settings-modal') {
            closeSettings();
          } else {
            modal.classList.remove('open');
          }
        }
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

      // 3. Transfer Host
      const transBtn = e.target.closest('[data-transfer]');
      if (transBtn) {
        const targetId = transBtn.dataset.transfer;
        const name = $(`[data-socket="${targetId}"]`)?.dataset.name || 'user';
        if (confirm(`Transfer room ownership to ${name}?`)) {
          socket.emit('transfer-creator', { roomId, targetId });
        }
      }

      // 5. Force Mute
      const forceMuteBtn = e.target.closest('[data-force-mute]');
      if (forceMuteBtn) {
        const targetId = forceMuteBtn.dataset.forceMute;
        if (peerForceMuted[targetId]) {
          socket.emit('force-unmute', { roomId, targetId });
        } else {
          socket.emit('force-mute', { roomId, targetId });
        }
      }

      // 7. Message Action: Delete Message
      const actDel = e.target.closest('[data-act-del]');
      if (actDel) {
        socket.emit('delete-chat-message', { roomId, msgId: actDel.dataset.actDel });
      }

      // 7b. Message Action: Edit Message — swap the text into an inline input
      const actEdit = e.target.closest('[data-act-edit]');
      if (actEdit) {
        const msgId = actEdit.dataset.actEdit;
        beginEditMessage(msgId);
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
        const text = msgEl.dataset.rawText || ''; // raw source, not rendered markdown

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
    let roomParam = urlParams.get('room');
    const passParam = urlParams.get('password');
    pendingInviteToken = urlParams.get('inv') || null;
    if (roomParam) {
      roomParam = roomParam.trim().toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I');
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
    const updateIcon = $('#update-icon');
    const updateLabel = $('#update-label');
    const btnCheck = $('#btn-check-update');
    const btnDownload = $('#btn-download-update');
    const btnInstall = $('#btn-install-update');
    const progressBar = $('#update-progress-bar');
    const progressFill = $('#update-progress-fill');
    const progressText = $('#update-progress-text');

    const ICONS = {
      cloud: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
      spinner: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
      check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>'
    };

    // Central state setter — one place to swap icon/animation/label color
    // instead of repeating the same five lines per status branch.
    function setUpdateIcon(name, animClass) {
      updateIcon.innerHTML = ICONS[name];
      updateIcon.className = `update-icon${animClass ? ' ' + animClass : ''}`;
    }

    updateSection.classList.add('show');
    requestAnimationFrame(() => updateSection.classList.add('visible'));

    btnCheck.addEventListener('click', () => {
      btnCheck.style.display = 'none';
      btnDownload.style.display = 'none';
      btnInstall.style.display = 'none';
      window.electronAPI.checkForUpdates();
    });

    window.electronAPI.onUpdateStatus((data) => {
      switch (data.status) {
        case 'checking':
          setUpdateIcon('spinner', 'spin');
          updateLabel.textContent = 'Checking for updates...';
          btnCheck.style.display = 'none';
          btnDownload.style.display = 'none';
          btnInstall.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          break;
        case 'available':
          setUpdateIcon('cloud');
          updateLabel.textContent = `Update v${data.version} available`;
          btnCheck.style.display = 'none';
          btnDownload.style.display = 'inline-flex';
          btnInstall.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          toast(`Update v${data.version} available!`, 'info');
          break;
        case 'downloading':
          setUpdateIcon('cloud', 'pulse');
          updateLabel.textContent = 'Downloading update...';
          btnDownload.style.display = 'none';
          progressBar.style.display = 'block';
          progressText.style.display = 'block';
          progressFill.style.width = data.percent + '%';
          progressText.textContent = `${data.percent}%`;
          break;
        case 'ready':
          setUpdateIcon('check', 'ok');
          updateLabel.textContent = 'Update ready to install';
          btnInstall.style.display = 'inline-flex';
          btnDownload.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          toast('Update downloaded — click Close & Install', 'success');
          break;
        case 'up-to-date':
          setUpdateIcon('check', 'ok');
          updateLabel.textContent = `App is up to date (v${window.APP_VERSION || '1.0.2'})`;
          btnCheck.style.display = 'inline-flex';
          btnDownload.style.display = 'none';
          btnInstall.style.display = 'none';
          progressBar.style.display = 'none';
          progressText.style.display = 'none';
          break;
        case 'error':
          setUpdateIcon('alert', 'err');
          updateLabel.textContent = `Update check failed: ${data.message || 'Unknown error'}`;
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
