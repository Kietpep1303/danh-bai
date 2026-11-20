// Poker Texas Hold'em kiểu sòng thật (No-Limit): mỗi người có chip riêng, tố bao nhiêu cũng được,
// có tất tay (all-in) và hũ phụ. Mù nhỏ = nửa mức cược, mù lớn = mức cược của phòng.
// Chip nằm ở player.chips (giữ qua các ván); điểm (player.points) vẫn cộng trừ theo lời lỗ mỗi ván.
const { newDeck } = require('./deck');
const { name, log } = require('./util');
const Stars = require('./stars');

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const RN = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' };
const rv = c => (c.r === 1 ? 14 : c.r);
const rname = v => RN[v] || String(v);

// ---------- Chấm điểm bài ----------
// Trả về mảng điểm [loại, ...lá phụ] để so từng phần tử; lớn hơn là mạnh hơn.
function eval5(cards) {
  const rs = cards.map(rv).sort((a, b) => b - a);
  const flush = cards.every(c => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightTop = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightTop = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straightTop = 5; // A-2-3-4-5
  }
  const cnt = {};
  for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const groups = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroup = groups.map(g => g[1]);
  if (straightTop && flush) return [8, straightTop];
  if (groups[0][0] === 4) return [7, ...byGroup];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroup];
  if (flush) return [5, ...rs];
  if (straightTop) return [4, straightTop];
  if (groups[0][0] === 3) return [3, ...byGroup];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroup];
  if (groups[0][0] === 2) return [1, ...byGroup];
  return [0, ...rs];
}
const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function best(cards) {
  let top = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
    const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
    const score = eval5(five);
    if (!top || cmp(score, top.score) > 0) top = { score, five };
  }
  return top;
}
function label(score) {
  const [k, a, b] = score;
  if (k === 8) return a === 14 ? 'Thùng phá sảnh lớn' : `Thùng phá sảnh ${rname(a)}`;
  if (k === 7) return `Tứ quý ${rname(a)}`;
  if (k === 6) return `Cù lũ ${rname(a)} ${rname(b)}`;
  if (k === 5) return `Thùng ${rname(a)}`;
  if (k === 4) return `Sảnh ${rname(a)}`;
  if (k === 3) return `Sám cô ${rname(a)}`;
  if (k === 2) return `Thú ${rname(a)} ${rname(b)}`;
  if (k === 1) return `Đôi ${rname(a)}`;
  return `Mậu thầu ${rname(a)}`;
}
function currentLabel(hole, board) {
  const all = [...hole, ...board];
  if (all.length >= 5) return label(best(all).score);
  const [x, y] = hole.map(rv).sort((a, b) => b - a);
  return x === y ? `Đôi ${rname(x)}` : `Mậu thầu ${rname(x)}`;
}

// ---------- Chip và hũ ----------
const startChips = room => room.pkStack || 1000;
const chipsOf = (room, p) => (p.chips == null ? startChips(room) : p.chips);
// tách hũ chính/hũ phụ theo mức góp của từng người (người bỏ bài vẫn góp nhưng không được ăn)
function buildPots(r) {
  const live = r.order.filter(id => !r.folded.includes(id));
  const levels = [...new Set(live.map(id => r.contrib[id]))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const L of levels) {
    const amount = r.order.reduce((s, id) => s + Math.max(0, Math.min(r.contrib[id], L) - prev), 0);
    if (amount > 0) pots.push({ amount, eligible: live.filter(id => r.contrib[id] >= L) });
    prev = L;
  }
  const total = r.order.reduce((s, id) => s + r.contrib[id], 0);
  const used = pots.reduce((s, p) => s + p.amount, 0);
  if (pots.length && total > used) pots[pots.length - 1].amount += total - used; // phần lẻ của người đã bỏ bài
  return pots;
}

// hũ chính/hũ phụ đang hình thành giữa ván: chỉ tách theo mức của người đã tất tay
function livePots(r) {
  const levels = [...new Set(r.order.filter(id => !r.folded.includes(id) && r.stack[id] === 0).map(id => r.contrib[id]))].sort((a, b) => a - b);
  if (!levels.length) return null;
  const pots = []; let prev = 0;
  for (const L of levels) { pots.push(r.order.reduce((s, id) => s + Math.max(0, Math.min(r.contrib[id], L) - prev), 0)); prev = L; }
  const rest = r.order.reduce((s, id) => s + Math.max(0, r.contrib[id] - prev), 0);
  if (rest > 0) pots.push(rest);
  return pots.filter(v => v > 0).length > 1 ? pots.filter(v => v > 0) : null;
}

