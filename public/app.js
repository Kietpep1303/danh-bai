(() => {
  const socket = io({ transports: ['websocket', 'polling'] });
  const app = document.getElementById('app');
  const SUITS = ['♠', '♣', '♦', '♥'];
  const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const GAMES = {
    xidach: { name: 'Xì dách', max: 8, dealer: true },
    baicao: { name: 'Bài cào', max: 17, dealer: true },
    tienlen: { name: 'Tiến lên', max: 4, dealer: false },
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
  let offset = 0;         // lệch đồng hồ với server

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('banbai') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('banbai', JSON.stringify({ ...store.get(), ...v })); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pname = id => { const p = S && S.players.find(x => x.id === id); return p ? esc(p.name) : '?'; };
  let toastT;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
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
    const s = store.get();
    const url = new URL(location.href).searchParams.get('r');
    if (s.code && s.token && (!url || url.toUpperCase() === s.code)) {
      emit('join', { code: s.code, token: s.token }).then(r => { if (!r.ok) { store.set({ code: null, token: null }); S = null; render(); } });
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
    S = st; render();
  });
  socket.on('kicked', () => { store.set({ code: null, token: null }); S = null; toast('Bạn đã được mời ra khỏi phòng'); render(); });
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
        <p class="tag">Xì dách, bài cào, tiến lên. Tạo phòng rồi gửi mã cho bạn bè.</p>
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
      const r = await emit('create', { name, game: b.dataset.game });
      if (r.ok) enterRoom(r);
    });
    const join = async () => {
      const name = getName(); if (!name) return;
      const c = app.querySelector('#code').value.trim().toUpperCase();
      if (c.length !== 6) return toast('Mã phòng có 6 ký tự');
      const r = await emit('join', { code: c, name, token: s.code === c ? s.token : undefined });
      if (r.ok) enterRoom(r);
    };
    app.querySelector('#join').onclick = join;
    app.querySelector('#code').onkeydown = e => { if (e.key === 'Enter') join(); };
  }
  function enterRoom(r) {
    store.set({ code: r.code, token: r.token });
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
        <span class="seat-pts">${p.points} điểm</span>
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
          <h3>Mức cược mỗi ván</h3>
          <div class="bets">${BETS.map(b => `<button ${dis} class="${S.bet === b ? 'on' : ''}" data-bet="${b}">${b}</button>`).join('')}</div>
        </div>
        ${g.dealer ? `<div>
          <h3>Cách chọn nhà cái</h3>
          <div class="seg">
            <button ${dis} class="${S.dealerMode === 'vote' ? 'on' : ''}" data-mode="vote">Bầu chọn</button>
            <button ${dis} class="${S.dealerMode === 'random3' ? 'on' : ''}" data-mode="random3">Ngẫu nhiên 3 ván</button>
          </div></div>` : ''}
        ${!isHost ? '<p class="note">Chỉ chủ phòng đổi được trò chơi và mức cược.</p>' : ''}
        <button class="btn ghost" data-leave>Rời phòng</button>
      </div>`;
  }
  function bindPanel(root) {
    root.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => emit('vote', { id: b.dataset.vote }));
    root.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => { if (confirm('Mời người này ra khỏi phòng?')) emit('kick', { id: b.dataset.kick }); });
    root.querySelectorAll('[data-set-game]').forEach(b => b.onclick = () => emit('settings', { game: b.dataset.setGame }));
    root.querySelectorAll('[data-bet]').forEach(b => b.onclick = () => emit('settings', { bet: +b.dataset.bet }));
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => emit('settings', { dealerMode: b.dataset.mode }));
    const lv = root.querySelector('[data-leave]');
    if (lv) lv.onclick = () => {
      if (!confirm('Rời phòng?')) return;
      socket.emit('leave'); store.set({ code: null, token: null }); S = null; sheetOpen = false;
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
    let cards = seat.cards ? seat.cards.map((c, i) => card(c, '', dk(r, j, seat.id, i))).join('')
      : Array.from({ length: nBack }, (_, i) => card(null, '', dk(r, j, seat.id, i))).join('');
    if (r.game === 'tienlen') cards = (seat.cards && r.phase === 'done' ? cards : (seat.count ? card(null, '', dk(r, j, seat.id, 0)) : '')) + `<span class="count">${seat.count} lá</span>`;
    let info = '';
    if (seat.result != null && seat.id !== r.dealer) info = money(seat.result * S.bet);
    else if (seat.info) info = esc(seat.info);
    if (r.game === 'tienlen') {
      if (seat.place) info = `Về thứ ${seat.place}`;
      else if (seat.passed) info = 'Bỏ lượt';
    }
    if (r.game === 'xidach' && seat.stood && seat.result == null && !dealer) info = info || 'Đã dằn';
    const timer = isTurn && S.deadline ? `<span class="timer" data-dl="${S.deadline}"></span>` : '';
    const canCheck = r.game === 'xidach' && r.phase === 'dealer' && S.me === r.dealer && !dealer && seat.result == null;
    return `<div class="seat ${isTurn ? 'turn' : ''} ${p.connected ? '' : 'off'}">
      <div class="seat-top"><span class="seat-name">${esc(p.name)} ${dealer ? '<span class="badge">Cái</span>' : ''}</span><span class="seat-pts">${p.points}</span></div>
      <div class="mini">${cards}</div>
      <div class="seat-info"><span>${info}</span>${timer}</div>
      ${canCheck ? `<button class="btn small" data-check="${seat.id}">Xét</button>` : ''}
    </div>`;
  }

  // ---------- Bàn chơi ----------
  function statusText(r, mine) {
    const myTurn = r.turn === S.me && r.phase !== 'done';
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

  function renderRoom() {
    const g = GAMES[S.game], r = S.round, isHost = S.me === S.hostId;
    const mine = r && r.seats.find(x => x.id === S.me);
    const others = r ? r.seats.filter(x => x.id !== S.me) : [];
    const canStart = (!r || r.phase === 'done') && (isHost || (g.dealer && S.me === S.dealerId));
    const me = S.players.find(p => p.id === S.me) || { points: 0 };

    let center = '';
    if (r && r.game === 'tienlen') {
      center = `<div class="center">${r.table
        ? `<div class="cards">${r.table.cards.map(c => card(c)).join('')}</div><small>${pname(r.table.by)} đánh ${esc(r.table.label)}</small>`
        : `<small>Bàn trống</small>`}</div>`;
    }
    let body;
    if (!r) {
      body = `<div class="panel-wrap">${panelHTML()}</div>`;
    } else {
      body = `
        <div class="seats ${others.length > 7 ? 'many' : ''}">${others.map(s => seatHTML(s, r)).join('')}</div>
        ${center}
        <div class="status">${statusText(r, mine)}${r.phase === 'done' && !canStart ? '<small>Đợi chủ phòng hoặc nhà cái chia ván mới</small>' : ''}</div>
        <div class="feed">${S.log.slice(-3).map(l => `<div>${esc(l.msg)}</div>`).join('')}</div>`;
    }

    // phần của mình
    let hand = '', actions = '', head = '';
    if (r && mine) {
      const myTurn = r.turn === S.me && r.phase !== 'done';
      const resTxt = mine.result != null && S.me !== r.dealer ? ' ' + money(mine.result * S.bet) : '';
      const myJ = r.seats.indexOf(mine);
      const nan = r.game !== 'tienlen' ? squeeze(r, mine, myJ) : null;
      const locked = nan && nan.hidden > 0;
      let infoTxt = locked ? 'Vuốt lá bài để nặn' : mine.info ? esc(mine.info) : '';
      if (r.game === 'tienlen') infoTxt = mine.place ? `Về thứ ${mine.place}` : `${mine.count} lá`;
      head = `<div class="me-head"><span><b class="${locked ? 'nan-hint' : ''}">${infoTxt}</b>${locked ? '' : resTxt}${r.dealer === S.me ? ' <span class="badge">Cái</span>' : ''}</span>
        <span>${locked ? '<button class="btn small ghost" data-quick>Lật nhanh</button> ' : ''}${myTurn && S.deadline ? `<span class="timer" data-dl="${S.deadline}"></span> ` : ''}${me.points} điểm</span></div>`;
      if (r.game === 'tienlen') {
        hand = `<div class="hand tl">${(mine.cards || []).map((c, i) => card(c, sel.has(c.id) ? 'sel' : '', dk(r, myJ, S.me, i))).join('')}</div>`;
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
          <div class="bar-title"><b>${g.name}</b>Cược ${S.bet}${g.dealer && S.dealerId ? `, cái: ${pname(S.dealerId)}` : ''}</div>
          ${r ? '<button class="btn small ghost" data-sheet>Phòng</button>' : ''}
        </header>
        <section class="felt"><div class="room-inner" style="display:flex;flex-direction:column;gap:12px">${body}</div></section>
        <section class="me"><div class="room-inner" style="display:flex;flex-direction:column;gap:10px">
          ${head}${hand}
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
    return { hidden: hidden.length, html: `<div class="hand sq ${hidden.length ? '' : 'all'}">${fan}${pile}</div>` };
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
    if (firstPaint) { firstPaint = false; return; }
    if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const src = app.querySelector('.center') || app.querySelector('.status') || app.querySelector('.felt');
    const fr = src.getBoundingClientRect();
    const ox = fr.left + fr.width / 2, oy = fr.top + fr.height / 2;
    els.sort((a, b) => (parseInt(a.dataset.i) || 0) - (parseInt(b.dataset.i) || 0) || (+a.dataset.j - +b.dataset.j));
    const step = Math.min(85, 1500 / els.length);
    els.forEach((el, n) => {
      const b = el.getBoundingClientRect();
      el.style.setProperty('--dx', (ox - b.left - b.width / 2) + 'px');
      el.style.setProperty('--dy', (oy - b.top - b.height / 2) + 'px');
      el.style.animationDelay = Math.round(n * step) + 'ms';
      el.classList.add('dealing');
    });
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
    app.querySelectorAll('[data-check]').forEach(b => b.onclick = () => emit('act', { type: 'check', target: b.dataset.check }));
    const st = app.querySelector('[data-start]'); if (st) st.onclick = () => emit('start');
    const cl = app.querySelector('[data-clear]'); if (cl) cl.onclick = () => { sel.clear(); render(); };
    app.querySelectorAll('.hand.tl .card').forEach(c => c.onclick = () => {
      const id = +c.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); render();
    });
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
    if (!S) { if (!app.querySelector('.home')) renderHome(); return; }
    if (dragging) { pendingRender = true; return; } // đang nặn thì đợi vuốt xong mới vẽ lại
    // giữ vị trí cuộn khi vẽ lại
    const felt = app.querySelector('.felt'), sheet = app.querySelector('.sheet');
    const y = felt ? felt.scrollTop : 0, sy = sheet ? sheet.scrollTop : 0;
    renderRoom();
    const f2 = app.querySelector('.felt'), s2 = app.querySelector('.sheet');
    if (f2) f2.scrollTop = y; if (s2) s2.scrollTop = sy;
    animateDeal();
    justRevealed = null;
  }
  render();
})();
