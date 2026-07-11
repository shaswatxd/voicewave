const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 10000,
  pingInterval: 5000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 110 * 1024 * 1024
});

const PORT = process.env.PORT || 3000;
const MAX_USERS = 30;
const WARN_USERS = 20;
const MAX_SCREEN_SHARES = 6; // Discord-style: multiple people can stream at once
const ROOMS_FILE = path.join(__dirname, 'rooms.json');

const rooms = new Map();

function generateInviteToken() {
  return Math.random().toString(36).slice(2, 8);
}

// Load persistent rooms from disk
function loadRoomsFromDisk() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
      data.forEach(r => {
        rooms.set(r.id, {
          id: r.id,
          users: new Map(), // Active users in memory
          creator: null,    // Will be assigned on first active user join
          password: r.password || null,
          createdAt: r.createdAt || Date.now(),
          locked: r.locked || false,
          banned: r.banned || [], // Array of { name, ip }
          permissions: r.permissions || { allowMic: true, allowChat: true },
          moderators: r.moderators || [], // Array of usernames or socket IDs
          history: r.history || [], // Last 50 chat messages
          polls: r.polls || [], // Active polls
          pinned: r.pinned || [], // Pinned messages
          screenShares: {}, // Live screen shares (never persisted)
          inviteToken: r.inviteToken || generateInviteToken(),
          inviteExpiresAt: r.inviteExpiresAt || null
        });
      });
      console.log(`Loaded ${rooms.size} persistent rooms from disk.`);
    }
  } catch (err) {
    console.error('Error loading rooms.json:', err);
  }
}

// Save rooms to disk (excluding active sockets/users Map)
function saveRoomsToDisk() {
  try {
    const data = [];
    rooms.forEach((room, id) => {
      // Clean old empty rooms (e.g., older than 7 days and empty) to prevent infinite growth
      const ageInDays = (Date.now() - room.createdAt) / (1000 * 60 * 60 * 24);
      if (room.users.size === 0 && ageInDays > 7 && !room.password) {
        return; // Skip saving and let it expire
      }
      data.push({
        id: room.id,
        password: room.password,
        createdAt: room.createdAt,
        locked: room.locked || false,
        banned: room.banned || [],
        permissions: room.permissions || { allowMic: true, allowChat: true },
        moderators: room.moderators || [],
        history: room.history || [],
        polls: room.polls || [],
        pinned: room.pinned || [],
        inviteToken: room.inviteToken,
        inviteExpiresAt: room.inviteExpiresAt || null
      });
    });
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving rooms.json:', err);
  }
}

loadRoomsFromDisk();

