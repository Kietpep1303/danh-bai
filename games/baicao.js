const { newDeck } = require('./deck');
const { name, pay, log } = require('./util');
const Stars = require('./stars');

function classify(cards) {
  if (cards.every(c => c.r >= 11)) return { tier: 1, pts: 10, label: 'Ba tây' };
  const pts = cards.reduce((a, c) => a + Math.min(c.r, 10), 0) % 10;
  return { tier: 0, pts, label: pts === 0 ? 'Bù' : pts + ' nút' };
}
// Người chơi so với nhà cái. Ba tây thắng ăn gấp đôi.
function compare(p, d) {
  const a = classify(p), b = classify(d);
  if (a.tier !== b.tier) return a.tier > b.tier ? 2 : -2;
  if (a.pts === b.pts) return 0;
  return a.pts > b.pts ? 1 : -1;
}

module.exports = {
  title: 'Bài cào', min: 2, max: 17, usesDealer: true,
  start(room, order, dealer) {
    const deck = newDeck();
    const r = { game: 'baicao', phase: 'play', order, dealer, seats: {} };
    for (const id of order) r.seats[id] = { cards: [deck.pop(), deck.pop(), deck.pop()], flipped: false, result: null };
    Stars.begin(r);
    for (const id of order) Stars.deal(room, r, id, r.seats[id].cards);
    log(room, `Ván mới, ${name(room, dealer)} làm cái`);
    return r;
  },
  act(room, pid, a) {
    const r = room.round;
    if (r.phase === 'done') return 'Ván đã xong';
    const s = r.seats[pid];
    if (!s) return 'Bạn không có trong ván này';
    if (a.type === 'flip') { s.flipped = true; return; }
    if (a.type === 'reveal') {
      if (pid !== r.dealer) return 'Chỉ nhà cái mới lật hết được';
      const d = r.seats[r.dealer].cards;
      for (const id of r.order) {
        r.seats[id].flipped = true;
        if (id === r.dealer) continue;
        const m = compare(r.seats[id].cards, d);
        r.seats[id].result = m;
        pay(room, m > 0 ? r.dealer : id, m > 0 ? id : r.dealer, Math.abs(m) * room.bet);
        // sao: bên thắng +1 và cướp số sao bằng hệ số thắng (thường 1, ba tây 2)
        if (m > 0) { Stars.add(room, r, id, 1); Stars.steal(room, r, id, r.dealer, m, `thắng cái, ${classify(r.seats[id].cards).label}`); }
        if (m < 0) { Stars.add(room, r, r.dealer, 1); Stars.steal(room, r, r.dealer, id, -m, `cái ăn, ${classify(d).label}`); }
      }
      Stars.streaks(room, r, r.order, [...r.order.filter(id => r.seats[id].result > 0), ...(r.order.filter(id => r.seats[id].result < 0).length > r.order.filter(id => r.seats[id].result > 0).length ? [r.dealer] : [])]);
      const won = r.order.filter(id => r.seats[id].result < 0).length;
      const lost = r.order.filter(id => r.seats[id].result > 0).length;
      log(room, `Nhà cái ${classify(d).label}: ăn ${won} nhà, đền ${lost} nhà`);
      r.phase = 'done';
      return;
    }
    return 'Thao tác không hợp lệ';
  },
  actor(room) { const r = room.round; return r.phase === 'done' ? null : r.dealer; },
  auto(room, pid) { module.exports.act(room, pid, { type: 'reveal' }); },
  view(room, me) {
    const r = room.round;
    const seats = r.order.map(id => {
      const s = r.seats[id];
      const show = id === me || s.flipped;
      return { id, count: 3, cards: show ? s.cards.map(c => Stars.withFx(r, c)) : null, info: show ? classify(s.cards).label : null, flipped: s.flipped, result: s.result };
    });
    return { game: 'baicao', phase: r.phase, dealer: r.dealer, turn: r.phase === 'done' ? null : r.dealer, seats, steals: r.steals || [], starDelta: r.starDelta || {} };
  },
  _test: { classify, compare },
};
