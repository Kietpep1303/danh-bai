const { newDeck } = require('./deck');
const { name, pay, log } = require('./util');

// Thứ tự: 3 < 4 < ... < K < A < 2; chất ♠ < ♣ < ♦ < ♥
const rank = c => (c.r === 1 ? 14 : c.r === 2 ? 15 : c.r);
const val = c => rank(c) * 4 + c.s;
const sortHand = h => h.sort((a, b) => val(a) - val(b));

function analyze(cards) {
  const cs = [...cards].sort((a, b) => val(a) - val(b));
  const n = cs.length, rs = cs.map(rank);
  const top = val(cs[n - 1]), topRank = rs[n - 1];
  const mk = (type, len, label) => ({ type, len, top, topRank, label });
  if (n === 1) return mk('single', 1, 'lá lẻ');
  if (rs.every(r => r === rs[0])) {
    if (n === 2) return mk('pair', 2, 'Đôi');
    if (n === 3) return mk('triple', 3, 'Sám cô');
    if (n === 4) return mk('quad', 4, 'Tứ quý');
  }
  if (n >= 3 && topRank < 15 && rs.every((r, i) => i === 0 || r === rs[i - 1] + 1)) return mk('straight', n, `Sảnh ${n}`);
  if (n >= 6 && n % 2 === 0 && topRank < 15) {
    let ok = true;
    for (let i = 0; i < n; i += 2) {
      if (rs[i] !== rs[i + 1]) ok = false;
      if (i > 0 && rs[i] !== rs[i - 2] + 1) ok = false;
    }
    if (ok) return mk('pairs', n / 2, `${n / 2} đôi thông`);
  }
  return null;
}
// a có chặt / đè được b không
function canBeat(a, b) {
  if (!b) return true;
  if (a.type === b.type && a.len === b.len) return a.top > b.top;
  const heo = b.type === 'single' && b.topRank === 15;
  const doiHeo = b.type === 'pair' && b.topRank === 15;
  const ba = b.type === 'pairs' && b.len === 3;
  if (a.type === 'pairs' && a.len === 3) return heo;
  if (a.type === 'quad') return heo || doiHeo || ba;
  if (a.type === 'pairs' && a.len === 4) return heo || doiHeo || ba || b.type === 'quad';
  return false;
}
function toiTrang(hand) {
  const cnt = {};
  for (const c of hand) cnt[rank(c)] = (cnt[rank(c)] || 0) + 1;
  if (cnt[15] === 4) return 'Tứ quý heo';
  let dragon = true; for (let r = 3; r <= 14; r++) if (!cnt[r]) dragon = false;
  if (dragon) return 'Sảnh rồng';
  if (Object.values(cnt).reduce((a, v) => a + Math.floor(v / 2), 0) >= 6) return 'Sáu đôi';
  let run = 0;
  for (let r = 3; r <= 14; r++) { run = cnt[r] >= 2 ? run + 1 : 0; if (run >= 5) return 'Năm đôi thông'; }
  return null;
}
const RANK_PTS = { 2: [1, -1], 3: [2, 0, -2], 4: [3, 1, -1, -3] };

function finish(room, r) {
  const left = r.order.filter(id => r.hands[id].length > 0);
  // người còn bài: ít lá hơn xếp trên
  left.sort((a, b) => r.hands[a].length - r.hands[b].length);
  r.ranking = [...r.finished, ...left];
  const pts = RANK_PTS[r.order.length];
  r.ranking.forEach((id, i) => {
    const p = room.players.find(x => x.id === id);
    if (p) p.points += pts[i] * room.bet;
  });
  r.phase = 'done'; r.turn = null;
  room.tlWinner = r.ranking[0];
  log(room, `${name(room, r.ranking[0])} về nhất!`);
}
function nextWithCards(r, from) {
  const i0 = r.order.indexOf(from);
  for (let k = 1; k <= r.order.length; k++) {
    const id = r.order[(i0 + k) % r.order.length];
    if (r.hands[id].length > 0) return id;
  }
  return null;
}
function advance(room, r) {
  const active = r.order.filter(id => r.hands[id].length > 0);
  if (active.length <= 1) return finish(room, r);
  if (r.table) {
    const challengers = active.filter(id => id !== r.table.by && !r.passed.includes(id));
    if (challengers.length === 0) {
      let leader = r.table.by;
      if (r.hands[leader].length === 0) leader = nextWithCards(r, leader);
      r.table = null; r.passed = []; r.turn = leader;
      return;
    }
  }
  const i0 = r.order.indexOf(r.turn);
  for (let k = 1; k <= r.order.length; k++) {
    const id = r.order[(i0 + k) % r.order.length];
    if (r.hands[id].length > 0 && !r.passed.includes(id)) { r.turn = id; return; }
  }
}