// ---------- Vòng cược ----------
const canAct = (r, id) => !r.folded.includes(id) && r.stack[id] > 0;
const needsToAct = (r, id) => canAct(r, id) && (!r.acted.includes(id) || r.bets[id] < r.high);
function nextFrom(r, fromIdx, test) {
  const n = r.order.length;
  for (let k = 1; k <= n; k++) { const id = r.order[(fromIdx + k) % n]; if (test(id)) return id; }
  return null;
}
function put(r, id, amt) {
  amt = Math.min(amt, r.stack[id]);
  r.stack[id] -= amt; r.bets[id] += amt; r.contrib[id] += amt;
  return amt;
}
// trả lại phần cược không ai theo (người tố cao nhất góp nhiều hơn người thứ hai)
function returnUncalled(room, r) {
  const sorted = [...r.order].sort((a, b) => r.contrib[b] - r.contrib[a]);
  const [top, second] = sorted;
  const extra = r.contrib[top] - (second ? r.contrib[second] : 0);
  if (extra > 0) { r.contrib[top] -= extra; r.bets[top] -= extra; r.stack[top] += extra; }
}

function advance(room, r, fromId) {
  const live = r.order.filter(id => !r.folded.includes(id));
  if (live.length === 1) return finish(room, r, true);
  const next = nextFrom(r, r.order.indexOf(fromId), id => needsToAct(r, id));
  if (next) { r.turn = next; return; }
  // hết vòng cược. Nếu không còn quá 1 người tố được (những người kia tất tay) thì lật hết bài.
  const runOut = live.filter(id => r.stack[id] > 0).length <= 1;
  if (runOut && r.board.length < 5 && r.runFrom == null) r.runFrom = r.board.length;
  do {
    const i = STREETS.indexOf(r.phase);
    if (i === 3) return finish(room, r, false);
    r.phase = STREETS[i + 1];
    const deal = r.phase === 'flop' ? 3 : 1;
    for (let k = 0; k < deal; k++) r.board.push(r.deck.pop());
  } while (runOut);
  for (const id of r.order) { r.bets[id] = 0; if (canAct(r, id)) r.last[id] = null; }
  r.high = 0; r.minRaise = room.bet; r.acted = []; r.noReraise = [];
  r.turn = nextFrom(r, r.button, id => canAct(r, id));
  if (!r.turn) return advance(room, r, r.order[r.button]);
}

function finish(room, r, uncontested) {
  returnUncalled(room, r);
  const won = {};
  const live = r.order.filter(id => !r.folded.includes(id));
  if (uncontested) {
    const w = live[0];
    won[w] = r.order.reduce((s, id) => s + r.contrib[id], 0);
    r.winners = [w]; r.winLabel = null;
    r.pots = [{ amount: won[w], winners: [w] }];
    log(room, `${name(room, w)} ăn hũ ${won[w]} (mọi người bỏ bài)`);
  } else {
    while (r.board.length < 5) r.board.push(r.deck.pop());
    for (const id of live) { const b = best([...r.hands[id], ...r.board]); r.shown[id] = { score: b.score, label: label(b.score), five: b.five.map(c => c.id) }; }
    const leftOfButton = r.order.map((_, k) => r.order[(r.button + 1 + k) % r.order.length]);
    r.pots = buildPots(r).map(pot => {
      let top = null;
      for (const id of pot.eligible) if (!top || cmp(r.shown[id].score, top) > 0) top = r.shown[id].score;
      const ws = leftOfButton.filter(id => pot.eligible.includes(id) && cmp(r.shown[id].score, top) === 0);
      const share = Math.floor(pot.amount / ws.length);
      ws.forEach((id, k) => { won[id] = (won[id] || 0) + share + (k < pot.amount - share * ws.length ? 1 : 0); });
      return { amount: pot.amount, winners: ws, label: label(top) };
    });
    const main = r.pots[0];
    r.winners = [...new Set(r.pots.flatMap(p => p.winners))];
    r.winLabel = main.label;
    r.pots.forEach((p, i) => log(room, `${p.winners.map(id => name(room, id)).join(', ')} ăn ${i ? 'hũ phụ' : 'hũ'} ${p.amount} với ${p.label}`));
  }
  for (const id of r.order) {
    r.stack[id] += won[id] || 0;
    r.net[id] = (won[id] || 0) - r.contrib[id];
    const p = room.players.find(x => x.id === id);
    if (p) { p.points += r.net[id]; p.chips = r.stack[id]; }
  }
  // con nợ thắng ván thì tự trả nợ từ phần lời
  for (const debt of room.debts || []) {
    const win = r.net[debt.debtor];
    if (!(win > 0) || debt.amount <= 0) continue;
    const debtor = room.players.find(x => x.id === debt.debtor), lender = room.players.find(x => x.id === debt.lender);
    if (!debtor) continue;
    const pay = Math.min(debt.amount, win, debtor.chips);
    if (!pay) continue;
    debtor.chips -= pay; r.stack[debt.debtor] -= pay;
    if (lender) {
      lender.chips = (lender.chips == null ? startChips(room) : lender.chips) + pay;
      if (r.stack[lender.id] != null) r.stack[lender.id] += pay;
    }
    debt.amount -= pay;
    log(room, `${name(room, debt.debtor)} thắng ván, tự trả nợ ${name(room, debt.lender)} ${pay} chip${debt.amount ? `, còn nợ ${debt.amount}` : ', hết nợ!'}`);
  }
  if (room.debts) room.debts = room.debts.filter(x => x.amount > 0);
  // sao quy đổi từ chip lời lỗ: 10 mức mù lớn = 1⭐, có lời ít nhất +1⭐; mỗi ván được/mất tối đa 5⭐ (một hũ lớn không nhảy thẳng lên Kim cương)
  const unit = room.bet * 5;
  for (const id of r.order) {
    const net = r.net[id];
    const n = net > 0 ? Math.max(1, Math.floor(net / unit)) : net < 0 ? -Math.floor(-net / unit) : 0;
    Stars.add(room, r, id, Math.max(-3, Math.min(5, n + (r.winners && r.winners.includes(id) ? 1 : 0))));
  }
  Stars.streaks(room, r, r.order, r.order.filter(id => r.net[id] > 0));
  r.pot = r.order.reduce((s, id) => s + r.contrib[id], 0);
  r.phase = 'done'; r.turn = null;
  const broke = r.order.filter(id => r.stack[id] <= 0);
  if (broke.length) log(room, `${broke.map(id => name(room, id)).join(', ')} hết chip, phải ngồi xem (đi xin hoặc vay chip để chơi tiếp)`);
}

