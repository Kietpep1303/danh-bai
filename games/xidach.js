const { newDeck } = require('./deck');
const { name, pay, log } = require('./util');
const Stars = require('./stars');

// Giá trị tốt nhất của bài xì dách. A: 2 lá = 11/10/1, 3 lá = 10/1, 4-5 lá = 1
function total(cards) {
  let base = 0, aces = 0;
  for (const c of cards) { if (c.r === 1) aces++; else base += Math.min(c.r, 10); }
  const opts = cards.length <= 2 ? [11, 10, 1] : cards.length === 3 ? [10, 1] : [1];
  let sums = [base];
  for (let i = 0; i < aces; i++) { const n = []; for (const s of sums) for (const o of opts) n.push(s + o); sums = n; }
  const ok = sums.filter(s => s <= 21);
  return ok.length ? Math.max(...ok) : Math.min(...sums);
}
// tier: 5 xì bàn, 4 xì dách, 3 ngũ linh, 2 thường, 0 quắc
function classify(cards) {
  const t = total(cards);
  if (cards.length === 2 && cards.every(c => c.r === 1)) return { tier: 5, mult: 3, label: 'Xì bàn', t };
  if (cards.length === 2 && cards.some(c => c.r === 1) && cards.some(c => c.r >= 10)) return { tier: 4, mult: 2, label: 'Xì dách', t };
  if (t > 21) return { tier: 0, mult: 1, label: 'Quắc', t };
  if (cards.length === 5) return { tier: 3, mult: 2, label: 'Ngũ linh', t };
  return { tier: 2, mult: 1, label: t + ' điểm', t };
}
// Kết quả của người chơi so với nhà cái: số dương = người chơi thắng bao nhiêu lần cược
function compare(p, d) {
  const a = classify(p), b = classify(d);
  if (a.tier === 0 && b.tier === 0) return 0;
  if (a.tier === 0) return -b.mult;
  if (b.tier === 0) return a.mult;
  if (a.tier !== b.tier) return a.tier > b.tier ? a.mult : -b.mult;
  if (a.tier >= 4) return 0;
  if (a.tier === 3) return a.t === b.t ? 0 : (a.t < b.t ? 2 : -2);
  return a.t === b.t ? 0 : (a.t > b.t ? 1 : -1);
}

function settle(room, r, pid) {
  const s = r.seats[pid];
  if (s.result != null) return;
  const m = compare(s.cards, r.seats[r.dealer].cards);
  s.result = m;
  s.revealed = true; // bài người bị xét lật ra; bài nhà cái chỉ người này thấy (xem view)
  pay(room, m > 0 ? r.dealer : pid, m > 0 ? pid : r.dealer, Math.abs(m) * room.bet);
  const lbl = classify(s.cards).label;
  // sao: bên thắng +1 và cướp số sao bằng hệ số thắng (thường 1, xì dách/ngũ linh 2, xì bàn 3)
  if (m > 0) { Stars.add(room, r, pid, 1); Stars.steal(room, r, pid, r.dealer, m, `thắng cái, ${lbl}`); }
  if (m < 0) { Stars.add(room, r, r.dealer, 1); Stars.steal(room, r, r.dealer, pid, -m, `cái ăn, ${classify(r.seats[r.dealer].cards).label}`); }
  log(room, m === 0 ? `${name(room, pid)} hòa nhà cái (${lbl})`
    : m > 0 ? `${name(room, pid)} thắng ${m * room.bet} (${lbl})`
      : `${name(room, pid)} thua ${-m * room.bet} (${lbl})`);
}
function players(r) { return r.order.filter(id => id !== r.dealer); }
function checkDone(r, room) {
  if (players(r).every(id => r.seats[id].result != null) && r.phase !== 'done') {
    r.phase = 'done'; r.turn = null;
    // chuỗi thắng: nhà con thắng cái; cái thắng nếu ăn nhiều nhà hơn thua
    if (room) {
      const won = players(r).filter(id => r.seats[id].result > 0);
      const dealerWin = players(r).filter(id => r.seats[id].result < 0).length > won.length;
      Stars.streaks(room, r, r.order, dealerWin ? [...won, r.dealer] : won);
    }
  }
}
function nextPlayer(r) {
  const ps = players(r);
  const idx = r.turn ? ps.indexOf(r.turn) : -1;
  for (let i = idx + 1; i < ps.length; i++) {
    const s = r.seats[ps[i]];
    if (s.result == null) { r.turn = ps[i]; return; }
  }
  r.phase = 'dealer'; r.turn = r.dealer;
}

