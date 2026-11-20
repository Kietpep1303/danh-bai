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
  const card = (c, cls = '', attr = '') => c
    ? `<div class="card ${c.s >= 2 ? 'red' : ''} ${cls}" data-id="${c.id}" ${attr}><span class="cr">${RANKS[c.r] || c.r}<i>${SUITS[c.s]}</i></span><span class="cs">${SUITS[c.s]}</span></div>`
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
  socket.on('kicked', () => { store.set({ code: null, token: null }); tabTicket.set({}); S = null; resetChat(); toast('Bạn đã được mời ra khỏi phòng'); render(); });

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
      ${ordersHTML(id)}`;
    pop.hidden = false;
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.bottom + 8 + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : r.bottom + 8;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    pop.querySelectorAll('[data-item]:not(:disabled)').forEach(e => holdToSpam(e, id, e.dataset.item));
    pop.querySelector('[data-rain]').onclick = e => { e.stopPropagation(); unlockAudio(); rain(id, e.currentTarget.dataset.rain); };
    pop.querySelectorAll('[data-order]').forEach(b => b.onclick = e => { e.stopPropagation(); unlockAudio(); emit('order', { to: id, kind: b.dataset.order }); });
    const fg = pop.querySelector('[data-forgive]');
    if (fg) fg.onclick = e => { e.stopPropagation(); emit('loan:forgive', { debtor: id }); closeTaunt(); };
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
  const pile = {}; // pid -> số món đang dính quanh ghế
  const syncWipe = () => { wipe.hidden = mess.querySelectorAll('.mine').length < 6; };
  function stick(item, x, y, size, life, mine, pid) {
    const s = document.createElement('span');
    s.className = 'goo' + (mine ? ' mine' : '');
    s.innerHTML = ico(item);
    s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.fontSize = size + 'px';
    s.style.setProperty('--r', (Math.random() * 70 - 35) + 'deg');
    s.style.animationDuration = `.18s, ${life}ms`;
    mess.appendChild(s);
    if (pid) pile[pid] = (pile[pid] || 0) + 1;
    setTimeout(() => { s.remove(); if (pid) pile[pid]--; syncWipe(); }, life);
    while (mess.childElementCount > 220) mess.firstElementChild.remove();
    syncWipe();
  }
  let lastHitSfx = 0, lastWhoosh = 0, hitToast = { t: 0, n: 0 };
  socket.on('taunt', ({ from, to, item, name }) => {
    if (!S) return;
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
      // dính quanh ghế người bị ném, càng nhiều càng lan rộng
      const n = pile[to] || 0, spread = Math.min(260, 14 + n * 7), ang = Math.random() * Math.PI * 2;
      const r0 = Math.sqrt(Math.random()) * spread;
      stick(item, b2.x + Math.cos(ang) * r0 * 1.3, b2.y + Math.sin(ang) * r0 * .8, hard ? 26 + Math.random() * 20 : 24, hard ? 7000 : 2500, false, to);
      const s = document.createElement('div');
      s.className = 'splat-fx' + (hard ? ' hard' : '');
      s.style.left = b2.x + 'px'; s.style.top = b2.y + 'px';
      s.innerHTML = `<span class="big">${ico(item)}</span>${POW[item] && n % 4 === 0 ? `<b>${POW[item]}</b>` : ''}${hard && n < 12 ? '<i></i><i></i><i></i><i></i><i></i><i></i>' : ''}`;
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
    if (mine > 0) h += `<button class="btn small ghost ${me.sitOut ? 'on' : ''}" data-sitout="${me.sitOut ? 0 : 1}">${me.sitOut ? 'Vào chơi lại' : 'Nghỉ ván sau'}</button>`;
    debts.forEach(d => { h += `<button class="btn small" data-repay="${d.lender}" ${mine > 0 ? '' : 'disabled'}>Trả nợ ${pname(d.lender)} (${d.amount})</button>`; });
    return `<div class="loan-row">${h}</div>`;
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
      emit('loan:reply', { id: a.id, ok: b.dataset.ans === '1' }).then(x => { if (x.error && /Đợi hết ván/.test(x.error)) return; askQueue.shift(); showAsk(); });
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
    const o = ORDERS[kind]; if (!o || !S) return;
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
    const els = [...app.querySelectorAll('.tl-mid .center .cards .card')];
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
    const mid = app.querySelector('.tl-mid .center');
    if (mid) setTimeout(() => {
      mid.animate([{ transform: 'none' }, { transform: chop ? 'translate(-6px,3px) rotate(-1.5deg)' : 'translateY(3px)' },
        { transform: chop ? 'translate(5px,-2px) rotate(1deg)' : 'none' }, { transform: 'none' }], { duration: chop ? 320 : 160 });
    }, end - 60);
    if (chop) {
      sfx('chop', end - 60);
      const m = mid ? mid.getBoundingClientRect() : null;
      const s = document.createElement('div');
      s.className = 'chop-fx';
      s.textContent = 'CHẶT!';
      s.style.left = (m ? m.left + m.width / 2 : innerWidth / 2) + 'px'; s.style.top = (m ? m.top + m.height / 2 : innerHeight / 2) + 'px';
      s.style.animationDelay = (end - 80) + 'ms';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), end + 1100);
    }
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
      const t = ticket();
      const r = await emit('join', { code: c, name, tab: TAB, token: t.code === c ? t.token : undefined });
      if (r.ok) enterRoom(r);
    };
    app.querySelector('#join').onclick = join;
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
          <div class="seg">${Object.entries(GAMES).map(([k, x]) => `<button ${dis} class="${S.game === k ? 'on' : ''}" data-set-game="${k}">${x.name}</button>`).join('')}</div>
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
    root.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => { if (confirm('Mời người này ra khỏi phòng?')) emit('kick', { id: b.dataset.kick }); });
    root.querySelectorAll('[data-set-game]').forEach(b => b.onclick = () => emit('settings', { game: b.dataset.setGame }));
    root.querySelectorAll('[data-bet]').forEach(b => b.onclick = () => emit('settings', { bet: +b.dataset.bet }));
    root.querySelectorAll('[data-stack]').forEach(b => b.onclick = () => emit('settings', { pkStack: +b.dataset.stack }));
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => emit('settings', { dealerMode: b.dataset.mode }));
    root.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => emit('settings', { dealFx: b.dataset.fx }));
    root.querySelectorAll('[data-sound]').forEach(b => b.onclick = () => {
      soundOn = b.dataset.sound === '1'; store.set({ sound: soundOn });
      if (soundOn) { unlockAudio(); setTimeout(() => sfx('deal'), 50); }
      render();
    });
    const lv = root.querySelector('[data-leave]');
    if (lv) lv.onclick = () => {
      if (!confirm('Rời phòng?')) return;
      socket.emit('leave'); store.set({ code: null, token: null }); tabTicket.set({}); S = null; sheetOpen = false; resetChat();
      history.replaceState(null, '', '/'); render();
    };
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
      <div class="seat-top"><span class="seat-name">${esc(p.name)} ${dealer ? '<span class="badge">Cái</span>' : ''}${r.game === 'poker' ? pkBadges(seat, true) : ''}${debtBadges(seat.id)}</span><span class="seat-pts">${r.game === 'poker' ? chipTxt(seat.chips) : p.points}</span></div>
      ${bubble(seat.id)}
      <div class="mini">${cards}</div>
      <div class="seat-info"><span>${info}</span>${timer}</div>
      ${canCheck ? `<button class="btn small" data-check="${seat.id}">Xét</button>` : ''}
    </div>`;
  }

  // ---------- Bàn tiến lên: ngồi vòng quanh bàn theo thứ tự đánh ----------
  // Mình luôn ngồi dưới; người đánh ngay sau mình ở bên phải, rồi trên, rồi trái
  // (ngược chiều kim đồng hồ). Mũi tên giữa các ghế chỉ chiều đánh.
  const TL_POS = { 1: ['bottom'], 2: ['bottom', 'top'], 3: ['bottom', 'right', 'left'], 4: ['bottom', 'right', 'top', 'left'] };
  const TL_ARROW = {
    'bottom>right': ['br', -45], 'right>top': ['tr', -135], 'top>left': ['tl', 135], 'left>bottom': ['bl', 45],
    'right>left': ['top', 180], 'bottom>top': ['right', -90], 'top>bottom': ['left', 90],
  };
  function selfSeat(r, mine) {
    const isTurn = r.turn === S.me && r.phase !== 'done';
    const st = mine.place ? `Về thứ ${mine.place}` : mine.passed ? 'Bỏ lượt' : `${mine.count} lá`;
    return `<div class="seat self ${isTurn ? 'turn' : ''} ${isRinging(S.me) ? 'ringing' : ''}" data-pid="${S.me}">
      ${bubble(S.me, true)}${ringFx(S.me)}
      <div class="seat-top"><span class="seat-name">Bạn</span><span class="seat-pts">${st}</span></div>
      ${isTurn && S.deadline ? `<div class="seat-info"><span>Tới lượt bạn</span><span class="timer" data-dl="${S.deadline}"></span></div>` : ''}
    </div>`;
  }
  function tlTable(r, mine, center) {
    const n = r.seats.length;
    const start = mine ? r.seats.indexOf(mine) : 0;
    const ring = r.seats.map((_, k) => r.seats[(start + k) % n]);
    const pos = TL_POS[n] || TL_POS[4];
    let cells = '';
    ring.forEach((seat, k) => {
      cells += `<div class="tl-pos" style="grid-area:${pos[k]}">${k === 0 && mine ? selfSeat(r, mine) : seatHTML(seat, r)}</div>`;
      const a = n > 1 && TL_ARROW[pos[k] + '>' + pos[(k + 1) % n]];
      const live = r.turn === seat.id && r.phase !== 'done';
      if (a) cells += `<div class="tl-arrow ${live ? 'on' : ''}" style="grid-area:${a[0]}" aria-hidden="true"><span style="transform:rotate(${a[1]}deg)">➜</span></div>`;
    });
    return `<div class="tl-table n${n}">${cells}<div class="tl-mid">${center}</div></div>
      <p class="tl-dir"><span aria-hidden="true">↺</span> Đánh ngược chiều kim đồng hồ, theo mũi tên</p>`;
  }

  // ---------- Bàn chơi ----------
  // ---------- Poker ----------
  const PK_PHASE = { preflop: 'Vòng đầu', flop: 'Lật 3 lá', turn: 'Lá thứ tư', river: 'Lá cuối' };
  const pkBadges = (s, noD) => (s.btn && !noD ? ' <span class="badge pk-d" title="Nút chia bài">D</span>' : '')
    + (s.sb ? ' <span class="badge pk-b" title="Mù nhỏ">MN</span>' : '') + (s.bb ? ' <span class="badge pk-b" title="Mù lớn">ML</span>' : '');
  function pkSeatInfo(s, r) {
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
      <div class="seat-top"><span class="seat-name">Bạn${pkBadges(mine, true)}${debtBadges(S.me)}</span><span class="seat-pts">${chipTxt(mine.chips)}</span></div>
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
  function pkTable(r, mine, center) {
    const n = r.seats.length, angs = pkAngles(n);
    const start = mine ? r.seats.indexOf(mine) : 0;
    const ring = r.seats.map((_, k) => r.seats[(start + k) % n]);
    const live = r.phase !== 'done';
    let html = '<div class="pk-oval" aria-hidden="true"></div>';
    ring.forEach((seat, k) => {
      const deg = angs[k], nextDeg = k + 1 < n ? angs[k + 1] : 450, step = nextDeg - deg;
      html += `<div class="pk-pos" style="${pkAt(deg)}">${k === 0 && mine ? pkSelf(r, mine) : seatHTML(seat, r)}</div>`;
      // chip cược đặt trước ghế, nút D đặt lệch bên cạnh
      if (live && seat.bet) html += `<span class="chip pk-bet" style="${pkAt(deg, .6)}">${seat.bet}</span>`;
      if (seat.btn) html += `<span class="pk-dbtn" title="Nút chia bài" style="${pkAt(deg - Math.min(22, step / 2.6), .68)}">D</span>`;
      // mũi tên giữa ghế này và ghế kế tiếp, chỉ chiều đi
      if (n > 1) {
        const on = live && r.turn === seat.id;
        html += `<span class="pk-arrow ${on ? 'on' : ''}" data-a="${deg + step / 2}" style="${pkAt(deg + step / 2)}" aria-hidden="true"><i>➜</i></span>`;
      }
    });
    return `<div class="pk-table n${n} ${n >= 7 ? 'dense' : ''}" ${pkH ? `style="height:${pkH}px"` : ''}>${html}<div class="pk-mid">${center}<div class="pk-status">${statusText(r, mine)}</div></div><div class="pk-log" aria-live="polite">${S.log.slice(-2).map(l => `<div>${esc(l.msg)}</div>`).join('')}</div><span class="pk-dir" title="Lượt đi theo chiều kim đồng hồ"><b aria-hidden="true">↻</b> chiều kim đồng hồ</span></div>`;
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
    // kích thước đổi nhiều thì vẽ lại để chia ghế theo đúng hình bàn
    const changed = !pkDims || Math.abs(pkDims.a - W) > 20 || Math.abs(pkDims.b - H) > 20;
    pkDims = { a: W, b: H };
    if (changed && !orientArrows.busy) { orientArrows.busy = true; render(); orientArrows.busy = false; return; }
    t.querySelectorAll('.pk-arrow').forEach(el => {
      const a = +el.dataset.a * Math.PI / 180;
      el.firstChild.style.transform = `rotate(${Math.atan2(H * Math.cos(a), -W * Math.sin(a)) * 180 / Math.PI}deg)`;
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
    mid.style.left = ''; mid.style.top = ''; mid.style.transform = '';
    const m = mid.getBoundingClientRect();
    const seats = [...t.querySelectorAll('.pk-pos')].map(e => e.getBoundingClientRect());
    const cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2, gap = 6;
    // khoảng dọc: dưới các ghế phía trên, trên các ghế phía dưới (chỉ tính ghế nằm ngang hàng với khu giữa)
    let top = tr.top + gap, bottom = tr.bottom - gap;
    seats.forEach(r => {
      if (r.right <= m.left || r.left >= m.right) return;
      if ((r.top + r.bottom) / 2 < cy) top = Math.max(top, r.bottom + gap);
      else bottom = Math.min(bottom, r.top - gap);
    });
    // khoảng ngang: giữa các ghế hai bên nằm trong khoảng dọc đó
    let left = tr.left + gap, right = tr.right - gap;
    seats.forEach(r => {
      if (r.bottom <= top || r.top >= bottom) return;
      if ((r.left + r.right) / 2 < cx) left = Math.max(left, r.right + gap);
      else right = Math.min(right, r.left - gap);
    });
    const s = Math.max(.5, Math.min(1, (bottom - top) / m.height, (right - left) / m.width));
    mid.style.left = ((left + right) / 2 - tr.left) + 'px';
    mid.style.top = ((top + bottom) / 2 - tr.top) + 'px';
    if (s < 1) mid.style.transform = `translate(-50%, -50%) scale(${s.toFixed(3)})`;
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
  function pkCenter(r) {
    const slots = Array.from({ length: 5 }, (_, i) => r.board[i]
      ? card(r.board[i], r.seats.some(s => s.best && s.best.includes(r.board[i].id)) ? 'hi' : '', `data-k="${r.id}:board:${i}" data-i="${i}" data-j="99"`)
      : '<div class="card slot"></div>').join('');
    return `<div class="center pk-center">
      <div class="cards board">${slots}</div>
      <div class="pk-pot"><span class="chip big">${r.pot}</span><span>Hũ</span>${r.phase !== 'done' ? `<small>${PK_PHASE[r.phase]}</small>` : ''}</div>
      ${r.sidePots && r.sidePots.length > 1 ? `<div class="pk-pots">${r.sidePots.map((v, i) => `<span>${i ? 'Hũ phụ' + (r.sidePots.length > 2 ? ' ' + i : '') : 'Hũ chính'} <b>${v}</b></span>`).join('')}</div>` : ''}
      ${r.pots && r.pots.length > 1 ? `<div class="pk-pots">${r.pots.map((p, i) => `<span>${i ? 'Hũ phụ' : 'Hũ chính'} <b>${p.amount}</b> → ${p.winners.map(id => id === S.me ? 'Bạn' : pname(id)).join(', ')}</span>`).join('')}</div>` : ''}
    </div>`;
  }
  function pkStatus(r, mine, myTurn) {
    if (r.phase === 'done') {
      const w = (r.winners || []).map(id => id === S.me ? 'Bạn' : pname(id)).join(', ');
      return r.winLabel ? `${w} thắng với ${esc(r.winLabel)}` : `${w} ăn hũ, mọi người bỏ bài`;
    }
    if (!mine) return 'Bạn đang xem ván này, ván sau sẽ được chia bài';
    if (mine.folded) return `Bạn đã bỏ bài. Đợi ${pname(r.turn)}`;
    if (myTurn) return r.toCall ? `Tới lượt bạn: theo ${r.toCall}${r.canRaise ? `, tố lên từ ${r.minRaiseTo}` : ""} hoặc bỏ bài` : 'Tới lượt bạn: xem hoặc tố';
    return `Đợi ${pname(r.turn)}`;
  }
  function statusText(r, mine) {
    const myTurn = r.turn === S.me && r.phase !== 'done';
    if (r.game === 'poker') return pkStatus(r, mine, myTurn);
    if (r.phase === 'done') {
      if (r.toiTrang) return `${pname(r.toiTrang.by)} tới trắng: ${esc(r.toiTrang.label)}`;
      if (r.ranking) return `${pname(r.ranking[0])} về nhất`;
      return 'Hết ván';
    }
    if (!mine) return 'Bạn đang xem ván này, ván sau sẽ được chia bài';
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
    return `<div class="watchers"><span>Đang ngồi xem:</span>${w.map(p => `<b class="${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === S.me ? ' (bạn)' : ''}${S.game === 'poker' && p.chips <= 0 ? ' · hết chip' : ''}</b>`).join('')}<small>${S.game === 'poker' ? 'Ván sau sẽ được chia bài nếu còn chip' : 'Ván sau sẽ được chia bài'}</small></div>`;
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
    let body;
    if (!r) {
      body = `<div class="panel-wrap">${panelHTML()}</div>`;
    } else {
      body = `
        ${r.game === 'tienlen' ? tlTable(r, mine, center) : r.game === 'poker' ? pkTable(r, mine, center)
          : `<div class="seats ${others.length > 7 ? 'many' : ''}">${others.map(s => seatHTML(s, r)).join('')}</div>`}
        ${watchersHTML(r)}
        <div class="status ${r.game === 'poker' ? 'pk-hide' : ''}">${statusText(r, mine)}${r.phase === 'done' && !canStart ? '<small>Đợi chủ phòng hoặc nhà cái chia ván mới</small>' : ''}</div>
        <div class="feed ${r.game === 'poker' ? 'pk-hide' : ''}">${S.log.slice(-3).map(l => `<div>${esc(l.msg)}</div>`).join('')}</div>`;
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
      head = `<div class="me-head ${isRinging(S.me) ? 'ringing' : ''}" ${r.game === 'tienlen' ? '' : `data-pid="${S.me}"`}><span><b class="${locked ? 'nan-hint' : ''}">${infoTxt}</b>${locked ? '' : resTxt}${r.dealer === S.me ? ' <span class="badge">Cái</span>' : ''}${r.game === 'poker' ? pkBadges(mine) + (mine.bet && r.phase !== 'done' ? ` <span class="chip">${mine.bet}</span>` : '') : ''}${ringFx(S.me)}</span>
        <span>${locked ? '<button class="btn small ghost" data-quick>Lật nhanh</button> ' : ''}${myTurn && S.deadline ? `<span class="timer" data-dl="${S.deadline}"></span> ` : ''}${r.game === 'poker' ? chipTxt(mine.chips) + ' · ' : ''}${me.points} điểm</span></div>`;
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
        if (r.game === 'poker' && r.phase !== 'done') {
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
      <div class="room">
        ${socket.connected ? '' : '<div class="offline-bar">Mất kết nối, đang nối lại…</div>'}
        <header class="bar">
          <button class="code-chip" data-share aria-label="Chia sẻ mã phòng">${S.code}</button>
          <div class="bar-title"><b>${g.name}</b>${S.game === 'poker' ? `Mù ${Math.max(1, Math.floor(S.bet / 2))}/${S.bet}` : `Cược ${S.bet}`}${g.dealer && S.dealerId ? `, cái: ${pname(S.dealerId)}` : ''}</div>
          <button class="btn small ghost chat-btn ${chatOpen ? 'on' : ''}" data-chat aria-label="Trò chuyện${unread ? `, ${unread} tin chưa đọc` : ''}">${ico('💬')}${unread ? `<span class="unread">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
          ${r ? '<button class="btn small ghost" data-sheet>Phòng</button>' : ''}
        </header>
        <section class="felt"><div class="room-inner" style="display:flex;flex-direction:column;gap:12px">${body}</div></section>
        <section class="me"><div class="room-inner" style="display:flex;flex-direction:column;gap:10px">
          ${head}${hand}
          ${S.game === 'poker' ? loanRow() : ''}${raiseBar}
          <div class="actions">${actions}</div>
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

  function bind() {
    bindDrag();
    const q = app.querySelector('[data-quick]'); if (q) q.onclick = quickReveal;
    bindPanel(app);
    app.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const type = b.dataset.act;
      if (type === 'play') return emit('act', { type, cards: [...sel] }).then(r => { if (r.ok) sel.clear(); render(); });
      emit('act', { type });
    });
    const sc = app.querySelector('[data-showcards]'); if (sc) sc.onclick = () => emit('act', { type: 'show' });
    app.querySelectorAll('[data-sitout]').forEach(b => b.onclick = () => emit('sitout', { on: b.dataset.sitout === '1' }));
    app.querySelectorAll('[data-loan]').forEach(b => b.onclick = e => { e.stopPropagation(); openLoan(b.dataset.loan, b); });
    app.querySelectorAll('[data-repay]').forEach(b => b.onclick = () => emit('loan:repay', { lender: b.dataset.repay }));
    const ro = app.querySelector('[data-raise-open]'); if (ro) ro.onclick = () => { raise.open = true; render(); };
    const rc = app.querySelector('[data-raise-close]'); if (rc) rc.onclick = () => { raise.open = false; render(); };
    app.querySelectorAll('[data-raise-step]').forEach(b => b.onclick = () => { const r = S.round; raise.to = Math.max(r.minRaiseTo, Math.min(r.maxRaiseTo, raise.to + +b.dataset.raiseStep * S.bet)); render(); });
    app.querySelectorAll('[data-raise-to]').forEach(b => b.onclick = () => { raise.to = +b.dataset.raiseTo; render(); });
    const rr = app.querySelector('[data-raise-range]');
    if (rr) rr.oninput = () => { raise.to = +rr.value; app.querySelectorAll('[data-raise-val]').forEach(x => { x.textContent = rr.value; }); };
    const rg = app.querySelector('[data-raise-go]');
    if (rg) rg.onclick = () => { const to = raise.to, r = S.round; raise.open = false; emit('act', to >= r.maxRaiseTo ? { type: 'allin' } : { type: 'raise', to }); };
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
    renderRoom();
    const f2 = app.querySelector('.felt'), s2 = app.querySelector('.sheet');
    if (f2) f2.scrollTop = y; if (s2) s2.scrollTop = sy;
    animateDeal();
    orientArrows();
    animatePlay(prevHand);
    flipHand(prevHand);
    justRevealed = null;
  }
  render();
})();