const api = {
  title: 'Tiến lên', min: 2, max: 4, usesDealer: false,
  start(room, order) {
    const deck = newDeck();
    const r = { game: 'tienlen', phase: 'play', order, hands: {}, table: null, passed: [], finished: [], turn: null, require: null, lastPlay: null };
    for (const id of order) r.hands[id] = sortHand(deck.splice(0, 13));
    log(room, 'Ván tiến lên mới');
    // Tới trắng
    for (const id of order) {
      const t = toiTrang(r.hands[id]);
      if (t) {
        log(room, `${name(room, id)} tới trắng: ${t}!`);
        for (const o of order) if (o !== id) pay(room, o, id, 2 * room.bet);
        r.ranking = [id, ...order.filter(o => o !== id)];
        r.toiTrang = { by: id, label: t };
        r.phase = 'done'; room.tlWinner = id;
        return r;
      }
    }
    if (room.tlWinner && order.includes(room.tlWinner)) r.turn = room.tlWinner;
    else {
      // ván đầu: ai giữ lá nhỏ nhất (thường là 3 bích) đi trước và phải đánh lá đó
      let best = null;
      for (const id of order) { const c = r.hands[id][0]; if (!best || val(c) < val(best.c)) best = { id, c }; }
      r.turn = best.id; r.require = best.c.id;
    }
    return r;
  },
  act(room, pid, a) {
    const r = room.round;
    if (r.phase === 'done') return 'Ván đã xong';
    if (r.turn !== pid) return 'Chưa tới lượt bạn';
    const hand = r.hands[pid];
    if (a.type === 'pass') {
      if (!r.table) return 'Bạn đang được đánh trước, không bỏ lượt được';
      r.passed.push(pid);
      advance(room, r);
      return;
    }
    if (a.type !== 'play') return 'Thao tác không hợp lệ';
    const ids = Array.isArray(a.cards) ? [...new Set(a.cards)] : [];
    const cards = ids.map(id => hand.find(c => c.id === id));
    if (!cards.length || cards.some(c => !c)) return 'Chọn bài để đánh';
    if (r.require != null && !ids.includes(r.require)) return 'Lượt đầu phải đánh kèm lá nhỏ nhất của bạn';
    const combo = analyze(cards);
    if (!combo) return 'Bộ bài này không hợp lệ';
    if (!canBeat(combo, r.table && r.table.combo)) return 'Bộ này không chặn được bài trên bàn';
    // Chặt heo: người bị chặt đền tiền
    if (r.table && combo.type !== r.table.combo.type) {
      const heos = r.table.cards.filter(c => rank(c) === 15);
      const amt = heos.reduce((s, c) => s + (c.s >= 2 ? 2 : 1), 0) * room.bet;
      if (amt) {
        pay(room, r.table.by, pid, amt);
        log(room, `${name(room, pid)} chặt heo ${name(room, r.table.by)}, ăn ${amt}`);
      } else log(room, `${name(room, pid)} chặt ${combo.label}!`);
    }
    r.require = null;
    r.hands[pid] = hand.filter(c => !ids.includes(c.id));
    r.table = { by: pid, cards: sortHand(cards), combo };
    if (r.hands[pid].length === 0) { r.finished.push(pid); log(room, `${name(room, pid)} hết bài (về thứ ${r.finished.length})`); }
    advance(room, r);
  },
  actor(room) { const r = room.round; return r.phase === 'done' ? null : r.turn; },
  auto(room, pid) {
    const r = room.round;
    if (r.table) { api.act(room, pid, { type: 'pass' }); log(room, `${name(room, pid)} hết giờ, bỏ lượt`); return; }
    const c = r.require != null ? r.require : r.hands[pid][0].id;
    api.act(room, pid, { type: 'play', cards: [c] });
    log(room, `${name(room, pid)} hết giờ, tự đánh lá nhỏ nhất`);
  },
  view(room, me) {
    const r = room.round;
    return {
      game: 'tienlen', phase: r.phase, turn: r.turn,
      seats: r.order.map(id => ({
        id, count: r.hands[id].length,
        cards: id === me || r.phase === 'done' ? r.hands[id] : null,
        passed: r.passed.includes(id), place: r.finished.indexOf(id) + 1 || null,
      })),
      table: r.table ? { by: r.table.by, cards: r.table.cards, label: r.table.combo.label } : null,
      require: r.turn === me ? r.require : null,
      ranking: r.ranking || null, toiTrang: r.toiTrang || null,
    };
  },
  _test: { analyze, canBeat, toiTrang },
};
module.exports = api;
