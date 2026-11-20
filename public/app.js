(() => {
  const socket = io({ transports: ['websocket', 'polling'] });
  const app = document.getElementById('app');
  const { ico, rich } = window.ICONS; // icon vẽ kiểu manga thay cho emoji
  const SUITS = ['♠', '♣', '♦', '♥'];
  const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const GAMES = {
    xidach: { name: 'Xì dách', max: 8, dealer: true },
    baicao: { name: 'Bài cào', max: 17, dealer: true },
    tienlen: { name: 'Tiến lên', max: 4, dealer: false },
    poker: { name: 'Poker', max: 9, dealer: false },
  };
  let S = null;           // trạng thái phòng từ server
  let sel = new Set();    // lá đang chọn (tiến lên)
  let sheetOpen = false;
  // Nặn bài: lá nào đã vuốt ra, chồng bài đã mở lớp úp chưa
  let revealed = new Set(), pileOpen = null, justRevealed = null;
  try { const v = JSON.parse(sessionStorage.getItem('banbai-nan') || '{}'); revealed = new Set(v.rv || []); pileOpen = v.open || null; } catch {}
  const saveNan = () => { try { sessionStorage.setItem('banbai-nan', JSON.stringify({ rv: [...revealed].slice(-40), open: pileOpen })); } catch {} };
  // Hiệu ứng chia bài
  const seen = new Set(); let firstPaint = true;
  let dragging = false, pendingRender = false, autoTimer = null;
  let lastRoundId = null;
  const FX = { random: 'Ngẫu nhiên', fly: 'Bay thẳng', spin: 'Xoay tít', flip: 'Lật bay', arc: 'Vòng cung', snap: 'Búng nhanh' };
  const FX_LIST = ['fly', 'spin', 'flip', 'arc', 'snap'];
  // "Ngẫu nhiên": chọn theo mã ván để cả bàn thấy cùng một kiểu
  const fxFor = id => {
    if (S.dealFx && S.dealFx !== 'random') return S.dealFx;
    let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return FX_LIST[Math.abs(h) % FX_LIST.length];
  };

  // ---------- Âm thanh lá bài (tự tạo, không cần file) ----------
  let soundOn = (() => { try { return JSON.parse(localStorage.getItem('banbai') || '{}').sound !== false; } catch { return true; } })(), actx = null;
  const unlockAudio = () => {
    if (!soundOn) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {}
  };
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  function sfx(kind, when = 0) {
    if (!soundOn || !actx || actx.state !== 'running') return;
    const t = actx.currentTime + when / 1000;
    if (kind === 'bell') { // chuông "bon bon": hai tiếng gõ, mỗi tiếng gồm vài họa âm tắt dần
      const vol = when === -1 ? 0.5 : 0.22;
      const strike = t0 => [1, 2.76, 5.4].forEach((m, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = 660 * m;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol / (i + 1.2), t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i ? 0.45 : 1.1));
        o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 1.2);
      });
      const t0 = actx.currentTime; strike(t0); strike(t0 + 0.3);
      return;
    }
    if (kind === 'chat') { // tiếng "ting" nhỏ khi có tin nhắn
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.25);
      return;
    }
    if (kind === 'whoosh' || kind === 'splat' || kind === 'slam' || kind === 'chop') { // tiếng gió, tiếng bẹp, tiếng đập bài
      const L = { whoosh: 0.35, splat: 0.22, slam: 0.12, chop: 0.4 }[kind];
      const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * L), actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) { const x = i / d.length; d[i] = (Math.random() * 2 - 1) * (kind === 'whoosh' ? Math.sin(Math.PI * x) : Math.pow(1 - x, kind === 'chop' ? 2 : 3)); }
      const src = actx.createBufferSource(); src.buffer = buf;
      const f = actx.createBiquadFilter(), g = actx.createGain();
      if (kind === 'whoosh') { f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + L); g.gain.value = 0.18; }
      else { f.type = 'lowpass'; f.frequency.value = kind === 'splat' ? 900 : kind === 'chop' ? 1400 : 700; g.gain.value = kind === 'slam' ? 0.9 : 0.7; }
      src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t);
      if (kind === 'slam' || kind === 'chop') { // thêm tiếng "bộp" trầm
        const o = actx.createOscillator(), og = actx.createGain();
        o.frequency.setValueAtTime(kind === 'chop' ? 160 : 120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        og.gain.setValueAtTime(kind === 'chop' ? 0.6 : 0.35, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(og); og.connect(actx.destination); o.start(t); o.stop(t + 0.25);
      }
      return;
    }
    if (kind === 'pop') {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.09);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.2);
      return;
    }
    const len = kind === 'shuffle' ? 0.09 : 0.05;
    const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'shuffle' ? 2 : 4);
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = kind === 'flip' ? 2400 : kind === 'shuffle' ? 1500 : 3200; f.Q.value = 0.9;
    const g = actx.createGain(); g.gain.value = kind === 'shuffle' ? 0.25 : 0.4;
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t);
  }
  let offset = 0;         // lệch đồng hồ với server

  // Mỗi tab có mã riêng; vé vào phòng lưu theo tab (sessionStorage) để 2 tab cùng trình duyệt là 2 người khác nhau.
  const TAB = (() => { try { let t = sessionStorage.getItem('banbai-tab'); if (!t) { t = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('banbai-tab', t); } return t; } catch { return Math.random().toString(36).slice(2, 12); } })();
  const tabTicket = {
    get() { try { return JSON.parse(sessionStorage.getItem('banbai-ticket') || '{}'); } catch { return {}; } },
    set(v) { try { sessionStorage.setItem('banbai-ticket', JSON.stringify(v)); } catch {} },
  };
  const ticket = () => { const t = tabTicket.get(); if (t.code && t.token) return t; const s = store.get(); return { code: s.code, token: s.token }; };
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('banbai') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('banbai', JSON.stringify({ ...store.get(), ...v })); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pname = id => { const p = S && S.players.find(x => x.id === id); return p ? esc(p.name) : '?'; };
  let toastT;
  function toast(msg, html) {
    const t = document.getElementById('toast');
    if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function emit(ev, data) {
    return new Promise(res => socket.emit(ev, data, r => { if (r && r.error) toast(r.error); res(r || {}); }));
  }
  // phần trang trí bên trong lá thưởng theo từng kiểu
  const FX_INNER = {
    bronze: '<i class="fx-l"></i>', silver: '<i class="fx-l"></i>', gold: '<i class="fx-l"></i>',
    holo: '<i class="fx-l"></i><i class="fx-sp"></i><i class="fx-sp"></i><i class="fx-sp"></i>', fire: '<i class="fx-l"></i>',
  };
  // bậc theo số sao (khớp với server): Đồng 1, Bạc 3, Vàng 6, Kim cương 10
  const TIER_LIST = [[10, 'holo', 'Kim cương'], [6, 'gold', 'Vàng'], [3, 'silver', 'Bạc'], [1, 'bronze', 'Đồng']];
  const tierOf = n => { const t = TIER_LIST.find(([m]) => (n || 0) >= m); return t ? { style: t[1], name: t[2], lvl: 4 - TIER_LIST.indexOf(t) } : { style: null, name: 'Chưa có bậc', lvl: 0 }; };
  const nextTier = n => { const t = [...TIER_LIST].reverse().find(([m]) => (n || 0) < m); return t ? `còn ${t[0] - (n || 0)} ⭐ nữa lên ${t[2]}` : 'bậc cao nhất'; };
  const tierBadge = p => {
    if (!p || !p.stars) return '';
    const t = tierOf(p.stars);
    return ` <span class="badge tier ${t.style ? 't-' + t.style : 't-none'}" title="${t.name} · ${p.stars} sao · ${nextTier(p.stars)}">${p.streak >= 3 ? '🔥' : '★'}${p.stars}</span>`;
  };
  const card = (c, cls = '', attr = '') => c
    ? `<div class="card ${c.s >= 2 ? 'red' : ''} ${c.fx ? 'fx fx-' + c.fx : ''} ${cls}" data-id="${c.id}" ${attr}>${c.fx ? FX_INNER[c.fx] || '' : ''}<span class="cr">${RANKS[c.r] || c.r}<i>${SUITS[c.s]}</i></span><span class="cs">${SUITS[c.s]}</span></div>`
    : `<div class="card back ${cls}" ${attr}></div>`;
  // khóa để biết lá nào mới được chia: ván : ghế : thứ tự lá
  const dk = (r, j, id, i) => `data-k="${r.id}:${id}:${i}" data-i="${i}" data-j="${j}"`;
  const backs = n => Array.from({ length: n }, () => card(null)).join('');
  const money = m => m > 0 ? `<span class="win">+${m}</span>` : m < 0 ? `<span class="lose">${m}</span>` : `<span>Hòa</span>`;

  // ---------- Kết nối ----------
  socket.on('connect', () => {
    const s = ticket();
    const url = new URL(location.href).searchParams.get('r');
    if (s.code && s.token && (!url || url.toUpperCase() === s.code)) {
      emit('join', { code: s.code, token: s.token, tab: TAB }).then(r => {
        if (r.ok) return;
        if (!r.taken) { store.set({ code: null, token: null }); tabTicket.set({}); }
        S = null; render();
      });
    } else render();
  });
  socket.on('disconnect', () => render());
  socket.on('state', st => {
    if (S && S.round && st.round) {
      const mine = (st.round.seats.find(x => x.id === st.me) || {}).cards || [];
      const ids = new Set(mine.map(c => c.id));
      sel = new Set([...sel].filter(id => ids.has(id)));
    } else sel.clear();
    offset = st.now - Date.now();
    trackBeats(S, st);
    S = st; render();
  });
  socket.on('kicked', () => { store.set({ code: null, token: null, last: null }); tabTicket.set({}); S = null; resetChat(); toast('Bạn đã được mời ra khỏi phòng'); render(); });

  // ---------- Trò chuyện ----------
  // Khung chat nằm ngoài #app để mỗi lần bàn vẽ lại không làm mất chữ đang gõ.
  let chatMsgs = [], chatOpen = false, unread = 0;
  const bubbles = {}; // pid -> { text, until }
  const QUICK = ['👍', '😂', '😮', '😭', '😡', '🎉', 'Nhanh lên!', 'Bài đẹp quá', 'Chúc may mắn', 'Ván nữa!', 'Thua rồi 😢', 'Hay lắm!'];
  const chatEl = document.createElement('section');
  chatEl.className = 'chat'; chatEl.hidden = true;
  chatEl.setAttribute('aria-label', 'Trò chuyện');
  chatEl.innerHTML = `
    <div class="chat-head"><b>Trò chuyện</b><button class="btn small ghost" type="button" data-chat-close>Đóng</button></div>
    <div class="chat-list" role="log" aria-live="polite"></div>
    <div class="chat-quick">${QUICK.map(q => `<button type="button" data-q="${esc(q)}">${rich(esc(q))}</button>`).join('')}</div>
    <form class="chat-form">
      <input maxlength="200" autocomplete="off" enterkeyhint="send" placeholder="Nhắn gì đó…" aria-label="Tin nhắn">
      <button class="btn small" type="submit">Gửi</button>
    </form>`;
  document.body.appendChild(chatEl);
  const chatList = chatEl.querySelector('.chat-list');
  const chatInput = chatEl.querySelector('input');
  const hhmm = t => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  function msgNode(m, prev) {
    const mine = S && m.pid === S.me;
    const el = document.createElement('div');
    el.className = 'msg' + (mine ? ' mine' : '') + (prev && prev.pid === m.pid && m.t - prev.t < 120000 ? ' cont' : '');
    if (!mine) { const n = document.createElement('span'); n.className = 'msg-name'; n.textContent = m.name; el.appendChild(n); }
    const b = document.createElement('div'); b.className = 'msg-text'; b.innerHTML = rich(esc(m.text)); b.title = hhmm(m.t);
    if (/^\p{Extended_Pictographic}{1,3}$/u.test(m.text)) b.classList.add('big');
    el.appendChild(b);
    return el;
  }
  function paintChat() {
    chatList.innerHTML = '';
    if (!chatMsgs.length) { chatList.innerHTML = '<p class="chat-empty">Chưa có tin nhắn. Chào cả bàn một câu đi!</p>'; return; }
    chatMsgs.forEach((m, i) => chatList.appendChild(msgNode(m, chatMsgs[i - 1])));
    chatList.scrollTop = chatList.scrollHeight;
  }
  function setChatOpen(v) {
    chatOpen = v; chatEl.hidden = !v || !S;
    if (v) { unread = 0; paintChat(); if (matchMedia('(pointer: fine)').matches) chatInput.focus(); }
    render();
  }
  function resetChat() { chatMsgs = []; unread = 0; chatOpen = false; chatEl.hidden = true; for (const k in bubbles) delete bubbles[k]; }
  async function sendChat(text) {
    text = text.trim(); if (!text) return;
    const r = await emit('chat', { text });
    if (r.ok && text === chatInput.value.trim()) chatInput.value = '';
  }
  chatEl.querySelector('form').onsubmit = e => { e.preventDefault(); sendChat(chatInput.value); };
  chatEl.querySelectorAll('.chat-quick button').forEach(b => b.onclick = () => sendChat(b.dataset.q));
  chatEl.querySelector('[data-chat-close]').onclick = () => setChatOpen(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && chatOpen) setChatOpen(false); });
  // bàn phím điện thoại che khung chat: đẩy khung lên theo vùng nhìn thấy
  if (window.visualViewport) {
    const fit = () => chatEl.style.setProperty('--kb', Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px');
    visualViewport.addEventListener('resize', fit); visualViewport.addEventListener('scroll', fit);
  }
  socket.on('chat:history', list => { chatMsgs = Array.isArray(list) ? list : []; unread = 0; if (chatOpen) paintChat(); render(); });
  socket.on('chat', m => {
    if (chatMsgs.some(x => x.id === m.id)) return;
    const prev = chatMsgs[chatMsgs.length - 1];
    chatMsgs.push(m); if (chatMsgs.length > 100) chatMsgs.shift();
    if (chatOpen) {
      const atEnd = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 60;
      const empty = chatList.querySelector('.chat-empty'); if (empty) empty.remove();
      chatList.appendChild(msgNode(m, prev));
      if (atEnd || m.pid === (S && S.me)) chatList.scrollTop = chatList.scrollHeight;
    }
    const mine = S && m.pid === S.me;
    if (!mine) { if (!chatOpen) unread++; sfx('chat'); }
    bubbles[m.pid] = { text: m.text, until: Date.now() + 5000 };
    setTimeout(() => { if (bubbles[m.pid] && bubbles[m.pid].until <= Date.now()) { delete bubbles[m.pid]; render(); } }, 5100);
    // người gửi không có ghế trên bàn (đang ở sảnh chờ hoặc ngồi xem) thì báo bằng toast
    const onTable = S && S.round && S.round.seats.some(x => x.id === m.pid);
    if (!mine && !chatOpen && !onTable) toast(`${m.name}: ${m.text}`);
    render();
  });
  // ---------- Chuông giục đánh ----------
  const ringing = {}; // pid -> thời điểm hết rung
  socket.on('ring', ({ from, to, name }) => {
    const forMe = S && to === S.me;
    sfx('bell', forMe ? -1 : 0); // người bị giục nghe to hơn
    if (forMe) {
      if (navigator.vibrate) try { navigator.vibrate([90, 60, 90]); } catch {}
      toast(`${ico('🔔')} ${esc(name)} đang giục bạn đánh!`, true);
    }
    ringing[to] = Date.now() + 1100;
    render();
    setTimeout(() => { if (ringing[to] <= Date.now()) { delete ringing[to]; render(); } }, 1150);
  });
  const isRinging = id => ringing[id] > Date.now();
  const ringFx = id => isRinging(id) ? '<span class="ring-fx" aria-hidden="true">BON BON!</span>' : '';
  const bellBtn = (id, name) => `<button class="bell" data-ring title="Gõ chuông giục ${name}" aria-label="Gõ chuông giục ${name}">${ico('🔔')}</button>`;

  // ---------- Khiêu khích: ném đồ, thả emoji vào ghế người khác ----------
  // 💩 chỉ ném được vào người mình vừa "ăn" (chặn bài, chặt, thắng tiền). Các món khác ném lúc nào cũng được.
  const THROW = ['💩', '🍅', '🥚', '🩴', '💣'];
  const EMOJI = ['🤡', '😜', '😂', '😡', '👎', '❤️', '👍', '👏', '🔥', '🌹', '🍺'];
  const HARD = new Set(THROW);
  const POW = { '💩': 'PẸT!', '🍅': 'BẸP!', '🥚': 'BỐP!', '🩴': 'CHÁT!', '💣': 'BÙM!' };
  const beaten = {}; // pid -> hạn được ném 💩
  const canPoop = id => beaten[id] > Date.now() || isMyDebtor(id);
  const markBeat = (id, ms = 20000) => { if (id && (!S || id !== S.me)) { beaten[id] = Date.now() + ms; setTimeout(() => S && render(), ms + 50); } };
  // so state cũ và mới để biết mình vừa ăn ai
  function trackBeats(prev, st) {
    const a = prev && prev.round, b = st.round, me = st.me;
    if (!b) return;
    if (!a || a.id !== b.id) { for (const k in beaten) delete beaten[k]; }
    if (b.game === 'tienlen') {
      const pt = a && a.id === b.id ? a.table : null;
      if (b.table && b.table.by === me && pt && pt.by !== me && pt.cards[0].id !== b.table.cards[0].id) markBeat(pt.by);
      if (b.phase === 'done' && b.ranking && (!a || a.phase !== 'done')) {
        const i = b.ranking.indexOf(me);
        if (i >= 0) b.ranking.slice(i + 1).forEach(id => markBeat(id, 30000));
      }
    } else if (b.phase === 'done' && (!a || a.phase !== 'done' || a.id !== b.id)) {
      const mine = b.seats.find(x => x.id === me);
      if (!mine) return;
      if (b.game === 'poker') { if (mine.net > 0) b.seats.forEach(x => { if (x.net < 0) markBeat(x.id, 30000); }); return; }
      if (b.dealer === me) b.seats.forEach(x => { if (x.result < 0) markBeat(x.id, 30000); });
      else if (mine.result > 0) markBeat(b.dealer, 30000);
    }
  }
  const tauntBtn = (id, name) => `<button class="taunt-btn" data-taunt="${id}" title="Khiêu khích ${name}" aria-label="Khiêu khích ${name}">${ico('😈')}</button>`
    + (canPoop(id) ? `<button class="taunt-btn hot" data-taunt="${id}" data-item="💩" title="Bấm hoặc giữ để ném 💩 vào ${name}" aria-label="Ném phân vào ${name}">${ico('💩')}</button>` : '');

  // ném liên tục: bấm là ném, giữ thì ném liền tay
  let spamTimer = null;
  const stopSpam = () => { clearInterval(spamTimer); spamTimer = null; };
  function holdToSpam(el, to, item) {
    el.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      stopSpam(); sendTaunt(to, item);
      spamTimer = setInterval(() => sendTaunt(to, item), 110);
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    el.onpointerup = el.onpointercancel = el.onlostpointercapture = stopSpam;
    el.onclick = e => { e.stopPropagation(); if (e.detail === 0) sendTaunt(to, item); }; // bàn phím
  }
  function rain(to, item, n = 24) {
    let k = 0;
    const t = setInterval(() => { sendTaunt(to, item); if (++k >= n) clearInterval(t); }, 70);
  }

  // bảng chọn món ném, nằm ngoài #app nên không mất khi bàn vẽ lại
  const pop = document.createElement('div');
  pop.className = 'taunt-pop'; pop.hidden = true;
  document.body.appendChild(pop);
  let popFor = null;
  function openTaunt(id, btn) {
    popFor = id;
    const nm = pname(id), ok = canPoop(id), rainItem = ok ? '💩' : '🍅';
    const b = (it, dis) => `<button data-item="${it}" ${dis ? 'disabled title="Phải ăn được người này mới ném được"' : ''}>${ico(it)}${dis ? `<i>${ico('🔒')}</i>` : ''}</button>`;
    pop.innerHTML = `<div class="tp-head">Ném vào <b>${nm}</b> <span>giữ để ném liên tục</span></div>
      <div class="tp-grid">${THROW.map(it => b(it, it === '💩' && !ok)).join('')}</div>
      <button class="tp-rain" data-rain="${rainItem}">${ico('🌧')} Mưa ${ico(rainItem)} ×24</button>
      <div class="tp-grid emo">${EMOJI.map(it => b(it)).join('')}</div>
      ${ok ? '' : `<small>${ico('💩')} mở khi bạn ăn được hoặc cho người này vay</small>`}
      ${ordersHTML(id)}
      <button class="tp-forgive tp-mute" data-mute="${id}">${mutedP.has(id) ? '🔊 Nhận lại đồ ném từ ' : '🔇 Chặn đồ ném từ '}${nm}</button>`;
    pop.hidden = false;
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.bottom + 8 + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : r.bottom + 8;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    pop.querySelectorAll('[data-item]:not(:disabled)').forEach(e => holdToSpam(e, id, e.dataset.item));
    pop.querySelector('[data-rain]').onclick = e => { e.stopPropagation(); unlockAudio(); rain(id, e.currentTarget.dataset.rain); };
    pop.querySelectorAll('[data-order]').forEach(b => b.onclick = e => { e.stopPropagation(); unlockAudio(); emit('order', { to: id, kind: b.dataset.order }); });
    const fg = pop.querySelector('[data-forgive]');
    if (fg) fg.onclick = e => { e.stopPropagation(); closeTaunt(); askForgive(id); };
    pop.querySelector('[data-mute]').onclick = e => { e.stopPropagation(); closeTaunt(); toggleMute(id); };
  }
  const closeTaunt = () => { pop.hidden = true; popFor = null; stopSpam(); };
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-taunt]')) closeTaunt(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTaunt(); });
  let tauntAt = 0, outOfAmmo = 0;
  function sendTaunt(to, item) {
    unlockAudio();
    if (Date.now() - tauntAt < 60) return;
    tauntAt = Date.now();
    emit('taunt', { to, item }).then(r => {
      if (r && r.error && Date.now() - outOfAmmo > 2000) { outOfAmmo = Date.now(); stopSpam(); }
    });
  }
  // vị trí ghế của một người trên màn hình
  function seatEl(id) {
    let el = app.querySelector(`[data-pid="${id}"]`);
    if (!el && S && id === S.me) el = app.querySelector('.me-head') || app.querySelector('.hand');
    return el;
  }
  function seatRect(id) {
    const r = (seatEl(id) || app.querySelector('.bar') || app).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  // Lớp "bãi chiến trường": đồ ném trúng dính lại, càng ném nhiều càng đầy màn hình
  const mess = document.createElement('div');
  mess.className = 'mess'; mess.setAttribute('aria-hidden', 'true');
  document.body.appendChild(mess);
  const wipe = document.createElement('button');
  wipe.className = 'wipe-btn'; wipe.hidden = true; wipe.innerHTML = `${ico('🧻')} Lau màn hình`;
  wipe.onclick = () => { mess.querySelectorAll('.mine').forEach(x => x.remove()); syncWipe(); };
  document.body.appendChild(wipe);
  // Tắt ném đồ (chỉ trên máy mình, người ném không biết): tắt hết, hoặc chặn riêng từng người
  let tauntOff = !!store.get().tauntOff;
  const mutedP = new Set(store.get().mutedP || []);
  const setTauntOff = on => {
    tauntOff = on; store.set({ tauntOff: on });
    if (on) { mess.innerHTML = ''; document.querySelectorAll('.throw-fx, .splat-fx').forEach(x => x.remove()); }
    syncWipe(); if (S) render();
  };
  const toggleMute = id => {
    if (mutedP.has(id)) mutedP.delete(id); else { mutedP.add(id); mess.querySelectorAll('.goo').forEach(x => x.remove()); }
    store.set({ mutedP: [...mutedP] }); syncWipe();
    toast(mutedP.has(id) ? `Đã chặn đồ ném từ ${pname(id)}` : `Nhận lại đồ ném từ ${pname(id)}`);
  };
  const muteBtn = document.createElement('button');
  muteBtn.className = 'mute-btn'; muteBtn.hidden = true;
  muteBtn.innerHTML = '🔇 Tắt ném đồ';
  muteBtn.onclick = () => { setTauntOff(true); toast('Đã tắt ném đồ. Bật lại trong bảng Phòng'); };
  document.body.appendChild(muteBtn);
  const hits = {}; // pid -> số lần bị ném liên tiếp (để chữ BẸP! không hiện dày đặc)
  const syncWipe = () => { wipe.hidden = mess.querySelectorAll('.mine').length < 6; muteBtn.hidden = wipe.hidden; };
  function stick(item, x, y, size, life, mine, pid) {
    const s = document.createElement('span');
    s.className = 'goo' + (mine ? ' mine' : '');
    s.innerHTML = ico(item);
    s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.fontSize = size + 'px';
    s.style.setProperty('--r', (Math.random() * 70 - 35) + 'deg');
    s.style.animationDuration = `.18s, ${life}ms`;
    if (pid) s.dataset.pid = pid;
    mess.appendChild(s);
    setTimeout(() => { s.remove(); syncWipe(); }, life);
    while (mess.childElementCount > 220) mess.firstElementChild.remove();
    syncWipe();
  }
  let lastHitSfx = 0, lastWhoosh = 0, hitToast = { t: 0, n: 0 };
  socket.on('taunt', ({ from, to, item, name }) => {
    if (!S || tauntOff || mutedP.has(from)) return;
    const a = seatRect(from), b = seatRect(to);
    const hard = HARD.has(item);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const land = () => {
      const now = Date.now();
      if (now - lastHitSfx > 55) { lastHitSfx = now; sfx(hard ? 'splat' : 'pop'); }
      const b2 = seatRect(to);
      if (to === S.me) {
        if (hard && navigator.vibrate) try { navigator.vibrate(60); } catch {}
        hitToast.n = now - hitToast.t < 2500 ? hitToast.n + 1 : 1; hitToast.t = now;
        toast(`${ico(item)} ${esc(name)} ${hard ? 'ném' : 'thả'} vào bạn!${hitToast.n > 1 ? ` ×${hitToast.n}` : ''}`, true);
        // dính khắp màn hình mình
        if (hard) stick(item, 20 + Math.random() * (innerWidth - 40), 20 + Math.random() * (innerHeight - 40), 48 + Math.random() * 90, 9000, true);
      }
      // dính gọn trong ô ghế người bị ném (không lan sang ghế khác hay giữa bàn), mỗi ghế tối đa 12 món
      const n = hits[to] = (hits[to] || 0) + 1;
      clearTimeout(hits[to + ':t']); hits[to + ':t'] = setTimeout(() => { hits[to] = 0; }, 1500);
      const size = hard ? 18 + Math.random() * 8 : 18;
      const px = Math.max(0, b2.w / 2 - size / 2 - 4), py = Math.max(0, b2.h / 2 - size / 2 - 4);
      stick(item, b2.x + (Math.random() * 2 - 1) * px, b2.y + (Math.random() * 2 - 1) * py, size, hard ? 4000 : 2000, false, to);
      const onSeat = [...mess.querySelectorAll(`.goo[data-pid="${to}"]`)];
      onSeat.slice(0, Math.max(0, onSeat.length - 12)).forEach(x => x.remove());
      const s = document.createElement('div');
      s.className = 'splat-fx' + (hard ? ' hard' : '');
      s.style.left = b2.x + 'px'; s.style.top = b2.y + 'px';
      s.innerHTML = `<span class="big">${ico(item)}</span>${POW[item] && (n - 1) % 4 === 0 ? `<b>${POW[item]}</b>` : ''}${hard && n < 12 ? '<i></i><i></i><i></i><i></i><i></i><i></i>' : ''}`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1100);
      const el = seatEl(to);
      if (el && hard && !reduce) el.animate([{ transform: 'none' }, { transform: 'translate(-4px,1px) rotate(-1.5deg)' }, { transform: 'translate(4px,-1px) rotate(1.5deg)' }, { transform: 'none' }], { duration: 220 });
    };
    if (reduce) return land();
    const p = document.createElement('div');
    p.className = 'throw-fx'; p.innerHTML = ico(item);
    p.style.left = a.x + 'px'; p.style.top = a.y + 'px';
    document.body.appendChild(p);
    const tx = b.x + (Math.random() - .5) * Math.min(80, b.w * .5), ty = b.y + (Math.random() - .5) * Math.min(40, b.h * .5);
    const dx = tx - a.x, dy = ty - a.y, lift = -Math.min(160, 60 + Math.hypot(dx, dy) / 3) * (.7 + Math.random() * .6);
    const spin = (dx >= 0 ? 1 : -1) * (hard ? 540 : 200);
    const dur = Math.min(800, 420 + Math.hypot(dx, dy) / 3);
    const now = Date.now();
    if (now - lastWhoosh > 90) { lastWhoosh = now; sfx('whoosh'); }
    p.animate([
      { transform: 'translate(-50%,-50%) translate(0,0) rotate(0) scale(.6)' },
      { transform: `translate(-50%,-50%) translate(${dx / 2}px,${dy / 2 + lift}px) rotate(${spin / 2}deg) scale(1.35)`, offset: .5 },
      { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${spin}deg) scale(1)` },
    ], { duration: dur, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'forwards' }).onfinish = () => { p.remove(); land(); };
  });

  // ---------- Chip poker: xin, vay, trả nợ; chủ nợ sai vặt con nợ ----------
  const chipsOf = id => { const p = S && S.players.find(x => x.id === id); return p ? p.chips : 0; };
  const debtOf = (lender, debtor) => (S && S.debts || []).find(x => x.lender === lender && x.debtor === debtor);
  const myDebts = () => (S && S.debts || []).filter(x => x.debtor === S.me);
  const isMyDebtor = id => !!debtOf(S.me, id);
  const chipTxt = n => `<span class="chips-n">${ico('💰')}${n}</span>`;
  // nhãn chủ nợ / con nợ cạnh tên
  function debtBadges(id) {
    const ds = S.debts || [];
    let h = '';
    if (ds.some(x => x.debtor === id)) h += ` <span class="badge debtor" title="Đang nợ: ${ds.filter(x => x.debtor === id).map(x => `${pname(x.lender)} ${x.amount}`).join(', ')}">${ico('⛓')}Con nợ</span>`;
    if (ds.some(x => x.lender === id)) h += ` <span class="badge lender" title="Chủ nợ">${ico('💰')}Chủ nợ</span>`;
    return h;
  }
  const inMyHand = () => { const r = S.round; return r && r.game === 'poker' && r.phase !== 'done' && r.seats.some(x => x.id === S.me); };
  // hàng nút xin / vay / trả nợ dưới bàn (chỉ ở poker)
  function loanRow() {
    if (S.game !== 'poker' || inMyHand()) return '';
    const mine = chipsOf(S.me), debts = myDebts(), r = S.round;
    const me = S.players.find(p => p.id === S.me) || {};
    const seat = r && r.seats.find(x => x.id === S.me);
    let h = '';
    if (mine <= 0) h += `<span class="broke">${ico('😭')} Hết chip, đang ngồi xem</span>`;
    // hết ván: ai còn giữ bài úp (thắng không ai theo, hoặc đã bỏ bài) được lật cho cả bàn xem
    if (seat && r.phase === 'done' && !seat.shown) h += '<button class="btn small ghost" data-showcards>Lật bài cho xem</button>';
    if (mine < (S.pkStack || 1000) / 2) h += `<button class="btn small ghost" data-loan="gift">${ico('🙏')} Xin chip</button><button class="btn small ghost" data-loan="loan">${ico('💰')} Vay chip</button>`;
    debts.forEach(d => { h += `<button class="btn small" data-repay="${d.lender}" ${mine > 0 ? '' : 'disabled'}>Trả nợ ${pname(d.lender)} (${d.amount})</button>`; });
    return `<div class="loan-row">${h}</div>`;
  }
  // Hàng chỗ ngồi: người đang xem bấm vào chơi ván sau; người đang chơi bấm nghỉ ván sau (mọi trò)
  function seatRow() {
    const me = S.players.find(p => p.id === S.me); if (!me) return '';
    const r = S.round, inRound = r && r.phase !== 'done' && r.seats.some(x => x.id === S.me);
    const justPlayed = r && r.phase === 'done' && r.seats.some(x => x.id === S.me) && !me.sitOut;
    const next = (S.next || []).includes(S.me), broke = S.game === 'poker' && me.chips <= 0;
    const btn = (v, t, main) => `<button class="btn small ${main ? '' : 'ghost'}" data-sitout="${v}">${t}</button>`;
    let msg, btns;
    if (me.sitOut === 'once') { msg = 'Bạn nghỉ <b>1 ván</b>, ván sau nữa tự vào lại.'; btns = btn(0, 'Thôi, vẫn chơi', true) + btn(1, 'Nghỉ luôn'); }
    else if (me.sitOut) { msg = 'Bạn đang <b>nghỉ</b>, chỉ ngồi xem.'; btns = btn(0, 'Vào chơi ván sau', true); }
    else if (inRound || (justPlayed && next && !broke)) return '';
    else if (broke) { msg = 'Hết chip: xin hoặc vay chip để vào chơi.'; btns = ''; }
    else if (next) { msg = r && r.phase !== 'done' ? '<b>Đã có chỗ:</b> ván sau bạn sẽ được chia bài.' : '<b>Đã có chỗ</b> ở ván tới.'; btns = btn('once', 'Nghỉ 1 ván') + btn(1, 'Chỉ xem'); }
    else { msg = `Bàn đủ ${S.maxSeats} người, bạn được ưu tiên vào khi có chỗ.`; btns = btn(1, 'Chỉ xem'); }
    return `<div class="seat-row ${inRound && !me.sitOut ? '' : 'watching'}">${msg ? `<span>${msg}</span>` : ''}${btns}</div>`;
  }
  // đổi trò nhanh giữa các ván (ai cũng đổi được)
  function gameSwitch() {
    const r = S.round;
    if (r && r.phase !== 'done') return '';
    return `<div class="game-switch"><span>Đổi trò:</span>${Object.entries(GAMES).map(([k, x]) => `<button class="btn small ${S.game === k ? '' : 'ghost'}" data-set-game="${k}" ${S.game === k ? 'disabled' : ''}>${x.name}</button>`).join('')}</div>`;
  }
  function debtorRow() {
    const mine = (S.debts || []).filter(x => x.lender === S.me);
    if (!mine.length) return '';
    return `<div class="debtor-row">${mine.map(d => `<div class="dr-item">
      <span class="dr-who">${ico('⛓')} <b>${pname(d.debtor)}</b> nợ bạn ${d.amount}</span>
      <span class="dr-btns">${Object.entries(ORDERS).map(([k, o]) => `<button class="dr-b" data-order-to="${d.debtor}" data-order="${k}" title="Bắt ${pname(d.debtor)} ${o.act} bạn">${ico(o.ico)}<em>${o.act.split(' ')[0]}</em></button>`).join('')}
        <button class="dr-b" data-poop-to="${d.debtor}" title="Ném 💩 vào ${pname(d.debtor)} (giữ để ném liên tục)">${ico('💩')}<em>ném</em></button>
        <button class="dr-b ghost" data-forgive-to="${d.debtor}" title="Xóa nợ cho ${pname(d.debtor)}">✕<em>xóa nợ</em></button></span>
    </div>`).join('')}</div>`;
  }
  // bảng chọn người và số chip để xin / vay
  function openLoan(kind, btn) {
    const others = S.players.filter(p => p.id !== S.me && p.chips > 0);
    const amounts = [100, 200, 500, S.pkStack || 1000];
    pop.innerHTML = `<div class="tp-head">${kind === 'gift' ? 'Xin chip ai?' : 'Vay chip ai?'} <span>${kind === 'gift' ? 'xin thì không phải trả' : 'vay phải trả thêm 10% lãi, thắng ván là tự trừ nợ'}</span></div>
      ${others.length ? others.map(p => `<div class="loan-p"><b>${esc(p.name)}</b> ${chipTxt(p.chips)}
        <div class="loan-amts">${amounts.map(a => `<button data-to="${p.id}" data-amt="${a}" ${p.chips < a ? 'disabled' : ''}>${a}</button>`).join('')}</div></div>`).join('')
        : '<small>Không ai còn chip để cho</small>'}`;
    pop.hidden = false; popFor = null;
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    pop.style.top = Math.max(8, r.top - h - 8) + 'px';
    pop.querySelectorAll('[data-amt]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      emit('loan:ask', { to: b.dataset.to, amount: +b.dataset.amt, kind }).then(x => { if (x.ok) toast(`Đã gửi lời ${kind === 'gift' ? 'xin' : 'hỏi vay'}, đợi người ta trả lời`); });
      closeTaunt();
    });
  }
  // người khác xin / hỏi vay mình: hiện hộp hỏi
  const askBox = document.createElement('div');
  askBox.className = 'ask-box'; askBox.hidden = true;
  document.body.appendChild(askBox);
  let askQueue = [];
  function showAsk() {
    const a = askQueue[0];
    if (!a) { askBox.hidden = true; return; }
    const gift = a.kind === 'gift';
    askBox.innerHTML = `<div class="ask-ico">${ico(gift ? '🙏' : '💰')}</div>
      <p><b>${esc(a.name)}</b> ${gift ? `xin bạn <b>${a.amount}</b> chip` : `muốn vay <b>${a.amount}</b> chip, hứa trả <b>${a.repay}</b>`}</p>
      ${gift ? '' : '<small>Cho vay xong bạn thành chủ nợ: được sai vặt và ném 💩 con nợ thoải mái tới khi trả hết.</small>'}
      <div class="ask-btns"><button class="btn ghost" data-ans="0">Không ${gift ? 'cho' : 'cho vay'}</button><button class="btn" data-ans="1">${gift ? 'Cho luôn' : 'Cho vay'}</button></div>`;
    askBox.hidden = false;
    askBox.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => {
      emit('loan:reply', { id: a.id, ok: b.dataset.ans === '1' }).then(x => { if (x.error && /Đợi hết ván/.test(x.error)) return; if (x.ok && b.dataset.ans === '1' && !gift) toast(`Giờ ${a.name} là con nợ của bạn! Sai vặt ở hàng ⛓ dưới bàn`); askQueue.shift(); showAsk(); });
    });
    clearTimeout(showAsk.t);
    showAsk.t = setTimeout(() => { askQueue = askQueue.filter(x => x !== a); showAsk(); }, Math.max(1000, 60000 - (Date.now() - a.got)));
  }
  socket.on('loan:ask', a => { askQueue.push({ ...a, got: Date.now() }); sfx('bell'); if (askQueue.length === 1) showAsk(); });
  socket.on('loan:result', ({ msg }) => { toast(msg); sfx('chat'); });

  // sai vặt: chỉ là hiệu ứng vui trên ghế con nợ
  const ORDERS = {
    quat: { ico: '🪭', act: 'quạt mát cho', pow: 'QUẠT QUẠT~' },
    tra: { ico: '🍵', act: 'bưng trà mời', pow: 'MỜI CHỦ NỢ!' },
    dam: { ico: '👊', act: 'đấm lưng cho', pow: 'BỊCH BỊCH!' },
    hat: { ico: '🎤', act: 'hát tặng', pow: '♪ LA LA LA ♪' },
    cui: { ico: '🙇', act: 'cúi đầu chào', pow: 'DẠ THƯA!' },
    xinloi: { ico: '🙏', act: 'xin lỗi', pow: 'CON XIN LỖI!' },
  };
  const ordersHTML = id => isMyDebtor(id) ? `<div class="tp-sub">Sai con nợ <span>${pname(id)} đang nợ bạn ${debtOf(S.me, id).amount} chip</span></div>
      <div class="tp-grid orders">${Object.entries(ORDERS).map(([k, o]) => `<button data-order="${k}" title="Bắt ${o.act} bạn">${ico(o.ico)}<em>${o.act.split(' ')[0]}</em></button>`).join('')}</div>
      <button class="tp-forgive" data-forgive>Xóa nợ cho ${pname(id)}</button>` : '';
  socket.on('order', ({ from, to, kind }) => {
    const o = ORDERS[kind]; if (!o || !S || mutedP.has(from)) return;
    const b = seatRect(to);
    const fx = document.createElement('div');
    fx.className = `order-fx o-${kind}`;
    fx.style.left = b.x + 'px'; fx.style.top = b.y + 'px';
    fx.innerHTML = `<span class="o-ico">${ico(o.ico)}</span><b>${o.pow}</b><small>${to === S.me ? 'Bạn' : pname(to)} ${o.act} ${from === S.me ? 'bạn' : pname(from)}</small>`;
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 2800);
    const el = seatEl(to);
    if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const bow = kind === 'cui' || kind === 'xinloi';
      el.animate(bow ? [{ transform: 'none' }, { transform: 'translateY(6px) scale(.94) rotate(-2deg)' }, { transform: 'none' }, { transform: 'translateY(6px) scale(.94) rotate(-2deg)' }, { transform: 'none' }]
        : [{ transform: 'none' }, { transform: 'translateX(-3px) rotate(-1deg)' }, { transform: 'translateX(3px) rotate(1deg)' }, { transform: 'none' }], { duration: bow ? 1200 : 400, iterations: bow ? 1 : 3 });
    }
    sfx(kind === 'dam' ? 'slam' : kind === 'hat' ? 'chat' : 'pop');
    if (to === S.me) { toast(`${ico(o.ico)} Chủ nợ ${pname(from)} bắt bạn ${o.act} họ!`, true); if (navigator.vibrate) try { navigator.vibrate([60, 40, 60]); } catch {} }
  });

  // ---------- Tự xếp bài trên tay (tiến lên): kéo thả hoặc bấm xếp theo số / chất ----------
  let handOrder = [], handRound = null;
  const tlRank = c => (c.r === 1 ? 14 : c.r === 2 ? 15 : c.r);
  function orderedHand(r, cards) {
    if (handRound !== r.id) { handRound = r.id; handOrder = []; }
    const ids = new Set(cards.map(c => c.id));
    handOrder = handOrder.filter(id => ids.has(id));
    cards.forEach(c => { if (!handOrder.includes(c.id)) handOrder.push(c.id); });
    const m = new Map(cards.map(c => [c.id, c]));
    return handOrder.map(id => m.get(id));
  }
  function sortHandBy(mode) {
    const cards = (S.round.seats.find(x => x.id === S.me) || {}).cards || [];
    const byRank = (a, b) => tlRank(a) - tlRank(b) || a.s - b.s;
    handOrder = cards.slice().sort(mode === 'suit' ? (a, b) => a.s - b.s || tlRank(a) - tlRank(b) : byRank).map(c => c.id);
    render();
  }
  // kéo một lá sang trái/phải để đổi chỗ; bấm nhẹ thì chọn lá như cũ
  function bindHandDrag() {
    const hand = app.querySelector('.hand.tl');
    if (!hand) return;
    hand.querySelectorAll('.card[data-id]').forEach(el => {
      el.onpointerdown = e => {
        if (e.button > 0) return;
        const sx = e.clientX, sy = e.clientY, id = +el.dataset.id;
        let moved = false;
        const others = [...hand.querySelectorAll('.card[data-id]')].filter(c => c !== el);
        const move = ev => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (!moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (!moved) { moved = true; dragging = true; el.classList.add('moving'); }
          el.style.transform = `translate(${dx}px, ${Math.min(0, dy) - 16}px) rotate(${dx / 30}deg)`;
          // chỗ chèn: đếm số lá có tâm phần lộ ra nằm bên trái ngón tay
          const rects = others.map(c => c.getBoundingClientRect());
          let at = 0;
          rects.forEach((rc, k) => { const step = k + 1 < rects.length ? rects[k + 1].left - rc.left : rc.width; if (rc.left + Math.min(rc.width, step) / 2 < ev.clientX) at = k + 1; });
          others.forEach((c, k) => c.classList.toggle('gap-l', k === at));
          el.dataset.at = at;
        };
        const up = () => {
          removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
          if (!moved) { sel.has(id) ? sel.delete(id) : sel.add(id); render(); return; }
          const rest = others.map(c => +c.dataset.id), at = +(el.dataset.at || 0);
          rest.splice(at, 0, id);
          handOrder = rest;
          dragging = false; pendingRender = false;
          render();
        };
        addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      };
    });
  }
  // lá trên tay trượt mượt về chỗ mới (sau khi xếp, kéo hoặc đánh bớt)
  function flipHand(prev) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    app.querySelectorAll('.hand.tl .card[data-id]').forEach(el => {
      const p = prev[el.dataset.id];
      if (!p) return;
      const b = el.getBoundingClientRect(), dx = p.left - b.left;
      if (Math.abs(dx) > 2) el.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 220, easing: 'ease-out' });
    });
  }

  // ---------- Hiệu ứng đánh bài xuống giữa bàn (tiến lên) ----------
  let lastTableKey, lastLogT = 0;
  function handRects() {
    const m = {};
    app.querySelectorAll('.hand.tl .card[data-id]').forEach(c => { m[c.dataset.id] = c.getBoundingClientRect(); });
    return m;
  }
  function animatePlay(prevHand) {
    const r = S.round;
    const logs = S.log || [];
    const newLogs = logs.filter(l => l.t > lastLogT);
    if (logs.length) lastLogT = Math.max(lastLogT, logs[logs.length - 1].t);
    if (!r || r.game !== 'tienlen') { lastTableKey = null; return; }
    const key = r.table ? `${r.id}:${r.table.by}:${r.table.cards.map(c => c.id).join(',')}` : null;
    const first = lastTableKey === undefined;
    if (key === lastTableKey) return;
    lastTableKey = key;
    if (first || !key || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...app.querySelectorAll('.pk-mid .center .cards .card')];
    const from = r.table.by;
    const seat = seatRect(from);
    const chop = newLogs.some(l => /chặt/.test(l.msg));
    els.forEach((el, i) => {
      const b = el.getBoundingClientRect();
      const h = from === S.me && prevHand[el.dataset.id];
      const ox = h ? h.left + h.width / 2 : seat.x, oy = h ? h.top + h.height / 2 : seat.y;
      const dx = ox - b.left - b.width / 2, dy = oy - b.top - b.height / 2;
      const s0 = h ? h.width / b.width : .5;
      const rot = (i % 2 ? 1 : -1) * (12 + (i * 23) % 18);
      el.animate([
        { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(${s0})`, opacity: h ? 1 : .3 },
        { transform: `translate(0,-14px) rotate(${-rot / 4}deg) scale(1.22)`, opacity: 1, offset: .7 },
        { transform: 'translate(0,2px) scale(.94, .9)', offset: .86 },
        { transform: 'none' },
      ], { duration: 460, delay: i * 45, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'backwards' });
    });
    const end = 400 + els.length * 45;
    sfx('slam', end - 60);
    const mid = app.querySelector('.pk-mid .center');
    if (mid) setTimeout(() => {
      mid.animate([{ transform: 'none' }, { transform: chop ? 'translate(-6px,3px) rotate(-1.5deg)' : 'translateY(3px)' },
        { transform: chop ? 'translate(5px,-2px) rotate(1deg)' : 'none' }, { transform: 'none' }], { duration: chop ? 320 : 160 });
    }, end - 60);
    const fx = tlCombo(r.table, newLogs);
    if (fx) setTimeout(() => comboFx(fx[0], fx[1], centerAt(), fx[2]), end - 80);
    // lá thưởng được đánh ra: cả bàn thấy, nổ tia sao
    els.filter(el => el.classList.contains('fx')).forEach((el, k) => setTimeout(() => starBurst(el), end + k * 120));
  }

  // ---------- Hiệu ứng bộ mạnh (cả 4 trò) ----------
  // lvl 1: chữ vàng nhỏ, 2: chữ đỏ to + rung, 3: chữ to nhất + tia sáng + chớp màn hình + rung mạnh
  function centerAt() {
    const m = app.querySelector('.pk-mid') || app.querySelector('.felt');
    const b = m ? m.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
  function comboFx(text, lvl, at, sub) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = document.createElement('div');
    el.className = `combo-fx lv${lvl}`;
    el.innerHTML = `${lvl >= 3 && !reduce ? '<i class="cf-rays"></i>' : ''}<b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    const x = Math.max(120, Math.min(innerWidth - 120, at.x)), y = Math.max(70, Math.min(innerHeight - 70, at.y));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), lvl >= 3 ? 2300 : 1700);
    sfx(lvl >= 3 ? 'chop' : lvl === 2 ? 'slam' : 'pop');
    if (lvl >= 2) sfx('pop', 120);
    if (reduce) return;
    const felt = app.querySelector('.felt');
    if (felt && lvl >= 2) felt.animate([{ transform: 'none' }, { transform: `translate(${lvl >= 3 ? -8 : -4}px, 3px)` }, { transform: `translate(${lvl >= 3 ? 7 : 3}px, -2px)` }, { transform: 'none' }], { duration: lvl >= 3 ? 380 : 220, iterations: lvl >= 3 ? 2 : 1 });
    if (lvl >= 3) { const f = document.createElement('div'); f.className = 'cf-flash'; document.body.appendChild(f); setTimeout(() => f.remove(), 500); }
  }
  // tiến lên: bộ vừa đánh có đáng làm hiệu ứng không -> [chữ, cấp, dòng phụ]
  function tlCombo(table, logs) {
    if (!table) return null;
    const rk = c => (c.r === 1 ? 14 : c.r === 2 ? 15 : c.r);
    const cards = table.cards, lab = table.label || '', top = Math.max(...cards.map(rk)), heo = top === 15;
    const chop = logs.find(l => /chặt/.test(l.msg));
    if (chop) { const m = chop.msg.match(/ăn (\d+)/); return [/chặt heo/.test(chop.msg) ? 'CHẶT HEO!' : 'CHẶT!', 3, m ? `${lab} · ăn ${m[1]}` : lab]; }
    if (lab === 'Tứ quý') return [heo ? 'TỨ QUÝ HEO!' : 'TỨ QUÝ!', 3, ''];
    let m = lab.match(/(\d+) đôi thông/);
    if (m) return [`${m[1]} ĐÔI THÔNG!`, +m[1] >= 4 ? 3 : 2, ''];
    m = lab.match(/Sảnh (\d+)/);
    if (m && +m[1] >= 5) return [+m[1] >= 7 ? `SẢNH DÀI ${m[1]} LÁ!` : `SẢNH ${m[1]}!`, +m[1] >= 9 ? 3 : +m[1] >= 6 ? 2 : 1, ''];
    if (lab === 'Sám cô') return [heo ? 'SÁM HEO!' : 'SÁM CÔ!', heo ? 3 : 1, ''];
    if (lab === 'Đôi' && heo) return ['ĐÔI HEO!', 2, cards.some(c => c.s >= 2) ? 'có heo đỏ' : ''];
    if (lab === 'Đôi' && top === 14) return ['ĐÔI ÁT!', 1, ''];
    if (cards.length === 1 && heo) return [cards[0].s >= 2 ? 'HEO ĐỎ!' : 'HEO!', 1, ''];
    return null;
  }
  function starBurst(el) {
    const b = el.getBoundingClientRect(), g = document.createElement('div');
    g.className = 'gold-burst'; g.style.left = (b.left + b.width / 2) + 'px'; g.style.top = (b.top + b.height / 2) + 'px';
    g.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
    document.body.appendChild(g); sfx('chat'); setTimeout(() => g.remove(), 900);
  }
  // sao bay từ ghế người bị cướp sang ghế người cướp
  function starFly(from, to, n, why) {
    const a0 = seatRect(from), b0 = seatRect(to);
    for (let k = 0; k < Math.min(n, 5); k++) {
      const s = document.createElement('div');
      s.className = 'star-fly'; s.textContent = '★';
      s.style.left = a0.x + 'px'; s.style.top = a0.y + 'px';
      document.body.appendChild(s);
      const dx = b0.x - a0.x, dy = b0.y - a0.y;
      s.animate([
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: `translate(-50%,-50%) translate(${dx * .5}px,${dy * .5 - 70}px) scale(1.6) rotate(180deg)`, opacity: 1, offset: .5 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(1) rotate(360deg)`, opacity: 1 },
      ], { duration: 900, delay: k * 140, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'both' }).onfinish = () => s.remove();
    }
    setTimeout(() => comboFx(`+${n} ⭐`, 1, b0, `cướp của ${pname(from)} · ${why}`), 700 + Math.min(n, 5) * 140);
  }
  // bậc của mọi người: lên bậc thì hiệu ứng lớn, rớt bậc thì hiệu ứng nhỏ
  const tierSeen = {}; let tierInit = false;
  function trackTiers() {
    if (!S) return;
    for (const p of S.players) {
      const t = tierOf(p.stars);
      if (tierInit && tierSeen[p.id] != null && t.lvl !== tierSeen[p.id]) {
        const at = seatRect(p.id), who = p.id === S.me ? 'Bạn' : p.name;
        if (t.lvl > tierSeen[p.id]) setTimeout(() => comboFx(`LÊN ${t.name.toUpperCase()}!`, t.lvl >= 4 ? 3 : 2, at, `${who} · ${t.lvl} lá thưởng mỗi ván`), 1600);
        else setTimeout(() => comboFx('RỚT HẠNG…', 1, at, `${who} xuống ${t.name}`), 1600);
      }
      tierSeen[p.id] = t.lvl;
    }
    tierInit = true;
  }
  // các trò khác: soi trạng thái mới để bắn hiệu ứng (mỗi sự kiện một lần)
  const fxSeen = new Set(); let fxInit = false;
  function detectCombos(r) {
    if (!r) return;
    const evs = [];
    const add = (key, text, lvl, at, sub) => evs.push({ key: r.id + ':' + key, text, lvl, at, sub });
    (r.steals || []).forEach((s, k) => {
      const key = r.id + ':steal:' + k;
      if (fxInit && !fxSeen.has(key)) setTimeout(() => starFly(s.from, s.to, s.n, s.why), 400);
      fxSeen.add(key);
    });
    if (r.game === 'tienlen' && r.phase === 'done' && r.toiTrang) add('toitrang', 'TỚI TRẮNG!', 3, centerAt, `${pname(r.toiTrang.by)}: ${r.toiTrang.label}`);
    if (r.game === 'xidach' || r.game === 'baicao') {
      const big = r.game === 'xidach' ? { 'Xì bàn': 3, 'Xì dách': 2, 'Ngũ linh': 2 } : { 'Ba tây': 2, '9 nút': 1 };
      for (const s of r.seats) {
        if (!s.cards || !s.info) continue;
        if (r.game === 'baicao' && s.id !== S.me && !s.flipped && r.phase !== 'done') continue;
        if (big[s.info]) add(s.id + ':' + s.info, s.info.toUpperCase() + '!', big[s.info], () => seatRect(s.id), s.id === S.me ? 'Bạn' : pname(s.id));
        else if (s.info === 'Quắc' && s.id === S.me) add('quac', 'QUẮC!', 1, () => seatRect(s.id), 'Quá 21 điểm');
      }
    }
    if (r.game === 'poker') {
      for (const s of r.seats) if (r.phase !== 'done' && s.allin && !s.folded) add('allin:' + s.id, 'TẤT TAY!', 2, () => seatRect(s.id), s.id === S.me ? 'Bạn' : pname(s.id));
      if (r.phase === 'done' && r.winLabel) {
        const L = r.winLabel, lvl = /^Thùng phá sảnh|^Tứ quý/.test(L) ? 3 : /^Cù lũ|^Thùng/.test(L) ? 2 : /^Sảnh|^Sám cô/.test(L) ? 1 : 0;
        const head = [[/^Thùng phá sảnh lớn/, 'THÙNG PHÁ SẢNH LỚN!'], [/^Thùng phá sảnh/, 'THÙNG PHÁ SẢNH!'], [/^Tứ quý/, 'TỨ QUÝ!'], [/^Cù lũ/, 'CÙ LŨ!'], [/^Thùng/, 'THÙNG!'], [/^Sảnh/, 'SẢNH!'], [/^Sám cô/, 'SÁM CÔ!']].find(([re]) => re.test(L));
        if (lvl && head) add('win', head[1], lvl, centerAt, (r.winners || []).map(id => id === S.me ? 'Bạn' : pname(id)).join(', ') + ' · ' + L);
      }
    }
    if (!fxInit) { evs.forEach(e => fxSeen.add(e.key)); fxInit = true; return; } // mới vào phòng: không bắn lại chuyện cũ
    evs.filter(e => !fxSeen.has(e.key)).slice(0, 2).forEach((e, k) => { fxSeen.add(e.key); setTimeout(() => comboFx(e.text, e.lvl, e.at(), e.sub), 250 + k * 900); });
  }

  const isEmoji = t => /^\p{Extended_Pictographic}{1,3}$/u.test(t);
  const bubble = (id, up) => bubbles[id] ? `<div class="bubble ${up ? 'up' : ''} ${isEmoji(bubbles[id].text) ? 'emoji' : ''}">${rich(esc(bubbles[id].text))}</div>` : '';
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !socket.connected) socket.connect(); });
  setInterval(() => {
    document.querySelectorAll('[data-dl]').forEach(el => {
      const left = Math.max(0, Math.ceil((+el.dataset.dl - (Date.now() + offset)) / 1000));
      el.textContent = left + 's';
    });
  }, 500);

  // ---------- Trang chủ ---------- 
  function renderHome() {
    const s = store.get();
    const code = (new URL(location.href).searchParams.get('r') || '').toUpperCase();
    app.innerHTML = `
      <main class="home">
        <h1 class="logo">Bàn<span>Bài</span></h1>
        <p class="tag">Xì dách, bài cào, tiến lên, poker. Tạo phòng rồi gửi mã cho bạn bè.</p>
        <label class="field">Tên của bạn<input id="name" maxlength="16" autocomplete="nickname" value="${esc(s.name || '')}" placeholder="Ví dụ: Tuấn"></label>
        <section>
          ${s.last && s.last.code ? `<button class="btn back-room" id="back">↩ Vào lại phòng <b>${esc(s.last.code)}</b></button><small class="back-note">Điểm và chip của bạn vẫn còn giữ</small>` : ''}
          <h2>Vào phòng có sẵn</h2>
          <div class="join-row">
            <input id="code" class="code-input" maxlength="6" autocapitalize="characters" autocomplete="off" value="${esc(code)}" placeholder="MÃ PHÒNG">
            <button class="btn" id="join">Vào</button>
          </div>
        </section>
        <section>
          <h2>Tạo phòng mới</h2>
          <div class="games">
            ${Object.entries(GAMES).map(([k, g]) => `<button class="game-btn" data-game="${k}">${g.name}<small>tối đa ${g.max} người</small></button>`).join('')}
          </div>
        </section>
      </main>`;
    const nameEl = app.querySelector('#name');
    const getName = () => {
      const n = nameEl.value.trim();
      if (!n) { toast('Nhập tên trước đã'); nameEl.focus(); return null; }
      store.set({ name: n }); return n;
    };
    app.querySelectorAll('.game-btn').forEach(b => b.onclick = async () => {
      const name = getName(); if (!name) return;
      const r = await emit('create', { name, game: b.dataset.game, tab: TAB });
      if (r.ok) enterRoom(r);
    });
    const join = async () => {
      const name = getName(); if (!name) return;
      const c = app.querySelector('#code').value.trim().toUpperCase();
      if (c.length !== 6) return toast('Mã phòng có 6 ký tự');
      const t = ticket(), last = store.get().last || {};
      const r = await emit('join', { code: c, name, tab: TAB, token: t.code === c ? t.token : last.code === c ? last.token : undefined });
      if (r.ok) enterRoom(r);
    };
    app.querySelector('#join').onclick = join;
    const back = app.querySelector('#back');
    if (back) back.onclick = async () => {
      const last = store.get().last;
      const r = await emit('join', { code: last.code, token: last.token, tab: TAB, name: app.querySelector('#name').value.trim() || undefined });
      if (r.ok) { store.set({ last: null }); enterRoom(r); } else if (/Không tìm thấy/.test(r.error || '')) { store.set({ last: null }); render(); }
    };
    app.querySelector('#code').onkeydown = e => { if (e.key === 'Enter') join(); };
  }
  function enterRoom(r) {
    store.set({ code: r.code, token: r.token });
    tabTicket.set({ code: r.code, token: r.token });
    history.replaceState(null, '', '/?r=' + r.code);
  }

  // ---------- Bảng phòng (người chơi, cài đặt) ----------
  function panelHTML() {
    const isHost = S.me === S.hostId, g = GAMES[S.game];
    const playing = S.round && S.round.phase !== 'done';
    const canVote = g.dealer && S.dealerMode === 'vote';
    const rows = S.players.map(p => `
      <div class="prow">
        <span class="dot ${p.connected ? '' : 'off'}"></span>
        <span class="pn">${esc(p.name)}${p.id === S.me ? ' (bạn)' : ''}
          ${p.id === S.hostId ? '<span class="badge host">Chủ</span>' : ''}
          ${g.dealer && p.id === S.dealerId ? '<span class="badge">Cái</span>' : ''}</span>
        <span class="seat-pts">${S.game === 'poker' ? chipTxt(p.chips) + ' · ' : ''}${p.points} điểm</span>
        ${canVote ? `<button class="btn small ${S.myVote === p.id ? '' : 'ghost'}" data-vote="${p.id}">Bầu${S.tally[p.id] ? ' ' + S.tally[p.id] : ''}</button>` : ''}
        ${isHost && p.id !== S.me ? `<button class="btn small ghost" data-kick="${p.id}" aria-label="Mời ${esc(p.name)} ra">✕</button>` : ''}
      </div>`).join('');
    const dis = !isHost || playing ? 'disabled' : '';
    const BETS = [5, 10, 20, 50, 100];
    return `
      <div class="panel">
        <div>
          <h3>Người chơi (${S.players.length})</h3>
          <div class="plist">${rows}</div>
          ${canVote ? `<p class="note">Bấm “Bầu” cho người bạn muốn làm cái. Nhà cái giữ ghế đến khi người khác được nhiều phiếu hơn, đổi từ ván sau.</p>` : ''}
          ${g.dealer && S.dealerMode === 'random3' ? `<p class="note">Nhà cái đổi ngẫu nhiên mỗi 3 ván (đã làm ${Math.min(S.dealerRounds, 3)}/3).</p>` : ''}
          ${S.players.length > g.max ? `<p class="note">${g.name} tối đa ${g.max} người, ai vào sau sẽ ngồi xem.</p>` : ''}
        </div>
        <div>
          <h3>Trò chơi</h3>
          <div class="seg">${Object.entries(GAMES).map(([k, x]) => `<button ${playing && !isHost ? 'disabled' : ''} class="${S.game === k ? 'on' : ''}" data-set-game="${k}">${x.name}</button>`).join('')}</div>
        </div>
        <div>
          <h3>${S.game === 'poker' ? 'Mù lớn (mù nhỏ bằng nửa)' : 'Mức cược mỗi ván'}</h3>
          <div class="bets">${BETS.map(b => `<button ${dis} class="${S.bet === b ? 'on' : ''}" data-bet="${b}">${b}</button>`).join('')}</div>
        </div>
        ${S.game === 'poker' ? `<div>
          <h3>Chip ban đầu mỗi người</h3>
          <div class="bets">${[500, 1000, 2000, 5000].map(b => `<button ${dis} class="${S.pkStack === b ? 'on' : ''}" data-stack="${b}">${b}</button>`).join('')}</div>
          <p class="note">Áp dụng cho người mới vào bàn poker. Hết chip thì ngồi xem, muốn chơi tiếp phải đi xin hoặc vay người khác.</p>
        </div>` : ''}
        ${g.dealer ? `<div>
          <h3>Cách chọn nhà cái</h3>
          <div class="seg">
            <button ${dis} class="${S.dealerMode === 'vote' ? 'on' : ''}" data-mode="vote">Bầu chọn</button>
            <button ${dis} class="${S.dealerMode === 'random3' ? 'on' : ''}" data-mode="random3">Ngẫu nhiên 3 ván</button>
          </div></div>` : ''}
        ${!isHost ? '<p class="note">Chỉ chủ phòng đổi được trò chơi và mức cược.</p>' : ''}
        <div>
          <h3>Kiểu phát bài</h3>
          <div class="fx-grid">${Object.entries(FX).map(([k, v]) => `<button ${dis} class="${(S.dealFx || 'random') === k ? 'on' : ''}" data-fx="${k}">${v}</button>`).join('')}</div>
          <p class="note">Cả bàn thấy cùng một kiểu. "Ngẫu nhiên" đổi kiểu mỗi ván.</p>
        </div>
        <div>
          <h3>Ném đồ, thả emoji vào bạn</h3>
          <div class="seg">
            <button class="${tauntOff ? '' : 'on'}" data-taunt-off="0">Hiện</button>
            <button class="${tauntOff ? 'on' : ''}" data-taunt-off="1">Tắt</button>
          </div>
          <p class="note">Chỉ trên máy bạn. ${mutedP.size ? `Đang chặn riêng ${mutedP.size} người (bỏ chặn trong bảng 😈 trên ghế họ).` : 'Muốn chặn riêng một người thì bấm 😈 trên ghế họ.'}</p>
        </div>
        <div>
          <h3>Âm thanh</h3>
          <div class="seg">
            <button class="${soundOn ? 'on' : ''}" data-sound="1">Bật tiếng</button>
            <button class="${soundOn ? '' : 'on'}" data-sound="0">Tắt tiếng</button>
          </div>
        </div>
        <button class="btn ghost" data-leave>Rời phòng</button>
      </div>`;
  }
  function bindPanel(root) {
    root.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => emit('vote', { id: b.dataset.vote }));
    root.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => confirmBox({ title: `Mời ${pname(b.dataset.kick)} ra khỏi phòng?`, yes: 'Mời ra', no: 'Không', lines: ['Người này phải vào lại bằng mã phòng.'], onYes: () => emit('kick', { id: b.dataset.kick }) }));
    root.querySelectorAll('[data-set-game]').forEach(b => b.onclick = () => {
      const g = b.dataset.setGame, r = S.round;
      if (g === S.game) return;
      if (r && r.phase !== 'done') return confirmBox({ title: `Hủy ván đang chơi để đổi sang ${GAMES[g].name}?`, yes: 'Hủy ván, đổi trò', no: 'Chơi tiếp',
        lines: [S.game === 'poker' ? 'Chip mọi người đã bỏ vào hũ ván này được trả lại.' : 'Ván đang chơi dừng lại, chưa tính tiền.'], onYes: () => emit('settings', { game: g }) });
      emit('settings', { game: g });
    });
    root.querySelectorAll('[data-bet]').forEach(b => b.onclick = () => emit('settings', { bet: +b.dataset.bet }));
    root.querySelectorAll('[data-stack]').forEach(b => b.onclick = () => emit('settings', { pkStack: +b.dataset.stack }));
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => emit('settings', { dealerMode: b.dataset.mode }));
    root.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => emit('settings', { dealFx: b.dataset.fx }));
    root.querySelectorAll('[data-taunt-off]').forEach(b => b.onclick = () => setTauntOff(b.dataset.tauntOff === '1'));
    root.querySelectorAll('[data-sound]').forEach(b => b.onclick = () => {
      soundOn = b.dataset.sound === '1'; store.set({ sound: soundOn });
      if (soundOn) { unlockAudio(); setTimeout(() => sfx('deal'), 50); }
      render();
    });
    const lv = root.querySelector('[data-leave]');
    if (lv) lv.onclick = () => confirmBox({ title: 'Rời phòng?', yes: 'Rời phòng', no: 'Ở lại',
      lines: [S.game === 'poker' ? 'Chip và điểm của bạn trong phòng này sẽ mất.' : 'Điểm của bạn trong phòng này sẽ mất.'], onYes: leaveRoom });
    function leaveRoom() {
      socket.emit('leave'); store.set({ code: null, token: null, last: { code: S.code, token: (tabTicket.get().token || store.get().token) } }); tabTicket.set({}); S = null; sheetOpen = false; resetChat();
      history.replaceState(null, '', '/'); render();
    }
  }

  // ---------- Ghế ----------
  function seatHTML(seat, r) {
    const p = S.players.find(x => x.id === seat.id) || { name: '?', points: 0, connected: false };
    const isTurn = r.turn === seat.id && r.phase !== 'done';
    const dealer = r.dealer === seat.id;
    const j = r.seats.indexOf(seat);
    const nBack = Math.min(seat.count, r.game === 'tienlen' ? 1 : 5);
    let cards = seat.cards ? seat.cards.map((c, i) => card(c, seat.best && seat.best.includes(c.id) ? 'hi' : '', dk(r, j, seat.id, i))).join('')
      : Array.from({ length: nBack }, (_, i) => card(null, '', dk(r, j, seat.id, i))).join('');
    if (r.game === 'tienlen') cards = (seat.cards && r.phase === 'done' ? cards : (seat.count ? card(null, '', dk(r, j, seat.id, 0)) : '')) + `<span class="count">${seat.count} lá</span>`;
    let info = '';
    if (r.game === 'poker') info = pkSeatInfo(seat, r);
    else if (seat.result != null && seat.id !== r.dealer) info = money(seat.result * S.bet);
    else if (seat.info) info = esc(seat.info);
    if (r.game === 'tienlen') {
      if (seat.place) info = `Về thứ ${seat.place}`;
      else if (seat.passed) info = 'Bỏ lượt';
    }
    if (r.game === 'xidach' && seat.stood && seat.result == null && !dealer) info = info || 'Đã dằn';
    const timer = isTurn ? `<span class="turn-tools">${S.deadline ? `<span class="timer" data-dl="${S.deadline}"></span>` : ''}${seat.id !== S.me ? bellBtn(seat.id, esc(p.name)) : ''}</span>` : '';
    const canCheck = r.game === 'xidach' && r.phase === 'dealer' && S.me === r.dealer && !dealer && seat.result == null;
    return `<div class="seat ${isTurn ? 'turn' : ''} ${seat.win ? 'won' : ''} ${seat.folded ? 'folded' : ''} ${p.connected ? '' : 'off'} ${isRinging(seat.id) ? 'ringing' : ''}" data-pid="${seat.id}">
      ${ringFx(seat.id)}${seat.id !== S.me ? tauntBtn(seat.id, esc(p.name)) : ''}
      <div class="seat-top"><span class="seat-name">${esc(p.name)} ${dealer ? '<span class="badge">Cái</span>' : ''}${r.game === 'poker' ? pkBadges(seat, true) : ''}${tierBadge(p)}${debtBadges(seat.id)}</span><span class="seat-pts">${r.game === 'poker' ? chipTxt(seat.chips) : p.points}</span></div>
      ${bubble(seat.id)}
      <div class="mini">${cards}</div>
      <div class="seat-info"><span>${info}</span>${timer}</div>
      ${canCheck ? `<button class="btn small" data-check="${seat.id}">Xét</button>` : ''}
    </div>`;
  }

  // ---------- Ghế của mình trên bàn (bài thật nằm bên dưới) ----------
  function ringSelf(r, mine) {
    const isTurn = r.turn === S.me && r.phase !== 'done';
    let st = '';
    if (r.game === 'tienlen') st = mine.place ? `Về thứ ${mine.place}` : mine.passed ? 'Bỏ lượt' : `${mine.count} lá`;
    else if (mine.result != null && r.dealer !== S.me) st = money(mine.result * S.bet);
    else if (r.game === 'xidach' && mine.stood) st = 'Đã dằn';
    else if (r.game === 'baicao' && mine.flipped) st = 'Đã lật';
    const me = S.players.find(p => p.id === S.me) || { points: 0 };
    return `<div class="seat self ${isTurn ? 'turn' : ''} ${isRinging(S.me) ? 'ringing' : ''}" data-pid="${S.me}">
      ${bubble(S.me, true)}${ringFx(S.me)}
      <div class="seat-top"><span class="seat-name">Bạn${r.dealer === S.me ? ' <span class="badge">Cái</span>' : ''}${tierBadge(me)}${debtBadges(S.me)}</span><span class="seat-pts">${me.points}</span></div>
      <div class="seat-info"><span>${isTurn ? 'Tới lượt bạn' : st}</span>${isTurn && S.deadline ? `<span class="timer" data-dl="${S.deadline}"></span>` : ''}</div>
    </div>`;
  }

  // ---------- Bàn chơi ----------
  // ---------- Poker ----------
  const PK_PHASE = { preflop: 'Vòng đầu', flop: 'Lật 3 lá', turn: 'Lá thứ tư', river: 'Lá cuối' };
  const pkBadges = (s, noD) => (s.btn && !noD ? ' <span class="badge pk-d" title="Nút chia bài">D</span>' : '')
    + (s.sb ? ' <span class="badge pk-b" title="Mù nhỏ">MN</span>' : '') + (s.bb ? ' <span class="badge pk-b" title="Mù lớn">ML</span>' : '');
  function pkSeatInfo(s, r) {
    if (r.phase === 'showing') return s.folded ? 'Bỏ bài' : '<b class="pk-allin">Tất tay</b>';
    if (r.phase === 'done') return (s.info ? `<b class="pk-hand">${esc(s.info)}</b> ` : s.folded ? 'Bỏ bài ' : '') + (s.net ? money(s.net) : '');
    if (s.folded) return 'Bỏ bài';
    return s.last ? esc(s.last) : '';
  }
  // Bàn bầu dục: mình ngồi giữa phía dưới, lượt đi theo chiều kim đồng hồ
  // (người nói sau mình ngồi bên trái, rồi vòng lên trên, sang phải). Góc tính theo màn hình: 90° là dưới, 180° là trái.
  // vị trí trên mép bàn: f = 1 là đúng mép (tâm ghế), nhỏ hơn là vào trong. --mx/--my chừa chỗ để ghế không tràn ra ngoài.
  const pkAt = (deg, f = 1) => { const t = deg * Math.PI / 180, c = (Math.cos(t) * f).toFixed(4), s = (Math.sin(t) * f).toFixed(4);
    return `left:calc(50% + ${c} * (50% - var(--mx)));top:calc(50% + ${s} * (50% - var(--my)))`; };
  function pkSelf(r, mine) {
    const isTurn = r.turn === S.me && r.phase !== 'done';
    const st = r.phase === 'done' ? (mine.net ? money(mine.net) : 'Hòa') : mine.folded ? 'Bỏ bài' : mine.last ? esc(mine.last) : '';
    return `<div class="seat self ${isTurn ? 'turn' : ''} ${mine.win ? 'won' : ''} ${mine.folded ? 'folded' : ''} ${isRinging(S.me) ? 'ringing' : ''}" data-pid="${S.me}">
      ${bubble(S.me, true)}${ringFx(S.me)}
      <div class="seat-top"><span class="seat-name">Bạn${pkBadges(mine, true)}${tierBadge(S.players.find(p => p.id === S.me))}${debtBadges(S.me)}</span><span class="seat-pts">${chipTxt(mine.chips)}</span></div>
      ${st ? `<div class="seat-info"><span>${st}</span></div>` : ''}
    </div>`;
  }
  // chia ghế đều theo chiều dài mép bàn (bàn dẹt thì cạnh dài có nhiều ghế hơn), bắt đầu từ chỗ mình ở dưới
  let pkDims = null; // kích thước bàn lần vẽ trước: { a: bán trục ngang, b: bán trục dọc } (px)
  function pkAngles(n) {
    const A = pkDims ? pkDims.a : Math.min(innerWidth, 1100) / 2 - 70, B = pkDims ? pkDims.b : Math.max(110, innerHeight * .2);
    const N = 720, len = [0];
    const pt = d => { const t = d * Math.PI / 180; return [A * Math.cos(t), B * Math.sin(t)]; };
    for (let i = 1; i <= N; i++) { const p = pt(90 + (i - 1) / 2), q = pt(90 + i / 2); len.push(len[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
    const L = len[N];
    return Array.from({ length: n }, (_, k) => {
      const target = k * L / n; let i = 0; while (len[i] < target) i++;
      return 90 + i / 2;
    });
  }
  // Bàn bầu dục dùng chung cho mọi trò. Mình ngồi giữa phía dưới, các ghế xếp theo thứ tự đi.
  // Poker đi theo chiều kim đồng hồ (như sòng quốc tế); xì dách, bài cào, tiến lên đi ngược chiều kim đồng hồ.
  const ringDir = r => (r.game === 'poker' ? 1 : -1);
  function ringOrder(r) {
    // xì dách: nhà con rút lần lượt, nhà cái rút sau cùng
    if (r.game === 'xidach' && r.dealer) return [...r.seats.filter(s => s.id !== r.dealer), ...r.seats.filter(s => s.id === r.dealer)];
    return r.seats;
  }
  function ringTable(r, mine, center) {
    const seats = ringOrder(r), n = seats.length, angs = pkAngles(n), dir = ringDir(r);
    const M = d => (dir === 1 ? d : 180 - d); // ngược chiều kim đồng hồ: lật gương trái/phải
    const start = mine ? seats.indexOf(mine) : 0;
    const ring = seats.map((_, k) => seats[(start + k) % n]);
    const live = r.phase !== 'done';
    let html = '<div class="pk-oval" aria-hidden="true"></div><svg class="pk-track" aria-hidden="true"><path class="pk-track-base"/><path class="pk-track-run"/></svg>';
    ring.forEach((seat, k) => {
      const deg = angs[k], nextDeg = k + 1 < n ? angs[k + 1] : 450, step = nextDeg - deg;
      const self = k === 0 && mine;
      html += `<div class="pk-pos" style="${pkAt(M(deg))}">${self ? (r.game === 'poker' ? pkSelf(r, mine) : ringSelf(r, mine)) : seatHTML(seat, r)}</div>`;
      // poker: chip cược đặt trước ghế, nút D đặt lệch bên cạnh
      if (live && seat.bet) html += `<span class="chip pk-bet" style="${pkAt(M(deg), .6)}">${seat.bet}</span>`;
      if (seat.btn) html += `<span class="pk-dbtn" title="Nút chia bài" style="${pkAt(M(deg - Math.min(22, step / 2.6)), .68)}">D</span>`;
      // mũi tên giữa ghế này và ghế kế tiếp, chỉ chiều đi
      if (n > 1) {
        const on = live && r.turn === seat.id;
        html += `<span class="pk-arrow ${on ? 'on' : ''}" data-a="${M(deg + step / 2)}" style="${pkAt(M(deg + step / 2))}" aria-hidden="true"><i>➜</i></span>`;
      }
    });
    const dirTxt = dir === 1 ? '<b aria-hidden="true">↻</b> chiều kim đồng hồ' : '<b aria-hidden="true">↺</b> ngược chiều kim đồng hồ';
    return `<div class="pk-table g-${r.game} n${n} ${n >= 7 ? 'dense' : ''} ${n >= 10 ? 'crowd' : ''}" data-dir="${dir}" ${pkH ? `style="height:${pkH}px"` : ''}>${html}<div class="pk-mid">${center}${r.phase !== 'done' ? `<div class="pk-status">${statusText(r, mine)}</div>` : ''}</div><div class="pk-log" aria-live="polite">${S.log.slice(-2).map(l => `<div>${esc(l.msg)}</div>`).join('')}</div><span class="pk-dir" title="Chiều đi của lượt">${dirTxt}</span></div>`;
  }
  // xoay mũi tên theo đúng hướng tiếp tuyến của mép bàn (cần kích thước thật của bàn)
  let pkH = 0; // chiều cao bàn vừa khít khung (đo sau khi vẽ)
  function orientArrows() {
    const t = app.querySelector('.pk-table'); if (!t) return;
    // bàn cao vừa đúng phần còn trống của khung chơi, không phải cuộn
    const felt = app.querySelector('.felt');
    if (felt) {
      const inner = t.parentElement, ics = getComputedStyle(inner), fcs = getComputedStyle(felt);
      const kids = [...inner.children].filter(c => c !== t && getComputedStyle(c).display !== 'none');
      const others = kids.reduce((h, c) => h + c.offsetHeight, 0) + kids.length * (parseFloat(ics.rowGap) || 0);
      const room = felt.clientHeight - parseFloat(fcs.paddingTop) - parseFloat(fcs.paddingBottom);
      const want = Math.round(Math.max(200, Math.min(640, room - others - 6)));
      if (Math.abs(t.offsetHeight - want) > 6) { pkH = want; t.style.height = want + 'px'; }
      felt.scrollTop = 0;
    }
    const cs = getComputedStyle(t);
    const W = t.clientWidth / 2 - parseFloat(cs.getPropertyValue('--mx')), H = t.clientHeight / 2 - parseFloat(cs.getPropertyValue('--my'));
    const dir = +t.dataset.dir || 1;
    // vệt chạy dọc mép bàn theo chiều đi: theo chiều kim đồng hồ thì quét dương, ngược lại quét âm
    const svg = t.querySelector('.pk-track');
    if (svg) {
      const tw = t.clientWidth, th = t.clientHeight, cx = tw / 2, cy = th / 2, sw = dir === 1 ? 1 : 0;
      svg.setAttribute('viewBox', `0 0 ${tw} ${th}`);
      const d = `M${cx + W} ${cy}A${W} ${H} 0 1 ${sw} ${cx - W} ${cy}A${W} ${H} 0 1 ${sw} ${cx + W} ${cy}`;
      svg.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    }
    // kích thước đổi nhiều thì vẽ lại để chia ghế theo đúng hình bàn
    const changed = !pkDims || Math.abs(pkDims.a - W) > 20 || Math.abs(pkDims.b - H) > 20;
    pkDims = { a: W, b: H };
    if (changed && !orientArrows.busy) { orientArrows.busy = true; render(); orientArrows.busy = false; return; }
    t.querySelectorAll('.pk-arrow').forEach(el => {
      const a = +el.dataset.a * Math.PI / 180;
      el.firstChild.style.transform = `rotate(${Math.atan2(dir * H * Math.cos(a), -dir * W * Math.sin(a)) * 180 / Math.PI}deg)`;
    });
    // ghế nào lòi ra ngoài bàn (ghế cao, có chuông, có nút 😈 phía trên) thì đẩy vào trong
    const tr = t.getBoundingClientRect();
    t.querySelectorAll('.pk-pos').forEach(el => {
      el.style.translate = '';
      const r = el.getBoundingClientRect();
      const top = tr.top + 16, bottom = tr.bottom - 4, left = tr.left + 14, right = tr.right - 4;
      const dy = r.top < top ? top - r.top : r.bottom > bottom ? Math.max(top - r.top, bottom - r.bottom) : 0;
      const dx = r.left < left ? left - r.left : r.right > right ? right - r.right : 0;
      if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
    });
    fitMid(t, tr);
    const seatRs = [...t.querySelectorAll('.pk-pos')].map(e => e.getBoundingClientRect());
    const ccx = tr.left + tr.width / 2, ccy = tr.top + tr.height / 2;
    // chip cược / nút D bị ghế hoặc khu giữa che thì ẩn đi (số tiền vẫn ghi trên ghế)
    const midR = (t.querySelector('.pk-mid .pk-center') || t).getBoundingClientRect();
    t.querySelectorAll('.pk-bet, .pk-dbtn').forEach(el => {
      el.style.visibility = '';
      const r = el.getBoundingClientRect();
      const hit = s => r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top;
      if (seatRs.some(hit) || hit(midR)) el.style.visibility = 'hidden';
    });
  }
  // Đặt khu giữa bàn (5 lá chung, hũ, trạng thái) vào khoảng trống giữa các ghế, chật thì thu nhỏ lại
  function fitMid(t, tr) {
    const mid = t.querySelector('.pk-mid'); if (!mid) return;
    const center = mid.querySelector('.pk-center');
    const seats = [...t.querySelectorAll('.pk-pos')].map(e => e.getBoundingClientRect());
    const cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2, gap = 6;
    // thử một kiểu xếp (ngang hoặc dọc), trả về mức thu nhỏ cần thiết và khoảng trống tìm được
    const fit = dir => {
      if (center) center.style.flexDirection = dir;
      mid.style.left = ''; mid.style.top = ''; mid.style.transform = '';
      const m0 = mid.getBoundingClientRect(), W = m0.width, H = m0.height;
      // khoảng trống quanh khu giữa khi nó rộng w (chỉ tính ghế nằm ngang hàng với khu giữa)
      const space = w => {
        const L = cx - w / 2, R = cx + w / 2;
        let top = tr.top + gap, bottom = tr.bottom - gap;
        seats.forEach(r => {
          if (r.right <= L || r.left >= R) return;
          if ((r.top + r.bottom) / 2 < cy) top = Math.max(top, r.bottom + gap); else bottom = Math.min(bottom, r.top - gap);
        });
        let left = tr.left + gap, right = tr.right - gap;
        seats.forEach(r => {
          if (r.bottom <= top || r.top >= bottom) return;
          if ((r.left + r.right) / 2 < cx) left = Math.max(left, r.right + gap); else right = Math.min(right, r.left - gap);
        });
        return { top, bottom, left, right };
      };
      // thu nhỏ dần tới khi vừa
      let box = null;
      for (let s = 1; s >= .4; s -= .05) {
        const b = space(W * s);
        box = { s, ...b };
        if (H * s <= b.bottom - b.top && W * s <= b.right - b.left) break;
      }
      return box;
    };
    const row = fit('row'), col = fit('column');
    const [dir, b] = row.s >= col.s ? ['row', row] : ['column', col];
    if (center) center.style.flexDirection = dir;
    mid.style.left = ((b.left + b.right) / 2 - tr.left) + 'px';
    mid.style.top = ((b.top + b.bottom) / 2 - tr.top) + 'px';
    mid.style.transform = b.s < 1 ? `translate(-50%, -50%) scale(${b.s.toFixed(3)})` : '';
  }
  addEventListener('resize', () => orientArrows());
  let raise = { open: false, to: 0, key: null };
  function pkRaiseBar(r) {
    const pot = r.pot, call = r.toCall;
    const clamp = v => Math.max(r.minRaiseTo, Math.min(r.maxRaiseTo, Math.round(v)));
    const presets = [['Tối thiểu', r.minRaiseTo], ['½ hũ', clamp(r.high + (pot + call) / 2)], ['Cả hũ', clamp(r.high + pot + call)], ['Tất tay', r.maxRaiseTo]];
    return `<div class="raise-bar">
      <div class="rb-presets">${presets.map(([t, v]) => `<button class="btn small ghost ${raise.to === v ? 'on' : ''}" data-raise-to="${v}">${t}</button>`).join('')}<button class="btn small ghost" data-raise-close aria-label="Đóng">✕</button></div>
      <input type="range" min="${r.minRaiseTo}" max="${r.maxRaiseTo}" step="1" value="${raise.to}" data-raise-range aria-label="Số chip muốn tố">
      <div class="rb-row"><span>${r.minRaiseTo}</span><span class="rb-step"><button class="btn small ghost" data-raise-step="-1" aria-label="Bớt ${S.bet}">−</button><b>Tố lên <span data-raise-val>${raise.to}</span></b><button class="btn small ghost" data-raise-step="1" aria-label="Thêm ${S.bet}">+</button></span><span>${r.maxRaiseTo}</span></div>
    </div>`;
  }
  // Tất tay: bài mọi người ngửa ra trước, rồi lật 3 lá, lá thứ tư, lá cuối, mỗi lần cách nhau một nhịp
  const runAnim = {}; // id ván -> lúc bắt đầu lật
  const RUN_STEP = 1500;
  function pkRunout(r) {
    if (!r || r.game !== 'poker' || r.phase !== 'done' || r.runFrom == null || r.runFrom >= 5) return null;
    if (!(r.id in runAnim)) runAnim[r.id] = firstPaint || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Date.now();
    const steps = [3, 4, 5].filter(x => x > r.runFrom);
    const k = Math.floor((Date.now() - runAnim[r.id]) / RUN_STEP);
    if (k >= steps.length) return null;
    const vis = k > 0 ? steps[k - 1] : r.runFrom;
    // hẹn vẽ lại ở bước kế tiếp
    clearTimeout(pkRunout.t);
    pkRunout.t = setTimeout(() => { sfx('flip'); render(); }, runAnim[r.id] + (k + 1) * RUN_STEP - Date.now() + 20);
    return {
      ...r, phase: 'showing', board: r.board.slice(0, vis), winners: null, winLabel: null, pots: null, high: 0, sidePots: null,
      seats: r.seats.map(s => ({ ...s, win: false, best: null, net: null, info: null, bet: 0, last: s.folded ? 'Bỏ bài' : 'Tất tay' })),
    };
  }
  function pkCenter(r) {
    const slots = Array.from({ length: 5 }, (_, i) => r.board[i]
      ? card(r.board[i], r.seats.some(s => s.best && s.best.includes(r.board[i].id)) ? 'hi' : '', `data-k="${r.id}:board:${i}" data-i="${i}" data-j="99"`)
      : '<div class="card slot"></div>').join('');
    return `<div class="center pk-center">
      <div class="cards board">${slots}</div>
      <div class="pk-pot"><span class="chip big">${r.pot}</span><span>Hũ</span>${r.phase !== 'done' ? `<small>${r.phase === 'showing' ? 'Đang lật bài chung' : PK_PHASE[r.phase] + (r.high ? ` · mức cược vòng này <b>${r.high}</b>` : ' · chưa ai tố')}</small>` : ''}</div>
      ${r.sidePots && r.sidePots.length > 1 ? `<div class="pk-pots">${r.sidePots.map((v, i) => `<span>${i ? 'Hũ phụ' + (r.sidePots.length > 2 ? ' ' + i : '') : 'Hũ chính'} <b>${v}</b></span>`).join('')}</div>` : ''}
    </div>`;
  }
  // khung kết quả ván (xì dách, bài cào, tiến lên)
  function roundResult(r, mine, canStart) {
    let meRes = mine && mine.result != null && r.dealer !== S.me ? `<span class="pr-me">Bạn ${money(mine.result * S.bet)}</span>` : '';
    if (mine && r.starDelta) {
      const d = r.starDelta[S.me] || 0, me = S.players.find(p => p.id === S.me) || {};
      const took = (r.steals || []).filter(s => s.to === S.me).map(s => `cướp ${s.n} của ${pname(s.from)}`);
      const lost = (r.steals || []).filter(s => s.from === S.me).map(s => `bị ${pname(s.to)} cướp ${s.n}`);
      meRes += `<span class="pr-me pr-star">⭐ ${d > 0 ? '+' + d : d} → ${me.stars || 0} sao · ${tierOf(me.stars).name}${[...took, ...lost].length ? ' (' + [...took, ...lost].join(', ') + ')' : ''}</span>`;
    }
    return `<div class="pk-result" role="status"><b class="pr-main">${ico('🎉')} ${statusText(r, mine)}</b>${meRes}${canStart ? '' : '<small>Đợi chủ phòng hoặc nhà cái chia ván mới</small>'}</div>`;
  }
  // khung kết quả ván poker, nằm ngoài bàn để không bị ghế che
  function pkResult(r, mine) {
    const who = id => id === S.me ? 'Bạn' : pname(id);
    const pots = r.pots && r.pots.length > 1
      ? r.pots.map((p, i) => `<span>${i ? 'Hũ phụ' : 'Hũ chính'} <b>${p.amount}</b> → ${p.winners.map(who).join(', ')}</span>`).join('') : '';
    const me = mine && mine.net != null ? `<span class="pr-me">Bạn ${mine.net > 0 ? 'được' : mine.net < 0 ? 'mất' : 'hòa'}${mine.net ? ' ' + money(mine.net) : ''}</span>` : '';
    const d = mine && r.starDelta ? r.starDelta[S.me] || 0 : 0, pme = S.players.find(p => p.id === S.me) || {};
    const star = mine ? `<span class="pr-me pr-star">⭐ ${d > 0 ? '+' + d : d} → ${pme.stars || 0} sao · ${tierOf(pme.stars).name}</span>` : '';
    return `<div class="pk-result" role="status"><b class="pr-main">${ico('🎉')} ${pkStatus(r, mine, false)}</b>${pots ? `<div class="pk-pots">${pots}</div>` : ''}${me}${star}</div>`;
  }
  function pkStatus(r, mine, myTurn) {
    if (r.phase === 'showing') return 'Tất tay! Đang lật bài…';
    if (r.phase === 'done') {
      if (r.pots && r.pots.length > 1 && r.winLabel) return `${r.pots[0].winners.map(id => id === S.me ? 'Bạn' : pname(id)).join(', ')} ăn hũ chính với ${esc(r.winLabel)}`;
      const w = (r.winners || []).map(id => id === S.me ? 'Bạn' : pname(id)).join(', ');
      return r.winLabel ? `${w} thắng với ${esc(r.winLabel)}` : `${w} ăn hũ, mọi người bỏ bài`;
    }
    if (!mine) return watchMsg();
    if (mine.folded) return `Bạn đã bỏ bài. Đợi ${pname(r.turn)}`;
    if (myTurn) return r.toCall ? `Tới lượt bạn: theo ${r.toCall}${r.canRaise ? `, tố lên từ ${r.minRaiseTo}` : ""} hoặc bỏ bài` : 'Tới lượt bạn: xem hoặc tố';
    return `Đợi ${pname(r.turn)}`;
  }
  function watchMsg() {
    const me = S.players.find(p => p.id === S.me) || {};
    if (me.sitOut) return 'Bạn đang nghỉ, ngồi xem';
    if (S.game === 'poker' && me.chips <= 0) return 'Bạn hết chip, đang ngồi xem';
    return (S.next || []).includes(S.me) ? 'Bạn đang xem, ván sau sẽ được chia bài' : 'Bạn đang xem, bàn đã đủ người';
  }
  function statusText(r, mine) {
    const myTurn = r.turn === S.me && r.phase !== 'done';
    if (r.game === 'poker') return pkStatus(r, mine, myTurn);
    if (r.phase === 'done') {
      if (r.toiTrang) return `${pname(r.toiTrang.by)} tới trắng: ${esc(r.toiTrang.label)}`;
      if (r.ranking) return `${pname(r.ranking[0])} về nhất`;
      return 'Hết ván';
    }
    if (!mine) return watchMsg();
    if (r.game === 'xidach') {
      if (r.phase === 'players') return myTurn ? 'Tới lượt bạn: rút hoặc dằn' : `Đợi ${pname(r.turn)}`;
      return myTurn ? 'Bạn là cái: rút thêm, xét từng người hoặc xét hết' : `Nhà cái ${pname(r.dealer)} đang rút và xét`;
    }
    if (r.game === 'baicao') return S.me === r.dealer ? 'Bạn là cái: lật hết khi mọi người sẵn sàng' : 'Lật bài của bạn, đợi nhà cái lật hết';
    if (r.game === 'tienlen') {
      if (myTurn) return r.table ? 'Tới lượt bạn: chặn hoặc bỏ lượt' : 'Bạn được đánh trước';
      return `Đợi ${pname(r.turn)}`;
    }
    return '';
  }

  // người trong phòng nhưng không có ghế ở ván này (vào giữa ván, hoặc quá số người tối đa)
  function watchersHTML(r) {
    const w = S.players.filter(p => !r.seats.some(x => x.id === p.id));
    if (!w.length) return '';
    return `<div class="watchers"><span>Đang ngồi xem:</span>${w.map(p => `<b data-pid="${p.id}" class="${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === S.me ? ' (bạn)' : ''}${p.sitOut ? ' · nghỉ' : S.game === 'poker' && p.chips <= 0 ? ' · hết chip' : (S.next || []).includes(p.id) ? ' · ván sau vào' : ' · chờ chỗ'}</b>`).join('')}</div>`;
  }
  function renderRoom() {
    const g = GAMES[S.game], r = S.round, isHost = S.me === S.hostId;
    const mine = r && r.seats.find(x => x.id === S.me);
    const others = r ? r.seats.filter(x => x.id !== S.me) : [];
    const canStart = (!r || r.phase === 'done') && (isHost || (g.dealer && S.me === S.dealerId) || S.game === 'poker');
    const me = S.players.find(p => p.id === S.me) || { points: 0 };

    let center = '';
    if (r && r.game === 'tienlen') {
      center = `<div class="center">${r.table
        ? `<div class="cards">${r.table.cards.map(c => card(c)).join('')}</div><small>${pname(r.table.by)} đánh ${esc(r.table.label)}</small>`
        : `<small>Bàn trống</small>`}</div>`;
    }
    if (r && r.game === 'poker') center = pkCenter(r);
    // xì dách, bài cào: bộ bài giữa bàn (bài chia ra từ đây)
    if (r && (r.game === 'xidach' || r.game === 'baicao')) center = `<div class="center deck-center"><div class="cards">${card(null)}</div></div>`;
    let body;
    if (!r) {
      body = `<div class="panel-wrap">${panelHTML()}</div>`;
    } else {
      body = `
        ${ringTable(r, mine, center)}
        ${watchersHTML(r)}
        <div class="status pk-hide">${statusText(r, mine)}${r.phase === 'done' && !canStart ? '<small>Đợi chủ phòng hoặc nhà cái chia ván mới</small>' : ''}</div>
        <div class="feed pk-hide">${S.log.slice(-3).map(l => `<div>${esc(l.msg)}</div>`).join('')}</div>`;
    }

    // phần của mình
    let hand = '', actions = '', head = '', raiseBar = '';
    if (r && mine) {
      const myTurn = r.turn === S.me && r.phase !== 'done';
      const resTxt = r.game === 'poker' ? (mine.net != null ? ' ' + money(mine.net) : '') : mine.result != null && S.me !== r.dealer ? ' ' + money(mine.result * S.bet) : '';
      const myJ = r.seats.indexOf(mine);
      const nan = r.game !== 'tienlen' ? squeeze(r, mine, myJ) : null;
      const locked = nan && nan.hidden > 0;
      let infoTxt = locked ? 'Vuốt lá bài để nặn' : mine.info ? esc(mine.info) : '';
      if (r.game === 'tienlen') infoTxt = (mine.place ? `Về thứ ${mine.place}` : `${mine.count} lá`)
        + (mine.cards && mine.cards.length > 1 ? ` <span class="sort-tools">Xếp <button class="btn small ghost" data-sort="rank">Số</button><button class="btn small ghost" data-sort="suit">Chất</button></span>` : '');
      head = `<div class="me-head ${isRinging(S.me) ? 'ringing' : ''}"><span><b class="${locked ? 'nan-hint' : ''}">${infoTxt}</b>${locked ? '' : resTxt}${r.dealer === S.me ? ' <span class="badge">Cái</span>' : ''}${r.game === 'poker' ? pkBadges(mine) + (mine.bet && r.phase !== 'done' ? ` <span class="chip">${mine.bet}</span>` : '') : ''}${ringFx(S.me)}</span>
        <span>${locked ? '<button class="btn small ghost" data-quick>Lật nhanh</button> ' : ''}${myTurn && S.deadline ? `<span class="timer" data-dl="${S.deadline}"></span> ` : ''}${me.sitOut ? '' : '<button class="btn small ghost sit-mini" data-sitout="once" title="Nghỉ ván sau, rồi tự vào lại">Nghỉ 1 ván</button><button class="btn small ghost sit-mini" data-sitout="1" title="Nghỉ tới khi bấm vào lại">Nghỉ luôn</button> '}${r.game === 'poker' ? chipTxt(mine.chips) + ' · ' : ''}${me.points} điểm</span></div>`;
      if (r.game === 'tienlen') {
        hand = `<div class="hand tl">${orderedHand(r, mine.cards || []).map((c, i) => card(c, sel.has(c.id) ? 'sel' : '', dk(r, myJ, S.me, i))).join('')}</div>`;
        if (r.phase !== 'done') actions = `
          <button class="btn ghost" data-act="pass" ${myTurn && r.table ? '' : 'disabled'}>Bỏ lượt</button>
          <button class="btn ghost" data-clear ${sel.size ? '' : 'disabled'}>Bỏ chọn</button>
          <button class="btn" data-act="play" ${myTurn && sel.size ? '' : 'disabled'}>Đánh</button>`;
      } else {
        hand = nan.html;
        if (r.game === 'xidach' && r.phase !== 'done') {
          if (r.phase === 'players' && S.me !== r.dealer) actions = `
            <button class="btn ghost" data-act="stand" ${myTurn && !locked && !(parseInt(mine.info) < 16 && mine.count < 5) ? '' : 'disabled'}>Dằn</button>
            <button class="btn" data-act="hit" ${myTurn && !locked ? '' : 'disabled'}>Rút bài</button>`;
          else if (S.me === r.dealer) actions = `
            <button class="btn ghost" data-act="checkAll" ${myTurn && !locked ? '' : 'disabled'}>Xét hết</button>
            <button class="btn" data-act="hit" ${myTurn && !locked ? '' : 'disabled'}>Rút bài</button>`;
        }
        if (r.game === 'poker' && r.phase === 'showing') actions = '<div class="hint" style="flex:1">Tất tay! Đang lật bài chung…</div>';
        else if (r.game === 'poker' && r.phase !== 'done') {
          if (mine.folded) actions = '<div class="hint" style="flex:1">Bạn đã bỏ bài, đợi hết ván</div>';
          else {
            const dis = myTurn && !locked ? '' : 'disabled';
            const rk = r.id + ':' + r.phase + ':' + r.high + ':' + mine.bet;
            if (raise.key !== rk) raise = { open: false, to: r.minRaiseTo, key: rk };
            raise.to = Math.max(r.minRaiseTo, Math.min(r.maxRaiseTo, raise.to));
            const canR = myTurn && !locked && r.canRaise;
            if (!canR) raise.open = false;
            actions = `
            <button class="btn ghost" data-act="fold" ${dis}>Bỏ bài</button>
            ${r.toCall ? `<button class="btn ghost" data-act="call" ${dis}>${r.callAllIn ? 'Tất tay ' + r.toCall : 'Theo ' + r.toCall}</button>` : `<button class="btn ghost" data-act="check" ${dis}>Xem</button>`}
            ${raise.open ? `<button class="btn" data-raise-go>${raise.to >= r.maxRaiseTo ? 'Tất tay ' : r.high ? 'Tố lên ' : 'Tố '}<span data-raise-val>${raise.to}</span></button>`
              : `<button class="btn" data-raise-open ${canR ? '' : 'disabled'}>${r.high ? 'Tố thêm' : 'Tố'}…</button>`}`;
            if (raise.open) raiseBar = pkRaiseBar(r);
          }
        }
        if (r.game === 'baicao' && r.phase !== 'done') {
          actions = `<button class="btn ghost" data-act="flip" ${mine.flipped || locked ? 'disabled' : ''}>${mine.flipped ? 'Đã lật' : 'Lật bài'}</button>`;
          if (S.me === r.dealer) actions += `<button class="btn" data-act="reveal">Lật hết, tính tiền</button>`;
        }
      }
    } else if (r && !mine) {
      head = `<div class="hint">Bạn đang ngồi xem</div>`;
    }
    if (canStart) actions = `<button class="btn red" data-start>${r ? 'Chia ván mới' : 'Chia bài'}</button>`;
    else if (!r) actions = `<div class="hint" style="flex:1">Đợi chủ phòng chia bài</div>`;

    app.innerHTML = `
      <div class="room g-${S.game}">
        ${socket.connected ? '' : '<div class="offline-bar">Mất kết nối, đang nối lại…</div>'}
        <header class="bar">
          <button class="code-chip" data-share aria-label="Chia sẻ mã phòng">${S.code}</button>
          <div class="bar-title"><b>${g.name}</b>${S.game === 'poker' ? `Mù ${Math.max(1, Math.floor(S.bet / 2))}/${S.bet}` : `Cược ${S.bet}`}${g.dealer && S.dealerId ? `, cái: ${pname(S.dealerId)}` : ''}</div>
          <button class="btn small ghost chat-btn ${chatOpen ? 'on' : ''}" data-chat aria-label="Trò chuyện${unread ? `, ${unread} tin chưa đọc` : ''}">${ico('💬')}${unread ? `<span class="unread">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
          ${r ? '<button class="btn small ghost" data-sheet>Phòng</button>' : ''}
        </header>
        <section class="felt"><div class="room-inner" style="display:flex;flex-direction:column;gap:12px">${body}</div></section>
        <section class="me"><div class="room-inner" style="display:flex;flex-direction:column;gap:10px">
          ${r && r.phase === 'done' ? (r.game === 'poker' ? pkResult(r, mine) : roundResult(r, mine, canStart)) : ''}${head}${hand}
          ${debtorRow()}${S.game === 'poker' ? loanRow() : ''}${seatRow()}${raiseBar}
          <div class="actions">${gameSwitch()}${actions}</div>
        </div></section>
      </div>
      ${sheetOpen && r ? `<div class="sheet-bg" data-close><div class="sheet" role="dialog" aria-label="Phòng">
        <div class="sheet-head"><h2>Phòng ${S.code}</h2><button class="btn small ghost" data-close>Đóng</button></div>
        ${panelHTML()}</div></div>` : ''}`;
    bind();
  }

  // ---------- Nặn bài ----------
  // Bài mới chia nằm thành một chồng úp. Vuốt lớp úp ra để thấy lá trên cùng,
  // vuốt tiếp lá trên cùng sang bên để lộ lá bên dưới.
  function squeeze(r, mine, j) {
    const cards = mine.cards || [];
    const key = c => r.id + ':' + c.id;
    if (r.phase === 'done') cards.forEach(c => revealed.add(key(c)));
    const shown = cards.filter(c => revealed.has(key(c)));
    const hidden = cards.filter(c => !revealed.has(key(c)));
    const open = pileOpen === r.id + ':' + cards.length;
    const fan = `<div class="fan">${shown.map(c => card(c, c.id === justRevealed ? 'pop' : '')).join('')}</div>`;
    let pile = '';
    if (hidden.length) {
      const stack = [...hidden].reverse(); // phần tử cuối nằm trên cùng
      pile = `<div class="pile" ${dk(r, j, S.me, 'p' + cards.length).replace(/data-i="[^"]*"/, `data-i="${shown.length}"`)}>` +
        stack.map((c, i) => {
          const top = i === stack.length - 1;
          return `<div class="pc" style="--o:${stack.length - 1 - i}" ${top && open ? `data-drag="card" data-cid="${c.id}"` : ''}>${card(c)}</div>`;
        }).join('') +
        (open ? '' : `<div class="pc cover hint" style="--o:0" data-drag="cover">${card(null)}</div>`) + `</div>`;
    }
    // còn đúng một lá đã lộ mặt thì tự gom vào tay
    clearTimeout(autoTimer);
    if (hidden.length === 1 && open) autoTimer = setTimeout(() => peel('card', hidden[0].id), 700);
    return { hidden: hidden.length, html: `<div class="hand sq ${hidden.length ? '' : 'all'}" style="--n:${Math.max(1, shown.length)}">${fan}${pile}</div>` };
  }
  function peel(kind, cid) {
    const r = S && S.round; if (!r) return;
    const mine = r.seats.find(x => x.id === S.me); if (!mine) return;
    if (kind === 'cover') pileOpen = r.id + ':' + mine.cards.length;
    else { revealed.add(r.id + ':' + cid); justRevealed = +cid; }
    if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
    saveNan(); render();
  }
  function quickReveal() {
    const r = S.round, mine = r.seats.find(x => x.id === S.me);
    mine.cards.forEach(c => revealed.add(r.id + ':' + c.id)); justRevealed = null;
    saveNan(); render();
  }
  function bindDrag() {
    app.querySelectorAll('[data-drag]').forEach(el => {
      el.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch {}
        dragging = true; el.classList.remove('hint'); el.classList.add('grab');
        const sx = e.clientX, sy = e.clientY, w = el.offsetWidth, h = el.offsetHeight;
        const move = ev => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
        };
        const up = ev => {
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
          el.classList.remove('grab');
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (Math.abs(dx) > w * 0.45 || Math.abs(dy) > h * 0.4) {
            el.style.transition = 'transform .22s ease-out, opacity .22s ease-out';
            el.style.transform = `translate(${dx * 2.2}px, ${dy * 2.2}px) rotate(${dx / 6}deg)`;
            el.style.opacity = '0';
            setTimeout(() => { dragging = false; pendingRender = false; peel(el.dataset.drag, el.dataset.cid); }, 200);
          } else {
            el.style.transition = 'transform .18s ease-out'; el.style.transform = '';
            setTimeout(() => { dragging = false; if (pendingRender) { pendingRender = false; render(); } }, 190);
          }
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
    });
  }
  // ---------- Hiệu ứng chia bài: lá mới bay từ giữa bàn về chỗ ----------
  function animateDeal() {
    const els = [...app.querySelectorAll('[data-k]')].filter(el => !seen.has(el.dataset.k));
    els.forEach(el => seen.add(el.dataset.k));
    const r = S.round;
    const newRound = r && r.id !== lastRoundId;
    if (r) lastRoundId = r.id;
    if (firstPaint) { firstPaint = false; return; }
    if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const src = app.querySelector('.center') || app.querySelector('.status') || app.querySelector('.felt');
    const fr = src.getBoundingClientRect();
    const ox = fr.left + fr.width / 2, oy = fr.top + fr.height / 2;
    const fx = fxFor(r ? r.id : 'x');
    // ván mới: xào bài giữa bàn trước rồi mới phát
    const intro = newRound && els.length > 2 ? shuffleShow(ox, oy) : 0;
    els.sort((a, b) => (parseInt(a.dataset.i) || 0) - (parseInt(b.dataset.i) || 0) || (+a.dataset.j - +b.dataset.j));
    const base = fx === 'snap' ? 45 : fx === 'arc' ? 95 : 80;
    const step = Math.min(base, 1700 / els.length);
    els.forEach((el, n) => {
      const b = el.getBoundingClientRect();
      const dx = ox - b.left - b.width / 2, dy = oy - b.top - b.height / 2;
      el.style.setProperty('--dx', dx + 'px');
      el.style.setProperty('--dy', dy + 'px');
      // điểm giữa vòng cung: lệch lên trên, cong về phía ngoài
      el.style.setProperty('--mx', dx / 2 + (dx > 0 ? -1 : 1) * Math.min(80, Math.abs(dy) / 3) + 'px');
      el.style.setProperty('--my', dy / 2 - 90 + 'px');
      el.style.setProperty('--rot', ((n % 2 ? 1 : -1) * (8 + (n * 37) % 20)) + 'deg');
      const delay = intro + Math.round(n * step);
      el.style.animationDelay = delay + 'ms';
      el.classList.remove('dealing', 'fx-fly', 'fx-spin', 'fx-flip', 'fx-arc', 'fx-snap');
      void el.offsetWidth;
      el.classList.add('dealing', 'fx-' + fx);
      sfx('deal', delay);
      if (fx === 'flip' && el.dataset.id) sfx('flip', delay + 330);
      // lá bài vàng: tới tay thì nổ tia sao
      if (el.classList.contains('fx')) setTimeout(() => {
        const b = el.getBoundingClientRect(), g = document.createElement('div');
        g.className = 'gold-burst'; g.style.left = (b.left + b.width / 2) + 'px'; g.style.top = (b.top + b.height / 2) + 'px';
        g.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
        document.body.appendChild(g); sfx('chat'); setTimeout(() => g.remove(), 900);
      }, delay + 520);
    });
    deckShow(ox, oy, intro, intro + els.length * step + 200);
  }
  // Bộ bài nằm giữa bàn, vơi dần trong lúc phát
  function deckShow(x, y, from, until) {
    const d = document.createElement('div');
    d.className = 'deck-fx';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.innerHTML = '<div class="card back"></div><div class="card back"></div><div class="card back"></div>';
    d.style.animation = `deckIn .2s ease-out ${Math.max(0, from - 80)}ms backwards, deckOut .3s ease-in ${until}ms forwards`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), until + 400);
  }
  // Xào bài: hai nửa bộ bài tách ra rồi đan vào nhau, 2 lần
  function shuffleShow(x, y) {
    const w = document.createElement('div');
    w.className = 'shuffle-fx';
    w.style.left = x + 'px'; w.style.top = y + 'px';
    let html = '';
    for (let i = 0; i < 6; i++) html += `<div class="card back sh ${i % 2 ? 'r' : 'l'}" style="--i:${i}"></div>`;
    w.innerHTML = html;
    document.body.appendChild(w);
    for (let k = 0; k < 6; k++) sfx('shuffle', 120 + k * 95);
    setTimeout(() => w.remove(), 900);
    return 760;
  }

  // ---------- Hỏi lại trước các quyết định quan trọng (bấm nhầm là mất tiền, mất ván) ----------
  const askEl = document.createElement('div');
  askEl.className = 'ask-box confirm-box'; askEl.hidden = true;
  askEl.setAttribute('role', 'alertdialog'); askEl.setAttribute('aria-modal', 'true');
  const askBg = document.createElement('div'); askBg.className = 'confirm-bg'; askBg.hidden = true;
  document.body.append(askBg, askEl);
  const closeAsk = () => { askEl.hidden = true; askBg.hidden = true; clearInterval(closeAsk.t); };
  askBg.onclick = closeAsk;
  // opts: title, lines (mảng chuỗi HTML), warn, yes, no, onYes, alive (hàm: còn hợp lệ không, ví dụ còn đúng lượt)
  function confirmBox(o) {
    askEl.innerHTML = `<p><b>${o.title}</b></p>${o.warn ? `<small class="warn">${o.warn}</small>` : ''}${(o.lines || []).filter(Boolean).map(l => `<small>${l}</small>`).join('')}
      <div class="ask-btns"><button class="btn ghost" data-ask-no>${o.no || 'Không'}</button><button class="btn ${o.safe ? '' : 'red'}" data-ask-yes>${o.yes}</button></div>`;
    askEl.setAttribute('aria-label', o.title.replace(/<[^>]+>/g, ''));
    askEl.hidden = false; askBg.hidden = false;
    askEl.querySelector('[data-ask-no]').focus();
    askEl.querySelector('[data-ask-no]').onclick = closeAsk;
    askEl.querySelector('[data-ask-yes]').onclick = () => { closeAsk(); o.onYes(); };
    clearInterval(closeAsk.t);
    if (o.alive) closeAsk.t = setInterval(() => { if (!o.alive()) closeAsk(); }, 300);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !askEl.hidden) closeAsk(); });
  // còn đúng lượt của mình ở ván này không (hết lượt thì tự đóng hộp hỏi)
  const sameTurn = () => { const r = S && S.round, key = r && r.id + ':' + r.turn; return () => { const x = S && S.round; return !!x && x.id + ':' + x.turn === key && x.phase !== 'done'; }; };
  function askForgive(id) {
    const d = debtOf(S.me, id); if (!d) return;
    confirmBox({ title: `Xóa nợ cho ${pname(id)}?`, yes: 'Xóa nợ', no: 'Không', lines: [`Bạn sẽ không đòi lại ${d.amount} chip nữa.`], onYes: () => emit('loan:forgive', { debtor: id }) });
  }
  function confirmFold() {
    const r = S && S.round, mine = r && r.seats.find(x => x.id === S.me);
    if (!r || !mine) return;
    confirmBox({
      title: 'Bỏ bài ván này?', yes: 'Bỏ bài', no: 'Không, chơi tiếp', alive: sameTurn(),
      warn: r.game === 'poker' && !r.toCall ? 'Bạn đang được <b>Xem</b> miễn phí, không cần bỏ bài.' : '',
      lines: [r.toCall ? `Đang phải theo <b>${r.toCall}</b> chip để chơi tiếp.` : '', 'Chip đã bỏ vào hũ ván này sẽ mất.'],
      onYes: () => emit('act', { type: 'fold' }),
    });
  }
  function confirmAllIn(onYes) {
    const r = S.round, mine = r.seats.find(x => x.id === S.me);
    confirmBox({
      title: `Tất tay <b>${r.maxRaiseTo}</b> chip?`, yes: 'Tất tay!', no: 'Thôi', alive: sameTurn(),
      lines: [`Bạn đặt toàn bộ ${mine.chips} chip còn lại. Thua là hết chip, phải ngồi xem.`], onYes,
    });
  }

  function bind() {
    bindDrag();
    const q = app.querySelector('[data-quick]'); if (q) q.onclick = quickReveal;
    bindPanel(app);
    app.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const type = b.dataset.act;
      if (type === 'play') return emit('act', { type, cards: [...sel] }).then(r => { if (r.ok) sel.clear(); render(); });
      if (type === 'fold') return confirmFold();
      const r = S.round;
      if (type === 'call' && r && r.game === 'poker' && r.callAllIn) return confirmBox({
        title: `Theo tất tay <b>${r.toCall}</b> chip?`, yes: 'Tất tay theo', no: 'Thôi', alive: sameTurn(),
        lines: ['Số chip này là toàn bộ chip bạn còn. Thua là phải ngồi xem.'], onYes: () => emit('act', { type }),
      });
      if (type === 'checkAll') return confirmBox({
        title: 'Xét hết các nhà?', yes: 'Xét hết', no: 'Chưa', alive: sameTurn(),
        lines: ['Lật bài tất cả nhà con và tính tiền ngay, không rút thêm được nữa.'], onYes: () => emit('act', { type }),
      });
      if (type === 'reveal') return confirmBox({
        title: 'Lật hết và tính tiền?', yes: 'Lật hết', no: 'Chưa', alive: () => !!(S && S.round && S.round.phase !== 'done'),
        lines: [`Còn ${r.seats.filter(s => !s.flipped && s.id !== S.me).length} nhà chưa tự lật bài.`], onYes: () => emit('act', { type }),
      });
      emit('act', { type });
    });
    const sc = app.querySelector('[data-showcards]'); if (sc) sc.onclick = () => emit('act', { type: 'show' });
    app.querySelectorAll('[data-sitout]').forEach(b => b.onclick = () => emit('sitout', { on: b.dataset.sitout === 'once' ? 'once' : b.dataset.sitout === '1' }));
    app.querySelectorAll('[data-order-to]').forEach(b => b.onclick = () => { unlockAudio(); emit('order', { to: b.dataset.orderTo, kind: b.dataset.order }); });
    app.querySelectorAll('[data-poop-to]').forEach(b => holdToSpam(b, b.dataset.poopTo, '💩'));
    app.querySelectorAll('[data-forgive-to]').forEach(b => b.onclick = () => askForgive(b.dataset.forgiveTo));
    app.querySelectorAll('[data-loan]').forEach(b => b.onclick = e => { e.stopPropagation(); openLoan(b.dataset.loan, b); });
    app.querySelectorAll('[data-repay]').forEach(b => b.onclick = () => {
      const d = myDebts().find(x => x.lender === b.dataset.repay); if (!d) return;
      const pay = Math.min(d.amount, chipsOf(S.me));
      confirmBox({ title: `Trả nợ ${pname(d.lender)} <b>${pay}</b> chip?`, yes: 'Trả nợ', no: 'Để sau', safe: true,
        lines: [pay < d.amount ? `Bạn chỉ đủ trả một phần, còn nợ ${d.amount - pay}.` : 'Trả xong là hết nợ, hết bị sai vặt.'],
        onYes: () => emit('loan:repay', { lender: d.lender }) });
    });
    const ro = app.querySelector('[data-raise-open]'); if (ro) ro.onclick = () => { raise.open = true; render(); };
    const rc = app.querySelector('[data-raise-close]'); if (rc) rc.onclick = () => { raise.open = false; render(); };
    app.querySelectorAll('[data-raise-step]').forEach(b => b.onclick = () => { const r = S.round; raise.to = Math.max(r.minRaiseTo, Math.min(r.maxRaiseTo, raise.to + +b.dataset.raiseStep * S.bet)); render(); });
    app.querySelectorAll('[data-raise-to]').forEach(b => b.onclick = () => { raise.to = +b.dataset.raiseTo; render(); });
    const rr = app.querySelector('[data-raise-range]');
    if (rr) rr.oninput = () => { raise.to = +rr.value; app.querySelectorAll('[data-raise-val]').forEach(x => { x.textContent = rr.value; }); };
    const rg = app.querySelector('[data-raise-go]');
    if (rg) rg.onclick = () => {
      const to = raise.to, r = S.round;
      if (to >= r.maxRaiseTo) return confirmAllIn(() => { raise.open = false; emit('act', { type: 'allin' }); });
      raise.open = false; emit('act', { type: 'raise', to });
    };
    app.querySelectorAll('[data-check]').forEach(b => b.onclick = () => emit('act', { type: 'check', target: b.dataset.check }));
    const st = app.querySelector('[data-start]'); if (st) st.onclick = () => emit('start');
    const cl = app.querySelector('[data-clear]'); if (cl) cl.onclick = () => { sel.clear(); render(); };
    bindHandDrag();
    app.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => sortHandBy(b.dataset.sort));
    app.querySelectorAll('[data-taunt][data-item]').forEach(b => holdToSpam(b, b.dataset.taunt, b.dataset.item));
    app.querySelectorAll('[data-taunt]:not([data-item])').forEach(b => b.onclick = e => {
      e.stopPropagation();
      popFor === b.dataset.taunt && !pop.hidden ? closeTaunt() : openTaunt(b.dataset.taunt, b);
    });
    app.querySelectorAll('[data-ring]').forEach(b => b.onclick = () => { unlockAudio(); emit('ring'); });
    const ch = app.querySelector('[data-chat]'); if (ch) ch.onclick = () => setChatOpen(!chatOpen);
    const sh = app.querySelector('[data-sheet]'); if (sh) sh.onclick = () => { sheetOpen = true; render(); };
    app.querySelectorAll('[data-close]').forEach(el => el.onclick = e => { if (e.target === el) { sheetOpen = false; render(); } });
    const share = app.querySelector('[data-share]');
    if (share) share.onclick = async () => {
      const url = `${location.origin}/?r=${S.code}`;
      if (navigator.share) { try { await navigator.share({ title: 'Vào bàn chơi bài', text: `Mã phòng ${S.code}`, url }); return; } catch {} }
      try { await navigator.clipboard.writeText(url); toast('Đã chép link phòng'); } catch { toast('Mã phòng: ' + S.code); }
    };
  }

  function render() {
    if (!S) { chatEl.hidden = true; if (!app.querySelector('.home')) renderHome(); return; }
    chatEl.hidden = !chatOpen;
    if (dragging) { pendingRender = true; return; } // đang nặn thì đợi vuốt xong mới vẽ lại
    // giữ vị trí cuộn khi vẽ lại
    const felt = app.querySelector('.felt'), sheet = app.querySelector('.sheet');
    const y = felt ? felt.scrollTop : 0, sy = sheet ? sheet.scrollTop : 0;
    const prevHand = handRects();
    // tất tay lật hết bài: tạm hiện bản "đang lật" (ít lá chung hơn, chưa công bố thắng thua)
    const realRound = S.round, shown = pkRunout(realRound);
    if (shown) S.round = shown;
    try { renderRoom(); } finally { S.round = realRound; }
    const shownRound = shown || realRound;
    const f2 = app.querySelector('.felt'), s2 = app.querySelector('.sheet');
    if (f2) f2.scrollTop = y; if (s2) s2.scrollTop = sy;
    animateDeal();
    orientArrows();
    animatePlay(prevHand);
    detectCombos(shownRound);
    trackTiers();
    flipHand(prevHand);
    justRevealed = null;
  }
  render();
})();
