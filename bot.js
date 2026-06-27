const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const FFMPEG_PATH = require('ffmpeg-static');

class MusicBot {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.tempDir = path.join(os.tmpdir(), 'voicewave-music');
    try { fs.mkdirSync(this.tempDir, { recursive: true }); } catch {}
  }

  getState(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        queue: [],
        nowPlaying: null,
        isPlaying: false,
        volume: 80,
        currentAudioData: null,
        playStartTime: null
      });
    }
    return this.rooms.get(roomId);
  }

  parseCommand(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('!')) return null;
    const parts = trimmed.slice(1).split(/\s+/);
    return { command: parts[0].toLowerCase(), args: parts.slice(1).join(' ') };
  }

  async handleCommand(socket, roomId, text, userName) {
    const parsed = this.parseCommand(text);
    if (!parsed) return false;
    const { command: cmd, args } = parsed;

    switch (cmd) {
      case 'play':
        if (!args) { this.sendBotMessage(roomId, 'Usage: !play <YouTube URL / search query / audio URL>'); break; }
        await this.addToQueue(socket, roomId, args, userName);
        break;
      case 'stop': this.stopPlayback(roomId); break;
      case 'skip': this.skipCurrent(roomId); break;
      case 'queue': case 'q': this.showQueue(roomId); break;
      case 'np': case 'nowplaying': this.showNowPlaying(roomId); break;
      case 'vol': case 'volume': this.setVolume(roomId, args); break;
      case 'shuffle': this.shuffleQueue(roomId); break;
      case 'clear': this.clearQueue(roomId); break;
      case 'help':
        this.sendBotMessage(roomId, [
          '**MusicBot Commands:**',
          '`!play <query>` — Play a song (YouTube URL, search, or audio URL)',
          '`!stop` — Stop playback & clear queue',
          '`!skip` — Skip current song',
          '`!queue` — Show queue',
          '`!np` — Now playing',
          '`!volume <0-100>` — Set volume',
          '`!shuffle` — Shuffle queue',
          '`!clear` — Clear queue'
        ].join('\n'));
        break;
      default: return false;
    }
    return true;
  }

  sendBotMessage(roomId, text) {
    this.io.to(roomId).emit('chat-message', {
      roomId,
      name: '🎵 MusicBot',
      text,
      timestamp: Date.now(),
      msgId: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  async addToQueue(socket, roomId, query, userName) {
    const state = this.getState(roomId);
    this.sendBotMessage(roomId, `🔍 Resolving: ${query}...`);

    try {
      const track = await this.resolveTrack(query);
      state.queue.push({ ...track, requestedBy: userName });
      this.sendBotMessage(roomId, `✅ Added: **${track.title}** (${track.duration || '?'})`);

      if (!state.isPlaying) {
        this.playNext(roomId);
      }
    } catch (err) {
      console.error('[Bot] Resolve error:', err.message);
      this.sendBotMessage(roomId, `❌ Error: ${err.message}`);
    }
  }

  async resolveTrack(query) {
    const ytRegex = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;
    const ytMatch = query.match(ytRegex);
    if (ytMatch) return this.resolveYouTube(`https://www.youtube.com/watch?v=${ytMatch[1]}`);

    if (query.match(/^https?:\/\/.+\.(mp3|wav|ogg|m4a|flac|aac|opus|wma)(\?.*)?$/i)) {
      const name = decodeURIComponent(path.basename(new URL(query).pathname));
      return { type: 'url', title: name, duration: '?', url: query };
    }

    return this.resolveYouTubeSearch(query);
  }

  async resolveYouTube(url) {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getInfo(url);
    return {
      type: 'youtube',
      title: info.videoDetails.title,
      duration: this.formatDuration(info.videoDetails.lengthSeconds),
      url: info.videoDetails.videoUrl || url,
      videoId: info.videoDetails.videoId
    };
  }

  async resolveYouTubeSearch(query) {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getInfo(`ytsearch:${query}`);
    const v = info.videoDetails;
    return {
      type: 'youtube',
      title: v.title,
      duration: this.formatDuration(v.lengthSeconds),
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      videoId: v.videoId
    };
  }

  formatDuration(sec) {
    const s = parseInt(sec) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  async playNext(roomId) {
    const state = this.getState(roomId);

    if (state.queue.length === 0) {
      state.isPlaying = false;
      state.nowPlaying = null;
      state.currentAudioData = null;
      this.io.to(roomId).emit('bot-track-end', { roomId });
      return;
    }

    const track = state.queue.shift();
    state.nowPlaying = track;
    state.isPlaying = true;

    this.sendBotMessage(roomId, `🎵 Now Playing: **${track.title}** ${track.duration !== '?' ? `(${track.duration})` : ''} — by ${track.requestedBy}`);
    this.io.to(roomId).emit('bot-now-playing', {
      roomId,
      track: { title: track.title, duration: track.duration, requestedBy: track.requestedBy }
    });

    try {
      const audioData = await this.downloadAudio(track);
      state.currentAudioData = audioData;
      state.playStartTime = Date.now();
      this.io.to(roomId).emit('bot-audio-data', {
        roomId,
        audioData,
        track: { title: track.title, duration: track.duration }
      });
    } catch (err) {
      console.error('[Bot] Download error:', err.message);
      this.sendBotMessage(roomId, `❌ Failed: ${err.message}`);
      this.playNext(roomId);
    }
  }

  downloadAudio(track) {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir, `vw-${Date.now()}.mp3`);
      const ffArgs = ['-f', 'mp3', '-ab', '128k', '-ar', '48000', '-ac', '1', '-y', outputPath];

      const onFfmpegClose = (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const data = fs.readFileSync(outputPath);
          const base64 = `data:audio/mpeg;base64,${data.toString('base64')}`;
          try { fs.unlinkSync(outputPath); } catch {}
          resolve(base64);
        } else {
          try { fs.unlinkSync(outputPath); } catch {}
          reject(new Error('FFmpeg conversion failed (code ' + code + ')'));
        }
      };

      if (track.type === 'youtube') {
        const ytdl = require('@distube/ytdl-core');
        const stream = ytdl(track.url, { filter: 'audioonly', quality: 'highestaudio' });
        const ff = spawn(FFMPEG_PATH, ['-i', 'pipe:0', ...ffArgs]);
        stream.pipe(ff.stdin);
        stream.on('error', (e) => { try { ff.kill(); } catch {} reject(e); });
        ff.on('close', onFfmpegClose);
        ff.on('error', reject);
      } else if (track.type === 'url') {
        const proto = track.url.startsWith('https') ? https : http;
        const followRedirect = (url) => {
          proto.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              followRedirect(res.headers.location);
              return;
            }
            const ff = spawn(FFMPEG_PATH, ['-i', 'pipe:0', ...ffArgs]);
            res.pipe(ff.stdin);
            ff.on('close', onFfmpegClose);
            ff.on('error', reject);
          }).on('error', reject);
        };
        followRedirect(track.url);
      } else {
        reject(new Error('Unsupported track type'));
      }
    });
  }

  stopPlayback(roomId) {
    const state = this.getState(roomId);
    state.isPlaying = false;
    state.nowPlaying = null;
    state.currentAudioData = null;
    state.queue = [];
    this.io.to(roomId).emit('bot-track-end', { roomId });
    this.sendBotMessage(roomId, '⏹️ Stopped & queue cleared');
  }

  skipCurrent(roomId) {
    const state = this.getState(roomId);
    if (!state.isPlaying) { this.sendBotMessage(roomId, 'Nothing playing to skip'); return; }
    this.io.to(roomId).emit('bot-track-end', { roomId });
    this.playNext(roomId);
  }

  showQueue(roomId) {
    const state = this.getState(roomId);
    if (state.queue.length === 0) { this.sendBotMessage(roomId, '📭 Queue is empty'); return; }
    const list = state.queue.map((t, i) => `**${i + 1}.** ${t.title} (${t.duration}) — ${t.requestedBy}`).join('\n');
    this.sendBotMessage(roomId, `📋 **Queue:**\n${list}`);
  }

  showNowPlaying(roomId) {
    const state = this.getState(roomId);
    if (!state.nowPlaying) { this.sendBotMessage(roomId, '🔇 Nothing playing'); return; }
    const t = state.nowPlaying;
    this.sendBotMessage(roomId, `🎵 **Now Playing:** ${t.title} ${t.duration !== '?' ? `(${t.duration})` : ''} — by ${t.requestedBy}`);
  }

  setVolume(roomId, args) {
    const vol = parseInt(args);
    if (isNaN(vol) || vol < 0 || vol > 100) { this.sendBotMessage(roomId, 'Usage: !volume <0-100>'); return; }
    this.getState(roomId).volume = vol;
    this.io.to(roomId).emit('bot-volume', { roomId, volume: vol });
    this.sendBotMessage(roomId, `🔊 Volume: ${vol}%`);
  }

  shuffleQueue(roomId) {
    const state = this.getState(roomId);
    if (state.queue.length <= 1) { this.sendBotMessage(roomId, 'Not enough tracks to shuffle'); return; }
    for (let i = state.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
    }
    this.sendBotMessage(roomId, '🔀 Queue shuffled');
  }

  clearQueue(roomId) {
    this.getState(roomId).queue = [];
    this.sendBotMessage(roomId, '🗑️ Queue cleared');
  }

  onTrackEnded(roomId) {
    const state = this.getState(roomId);
    state.currentAudioData = null;
    state.playStartTime = null;
    this.playNext(roomId);
  }

  cleanupRoom(roomId) {
    const state = this.rooms.get(roomId);
    if (state) {
      state.isPlaying = false;
      state.nowPlaying = null;
      state.currentAudioData = null;
      this.rooms.delete(roomId);
    }
  }
}

module.exports = MusicBot;