const api = {
  title: 'Poker', min: 2, max: 9, usesDealer: false,
  // chỉ chia bài cho người còn chip
  eligible(room, p) { return chipsOf(room, p) > 0; },
  start(room, order) {
    const n = order.length;
    const prev = order.indexOf(room.pkButton);
    const button = prev >= 0 ? (prev + 1) % n : 0;
    room.pkButton = order[button];
    const deck = newDeck();
    const r = {
      game: 'poker', phase: 'preflop', order, button, deck, board: [], hands: {}, stack: {},
      bets: {}, contrib: {}, last: {}, folded: [], acted: [], shown: {}, net: {},
      high: 0, minRaise: room.bet, winners: null, winLabel: null, pot: 0, pots: null, reveal: [], noReraise: [],
    };
    for (const id of order) {
      const p = room.players.find(x => x.id === id);
      r.stack[id] = chipsOf(room, p); p.chips = r.stack[id];
      r.hands[id] = [deck.pop(), deck.pop()]; r.bets[id] = 0; r.contrib[id] = 0; r.last[id] = null;
    }
    Stars.begin(r);
    for (const id of order) Stars.deal(room, r, id, r.hands[id]);
    const sb = n === 2 ? button : (button + 1) % n, bb = (sb + 1) % n;
    r.sb = order[sb]; r.bb = order[bb];
    const SB = Math.max(1, Math.floor(room.bet / 2)), BB = room.bet;
    put(r, r.sb, SB); r.last[r.sb] = r.stack[r.sb] ? 'Mù nhỏ' : 'Tất tay';
    put(r, r.bb, BB); r.last[r.bb] = r.stack[r.bb] ? 'Mù lớn' : 'Tất tay';
    r.high = Math.max(r.bets[r.sb], r.bets[r.bb]); r.minRaise = BB;
    r.turn = nextFrom(r, bb, id => needsToAct(r, id));
    log(room, `Ván poker mới, ${name(room, order[button])} cầm nút D`);
    if (!r.turn) advance(room, r, order[bb]);
    return r;
  },
  act(room, pid, a) {
    const r = room.round;
    if (a.type === 'show') {
      if (r.phase !== 'done') return 'Hết ván mới cho xem bài được';
      if (!r.order.includes(pid)) return 'Bạn không có trong ván này';
      if (!r.reveal.includes(pid)) { r.reveal.push(pid); log(room, `${name(room, pid)} lật bài cho cả bàn xem`); }
      return;
    }
    if (r.phase === 'done') return 'Ván đã xong';
    if (!r.order.includes(pid)) return 'Bạn không có trong ván này';
    if (r.turn !== pid) return 'Chưa tới lượt bạn';
    const toCall = r.high - r.bets[pid];
    const allInTo = r.bets[pid] + r.stack[pid];
    if (a.type === 'fold') {
      r.folded.push(pid); r.last[pid] = 'Bỏ bài';
      log(room, `${name(room, pid)} bỏ bài`);
    } else if (a.type === 'check') {
      if (toCall > 0) return `Phải theo ${toCall} hoặc bỏ bài`;
      r.acted.push(pid); r.last[pid] = 'Xem';
    } else if (a.type === 'call') {
      if (toCall <= 0) return 'Không có gì để theo, bấm Xem';
      const paid = put(r, pid, toCall);
      r.acted.push(pid);
      r.last[pid] = r.stack[pid] === 0 ? `Tất tay ${r.bets[pid]}` : `Theo ${paid}`;
      if (r.stack[pid] === 0) log(room, `${name(room, pid)} tất tay ${r.bets[pid]}`);
    } else if (a.type === 'raise' || a.type === 'allin') {
      // tố lên tổng mức "to" (tính cả phần đã bỏ vòng này)
      let to = a.type === 'allin' ? allInTo : Math.floor(Number(a.to));
      if (!Number.isFinite(to)) return 'Số chip không hợp lệ';
      if (to > allInTo) to = allInTo;
      if (to <= r.high) return toCall > 0 ? 'Muốn theo thì bấm Theo' : 'Phải tố nhiều hơn 0';
      const minTo = r.high + r.minRaise;
      if (to < minTo && to < allInTo) return `Tố ít nhất lên ${minTo}`;
      if (!r.order.some(id => id !== pid && canAct(r, id))) return 'Không còn ai để tố, chỉ theo được thôi';
      if (r.noReraise.includes(pid)) return 'Người trước tất tay chưa đủ mức tố, bạn chỉ được theo hoặc bỏ bài';
      put(r, pid, to - r.bets[pid]);
      const inc = to - r.high;
      const allIn = r.stack[pid] === 0;
      r.last[pid] = allIn ? `Tất tay ${to}` : r.high === 0 ? `Tố ${to}` : `Tố lên ${to}`;
      log(room, `${name(room, pid)} ${allIn ? 'tất tay' : r.high === 0 ? 'tố' : 'tố lên'} ${to}`);
      // tố đủ mức thì mọi người phải nói lại; tất tay thiếu mức thì người đã nói chỉ cần theo thêm
      if (inc >= r.minRaise) { r.minRaise = inc; r.acted = [pid]; r.noReraise = []; }
      else { r.noReraise = [...new Set([...r.noReraise, ...r.acted.filter(x => x !== pid)])]; r.acted.push(pid); }
      r.high = to;
    } else return 'Thao tác không hợp lệ';
    advance(room, r, pid);
  },
  actor(room) { const r = room.round; return r.phase === 'done' ? null : r.turn; },
  auto(room, pid) {
    const r = room.round;
    const check = r.high === r.bets[pid];
    api.act(room, pid, { type: check ? 'check' : 'fold' });
    log(room, `${name(room, pid)} hết giờ, tự ${check ? 'xem' : 'bỏ bài'}`);
  },
  view(room, me) {
    const r = room.round;
    const done = r.phase === 'done';
    const pot = r.order.reduce((s, id) => s + r.contrib[id], 0);
    const seats = r.order.map(id => {
      const folded = r.folded.includes(id);
      const sh = r.shown[id];
      return {
        id, count: folded ? 0 : 2, folded,
        cards: id === me || (done && (sh || r.reveal.includes(id))) ? r.hands[id].map(c => Stars.withFx(r, c)) : null, shown: done && (!!sh || r.reveal.includes(id)),
        info: sh ? sh.label : id === me && !folded ? currentLabel(r.hands[id], r.board) : null,
        best: sh && r.winners.includes(id) ? sh.five : null,
        bet: r.bets[id], last: r.last[id], chips: r.stack[id], allin: !folded && r.stack[id] === 0,
        net: done ? r.net[id] : null, win: done && r.winners.includes(id),
        btn: id === r.order[r.button], sb: id === r.sb, bb: id === r.bb,
      };
    });
    const inHand = r.order.includes(me);
    const myBet = inHand ? r.bets[me] : 0, myStack = inHand ? r.stack[me] : 0;
    const others = inHand && r.order.some(id => id !== me && canAct(r, id));
    const toCall = Math.max(0, Math.min(r.high - myBet, myStack));
    return {
      game: 'poker', phase: r.phase, turn: r.turn, dealer: null, seats,
      board: r.board, pot, high: r.high,
      toCall, callAllIn: inHand && r.high - myBet >= myStack && myStack > 0,
      minRaiseTo: Math.min(r.high + r.minRaise, myBet + myStack), maxRaiseTo: myBet + myStack,
      canRaise: !done && others && myStack > toCall && !r.noReraise.includes(me),
      winners: r.winners, winLabel: r.winLabel, steals: r.steals || [], starDelta: done ? r.starDelta || {} : {}, runFrom: done && r.runFrom != null ? r.runFrom : null,
      pots: done && r.pots ? r.pots.map(p => ({ amount: p.amount, winners: p.winners })) : null,
      sidePots: done ? null : livePots(r),
    };
  },
  _test: { eval5, best, label, cmp, currentLabel, buildPots },
};
module.exports = api;
