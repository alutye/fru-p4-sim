/* 時間結晶 描画・操作 */
(function () {
  'use strict';
  const { Sim, CFG, ROLES, ROLE_TYPE, SPELL_NAME, SPELL_SHORT, ATTACK_MARK, compass, dist } = window.CrystallizeSim;

  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');
  const SIZE = 720;
  const SCALE = SIZE / (2 * (CFG.R + 1.5));
  const toPx = p => ({ x: SIZE / 2 + p.x * SCALE, y: SIZE / 2 + p.y * SCALE });
  const fromPx = (px, py) => ({ x: (px - SIZE / 2) / SCALE, y: (py - SIZE / 2) / SCALE });

  const $ = id => document.getElementById(id);
  const ui = {
    role: $('role'), purple: $('purple'), tidal1: $('tidal1'), tidal2: $('tidal2'), speed: $('speed'),
    spectate: $('spectate'), hint: $('hint'), start: $('start'), pause: $('pause'), reset: $('reset'),
    stTime: $('stTime'), stPhase: $('stPhase'), stDebuff: $('stDebuff'), stHint: $('stHint'),
    result: $('result'), log: $('log'), sprintBtn: $('sprintBtn'),
  };

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(SIZE * dpr);
    if (canvas.width !== w) { canvas.width = w; canvas.height = w; }
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  const ROLE_COLOR = { tank: '#3b82f6', healer: '#22c55e', dps: '#ef4444' };
  const PHASE_NAME = {
    pre: '詠唱中', setup: '散開・竜頭待ち', yellow: '黄砂時計＋ウォタガ', kb: 'エアロガ吹き飛ばし',
    heads: '赤エアロが竜頭', tidal: '光の波＋白円', return: 'リターン設置', taker: 'テイカー散開', kb2: 'ノックバック',
  };
  const SPELL_COLOR = { aeroR: '#86efac', iceR: '#7dd3fc', iceB: '#7dd3fc', waterB: '#60a5fa', unholyB: '#fde047', eruptB: '#c084fc' };

  let sim = null, running = false, paused = false, timeScale = 1, last = performance.now(), loggedCount = 0;
  const keys = new Set();
  let touchSprint = false, pointerId = null;

  function newSim() {
    sim = new Sim({
      purple: ui.purple.value, tidal1: ui.tidal1.value, tidal2: ui.tidal2.value,
      userRole: parseInt(ui.role.value, 10), spectate: ui.spectate.checked,
    });
    running = false; paused = false; loggedCount = 0;
    ui.log.innerHTML = '';
    ui.result.classList.add('hidden');
    ui.pause.textContent = '一時停止';
    ui.start.textContent = '開始';
  }

  ui.start.addEventListener('click', () => {
    if (sim.done) newSim();
    running = true; paused = false;
    ui.start.textContent = '実行中…';
    ui.pause.textContent = '一時停止';
    canvas.focus();
  });
  function togglePause() {
    if (!running || sim.done) return;
    paused = !paused;
    ui.pause.textContent = paused ? '再開' : '一時停止';
  }
  ui.pause.addEventListener('click', togglePause);
  ui.reset.addEventListener('click', newSim);
  for (const el of [ui.role, ui.purple, ui.tidal1, ui.tidal2, ui.spectate]) {
    el.addEventListener('change', () => { if (!running || sim.done) newSim(); });
  }
  ui.speed.addEventListener('change', () => { timeScale = parseFloat(ui.speed.value); });

  canvas.tabIndex = 0;
  const pointToField = ev => {
    const r = canvas.getBoundingClientRect();
    return fromPx((ev.clientX - r.left) * (SIZE / r.width), (ev.clientY - r.top) * (SIZE / r.height));
  };
  canvas.addEventListener('pointerdown', ev => {
    if (!sim || sim.user < 0) return;
    ev.preventDefault();
    pointerId = ev.pointerId;
    canvas.setPointerCapture(pointerId);
    sim.moveTarget = pointToField(ev);
    if (ev.pointerType === 'mouse') canvas.focus();
  });
  canvas.addEventListener('pointermove', ev => {
    if (pointerId !== ev.pointerId || !sim || sim.user < 0) return;
    ev.preventDefault();
    sim.moveTarget = pointToField(ev);
  });
  const endPointer = ev => { if (pointerId === ev.pointerId) pointerId = null; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', ev => ev.preventDefault());

  ui.sprintBtn.addEventListener('pointerdown', ev => { ev.preventDefault(); touchSprint = true; ui.sprintBtn.classList.add('on'); });
  const sprintOff = () => { touchSprint = false; ui.sprintBtn.classList.remove('on'); };
  ui.sprintBtn.addEventListener('pointerup', sprintOff);
  ui.sprintBtn.addEventListener('pointercancel', sprintOff);
  ui.sprintBtn.addEventListener('pointerleave', sprintOff);

  window.addEventListener('keydown', ev => {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'SELECT' || tag === 'INPUT') return;
    if (ev.code === 'Space') { ev.preventDefault(); togglePause(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(ev.code)) {
      ev.preventDefault(); keys.add(ev.code);
    }
  });
  window.addEventListener('keyup', ev => keys.delete(ev.code));
  window.addEventListener('blur', () => keys.clear());

  function readInput() {
    let dx = 0, dy = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    sim.input = { dx, dy, sprint: touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight') };
  }

  function loop(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (running && !paused && !sim.done) { readInput(); sim.update(dt * timeScale); }
    draw();
    updatePanel();
    requestAnimationFrame(loop);
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function updatePanel() {
    const t = sim.t;
    ui.stTime.textContent = (t < 0 ? `詠唱 ${(-t).toFixed(1)}s` : `${t.toFixed(1)}s`);
    ui.stPhase.textContent = PHASE_NAME[sim.phaseKey(t)] + (sim.done ? '（終了）' : '');
    if (sim.user >= 0) {
      const p = sim.pl[sim.user];
      const parts = [];
      if (t >= 0) {
        parts.push(p.red ? '聖竜の爪（赤）' : '聖竜の牙（青）');
        parts.push(SPELL_NAME[p.spell]);
        if (p.red && p.claw) parts.push(`爪 残${Math.max(0, sim.remain(sim.user, 'color')).toFixed(0)}s`);
        if (p.blue && p.fang) parts.push(`牙 残${Math.max(0, sim.remain(sim.user, 'color')).toFixed(0)}s`);
      }
      ui.stDebuff.textContent = parts.length ? parts.join(' / ') : (t < 0 ? '（詠唱完了後に付与）' : 'なし');
      ui.stHint.textContent = running ? sim.hintText(sim.user) : '「開始」を押してください';
    } else {
      ui.stDebuff.textContent = '観戦モード';
      ui.stHint.textContent = running ? '全員 AI が処理します' : '「開始」を押してください';
    }
    while (loggedCount < sim.log.length) {
      const l = sim.log[loggedCount++];
      const li = document.createElement('li');
      li.className = l.type;
      li.innerHTML = `<span class="t">${l.t < 0 ? '-' : l.t.toFixed(1) + 's'}</span>${escapeHtml(l.text)}`;
      ui.log.appendChild(li);
      ui.log.scrollTop = ui.log.scrollHeight;
    }
    if (sim.done && ui.result.classList.contains('hidden')) {
      const r = sim.result;
      ui.result.classList.remove('hidden');
      ui.result.classList.toggle('ok', r.success);
      ui.result.classList.toggle('fail', !r.success);
      let html = `<h3>${r.success ? 'クリア！ 全員ノーミス' : 'ミスあり'}</h3>`;
      if (!r.success) {
        html += '<ul>';
        if (sim.user >= 0 && sim.fails[sim.user].length) html += `<li><b>自分（${ROLES[sim.user]}）:</b> ${sim.fails[sim.user].map(escapeHtml).join(' / ')}</li>`;
        for (const fp of r.failedPlayers) if (fp.i !== sim.user) html += `<li>${ROLES[fp.i]}: ${fp.f.map(escapeHtml).join(' / ')}</li>`;
        for (const rf of r.raidFails) html += `<li>${escapeHtml(rf)}</li>`;
        html += '</ul>';
      }
      ui.result.innerHTML = html;
      ui.start.textContent = 'もう一度';
      running = false;
    }
  }

  function circle(p, r, fill, stroke, lw) {
    const c = toPx(p);
    ctx.beginPath(); ctx.arc(c.x, c.y, r * SCALE, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  }
  function text(str, p, color, size, dy) {
    const c = toPx(p);
    ctx.fillStyle = color; ctx.font = `${size || 12}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, c.x, c.y + (dy || 0));
  }
  function clipArena() {
    const c = toPx({ x: 0, y: 0 });
    ctx.beginPath(); ctx.arc(c.x, c.y, CFG.R * SCALE, 0, Math.PI * 2); ctx.clip();
  }
  function wrapText(str, maxW, font) {
    ctx.font = font;
    const lines = []; let cur = '';
    for (const ch of String(str)) {
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** FF14の攻撃マーカー（頭上の赤い数字） */
  function drawAttackMark(px, py, n) {
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    const spikes = 8, R = 11, r = 6.5;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? R : r;
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#c2410c';
    ctx.fill();
    ctx.strokeStyle = '#fed7aa';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = '#9a3412'; ctx.fill();
    ctx.fillStyle = '#fff7ed';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0.5);
    ctx.restore();
  }

  function drawLockOn(px, py, r, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
    const L = Math.max(7, r * 0.35);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of corners) {
      const x = px + sx * r, y = py + sy * r;
      ctx.beginPath();
      ctx.moveTo(x, y + sy * L);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * L, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDragonHead(h) {
    const c = toPx(h);
    const r = 2.0 * SCALE;
    circle(h, 2.0, '#f8fafc', '#fde68a', 2.5);
    drawLockOn(c.x, c.y, r + 7, '#facc15');
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('竜', c.x, c.y);
    const side = h.dir > 0 ? '東' : '西';
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillText(side, c.x, c.y + r + 16);
    // 頭上の菱形マーカー
    ctx.save();
    ctx.translate(c.x, c.y - r - 14);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.restore();
  }

  function drawStackIcon(px, py, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    for (const [dx, dy] of [[-5, 2], [5, 2], [0, -4]]) {
      ctx.beginPath(); ctx.arc(px + dx, py + dy, 4.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpreadIcon(px, py, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7);
      ctx.lineTo(px + Math.cos(a) * 12, py + Math.sin(a) * 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKnockIcon(px, py, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = px + Math.cos(a) * 6, y = py + Math.sin(a) * 6;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * 2, py + Math.sin(a) * 2);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(a - 0.5) * 4, y - Math.sin(a - 0.5) * 4);
      ctx.lineTo(x - Math.cos(a + 0.5) * 4, y - Math.sin(a + 0.5) * 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawTakerMark(px, py) {
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(9, 7);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f5d0fe';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#faf5ff';
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('跳', 0, 1);
    ctx.restore();
  }

  /** 頭割り／散開／ノックバックの頭上マーカー */
  function drawMechMark(p, c, t, T) {
    const x = c.x + 16;
    const y = c.y - 0.7 * SCALE - 11;
    if (p.spell === 'unholyB' && t < T.UNTETH) drawStackIcon(x, y, '#fde047');
    else if (p.spell === 'waterB' && t < T.YELLOW) drawStackIcon(x, y, '#60a5fa');
    else if (p.spell === 'eruptB' && t < T.MOST) drawSpreadIcon(x, y, '#c084fc');
    else if (p.spell === 'aeroR' && t < T.MOST) drawKnockIcon(x, y, '#86efac');
  }

  function drawBand(d, lo, hi, fill) {
    ctx.save(); clipArena();
    const a = toPx({ x: d.x * lo, y: d.y * lo });
    const b = toPx({ x: d.x * hi, y: d.y * hi });
    const px = { x: -d.y, y: d.x };
    const w = CFG.R * 3 * SCALE;
    ctx.beginPath();
    ctx.moveTo(a.x + px.x * w, a.y + px.y * w);
    ctx.lineTo(a.x - px.x * w, a.y - px.y * w);
    ctx.lineTo(b.x - px.x * w, b.y - px.y * w);
    ctx.lineTo(b.x + px.x * w, b.y + px.y * w);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }

  function draw() {
    const t = sim.t, T = CFG.T;
    const dpr = canvas.width / SIZE;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    const showHint = ui.hint.checked && sim.user >= 0;

    window.EdenArena.blitFloor(ctx, SIZE, dpr, CFG.R, SCALE);

    // 未来の欠片
    circle(CFG.FRAGMENT, CFG.FRAGMENT_R, 'rgba(255,255,220,0.35)', 'rgba(255,240,180,0.95)', 2);
    text('欠片', CFG.FRAGMENT, '#fff6c8', 11, -CFG.FRAGMENT_R * SCALE - 10);

    // 砂時計（常時表示。黄=南北、紫=対角、線なし=残り）
    const hgCol = { yellow: '#f5d657', purple: '#c084fc', none: '#94a3b8' };
    if (t >= T.START) {
      const alive = sim.hourglass.filter(h => !h.exploded);
      const pair = (kind) => alive.filter(h => h.kind === kind);
      const drawTether = (a, b, color) => {
        const pa = toPx(a.pos), pb = toPx(b.pos);
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      };
      const yels = pair('yellow'); if (yels.length === 2) drawTether(yels[0], yels[1], 'rgba(245,214,87,0.85)');
      const purs = pair('purple'); if (purs.length === 2) drawTether(purs[0], purs[1], 'rgba(192,132,252,0.85)');
      for (const h of alive) {
        const col = hgCol[h.kind];
        const until = h.at - t;
        if (until <= 3.5) {
          const a = until <= 0 ? 0.45 : 0.10 + (3.5 - until) / 3.5 * 0.22;
          const fill = h.kind === 'yellow' ? `rgba(245,214,87,${a})` : h.kind === 'purple' ? `rgba(192,132,252,${a})` : `rgba(148,163,184,${a})`;
          circle(h.pos, CFG.HG_R, fill, col, 2.5);
        }
        const c = toPx(h.pos), s = 11;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(c.x - s, c.y - s - 2); ctx.lineTo(c.x + s, c.y - s - 2); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(c.x - s, c.y + s + 2); ctx.lineTo(c.x + s, c.y + s + 2); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#0f1218'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(c.x - s, c.y - s - 2); ctx.lineTo(c.x + s, c.y - s - 2); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x + s, c.y + s + 2); ctx.lineTo(c.x - s, c.y + s + 2); ctx.closePath(); ctx.stroke();
        const label = h.kind === 'yellow' ? '黄' : h.kind === 'purple' ? '紫' : '線なし';
        text(label, h.pos, '#fff', 11, s + 14);
      }
    }

    // 光の波予兆
    for (const j of [1, 2]) {
      const ann = j === 1 ? T.TIDAL1_ANN : T.TIDAL2_ANN;
      if (t < ann) continue;
      for (let k = 0; k < 4; k++) {
        const b = sim.tidalBand(j, k);
        if (t >= b.at - CFG.TIDAL_TELE && t < b.at) drawBand(b.d, b.lo, b.hi, 'rgba(255,230,140,0.16)');
      }
    }

    for (const ef of sim.effects) {
      if (ef.type === 'circle') circle(ef.pos, ef.r, ef.color);
      else if (ef.type === 'donut') {
        ctx.save(); clipArena();
        const c = toPx(ef.pos);
        ctx.beginPath(); ctx.arc(c.x, c.y, ef.r2 * SCALE, 0, Math.PI * 2);
        ctx.arc(c.x, c.y, ef.r1 * SCALE, 0, Math.PI * 2, true);
        ctx.fillStyle = ef.color; ctx.fill();
        ctx.restore();
      } else if (ef.type === 'band') drawBand(ef.d, ef.lo, ef.hi, ef.color);
      else if (ef.type === 'line') {
        const a = toPx(ef.a), b = toPx(ef.b);
        ctx.strokeStyle = ef.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // 白円（赤が当たった地点。B/2/3/D は担当マーカー）
    const MARK_COL = { B: '#ca8a04', D: '#7e22ce', '2': '#ca8a04', '3': '#2563eb' };
    for (const pd of sim.puddles) {
      circle(pd, CFG.PUDDLE_R, 'rgba(255,255,255,0.7)', '#ffffff', 2.5);
      if (pd.mark) text(pd.mark, pd, MARK_COL[pd.mark] || '#1e293b', 16, 0);
    }

    // 竜頭（ロックオン＋進行方向）
    for (const h of sim.heads) {
      if (!h.alive) continue;
      drawDragonHead(h);
    }

    // リーン（光の波の始点）
    if (t >= T.TIDAL1_ANN && t < T.TIDAL2[3] + 1) {
      const j = t >= T.TIDAL2_ANN ? 2 : 1;
      const d = sim.tidalDir(j);
      const pos = { x: d.x * 21, y: d.y * 21 };
      circle(pos, 1.3, '#9fd3ff', '#e8f6ff', 2);
      text('リーン', pos, '#dff1ff', 11, 16);
    }

    if (showHint && running && !sim.done) {
      const target = sim.assignedPos(sim.user, t);
      if (target) {
        ctx.setLineDash([5, 4]);
        circle(target, 1.3, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 2);
        ctx.setLineDash([]);
        const a = toPx(sim.pl[sim.user]), b = toPx(target);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    window.EdenArena.drawWaymarks(ctx, toPx);

    for (let i = 0; i < 8; i++) {
      const p = sim.pl[i];
      const isUser = i === sim.user;
      const c = toPx(p);
      circle(p, 0.95, null, p.red ? 'rgba(248,113,113,0.95)' : 'rgba(96,165,250,0.95)', 2.5);
      circle(p, 0.7, ROLE_COLOR[ROLE_TYPE[i]], isUser ? '#ffffff' : 'rgba(0,0,0,0.6)', isUser ? 3 : 1.5);
      text(ROLES[i], p, '#ffffff', 10, 0);
      if (t >= 0) {
        drawMechMark(p, c, t, T);
        ctx.fillStyle = SPELL_COLOR[p.spell];
        ctx.beginPath(); ctx.arc(c.x, c.y - 0.7 * SCALE - 11, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(SPELL_SHORT[p.spell], c.x, c.y - 0.7 * SCALE - 11);
        const atk = ATTACK_MARK[p.spell];
        if (atk) drawAttackMark(c.x, c.y - 0.7 * SCALE - 34, atk);
      }
      if (t >= T.TAKER_MARK && t < T.TAKER && i === sim.sc.taker) {
        const extra = ATTACK_MARK[p.spell] ? 56 : 34;
        drawTakerMark(c.x, c.y - 0.7 * SCALE - extra);
      }
      if (isUser) text('YOU', p, '#ffffff', 10, 0.7 * SCALE + 9);
      if (sim.fails[i].length) {
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(c.x - 9, c.y - 9); ctx.lineTo(c.x + 9, c.y + 9); ctx.moveTo(c.x + 9, c.y - 9); ctx.lineTo(c.x - 9, c.y + 9); ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '14px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(t < 0 ? `詠唱中 ${(-t).toFixed(1)}s` : `T+${t.toFixed(1)}s`, 12, 10);
    ctx.fillText(PHASE_NAME[sim.phaseKey(t)], 12, 30);
    let cast = null;
    if (t < T.DEBUFF) cast = ['時間結晶', (t - T.START) / (T.DEBUFF - T.START)];
    else if (t >= T.TIDAL1_ANN && t < T.TIDAL1[0]) cast = ['光の波', (t - T.TIDAL1_ANN) / (T.TIDAL1[0] - T.TIDAL1_ANN)];
    else if (t >= T.TIDAL2_ANN && t < T.TIDAL2[0]) cast = ['光の波', (t - T.TIDAL2_ANN) / (T.TIDAL2[0] - T.TIDAL2_ANN)];
    else if (t >= T.TAKER_MARK && t < T.TAKER) cast = ['スピリットテイカー', (t - T.TAKER_MARK) / (T.TAKER - T.TAKER_MARK)];
    else if (t >= T.RETURN_SNAP && t < T.RETURN) cast = ['リターン', (t - T.RETURN_SNAP) / (T.RETURN - T.RETURN_SNAP)];
    if (cast) {
      const w = 260, h = 14, x = SIZE / 2 - w / 2, y = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#f2c94c'; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, cast[1])), h);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#fff'; ctx.font = '13px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(cast[0], SIZE / 2, y + h + 4);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('北↑ / 東→', SIZE - 12, 10);

    if (ui.hint.checked && running && !sim.done && sim.user >= 0) {
      const lines = wrapText(sim.hintText(sim.user), SIZE - 32, '15px "Segoe UI", sans-serif').slice(0, 3);
      const lh = 20, h = lines.length * lh + 12, y0 = SIZE - h - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(8, y0, SIZE - 16, h);
      ctx.fillStyle = '#ffe08a'; ctx.font = '15px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((ln, k) => ctx.fillText(ln, 16, y0 + 6 + k * lh));
    }

    if (!running && !sim.done) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, SIZE / 2 - 24, SIZE, 48);
      ctx.fillStyle = '#fff'; ctx.font = '18px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('「開始」を押すと詠唱が始まります', SIZE / 2, SIZE / 2);
    } else if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, SIZE / 2 - 24, SIZE, 48);
      ctx.fillStyle = '#fff'; ctx.font = '18px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('一時停止中（Space で再開）', SIZE / 2, SIZE / 2);
    }
  }

  window.CrystallizeApp = { get sim() { return sim; } };
  newSim();
  requestAnimationFrame(loop);
})();
