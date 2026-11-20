// Bộ icon vẽ tay kiểu manga/chibi: nét mực đen dày, màu phẳng, mắt long lanh, má hồng.
// Dùng thay emoji của hệ điều hành để mọi máy nhìn giống nhau và hợp giao diện truyện tranh.
(() => {
  const K = '#111', SKIN = '#ffd9b3', YEL = '#ffd84a';
  const st = (w = 3) => `stroke="${K}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const P = (d, fill = 'none', w = 3) => `<path d="${d}" fill="${fill}" ${st(w)}/>`;
  const C = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${st()}/>`;
  const Ell = (x, y, rx, ry, fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${st()}/>`;
  const line = (d, color, w = 3) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  // mắt anime: tròng đen cao, hai đốm sáng
  const eye = (x, y, s = 1) => `<ellipse cx="${x}" cy="${y}" rx="${2.9 * s}" ry="${4 * s}" fill="${K}"/><circle cx="${x + 1.1 * s}" cy="${y - 1.5 * s}" r="${1.3 * s}" fill="#fff"/><circle cx="${x - 1 * s}" cy="${y + 1.6 * s}" r="${.6 * s}" fill="#fff"/>`;
  const eyes = (y, gap = 8, s = 1, cx = 32) => eye(cx - gap, y, s) + eye(cx + gap, y, s);
  const blush = (y, gap = 15, cx = 32) => `<ellipse cx="${cx - gap}" cy="${y}" rx="3.6" ry="2.1" fill="#ff8fab" opacity=".9"/><ellipse cx="${cx + gap}" cy="${y}" rx="3.6" ry="2.1" fill="#ff8fab" opacity=".9"/>`;
  const smile = (x, y, w = 6) => P(`M${x - w / 2} ${y}q${w / 2} ${w * .6} ${w} 0`, 'none', 2.6);
  const shine = d => line(d, '#fff', 3);
  const face = fill => C(32, 34, 25, fill) + shine('M15 27q3-9 12-12');
  const tear = (x, y) => P(`M${x} ${y}q-4 6 0 9q4-3 0-9z`, '#5ec8ff', 2.2);

  const I = {};
  // ---- đồ ném ----
  I['💩'] = P('M22 30q-1-8 8-9q5-1 6-8q7 5 5 11q6 0 6 6z', '#a0602e')
    + P('M14 42q-1-10 9-11h18q10 1 9 11z', '#a0602e')
    + P('M8 53q-2-11 10-12h28q12 1 10 12q-1 4-6 4H14q-5 0-6-4z', '#a0602e')
    + shine('M26 26q2-3 6-4') + shine('M18 36q2-2 6-2')
    + eyes(47, 8, 1) + blush(52, 15) + smile(32, 51, 6);
  I['🍅'] = Ell(32, 38, 24, 20, '#ff4d4d') + shine('M14 32q3-8 11-10')
    + P('M32 13l3 6 8-3-5 6 6 4-10-2-2 5-2-5-10 2 6-4-5-6 8 3z', '#4caf50', 2.5) + P('M32 13v-6', 'none', 3)
    + eyes(40, 8) + blush(45, 15) + smile(32, 45, 6);
  I['🥚'] = line('M7 22q-3-4 0-7q3-4 0-8M57 22q3-4 0-7q-3-4 0-8', '#7cb342', 2.6)
    + P('M32 8C46 8 54 30 54 40C54 52 44 58 32 58C20 58 10 52 10 40C10 30 18 8 32 8z', '#fffbe6')
    + `<ellipse cx="22" cy="48" rx="4" ry="3" fill="#c5e1a5"/><ellipse cx="44" cy="22" rx="3" ry="2.4" fill="#c5e1a5"/>`
    + P('M15 28l5 4 4-4 5 5 4-4 5 4 4-4 5 4', 'none', 2.4)
    + P('M20 37l6 6M26 37l-6 6M38 37l6 6M44 37l-6 6', 'none', 2.6)
    + P('M24 50q2-2 4 0t4 0 4 0 4 0', 'none', 2.4);
  I['🩴'] = `<g transform="rotate(-24 32 32)">`
    + P('M21 6q11-4 22 0q4 14 1 28q-2 12 0 20q-2 6-12 6t-12-6q2-8 0-20q-3-14 1-28z', '#e9f5ff')
    + P('M19 10q13-6 26 0q2 12 0 22q-13 5-26 0q-2-10 0-22z', '#8fd0ff')
    + [0, 1, 2, 3].map(r => [0, 1, 2].map(c => `<circle cx="${24 + c * 8 + (r % 2) * 4 - 2}" cy="${14 + r * 5.5}" r="1.8" fill="#fff" stroke="${K}" stroke-width="1.2"/>`).join('')).join('')
    + `</g>` + line('M50 46l8 2M48 54l7 5M53 38l7-1', '#ffb300', 3);
  I['💣'] = `<circle cx="29" cy="38" r="21" fill="#2b2b2b" ${st()}/>` + shine('M15 32q3-9 11-12')
    + `<rect x="37" y="12" width="11" height="9" rx="2" fill="#666" ${st(2.6)} transform="rotate(40 42 16)"/>`
    + P('M46 13q5-7 10-3', 'none', 2.6)
    + P('M56 3l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z', '#ffd400', 2) + `<circle cx="56.5" cy="8.5" r="1.6" fill="#e60012"/>`
    + `<ellipse cx="21" cy="40" rx="3.6" ry="4.4" fill="#fff"/><ellipse cx="36" cy="40" rx="3.6" ry="4.4" fill="#fff"/><circle cx="22" cy="41" r="1.8" fill="${K}"/><circle cx="35" cy="41" r="1.8" fill="${K}"/>`
    + line('M15 32l9 4M42 32l-9 4M22 50q7-5 14 0', '#fff', 2.6);
  // ---- emoji ----
  I['🤡'] = C(10, 26, 8, '#3d8bff') + C(54, 26, 8, '#3d8bff') + face('#fff')
    + P('M23 20l3 6-3 6-3-6z', '#74b9ff', 1.6) + P('M41 20l3 6-3 6-3-6z', '#74b9ff', 1.6)
    + eyes(28, 9, .9) + C(32, 38, 5.5, '#e60012') + P('M17 43q15 15 30 0q-15 7-30 0z', '#e60012', 2.4);
  I['😜'] = face(YEL) + P('M18 29q5-5 10 0', 'none', 2.8) + eye(41, 28, 1.25) + blush(38, 16)
    + P('M21 41q11 9 22 0', 'none', 2.8) + P('M31 45q0 9 5 9t4-9z', '#ff6b81', 2.2);
  I['😂'] = face(YEL) + P('M17 25l8 4-8 4M47 25l-8 4 8 4', 'none', 3)
    + P('M19 39q13 2 26 0q-2 15-13 15T19 39z', '#8b1a1a', 2.6) + P('M25 49q7-5 14 0q-7 5-14 0z', '#ff6b81', 1.6)
    + tear(9, 29) + tear(55, 29);
  I['😡'] = face('#ff6b4a') + P('M14 22l12 6M50 22l-12 6', 'none', 4) + eyes(32, 9, .85)
    + `<rect x="21" y="41" width="22" height="9" rx="2" fill="#fff" ${st(2.6)}/>` + line('M28 41v9M36 41v9', K, 2)
    + line('M44 4q4 0 4 4M58 4q-4 0-4 4M44 16q4 0 4-4M58 16q-4 0-4-4', '#e60012', 3);
  I['👎'] = `<g transform="rotate(180 32 32)">${hand()}</g>` + line('M8 6v8M14 4v10M20 6v6', '#5b8def', 2.6);
  I['❤'] = P('M32 56C14 44 6 34 6 23C6 14 13 8 21 8C26 8 30 11 32 15C34 11 38 8 43 8C51 8 58 14 58 23C58 34 50 44 32 56z', '#ff3b5c')
    + `<ellipse cx="17" cy="19" rx="4" ry="2.5" fill="#fff" transform="rotate(-35 17 19)"/>`
    + eyes(28, 8, .95) + blush(34, 14) + smile(32, 34, 6);
  I['👍'] = hand() + line('M52 6l3 6M58 14l-6 2M48 4v4', '#ffb300', 3);
  I['👏'] = `<rect x="12" y="14" width="19" height="36" rx="9.5" fill="${SKIN}" ${st()} transform="rotate(-18 21 32)"/>`
    + `<rect x="33" y="14" width="19" height="36" rx="9.5" fill="${SKIN}" ${st()} transform="rotate(18 43 32)"/>`
    + line('M19 18l-2 7M25 16l-1 7M45 18l2 7M39 16l1 7', K, 2)
    + `<rect x="10" y="50" width="16" height="8" rx="2" fill="#4a90e2" ${st(2.6)} transform="rotate(-18 18 54)"/>`
    + `<rect x="38" y="50" width="16" height="8" rx="2" fill="#4a90e2" ${st(2.6)} transform="rotate(18 46 54)"/>`
    + line('M32 2v7M23 5l3 5M41 5l-3 5', '#ffb300', 3);
  I['🔥'] = P('M32 4C36 16 50 20 50 38C50 50 42 58 32 58C22 58 14 50 14 38C14 28 20 24 22 16C26 22 28 24 30 26C30 18 30 10 32 4z', '#ff7a1a')
    + P('M32 26C35 34 42 36 42 44C42 51 37 55 32 55C27 55 22 51 22 44C22 38 27 36 28 32C30 34 31 30 32 26z', '#ffd400', 2.4)
    + eyes(44, 4.5, .75) + smile(32, 49, 4);
  I['🌹'] = line('M32 34V60', K, 7) + line('M32 34V60', '#43a047', 3)
    + P('M32 49q-15-7-17 4q10 4 17-4z', '#4caf50', 2.4) + P('M32 44q13-6 15 3q-9 4-15-3z', '#4caf50', 2.4)
    + P('M14 21q0-15 18-15t18 15q0 15-18 15T14 21z', '#e8193c')
    + P('M32 13q6 2 4 8q-3 5-8 2q-3-4 1-6', 'none', 2.4) + P('M17 25q8 6 15 2M47 25q-8 6-15 2', 'none', 2.2)
    + shine('M19 14q3-4 7-5');
  I['🍺'] = line('M42 28h5q7 0 7 7v6q0 7-7 7h-5', K, 9) + line('M42 28h5q7 0 7 7v6q0 7-7 7h-5', '#ffe9a8', 3.4)
    + `<rect x="11" y="20" width="32" height="38" rx="5" fill="#ffc928" ${st()}/>`
    + line('M18 26v26M36 26v26', '#fff3c4', 3)
    + P('M9 23q-1-8 8-8q2-7 10-6q6-5 12 1q9-1 8 7q2 6-4 7H13q-6 0-4-1z', '#fff')
    + `<circle cx="24" cy="50" r="1.6" fill="#fff"/><circle cx="30" cy="46" r="1.2" fill="#fff"/>`
    + eyes(37, 5.5, .8) + smile(27, 43, 5);
  // ---- emoji cho chat ----
  I['😮'] = face(YEL) + P('M18 19q5-4 10-1M46 19q-5-4-10-1', 'none', 2.6) + eyes(28, 9, 1.25)
    + Ell(32, 45, 5, 6.5, '#8b1a1a') + tear(53, 18);
  I['😭'] = face(YEL) + P('M16 29q5-6 10 0M38 29q5-6 10 0', 'none', 2.8)
    + P('M17 31q-2 14-5 25h8q0-12 3-25z', '#5ec8ff', 2) + P('M47 31q2 14 5 25h-8q0-12-3-25z', '#5ec8ff', 2)
    + P('M24 46q8-9 16 0q-2 8-8 8t-8-8z', '#8b1a1a', 2.6);
  I['😢'] = face(YEL) + P('M17 22l8-3M47 22l-8-3', 'none', 2.6) + eyes(30, 8, 1.05)
    + P('M26 47q6-5 12 0', 'none', 2.8) + tear(23, 37);
  I['🎉'] = P('M8 58L20 22l22 22z', '#ffd400') + line('M13 44l12 10M17 32l16 14', '#e60012', 3)
    + line('M30 16q4-10 12-6M44 22q8-6 14 0M38 10q2-6 8-6', '#e60012', 2.6)
    + `<rect x="48" y="30" width="5" height="5" fill="#3d8bff" ${st(1.6)} transform="rotate(20 50 32)"/>`
    + `<rect x="26" y="4" width="5" height="5" fill="#4caf50" ${st(1.6)} transform="rotate(-20 28 6)"/>`
    + `<circle cx="54" cy="44" r="2.6" fill="#ff8fab" ${st(1.6)}/><circle cx="40" cy="30" r="2.2" fill="#ffd400" ${st(1.6)}/>`;
  // ---- giao diện ----
  I['😈'] = P('M13 19q-3-11 5-15q-1 8 7 10z', '#9b6bff', 2.6) + P('M51 19q3-11-5-15q1 8-7 10z', '#9b6bff', 2.6)
    + face('#9b6bff') + P('M17 25l9 4M47 25l-9 4', 'none', 3.4) + eyes(32, 8.5, .95)
    + P('M19 40q13 11 26 0', 'none', 2.8) + P('M23 43l2 4 2-3M41 43l-2 4-2-3', '#fff', 1.8) + blush(38, 17);
  I['💬'] = P('M8 14q0-8 8-8h32q8 0 8 8v20q0 8-8 8H28l-12 10 2-10h-2q-8 0-8-8z', '#fff')
    + `<circle cx="22" cy="24" r="3.2" fill="${K}"/><circle cx="32" cy="24" r="3.2" fill="${K}"/><circle cx="42" cy="24" r="3.2" fill="${K}"/>`;
  I['🔔'] = line('M3 18l6 3M2 29h7M61 18l-6 3M62 29h-7', K, 3)
    + C(32, 54, 5.5, '#c98a00')
    + P('M32 5q4 0 4 4q13 4 13 21v9l6 8H9l6-8v-9q0-17 13-21q0-4 4-4z', '#ffd400')
    + shine('M20 26q2-9 9-12') + eyes(32, 6.5, .85) + blush(37, 12) + smile(32, 38, 5);
  I['🧻'] = P('M10 16v32q0 7 18 7t18-7V16', '#fff') + Ell(28, 16, 18, 7, '#fff') + Ell(28, 16, 6, 2.6, '#cfcfcf')
    + P('M46 30h10v26l-3-3-3 3-4-3', '#fff', 2.6) + line('M16 30v14M22 34v14', '#e6e6e6', 2.4);
  I['🌧'] = P('M14 36q-9 0-9-8t9-8q2-11 13-11q8 0 12 6q2-2 6-2q10 0 10 10q6 2 6 7t-6 6z', '#fff')
    + line('M18 44l-3 8M30 44l-3 8M42 44l-3 8M24 54l-2 6M36 54l-2 6', '#3d8bff', 3.4);
  I['🔒'] = P('M22 28v-8q0-10 10-10t10 10v8', 'none', 5) + `<rect x="13" y="28" width="38" height="28" rx="5" fill="#ffd400" ${st()}/>`
    + `<circle cx="32" cy="40" r="3.6" fill="${K}"/><rect x="30.5" y="41" width="3" height="8" rx="1" fill="${K}"/>`;
  I['🔕'] = I['🔔'];
  // ---- chủ nợ / con nợ ----
  I['💰'] = P('M22 14l-4-8h28l-4 8', '#e0a43a', 2.6)
    + P('M22 14q-14 10-14 26 0 18 24 18t24-18q0-16-14-26z', '#f2b84b')
    + line('M22 14h20', K, 3) + P('M28 30q-6 0-6 5t6 5h8q6 0 6 5t-6 5h-8M32 25v30', 'none', 3)
    + shine('M16 36q1-8 7-13');
  I['⛓'] = `<g transform="rotate(-35 32 32)">`
    + `<rect x="4" y="24" width="22" height="16" rx="8" fill="none" ${st(4)}/><rect x="21" y="24" width="22" height="16" rx="8" fill="none" ${st(4)}/><rect x="38" y="24" width="22" height="16" rx="8" fill="none" ${st(4)}/>`
    + line('M10 28h10M44 28h10', '#bbb', 2) + `</g>`;
  I['🍵'] = line('M24 14q-4-5 0-9M32 13q-4-5 0-9M40 14q-4-5 0-9', '#9e9e9e', 2.6)
    + P('M10 24h44v6q0 22-22 22T10 30z', '#fff') + P('M12 27h40', 'none', 2.4)
    + `<ellipse cx="32" cy="26" rx="20" ry="3" fill="#8bc34a"/>` + P('M20 56h24', 'none', 4)
    + eyes(38, 6, .8) + blush(43, 12) + smile(32, 43, 5);
  I['🎤'] = P('M28 34l-12 24', 'none', 7) + line('M28 34l-12 24', '#666', 3)
    + C(36, 22, 14, '#9e9e9e') + line('M26 16q10-6 20 4M24 24q12-8 24 2', '#666', 2)
    + shine('M28 13q4-3 8-2') + line('M52 6l4-2M54 14h6M50 2l1-2', '#e60012', 2.6)
    + `<text x="50" y="36" font-size="14" font-weight="900" fill="#e60012">♪</text>`;
  I['🙇'] = P('M8 58q4-18 24-18t24 18', '#4a90e2') + C(32, 30, 15, SKIN)
    + P('M17 26q2-14 15-14t15 14q-6-6-15-6t-15 6z', '#333', 2.4)
    + P('M24 32q3 2 6 0M34 32q3 2 6 0', 'none', 2.4) + P('M29 38q3 2 6 0', 'none', 2.2)
    + tear(50, 18) + line('M6 20l5 3M58 22l-5 2', '#5ec8ff', 2.4);
  I['🙏'] = `<rect x="16" y="10" width="15" height="38" rx="7.5" fill="${SKIN}" ${st()} transform="rotate(10 23 29)"/>`
    + `<rect x="33" y="10" width="15" height="38" rx="7.5" fill="${SKIN}" ${st()} transform="rotate(-10 41 29)"/>`
    + `<rect x="14" y="48" width="36" height="10" rx="3" fill="#4a90e2" ${st(2.6)}/>` + line('M8 8l4 4M56 8l-4 4M32 2v5', '#ffb300', 3);
  I['🪭'] = P('M32 56L6 26q26-26 52 0z', '#ff8fab') + line('M32 56L14 18M32 56L32 12M32 56L50 18M32 56L6 26M32 56L58 26', K, 2)
    + P('M10 28q22-20 44 0', 'none', 2) + C(32, 56, 4, '#e60012') + line('M58 40q4 2 4 6M56 48q3 2 3 5', '#5ec8ff', 2.6);
  I['👊'] = `<rect x="12" y="18" width="34" height="30" rx="10" fill="${SKIN}" ${st()}/>`
    + line('M20 18v12M28 18v12M36 18v12', K, 2.2) + P('M12 36q8 0 12 6', 'none', 2.4)
    + `<rect x="44" y="24" width="10" height="20" rx="2" fill="#4a90e2" ${st(2.6)}/>` + line('M4 12l6 4M2 26h7M6 40l5-3', '#ffb300', 3);

  function hand() {
    return P('M23 30V14q0-8 7-8t6 8v15', SKIN)
      + `<rect x="13" y="27" width="34" height="29" rx="8" fill="${SKIN}" ${st()}/>`
      + line('M15 36h17M15 44h17M15 52h15', K, 2.4)
      + `<rect x="46" y="29" width="9" height="25" rx="2" fill="#4a90e2" ${st(2.6)}/>`;
  }

  const norm = s => String(s).replace(/️/g, '');
  const svg = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${I[k]}</svg>`;
  // ico('💩') -> svg; nếu không có icon thì trả về chính ký tự đó
  const ico = (e, cls) => { const k = norm(e); return I[k] ? svg(k, cls) : String(e); };
  const keys = Object.keys(I).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${keys.join('|')})\\uFE0F?`, 'gu');
  // chữ đã được escape HTML, thay các emoji có icon bằng svg
  const rich = escaped => escaped.replace(re, (_, k) => svg(k));
  window.ICONS = { ico, rich, has: e => !!I[norm(e)] };
})();
