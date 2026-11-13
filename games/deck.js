// Lá bài: r = 1..13 (A=1, J=11, Q=12, K=13), s = 0..3 (♠ ♣ ♦ ♥)
const crypto = require('crypto');
function newDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ r, s, id: r * 4 + s });
  return shuffle(d);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
module.exports = { newDeck, shuffle };
