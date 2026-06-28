const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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
const WARN_USERS = 15;

const rooms = new Map();

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
  console.log(`[Connect] ${socket.id}`);

  socket.on('join-room', ({ roomId, userName, muted, joinOnly, password, avatar }) => {
    if (!roomId || !userName || roomId.length > 10 || userName.length > 32) {
      socket.emit('room-not-found', { roomId });
      return;
    }

    // Validate avatar size (max 300KB base64 string)
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
        createdAt: Date.now()
      };
      rooms.set(roomId, room);
    }

    if (room.password && room.password !== password && joinOnly) {
      socket.emit('room-requires-password', { roomId });
      return;
    }

    if (room.password && room.password !== password && !joinOnly) {
      socket.emit('room-requires-password', { roomId });
      return;
    }

    if (room.password && password && room.password !== password) {
      socket.emit('room-wrong-password', { roomId });
      return;
    }

    if (room.users.size >= MAX_USERS) {
      socket.emit('room-full', { roomId, maxUsers: MAX_USERS });
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;

    const userCount = room.users.size + 1;

    if (userCount >= WARN_USERS && userCount < MAX_USERS) {
      io.to(roomId).emit('room-warning', { count: userCount, max: MAX_USERS, message: `Room has ${userCount} members. Quality may degrade after ${MAX_USERS}.` });
    }

    const peers = [];
    room.users.forEach((user, id) => {
      peers.push({ socketId: id, name: user.name, muted: user.muted, isCreator: id === room.creator, avatar: user.avatar || null });
    });

    room.users.set(socket.id, { name: userName, muted: muted || false, avatar: validAvatar });
    socket.emit('room-joined', {
      roomId,
      peers,
      isCreator: socket.id === room.creator,
      creatorSocketId: room.creator,
      hasPassword: !!room.password
    });

    socket.to(roomId).emit('peer-joined', {
      socketId: socket.id,
      name: userName,
      muted: muted || false,
      isCreator: socket.id === room.creator,
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

  socket.on('user-muted', ({ roomId, muted }) => {
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      room.users.get(socket.id).muted = muted;
      socket.to(roomId).emit('peer-muted', { socketId: socket.id, muted });
    }
  });

  socket.on('chat-message', (data) => {
    const { roomId } = data;
    io.to(roomId).emit('chat-message', {
      ...data,
      socketId: socket.id
    });
  });

  socket.on('delete-chat-message', ({ roomId, msgId }) => {
    const room = rooms.get(roomId);
    const isCreator = room && room.creator === socket.id;
    io.to(roomId).emit('chat-message-deleted', {
      msgId,
      deletedBy: socket.id,
      isCreator
    });
  });

  socket.on('typing-start', ({ roomId }) => {
    socket.to(roomId).emit('typing-start', { socketId: socket.id });
  });

  socket.on('typing-stop', ({ roomId }) => {
    socket.to(roomId).emit('typing-stop', { socketId: socket.id });
  });

  socket.on('afk-status', ({ roomId, afk }) => {
    socket.to(roomId).emit('peer-afk', { socketId: socket.id, afk });
  });

  socket.on('soundboard-play', ({ roomId, soundId }) => {
    socket.to(roomId).emit('peer-soundboard-play', { socketId: socket.id, soundId });
  });

  socket.on('kick-user', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (room && room.creator === socket.id && room.users.has(targetId)) {
      io.to(targetId).emit('kicked', { roomId });
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.roomId = null;
      }
      room.users.delete(targetId);
      io.to(roomId).emit('peer-left', { socketId: targetId });
    }
  });

  socket.on('force-mute', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (room && room.creator === socket.id && room.users.has(targetId)) {
      room.users.get(targetId).muted = true;
      io.to(roomId).emit('peer-muted', { socketId: targetId, muted: true, forced: true });
    }
  });

  socket.on('force-unmute', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (room && room.creator === socket.id && room.users.has(targetId)) {
      room.users.get(targetId).muted = false;
      io.to(roomId).emit('peer-muted', { socketId: targetId, muted: false, forced: true });
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

  function handleLeave(sock, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.users.delete(sock.id);
    sock.leave(roomId);
    sock.roomId = null;

    io.to(roomId).emit('peer-left', { socketId: sock.id });

    if (room.users.size === 0) {
      rooms.delete(roomId);
      console.log(`[Room Deleted] ${roomId}`);
    } else if (sock.id === room.creator) {
      const newCreator = room.users.keys().next().value;
      room.creator = newCreator;
      io.to(roomId).emit('new-creator', { socketId: newCreator });
    }

    console.log(`[Leave] ${sock.id} from ${roomId} (${room.users.size} users)`);
  }
});

server.listen(PORT, () => {
  console.log(`VoiceWave server running on port ${PORT}`);
});
