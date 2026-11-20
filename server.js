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
  poker: require('./games/poker'),
};
const TURN_MS = 60000;        // hết giờ một lượt
const OFFLINE_TURN_MS = 15000; // người mất kết nối thì chờ ngắn hơn
const ROOM_IDLE_MS = 30 * 60000;
const CHAT_KEEP = 60;          // số tin giữ lại mỗi phòng
const CHAT_MAX_LEN = 200;
const CHAT_RATE = { n: 6, ms: 10000 }; // tối đa 6 tin / 10 giây mỗi người
const RING_COOLDOWN_MS = 5000;         // mỗi người gõ chuông cách nhau ít nhất 5 giây
const TAUNT_RATE = { n: 30, ms: 3000 }; // ném đồ/thả emoji: tối đa 30 món / 3 giây mỗi người (cho spam thoải mái)
const TAUNTS = ['💩', '🍅', '🥚', '🩴', '💣', '🤡', '😜', '😂', '😡', '👎', '❤️', '👍', '👏', '🔥', '🌹', '🍺'];

const app = express();
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
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
    game: room.game, bet: room.bet, dealerMode: room.dealerMode, dealerId: room.dealerId, dealFx: room.dealFx,
    dealerRounds: room.dealerRounds, myVote: room.votes[pid] || null, tally,
    players: room.players.map(p => ({ id: p.id, name: p.name, points: p.points, connected: p.connected, chips: p.chips == null ? room.pkStack : p.chips, sitOut: !!p.sitOut })),
    pkStack: room.pkStack, debts: room.debts.filter(x => x.amount > 0),
    round: r ? { ...GAMES[r.game].view(room, pid), id: r.id } : null,
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
  const order = room.players.filter(p => p.connected && !p.sitOut && (!G.eligible || G.eligible(room, p))).slice(0, G.max).map(p => p.id);
  if (order.length < G.min) return `Cần ít nhất ${G.min} người đang online`;
  if (G.usesDealer) chooseDealer(room, order);
  room.round = G.start(room, order, room.dealerId);
  room.roundNo = (room.roundNo || 0) + 1;
  room.round.id = room.code + '-' + room.roundNo;
  return null;
}

