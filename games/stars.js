// Sao, bậc và lá thưởng dùng chung cho mọi trò (chỉ để đẹp, không đổi luật, không đụng tiền/chip).
// Sao giữ trong phòng, đổi trò vẫn còn. Bậc (dễ lên, hợp chơi ngắn): Đồng 1, Bạc 3, Vàng 6, Kim cương 10 sao; bậc n được n lá thưởng mỗi ván.
// Thắng 3 ván liền: lá thưởng thành kiểu Lửa. Cướp được sao thì ván sau thêm 1 lá "chiến lợi phẩm" mang kiểu lá
// của người bị cướp (không giới hạn; tay bài không đủ lá thì giữ sang ván sau).
const { log } = require('./util');

const TIERS = [[10, 'holo'], [6, 'gold'], [3, 'silver'], [1, 'bronze']];
const player = (room, id) => room.players.find(x => x.id === id);
const stars = p => (p && p.tlStars) || 0;
const tierOf = n => { const i = TIERS.findIndex(([m]) => n >= m); return i < 0 ? { lvl: 0, style: null } : { lvl: 4 - i, style: TIERS[i][1] }; };

// đầu ván: chuẩn bị chỗ ghi sao, cướp, lá thưởng
function begin(r) { r.fx = {}; r.steals = []; r.starDelta = {}; }

function add(room, r, id, n) {
  const p = player(room, id); if (!p || !n) return 0;
  const before = stars(p);
  p.tlStars = Math.max(0, before + n);
  const d = p.tlStars - before;
  r.starDelta[id] = (r.starDelta[id] || 0) + d;
  return d;
}

// cướp n sao của victim cho thief
function steal(room, r, thief, victim, n, why) {
  const pv = player(room, victim), pt = player(room, thief);
  if (!pv || !pt || thief === victim || n <= 0) return 0;
  const got = Math.min(n, stars(pv));
  if (!got) return 0;
  const style = tierOf(stars(pv)).style || 'bronze';
  add(room, r, victim, -got); add(room, r, thief, got);
  pt.tlTrophies = [...(pt.tlTrophies || []), style];
  r.steals.push({ from: victim, to: thief, n: got, why });
  log(room, `${pt.name} cướp ${got} ⭐ của ${pv.name} (${why})`);
  return got;
}

// chuỗi thắng: người trong danh sách thắng +1, người còn lại về 0
function streaks(room, r, order, winners) {
  for (const id of order) { const p = player(room, id); if (p) p.tlStreak = winners.includes(id) ? (p.tlStreak || 0) + 1 : 0; }
}

// lúc chia bài: gắn kiểu lá thưởng cho một số lá ngẫu nhiên trên tay
function deal(room, r, id, cards) {
  const p = player(room, id); if (!p || !cards.length) return;
  const t = tierOf(stars(p));
  const all = [...Array(t.lvl).fill((p.tlStreak || 0) >= 3 ? 'fire' : t.style), ...(p.tlTrophies || [])];
  const n = Math.min(cards.length, all.length);
  // lá bậc đứng đầu (ván nào cũng có lại); chiến lợi phẩm chưa dùng tới vì tay bài ít lá thì giữ sang ván sau
  p.tlTrophies = all.slice(Math.max(n, t.lvl));
  [...cards].sort(() => Math.random() - .5).slice(0, n).forEach((c, k) => { r.fx[c.id] = all[k]; });
}

const withFx = (r, c) => (r && r.fx && c && r.fx[c.id] ? { ...c, fx: r.fx[c.id] } : c);

module.exports = { TIERS, stars, tierOf, begin, add, steal, streaks, deal, withFx };