module.exports = {
  title: 'Xì dách', min: 2, max: 8, usesDealer: true,
  start(room, order, dealer) {
    const deck = newDeck();
    const r = { game: 'xidach', phase: 'players', order, dealer, deck, seats: {}, turn: null };
    for (const id of order) r.seats[id] = { cards: [deck.pop(), deck.pop()], stood: false, revealed: false, result: null };
    Stars.begin(r);
    for (const id of order) Stars.deal(room, r, id, r.seats[id].cards);
    log(room, `Ván mới, ${name(room, dealer)} làm cái`);
    const dc = classify(r.seats[dealer].cards);
    if (dc.tier >= 4) {
      log(room, `Nhà cái có ${dc.label}!`);
      for (const id of players(r)) settle(room, r, id);
      checkDone(r, room);
      return r;
    }
    for (const id of players(r)) if (classify(r.seats[id].cards).tier >= 4) settle(room, r, id);
    checkDone(r, room);
    if (r.phase !== 'done') nextPlayer(r);
    return r;
  },
  act(room, pid, a) {
    const r = room.round;
    if (r.phase === 'done') return 'Ván đã xong';
    if (r.turn !== pid) return 'Chưa tới lượt bạn';
    const s = r.seats[pid];
    const c = classify(s.cards);
    if (r.phase === 'players') {
      if (a.type === 'hit') {
        if (s.cards.length >= 5 || c.t >= 21) return 'Không rút thêm được';
        s.cards.push(r.deck.pop());
        const n = classify(s.cards);
        if (n.tier === 0 || s.cards.length === 5) { s.stood = true; nextPlayer(r); }
        return;
      }
      if (a.type === 'stand') {
        if (c.t < 16 && s.cards.length < 5) return 'Chưa đủ 16 điểm, phải rút thêm';
        s.stood = true; nextPlayer(r); return;
      }
      return 'Thao tác không hợp lệ';
    }
    // lượt nhà cái
    if (a.type === 'hit') {
      if (s.cards.length >= 5 || c.tier === 0 || c.t >= 21) return 'Không rút thêm được';
      s.cards.push(r.deck.pop());
      const n = classify(s.cards);
      if (n.tier === 0) { log(room, 'Nhà cái quắc!'); for (const id of players(r)) settle(room, r, id); checkDone(r, room); }
      return;
    }
    if (a.type === 'check' || a.type === 'checkAll') {
      if (c.t < 15 && c.tier !== 0 && s.cards.length < 5) return 'Nhà cái cần ít nhất 15 điểm để xét';
      if (a.type === 'check') {
        if (!r.seats[a.target] || a.target === r.dealer) return 'Chọn người để xét';
        settle(room, r, a.target);
      } else for (const id of players(r)) settle(room, r, id);
      checkDone(r, room);
      return;
    }
    return 'Thao tác không hợp lệ';
  },
  actor(room) { const r = room.round; return r.phase === 'done' ? null : r.turn; },
  auto(room, pid) {
    const r = room.round; const s = r.seats[pid];
    if (r.phase === 'players') { s.stood = true; log(room, `${name(room, pid)} hết giờ, tự dằn`); nextPlayer(r); return; }
    log(room, 'Nhà cái hết giờ, tự rút và xét hết');
    for (let k = 0; k < 10 && r.phase === 'dealer'; k++) {
      const c = classify(s.cards);
      if (c.t < 15 && c.tier !== 0 && s.cards.length < 5) module.exports.act(room, pid, { type: 'hit' });
      else module.exports.act(room, pid, { type: 'checkAll' });
    }
  },
  view(room, me) {
    const r = room.round;
    const seats = r.order.map(id => {
      const s = r.seats[id];
      // bài nhà cái: chỉ nhà cái, người đã bị xét (đã so bài với cái) và cả bàn khi hết ván mới thấy
      const mine = r.seats[me];
      const show = id === r.dealer
        ? me === r.dealer || r.phase === 'done' || !!(mine && mine.result != null)
        : id === me || s.revealed || r.phase === 'done';
      return {
        id, count: s.cards.length, cards: show ? s.cards.map(c => Stars.withFx(r, c)) : null,
        info: show ? classify(s.cards).label : null,
        stood: s.stood, result: s.result,
      };
    });
    return { game: 'xidach', phase: r.phase, dealer: r.dealer, turn: r.turn, seats, steals: r.steals || [], starDelta: r.starDelta || {} };
  },
  _test: { total, classify, compare },
};
