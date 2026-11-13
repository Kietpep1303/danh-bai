const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { log, name } = require('./games/util');

const GAMES = {
  xidach: require('./games/xidach'),
  baicao: require('./games/baicao'),
  tienlen: require('./games/tienlen'),
};
const TURN_MS = 60000;        // hết giờ một lượt
const OFFLINE_TURN_MS = 15000; // người mất kết nối thì chờ ngắn hơn
const ROOM_IDLE_MS = 30 * 60000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.send('ok'));
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 30000, pingInterval: 10000 });

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => {
  let c;
  do { c = Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (rooms.has(c));
  return c;
};
const rid = () => crypto.randomBytes(6).toString('hex');
const cleanName = n => String(n || '').trim().slice(0, 16) || 'Người chơi';

function viewFor(room, pid) {
  const tally = {};
  for (const c of Object.values(room.votes)) tally[c] = (tally[c] || 0) + 1;
  const r = room.round;
  const actor = r ? GAMES[r.game].actor(room) : null;
  return {
    code: room.code, me: pid, hostId: room.hostId,
    game: room.game, bet: room.bet, dealerMode: room.dealerMode, dealerId: room.dealerId,
    dealerRounds: room.dealerRounds, myVote: room.votes[pid] || null, tally,
    players: room.players.map(p => ({ id: p.id, name: p.name, points: p.points, connected: p.connected })),
    round: r ? GAMES[r.game].view(room, pid) : null,
    deadline: actor ? room.turnAt + (isOnline(room, actor) ? TURN_MS : OFFLINE_TURN_MS) : null,
    log: room.log.slice(-12), now: Date.now(),
  };
}
function isOnline(room, id) { const p = room.players.find(x => x.id === id); return p && p.connected; }
function broadcast(room) {
  const r = room.round;
  const actor = r ? GAMES[r.game].actor(room) : null;
  if (actor !== room.lastActor) { room.lastActor = actor; room.turnAt = Date.now(); }
  for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('state', viewFor(room, p.id));
}

function chooseDealer(room, order) {
  const prev = room.dealerId;
  if (room.dealerMode === 'vote') {
    const tally = {};
    for (const [voter, cand] of Object.entries(room.votes)) if (order.includes(voter) && order.includes(cand)) tally[cand] = (tally[cand] || 0) + 1;
    let top = null;
    for (const [c, n] of Object.entries(tally)) if (!top || n > tally[top]) top = c;
    const cur = order.includes(prev) ? prev : null;
    // giữ nhà cái hiện tại cho tới khi có người được nhiều phiếu hơn
    if (top && (!cur || tally[top] > (tally[cur] || 0))) room.dealerId = top;
    else room.dealerId = cur || order.find(id => id === room.hostId) || order[0];
  } else {
    if (!order.includes(prev) || room.dealerRounds >= 3) {
      const pool = order.length > 1 ? order.filter(id => id !== prev) : order;
      room.dealerId = pool[crypto.randomInt(pool.length)];
    }
  }
  if (room.dealerId !== prev) {
    room.dealerRounds = 0;
    log(room, `${name(room, room.dealerId)} lên làm cái`);
  }
  room.dealerRounds++;
}

function startRound(room) {
  const G = GAMES[room.game];
  const order = room.players.filter(p => p.connected).slice(0, G.max).map(p => p.id);
  if (order.length < G.min) return `Cần ít nhất ${G.min} người đang online`;
  if (G.usesDealer) chooseDealer(room, order);
  room.round = G.start(room, order, room.dealerId);
  return null;
}

io.on('connection', socket => {
  const reply = (cb, data) => typeof cb === 'function' && cb(data);
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    const p = room && room.players.find(x => x.id === socket.data.pid);
    return p ? { room, p } : {};
  };
  function attach(room, p, cb) {
    p.socketId = socket.id; p.connected = true; p.offAt = null;
    socket.data.code = room.code; socket.data.pid = p.id;
    socket.join(room.code);
    room.touched = Date.now();
    reply(cb, { ok: true, code: room.code, token: p.token });
    broadcast(room);
  }

  socket.on('create', (d = {}, cb) => {
    const game = GAMES[d.game] ? d.game : 'xidach';
    const room = {
      code: newCode(), hostId: null, game, bet: 10, dealerMode: 'vote', dealerId: null, dealerRounds: 0,
      votes: {}, players: [], round: null, log: [], touched: Date.now(), tlWinner: null,
    };
    const p = { id: rid(), token: rid() + rid(), name: cleanName(d.name), points: 0, connected: true };
    room.players.push(p); room.hostId = p.id;
    rooms.set(room.code, room);
    log(room, `${p.name} tạo phòng`);
    attach(room, p, cb);
  });

  socket.on('join', (d = {}, cb) => {
    const room = rooms.get(String(d.code || '').toUpperCase().trim());
    if (!room) return reply(cb, { error: 'Không tìm thấy phòng này. Kiểm tra lại mã.' });
    let p = d.token && room.players.find(x => x.token === d.token);
    if (p) {
      if (d.name) p.name = cleanName(d.name);
      return attach(room, p, cb);
    }
    if (room.players.length >= 20) return reply(cb, { error: 'Phòng đã đầy (20 người)' });
    p = { id: rid(), token: rid() + rid(), name: cleanName(d.name), points: 0, connected: true };
    room.players.push(p);
    log(room, `${p.name} vào phòng`);
    attach(room, p, cb);
  });

  socket.on('settings', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    if (p.id !== room.hostId) return reply(cb, { error: 'Chỉ chủ phòng đổi được' });
    if (room.round && room.round.phase !== 'done') return reply(cb, { error: 'Đợi hết ván rồi đổi' });
    if (d.game && GAMES[d.game] && d.game !== room.game) { room.game = d.game; room.round = null; log(room, `Đổi sang ${GAMES[d.game].title}`); }
    if (d.bet) room.bet = Math.max(1, Math.min(100000, Math.floor(Number(d.bet)) || 10));
    if (d.dealerMode === 'vote' || d.dealerMode === 'random3') {
      if (d.dealerMode !== room.dealerMode) { room.dealerMode = d.dealerMode; room.dealerRounds = 3; }
    }
    reply(cb, { ok: true }); broadcast(room);
  });

  socket.on('vote', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    if (!room.players.some(x => x.id === d.id)) return reply(cb, { error: 'Không có người này' });
    room.votes[p.id] = d.id;
    reply(cb, { ok: true }); broadcast(room);
  });

  socket.on('start', (_, cb) => {
    const { room, p } = ctx(); if (!room) return;
    if (room.round && room.round.phase !== 'done') return reply(cb, { error: 'Ván đang chơi' });
    if (p.id !== room.hostId && p.id !== room.dealerId) return reply(cb, { error: 'Chủ phòng hoặc nhà cái mới chia bài được' });
    const err = startRound(room);
    if (err) return reply(cb, { error: err });
    reply(cb, { ok: true }); broadcast(room);
  });

  socket.on('act', (a = {}, cb) => {
    const { room, p } = ctx(); if (!room || !room.round) return;
    const err = GAMES[room.round.game].act(room, p.id, a);
    if (err) return reply(cb, { error: err });
    room.touched = Date.now();
    room.lastActor = undefined; // reset đồng hồ sau mỗi thao tác
    reply(cb, { ok: true }); broadcast(room);
  });

  socket.on('kick', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    if (p.id !== room.hostId) return reply(cb, { error: 'Chỉ chủ phòng mời ra được' });
    const r = room.round;
    if (r && r.phase !== 'done' && r.order.includes(d.id)) return reply(cb, { error: 'Người này đang trong ván, đợi hết ván' });
    const t = room.players.find(x => x.id === d.id);
    if (!t || t.id === p.id) return;
    room.players = room.players.filter(x => x !== t);
    delete room.votes[t.id];
    for (const k of Object.keys(room.votes)) if (room.votes[k] === t.id) delete room.votes[k];
    if (t.socketId) io.to(t.socketId).emit('kicked');
    log(room, `${t.name} đã bị mời ra`);
    reply(cb, { ok: true }); broadcast(room);
  });

  socket.on('leave', () => {
    const { room, p } = ctx(); if (!room) return;
    p.connected = false; p.socketId = null; p.offAt = Date.now();
    socket.leave(room.code); socket.data = {};
    passHost(room); broadcast(room);
  });

  socket.on('disconnect', () => {
    const { room, p } = ctx(); if (!room || p.socketId !== socket.id) return;
    p.connected = false; p.socketId = null; p.offAt = Date.now();
    passHost(room); broadcast(room);
  });
});

function passHost(room) {
  const host = room.players.find(x => x.id === room.hostId);
  if (host && host.connected) return;
  const next = room.players.find(x => x.connected);
  if (next) { room.hostId = next.id; log(room, `${next.name} thành chủ phòng`); }
}

// Hết giờ lượt thì tự đi giùm; dọn phòng bỏ trống
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.players.some(p => p.connected)) {
      if (now - room.touched > ROOM_IDLE_MS) rooms.delete(room.code);
      continue;
    }
    room.touched = now;
    const r = room.round; if (!r) continue;
    const G = GAMES[r.game];
    const actor = G.actor(room); if (!actor) continue;
    const limit = isOnline(room, actor) ? TURN_MS : OFFLINE_TURN_MS;
    if (now - room.turnAt > limit) {
      try { G.auto(room, actor); } catch (e) { console.error(e); }
      room.lastActor = undefined;
      broadcast(room);
    }
  }
}, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Bàn bài đang chạy ở cổng ' + PORT));
