function player(room, id) { return room.players.find(p => p.id === id); }
function name(room, id) { const p = player(room, id); return p ? p.name : '?'; }
function pay(room, fromId, toId, amount) {
  if (!amount) return;
  const a = player(room, fromId), b = player(room, toId);
  if (a) a.points -= amount;
  if (b) b.points += amount;
}
function log(room, msg) {
  room.log.push({ t: Date.now(), msg });
  if (room.log.length > 40) room.log.shift();
}
module.exports = { player, name, pay, log };