io.on('connection', socket => {
  const reply = (cb, data) => typeof cb === 'function' && cb(data);
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    const p = room && room.players.find(x => x.id === socket.data.pid);
    return p ? { room, p } : {};
  };
  function attach(room, p, cb, tab) {
    if (tab) p.tab = String(tab).slice(0, 40);
    p.socketId = socket.id; p.connected = true; p.offAt = null;
    socket.data.code = room.code; socket.data.pid = p.id;
    socket.join(room.code);
    room.touched = Date.now();
    reply(cb, { ok: true, code: room.code, token: p.token });
    socket.emit('chat:history', room.chat);
    broadcast(room);
  }

  socket.on('create', (d = {}, cb) => {
    const game = GAMES[d.game] ? d.game : 'xidach';
    const room = {
      code: newCode(), hostId: null, game, bet: 10, dealerMode: 'vote', dealerId: null, dealerRounds: 0, dealFx: 'random', pkStack: 1000, debts: [], asks: [], askSeq: 0,
      votes: {}, players: [], round: null, log: [], chat: [], chatSeq: 0, touched: Date.now(), tlWinner: null,
    };
    const p = { id: rid(), token: rid() + rid(), name: cleanName(d.name), points: 0, connected: true };
    room.players.push(p); room.hostId = p.id;
    rooms.set(room.code, room);
    log(room, `${p.name} tạo phòng`);
    attach(room, p, cb, d.tab);
  });

  socket.on('join', (d = {}, cb) => {
    const room = rooms.get(String(d.code || '').toUpperCase().trim());
    if (!room) return reply(cb, { error: 'Không tìm thấy phòng này. Kiểm tra lại mã.' });
    let p = d.token && room.players.find(x => x.token === d.token);
    if (p) {
      // cùng một người nhưng đang mở ở tab/máy khác còn kết nối: không cho tab mới chiếm chỗ,
      // để người đó vào như một người chơi mới (hay gặp khi mở 2 tab trên cùng trình duyệt)
      const live = p.socketId && p.socketId !== socket.id && io.sockets.sockets.get(p.socketId);
      if (live && d.tab && p.tab && d.tab !== p.tab) {
        if (!d.name) return reply(cb, { error: 'Phòng này đang mở ở tab khác. Nhập tên để vào như một người chơi khác.', taken: true });
      } else {
        if (d.name) p.name = cleanName(d.name);
        return attach(room, p, cb, d.tab);
      }
    }
    if (room.players.length >= 20) return reply(cb, { error: 'Phòng đã đầy (20 người)' });
    p = { id: rid(), token: rid() + rid(), name: cleanName(d.name), points: 0, connected: true };
    room.players.push(p);
    log(room, `${p.name} vào phòng`);
    attach(room, p, cb, d.tab);
  });

  socket.on('settings', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    if (p.id !== room.hostId) return reply(cb, { error: 'Chỉ chủ phòng đổi được' });
    if (room.round && room.round.phase !== 'done') return reply(cb, { error: 'Đợi hết ván rồi đổi' });
    if (d.game && GAMES[d.game] && d.game !== room.game) { room.game = d.game; room.round = null; log(room, `Đổi sang ${GAMES[d.game].title}`); }
    if (d.bet) room.bet = Math.max(1, Math.min(100000, Math.floor(Number(d.bet)) || 10));
    if (['random', 'fly', 'spin', 'flip', 'arc', 'snap'].includes(d.dealFx)) room.dealFx = d.dealFx;
    if ([500, 1000, 2000, 5000].includes(d.pkStack)) room.pkStack = d.pkStack;
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
    if (room.game !== 'poker' && p.id !== room.hostId && p.id !== room.dealerId) return reply(cb, { error: 'Chủ phòng hoặc nhà cái mới chia bài được' });
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

  socket.on('chat', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    const text = String(d.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return reply(cb, { error: 'Tin nhắn trống' });
    const now = Date.now();
    p.chatTimes = (p.chatTimes || []).filter(t => now - t < CHAT_RATE.ms);
    if (p.chatTimes.length >= CHAT_RATE.n) return reply(cb, { error: 'Gửi chậm lại chút nha' });
    p.chatTimes.push(now);
    const msg = { id: ++room.chatSeq, pid: p.id, name: p.name, text, t: now };
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    room.touched = now;
    io.to(room.code).emit('chat', msg);
    reply(cb, { ok: true });
  });

  // Gõ chuông giục người đang tới lượt
  socket.on('ring', (_, cb) => {
    const { room, p } = ctx(); if (!room) return;
    const r = room.round;
    const actor = r && r.phase !== 'done' ? GAMES[r.game].actor(room) : null;
    if (!actor) return reply(cb, { error: 'Chưa tới lượt ai cả' });
    if (actor === p.id) return reply(cb, { error: 'Đang tới lượt bạn mà!' });
    const now = Date.now();
    if (now - (p.ringAt || 0) < RING_COOLDOWN_MS) return reply(cb, { error: 'Đợi chút rồi gõ tiếp nha' });
    p.ringAt = now;
    io.to(room.code).emit('ring', { from: p.id, to: actor, name: p.name });
    reply(cb, { ok: true });
  });

  // ---------- Xin / vay chip, chủ nợ sai vặt con nợ ----------
  // đang có bài trong ván poker chưa xong thì chip đang nằm trên bàn, không cho chuyển
  const inHand = (room, id) => room.round && room.round.game === 'poker' && room.round.phase !== 'done' && room.round.order.includes(id);
  const chipsOf = (room, p) => (p.chips == null ? room.pkStack : p.chips);
  socket.on('loan:ask', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    const t = room.players.find(x => x.id === d.to);
    const amount = Math.floor(Number(d.amount));
    const kind = d.kind === 'gift' ? 'gift' : 'loan';
    if (!t || t.id === p.id) return reply(cb, { error: 'Chọn người để ' + (kind === 'gift' ? 'xin' : 'vay') });
    if (!(amount >= 1 && amount <= 100000)) return reply(cb, { error: 'Số chip không hợp lệ' });
    if (chipsOf(room, t) < amount) return reply(cb, { error: `${t.name} không đủ ${amount} chip` });
    const now = Date.now();
    if (room.asks.some(a => a.from === p.id && now - a.t < 15000)) return reply(cb, { error: 'Đợi người ta trả lời đã' });
    room.asks = room.asks.filter(a => now - a.t < 60000 && a.from !== p.id);
    const ask = { id: ++room.askSeq, from: p.id, to: t.id, amount, kind, repay: kind === 'loan' ? Math.ceil(amount * 11 / 10) : 0, t: now };
    room.asks.push(ask);
    if (t.socketId) io.to(t.socketId).emit('loan:ask', { ...ask, name: p.name });
    log(room, `${p.name} ${kind === 'gift' ? 'xin' : 'hỏi vay'} ${t.name} ${amount} chip`);
    reply(cb, { ok: true }); broadcast(room);
  });
  socket.on('loan:reply', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    const ask = room.asks.find(a => a.id === d.id && a.to === p.id);
    if (!ask) return reply(cb, { error: 'Lời xin này hết hạn rồi' });
    const asker = room.players.find(x => x.id === ask.from);
    if (!asker) { room.asks = room.asks.filter(a => a !== ask); return reply(cb, { error: 'Người xin đã rời phòng' }); }
    const word = ask.kind === 'gift' ? 'cho xin' : 'cho vay';
    const tell = msg => { if (asker.socketId) io.to(asker.socketId).emit('loan:result', { msg }); };
    if (!d.ok) {
      room.asks = room.asks.filter(a => a !== ask);
      log(room, `${p.name} không ${word} ${asker.name}`);
      tell(`${p.name} không ${word}`);
      reply(cb, { ok: true }); return broadcast(room);
    }
    if (inHand(room, p.id) || inHand(room, asker.id)) return reply(cb, { error: 'Đợi hết ván poker rồi mới chuyển chip được' });
    if (chipsOf(room, p) < ask.amount) return reply(cb, { error: 'Bạn không đủ chip' });
    room.asks = room.asks.filter(a => a !== ask);
    p.chips = chipsOf(room, p) - ask.amount;
    asker.chips = chipsOf(room, asker) + ask.amount;
    if (ask.kind === 'loan') {
      const debt = room.debts.find(x => x.lender === p.id && x.debtor === asker.id);
      if (debt) debt.amount += ask.repay; else room.debts.push({ lender: p.id, debtor: asker.id, amount: ask.repay });
      log(room, `${p.name} cho ${asker.name} vay ${ask.amount} chip, phải trả ${ask.repay}`);
      tell(`${p.name} cho bạn vay ${ask.amount} chip (phải trả ${ask.repay}). Giờ bạn là con nợ!`);
    } else {
      log(room, `${p.name} cho ${asker.name} ${ask.amount} chip`);
      tell(`${p.name} cho bạn ${ask.amount} chip`);
    }
    reply(cb, { ok: true }); broadcast(room);
  });
  socket.on('loan:repay', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    const debt = room.debts.find(x => x.debtor === p.id && x.lender === d.lender && x.amount > 0);
    if (!debt) return reply(cb, { error: 'Bạn không nợ người này' });
    if (inHand(room, p.id)) return reply(cb, { error: 'Đợi hết ván rồi trả' });
    const pay = Math.min(debt.amount, chipsOf(room, p));
    if (pay <= 0) return reply(cb, { error: 'Bạn hết chip rồi, lấy gì trả' });
    const lender = room.players.find(x => x.id === debt.lender);
    if (lender && inHand(room, lender.id)) return reply(cb, { error: 'Chủ nợ đang chơi dở ván, đợi hết ván rồi trả' });
    p.chips = chipsOf(room, p) - pay;
    if (lender) lender.chips = chipsOf(room, lender) + pay;
    debt.amount -= pay;
    log(room, `${p.name} trả nợ ${lender ? lender.name : '?'} ${pay} chip${debt.amount ? `, còn nợ ${debt.amount}` : ', hết nợ!'}`);
    room.debts = room.debts.filter(x => x.amount > 0);
    reply(cb, { ok: true }); broadcast(room);
  });
  socket.on('loan:forgive', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    const debt = room.debts.find(x => x.lender === p.id && x.debtor === d.debtor);
    if (!debt) return reply(cb, { error: 'Người này không nợ bạn' });
    room.debts = room.debts.filter(x => x !== debt);
    log(room, `${p.name} xóa nợ cho ${(room.players.find(x => x.id === d.debtor) || {}).name || '?'}`);
    reply(cb, { ok: true }); broadcast(room);
  });
  // chủ nợ sai vặt con nợ (chỉ là hiệu ứng vui trên bàn)
  const ORDERS = ['quat', 'tra', 'dam', 'hat', 'cui', 'xinloi'];
  socket.on('order', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    if (!ORDERS.includes(d.kind)) return reply(cb, { error: 'Không có việc này' });
    const debt = room.debts.find(x => x.lender === p.id && x.debtor === d.to && x.amount > 0);
    if (!debt) return reply(cb, { error: 'Người này không nợ bạn, không sai được' });
    const now = Date.now();
    if (now - (p.orderAt || 0) < 2500) return reply(cb, { error: 'Từ từ, để con nợ làm xong đã' });
    p.orderAt = now;
    io.to(room.code).emit('order', { from: p.id, to: d.to, kind: d.kind });
    reply(cb, { ok: true });
  });

  socket.on('sitout', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    p.sitOut = !!d.on;
    log(room, `${p.name} ${p.sitOut ? 'nghỉ, không chơi ván sau' : 'vào chơi lại'}`);
    reply(cb, { ok: true }); broadcast(room);
  });

  socket.on('taunt', (d = {}, cb) => {
    const { room, p } = ctx(); if (!room) return;
    if (!TAUNTS.includes(d.item)) return reply(cb, { error: 'Không có món này' });
    const t = room.players.find(x => x.id === d.to);
    if (!t || t.id === p.id) return reply(cb, { error: 'Chọn người để ném' });
    const now = Date.now();
    p.tauntLog = (p.tauntLog || []).filter(t => now - t < TAUNT_RATE.ms);
    if (p.tauntLog.length >= TAUNT_RATE.n) return reply(cb, { error: 'Hết đạn, đợi xíu rồi ném tiếp' });
    p.tauntLog.push(now);
    io.to(room.code).emit('taunt', { from: p.id, to: t.id, item: d.item, name: p.name });
    reply(cb, { ok: true });
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