app.use(express.static(path.join(__dirname, 'public'), { noCache: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

io.on('connection', (socket) => {
  const userIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  console.log(`[Connect] ${socket.id} (IP: ${userIp})`);

  socket.on('join-room', ({ roomId, userName, muted, joinOnly, password, avatar, inviteToken }) => {
    if (!roomId || !userName || roomId.length > 10 || userName.length > 32) {
      socket.emit('room-not-found', { roomId });
      return;
    }

    const validAvatar = (avatar && typeof avatar === 'string' && avatar.startsWith('data:image') && avatar.length < 400000) ? avatar : null;

    let room = rooms.get(roomId);

    if (!room) {
      if (joinOnly) {
        socket.emit('room-not-found', { roomId });
        return;
      }
      room = {
        id: roomId,
        users: new Map(),
        creator: socket.id,
        password: password || null,
        createdAt: Date.now(),
        locked: false,
        banned: [],
        permissions: { allowMic: true, allowChat: true },
        moderators: [],
        history: [],
        polls: [],
        pinned: [],
        screenShares: {},
        inviteToken: generateInviteToken(),
        inviteExpiresAt: null
      };
      rooms.set(roomId, room);
      saveRoomsToDisk();
    }

    // 1. Check if room is locked
    if (room.locked && room.creator !== socket.id && !room.moderators.includes(userName)) {
      socket.emit('room-locked-error', { roomId });
      return;
    }

    // 2. Check if banned
    const isBanned = room.banned.some(b => b.name === userName || b.ip === userIp);
    if (isBanned) {
      socket.emit('room-banned-error', { roomId });
      return;
    }

    // 2b. Check invite link token/expiry — only enforced when the client
    // actually sent one (i.e. arrived via a shared link), so manually-typed
    // room codes and pre-feature links keep working unaffected.
    if (inviteToken && (inviteToken !== room.inviteToken || (room.inviteExpiresAt && Date.now() > room.inviteExpiresAt))) {
      socket.emit('invite-expired', { roomId });
      return;
    }

    if (room.password && room.password !== password) {
      socket.emit('room-wrong-password', { roomId });
      return;
    }

    if (room.users.size >= MAX_USERS) {
      socket.emit('room-full', { roomId, maxUsers: MAX_USERS });
      return;
    }

    // Assign creator if room was loaded from disk and has no active creator
    if (!room.creator || room.users.size === 0) {
      room.creator = socket.id;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;

    const userCount = room.users.size + 1;

    if (userCount >= WARN_USERS && userCount < MAX_USERS) {
      io.to(roomId).emit('room-warning', { count: userCount, max: MAX_USERS, message: `Room has ${userCount} members. Quality may degrade.` });
    }

    const peers = [];
    room.users.forEach((user, id) => {
      peers.push({
        socketId: id,
        name: user.name,
        muted: user.muted,
        forceMuted: user.forceMuted || false,
        isCreator: id === room.creator,
        isModerator: room.moderators.includes(user.name),
        status: user.status || 'online',
        handRaised: user.handRaised || false,
        avatar: user.avatar || null,
        lastSeenAt: user.lastSeenAt || Date.now()
      });
    });

    room.users.set(socket.id, {
      name: userName,
      muted: muted || false,
      forceMuted: false,
      status: 'online',
      handRaised: false,
      avatar: validAvatar,
      lastSeenAt: Date.now()
    });

    socket.emit('room-joined', {
      roomId,
      peers,
      isCreator: socket.id === room.creator,
      creatorSocketId: room.creator,
      hasPassword: !!room.password,
      locked: room.locked,
      permissions: room.permissions,
      moderators: room.moderators,
      history: room.history, // Send last 50 messages
      polls: room.polls, // Send active polls
      pinned: room.pinned, // Send pinned messages
      // Ongoing screen shares, if any — strip the server-only watchers Set
      screenShares: Object.values(room.screenShares || {}).map(({ socketId, name, streamId, paused }) => ({ socketId, name, streamId, paused: !!paused })),
      inviteToken: room.inviteToken,
      inviteExpiresAt: room.inviteExpiresAt || null
    });

    socket.to(roomId).emit('peer-joined', {
      socketId: socket.id,
      name: userName,
      muted: muted || false,
      forceMuted: false,
      isCreator: socket.id === room.creator,
      isModerator: room.moderators.includes(userName),
      status: 'online',
      lastSeenAt: Date.now(),
      handRaised: false,
      avatar: validAvatar
    });

    console.log(`[Join] ${userName} → ${roomId} (${room.users.size} users)`);
  });

  socket.on('check-room-password', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('room-not-found', { roomId });
      return;
    }
    socket.emit('room-has-password', { roomId, hasPassword: !!room.password });
  });

  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // 🖥️ Screen share signaling (Discord-style — multiple simultaneous sharers)
  socket.on('screen-share-start', ({ roomId, streamId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    if (!room.screenShares) room.screenShares = {};
    const alreadySharing = !!room.screenShares[socket.id];
    if (!alreadySharing && Object.keys(room.screenShares).length >= MAX_SCREEN_SHARES) {
      socket.emit('screen-share-denied', { reason: 'limit', max: MAX_SCREEN_SHARES });
      return;
    }
    room.screenShares[socket.id] = { socketId: socket.id, name: socket.userName, streamId, watchers: new Set() };
    io.to(roomId).emit('screen-share-started', { socketId: socket.id, name: socket.userName, streamId });
  });

  socket.on('screen-share-stop', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.screenShares || !room.screenShares[socket.id]) return;
    delete room.screenShares[socket.id];
    io.to(roomId).emit('screen-share-stopped', { socketId: socket.id });
  });

  // 🔊 Device audio share (system/loopback audio, no video) — independent of deafen
  socket.on('device-audio-share-start', ({ roomId, streamId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    if (!room.deviceAudioShares) room.deviceAudioShares = {};
    room.deviceAudioShares[socket.id] = { socketId: socket.id, name: socket.userName, streamId };
    io.to(roomId).emit('device-audio-share-started', { socketId: socket.id, name: socket.userName, streamId });
  });

  socket.on('device-audio-share-stop', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.deviceAudioShares || !room.deviceAudioShares[socket.id]) return;
    delete room.deviceAudioShares[socket.id];
    io.to(roomId).emit('device-audio-share-stopped', { socketId: socket.id });
  });

  socket.on('screen-share-pause', ({ roomId }) => {
    const room = rooms.get(roomId);
    const share = room?.screenShares?.[socket.id];
    if (!share) return;
    share.paused = true;
    io.to(roomId).emit('screen-share-paused', { socketId: socket.id });
  });

  socket.on('screen-share-resume', ({ roomId }) => {
    const room = rooms.get(roomId);
    const share = room?.screenShares?.[socket.id];
    if (!share) return;
    share.paused = false;
    io.to(roomId).emit('screen-share-resumed', { socketId: socket.id });
  });

  // Source switch mid-share — deliberately NOT the same event as
  // screen-share-start, which would re-fire the "X is live!" toast for
  // every viewer on a mere source change.
  socket.on('screen-share-switch', ({ roomId, streamId }) => {
    const room = rooms.get(roomId);
    const share = room?.screenShares?.[socket.id];
    if (!share) return;
    share.streamId = streamId;
    io.to(roomId).emit('screen-share-switched', { socketId: socket.id, streamId });
  });

  // Live viewer count ("N watching", Discord Go-Live style) — a viewer only
  // watches one stream at a time, so switching focus moves them, it doesn't add up.
  socket.on('watching-share', ({ roomId, sharerSocketId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.screenShares) return;
    const touchedSharers = new Set();
    Object.values(room.screenShares).forEach(share => {
      if (share.socketId === sharerSocketId || share.socketId === socket.id) return;
      // Notify every other sharer unconditionally (not just ones this
      // viewer was previously registered as watching) — a viewer can jump
      // straight from one share to another without ever being recorded as
      // watching the new one's neighbors, and each sharer's client defaults
      // its per-peer sender to "on" until told otherwise (see
      // setPeerScreenSenderActive), so a missed "false" here would leave
      // that sharer sending video to a peer who's never actually watching.
      const wasWatching = share.watchers.has(socket.id);
      share.watchers.delete(socket.id);
      if (wasWatching) touchedSharers.add(share.socketId);
      // Mesh has no SFU to selectively forward media, so tell that sharer
      // directly this viewer isn't watching them — they can stop sending
      // their screen-share video to this one peer's connection and save
      // the upload bandwidth.
      io.to(share.socketId).emit('viewer-focus-changed', { viewerSocketId: socket.id, watching: false });
    });
    const target = room.screenShares[sharerSocketId];
    if (target && target.socketId !== socket.id) {
      target.watchers.add(socket.id);
      touchedSharers.add(sharerSocketId);
      io.to(target.socketId).emit('viewer-focus-changed', { viewerSocketId: socket.id, watching: true });
    }
    touchedSharers.forEach(sid => {
      const share = room.screenShares[sid];
      if (share) io.to(roomId).emit('watcher-count-updated', { sharerSocketId: sid, count: share.watchers.size });
    });
  });

  socket.on('user-muted', ({ roomId, muted }) => {
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      const user = room.users.get(socket.id);
      user.muted = muted;
      user.forceMuted = false;
      socket.to(roomId).emit('peer-muted', { socketId: socket.id, muted, forceMuted: false });
    }
  });

  // 💬 Chat messages with history
  socket.on('chat-message', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    if (!room) return;

    // Check chat permission
    if (!room.permissions.allowChat && room.creator !== socket.id && !room.moderators.includes(socket.userName)) {
      socket.emit('permission-error', { message: 'Chatting is disabled by host.' });
      return;
    }

    if (!data.text || typeof data.text !== 'string') return;
    if (data.text.length > 500) data.text = data.text.slice(0, 500);

    const messagePayload = {
      ...data,
      socketId: socket.id,
      name: socket.userName || data.name,
      timestamp: Date.now()
    };

    // Public chat: push to history
    room.history.push(messagePayload);
    if (room.history.length > 50) room.history.shift();
    io.to(roomId).emit('chat-message', messagePayload);
    saveRoomsToDisk();
  });

  // Delete message
  socket.on('delete-chat-message', ({ roomId, msgId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isCreator = room.creator === socket.id;
    const isMod = room.moderators.includes(socket.userName);
    const msg = room.history.find(m => m.msgId === msgId);
    const isOwner = msg && msg.socketId === socket.id;

    if (isCreator || isMod || isOwner) {
      room.history = room.history.filter(m => m.msgId !== msgId);
      io.to(roomId).emit('chat-message-deleted', { msgId, deletedBy: socket.id, isCreator });
      saveRoomsToDisk();
    }
  });

  // Edit message — sender only (not admins/mods, matches Discord's own convention)
  socket.on('edit-chat-message', ({ roomId, msgId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!text || typeof text !== 'string') return;

    const msg = room.history.find(m => m.msgId === msgId);
    if (!msg || msg.socketId !== socket.id) return;

    msg.text = text.length > 500 ? text.slice(0, 500) : text;
    msg.edited = true;
    io.to(roomId).emit('chat-message-edited', { msgId, text: msg.text });
    saveRoomsToDisk();
  });

  // Message Reactions
  socket.on('message-reaction', ({ roomId, msgId, reaction }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.history.find(m => m.msgId === msgId);
    if (msg) {
      if (!msg.reactions) msg.reactions = {};
      if (!msg.reactions[reaction]) msg.reactions[reaction] = [];

      const userIndex = msg.reactions[reaction].indexOf(socket.userName);
      if (userIndex > -1) {
        msg.reactions[reaction].splice(userIndex, 1); // remove reaction
        if (msg.reactions[reaction].length === 0) delete msg.reactions[reaction];
      } else {
        msg.reactions[reaction].push(socket.userName); // add reaction
      }
      io.to(roomId).emit('message-reactions-updated', { msgId, reactions: msg.reactions });
      saveRoomsToDisk();
    }
  });

  // Pin Message
  socket.on('pin-message', ({ roomId, msgId, pin }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isCreator = room.creator === socket.id;
    const isMod = room.moderators.includes(socket.userName);
    if (!isCreator && !isMod) return;

    if (pin) {
      const msg = room.history.find(m => m.msgId === msgId);
      if (msg && !room.pinned.some(p => p.msgId === msgId)) {
        room.pinned.push(msg);
      }
    } else {
      room.pinned = room.pinned.filter(p => p.msgId !== msgId);
    }
    io.to(roomId).emit('pinned-messages-updated', { pinned: room.pinned });
    saveRoomsToDisk();
  });

  // 📊 Polls and voting
  socket.on('create-poll', ({ roomId, question, options }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isCreator = room.creator === socket.id;
    const isMod = room.moderators.includes(socket.userName);
    if (!isCreator && !isMod) return;

    const poll = {
      id: `poll-${Date.now()}`,
      question,
      creator: socket.userName,
      options: options.map(o => ({ text: o, votes: [] })) // votes is array of userNames
    };

    room.polls.push(poll);
    io.to(roomId).emit('poll-created', poll);
    saveRoomsToDisk();
  });

  socket.on('cast-vote', ({ roomId, pollId, optionIndex }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (poll) {
      // Remove user's previous votes in this poll
      poll.options.forEach(o => {
        const index = o.votes.indexOf(socket.userName);
        if (index > -1) o.votes.splice(index, 1);
      });
      // Add vote to the new option
      poll.options[optionIndex].votes.push(socket.userName);
      io.to(roomId).emit('poll-updated', poll);
      saveRoomsToDisk();
    }
  });

  // Typing state
  socket.on('typing-start', ({ roomId }) => {
    socket.to(roomId).emit('typing-start', { socketId: socket.id });
  });

  socket.on('typing-stop', ({ roomId }) => {
    socket.to(roomId).emit('typing-stop', { socketId: socket.id });
  });

  // Read receipts — ephemeral, like status/handRaised (not persisted to disk)
  socket.on('chat-seen', ({ roomId }) => {
    const room = rooms.get(roomId);
    const user = room?.users.get(socket.id);
    if (!user) return;
    user.lastSeenAt = Date.now();
    socket.to(roomId).emit('read-receipt-updated', { socketId: socket.id, lastSeenAt: user.lastSeenAt });
  });

  // User Status & Hand Raise
  socket.on('update-status', ({ roomId, status }) => {
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      room.users.get(socket.id).status = status;
      io.to(roomId).emit('peer-status-updated', { socketId: socket.id, status });
    }
  });

  socket.on('hand-raise', ({ roomId, raised }) => {
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      room.users.get(socket.id).handRaised = raised;
      io.to(roomId).emit('peer-hand-raised', { socketId: socket.id, name: socket.userName, raised });
    }
  });

  socket.on('afk-status', ({ roomId, afk }) => {
    socket.to(roomId).emit('peer-afk', { socketId: socket.id, afk });
  });

  socket.on('soundboard-play', ({ roomId, soundId }) => {
    socket.to(roomId).emit('peer-soundboard-play', { socketId: socket.id, soundId });
  });

  // 🛡️ Admin & Moderation Controls (Creator Only)
  socket.on('toggle-lock', ({ roomId, locked }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isCreator = room.creator === socket.id;
    if (isCreator) {
      room.locked = locked;
      io.to(roomId).emit('room-lock-changed', { locked });
      saveRoomsToDisk();
    }
  });

  socket.on('toggle-permission', ({ roomId, permission, value }) => {
    const room = rooms.get(roomId);
    if (room && room.creator === socket.id) {
      room.permissions[permission] = value;
      io.to(roomId).emit('permissions-updated', { permissions: room.permissions });
      saveRoomsToDisk();
    }
  });

  socket.on('transfer-creator', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (room && room.creator === socket.id && room.users.has(targetId)) {
      room.creator = targetId;
      io.to(roomId).emit('new-creator', { socketId: targetId });
      saveRoomsToDisk();
    }
  });

  socket.on('kick-user', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isCreator = room.creator === socket.id;
    if (isCreator && room.users.has(targetId)) {
      io.to(targetId).emit('kicked', { roomId });
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.roomId = null;
      }
      clearWatcherFromShares(room, roomId, targetId);
      if (room.screenShares && room.screenShares[targetId]) {
        delete room.screenShares[targetId];
        io.to(roomId).emit('screen-share-stopped', { socketId: targetId });
      }
      if (room.deviceAudioShares && room.deviceAudioShares[targetId]) {
        delete room.deviceAudioShares[targetId];
        io.to(roomId).emit('device-audio-share-stopped', { socketId: targetId });
      }
      room.users.delete(targetId);
      io.to(roomId).emit('peer-left', { socketId: targetId });
    }
  });

  socket.on('force-mute', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isCreator = room.creator === socket.id;
    if (isCreator && room.users.has(targetId)) {
      const user = room.users.get(targetId);
      user.muted = true;
      user.forceMuted = true;
      io.to(roomId).emit('peer-muted', { socketId: targetId, muted: true, forced: true, forceMuted: true });
    }
  });

  socket.on('force-unmute', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isCreator = room.creator === socket.id;
    if (isCreator && room.users.has(targetId)) {
      const user = room.users.get(targetId);
      if (!user.forceMuted) return;
      user.muted = false;
      user.forceMuted = false;
      io.to(roomId).emit('peer-muted', { socketId: targetId, muted: false, forced: true, forceMuted: false });
    }
  });

  socket.on('leave-room', ({ roomId }) => {
    handleLeave(socket, roomId);
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      handleLeave(socket, socket.roomId);
    }
    console.log(`[Disconnect] ${socket.id}`);
  });

  // A departing socket might be watching someone else's stream — drop it
  // from that share's watcher count too, not just clean up its own share.
  function clearWatcherFromShares(room, roomId, socketId) {
    if (!room.screenShares) return;
    Object.values(room.screenShares).forEach(share => {
      if (share.watchers && share.watchers.delete(socketId)) {
        io.to(roomId).emit('watcher-count-updated', { sharerSocketId: share.socketId, count: share.watchers.size });
      }
    });
  }

  function handleLeave(sock, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.users.delete(sock.id);
    sock.leave(roomId);
    sock.roomId = null;

    clearWatcherFromShares(room, roomId, sock.id);

    // Clear screen share if the sharer left
    if (room.screenShares && room.screenShares[sock.id]) {
      delete room.screenShares[sock.id];
      io.to(roomId).emit('screen-share-stopped', { socketId: sock.id });
    }
    if (room.deviceAudioShares && room.deviceAudioShares[sock.id]) {
      delete room.deviceAudioShares[sock.id];
      io.to(roomId).emit('device-audio-share-stopped', { socketId: sock.id });
    }

    io.to(roomId).emit('peer-left', { socketId: sock.id });

    if (room.users.size === 0) {
      // If it doesn't have a password or custom configurations, we can delete it from active memory,
      // but keep it in rooms.json if persistent config is needed.
      if (!room.password && room.banned.length === 0 && room.polls.length === 0 && room.history.length === 0) {
        rooms.delete(roomId);
        console.log(`[Room Deleted] ${roomId}`);
      } else {
        // Creator is unset when room is empty, first person to join will reclaim
        room.creator = null;
      }
      saveRoomsToDisk();
    } else if (sock.id === room.creator) {
      const newCreator = room.users.keys().next().value;
      room.creator = newCreator;
      io.to(roomId).emit('new-creator', { socketId: newCreator });
      saveRoomsToDisk();
    }

    console.log(`[Leave] ${sock.id} from ${roomId} (${room.users.size} users)`);
  }
});

server.listen(PORT, () => {
  console.log(`VoiceWave server running on port ${PORT}`);
});
