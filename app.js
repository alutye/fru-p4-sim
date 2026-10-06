/* 描画・操作 */
(function () {
  'use strict';
  const { Sim, CFG, ROLES, ROLE_TYPE, compass, dist, angleOf } = window.DragonsongSim;

  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');
  const SIZE = canvas.width;
  const SCALE = SIZE / (2 * (CFG.R + 1.5));
  const toPx = p => ({ x: SIZE / 2 + p.x * SCALE, y: SIZE / 2 + p.y * SCALE });
  const fromPx = (px, py) => ({ x: (px - SIZE / 2) / SCALE, y: (py - SIZE / 2) / SCALE });

  const $ = id => document.getElementById(id);
  const ui = {
    role: $('role'), shape: $('shape'), wing: $('wing'), speed: $('speed'), tether: $('tether'), tetherVal: $('tetherVal'),
    spectate: $('spectate'), hint: $('hint'), start: $('start'), pause: $('pause'), reset: $('reset'),
    stTime: $('stTime'), stPhase: $('stPhase'), stDebuff: $('stDebuff'), stHint: $('stHint'),
    result: $('result'), log: $('log'),
  };

  const ROLE_COLOR = { tank: '#3b82f6', healer: '#22c55e', dps: '#ef4444' };
  const PHASE_NAME = { pre: '詠唱中（整列）', A: '塔・扇誘導', B: 'テイカー散開', C: 'ホーリーウィング＋ウォタガ', D: '宵闇の舞踏技' };

  let sim = null;
  let running = false;
  let paused = false;
  let timeScale = 1;
  let last = performance.now();
  let loggedCount = 0;
  const keys = new Set();

  function newSim() {
    sim = new Sim({
      shape: ui.shape.value,
      wing: ui.wing.value,
      userRole: parseInt(ui.role.value, 10),
      spectate: ui.spectate.checked,
    });
    running = false;
    paused = false;
    loggedCount = 0;
    ui.log.innerHTML = '';
    ui.result.classList.add('hidden');
    ui.pause.textContent = '一時停止';
    ui.start.textContent = '開始';
  }

  // ---- UI events ----
  ui.start.addEventListener('click', () => {
    if (sim.done) newSim();
    running = true; paused = false;
    ui.start.textContent = '実行中…';
    ui.pause.textContent = '一時停止';
    canvas.focus();
  });
  ui.pause.addEventListener('click', togglePause);
  ui.reset.addEventListener('click', newSim);
  for (const el of [ui.role, ui.shape, ui.wing, ui.spectate]) el.addEventListener('change', () => { if (!running || sim.done) newSim(); });
  ui.speed.addEventListener('change', () => { timeScale = parseFloat(ui.speed.value); });
  ui.tether.addEventListener('input', () => { CFG.TETHER_MIN = parseFloat(ui.tether.value); ui.tetherVal.textContent = ui.tether.value; });

  function togglePause() {
    if (!running || sim.done) return;
    paused = !paused;
    ui.pause.textContent = paused ? '再開' : '一時停止';
  }

  canvas.tabIndex = 0;
  canvas.addEventListener('click', ev => {
    if (!sim || sim.user < 0) return;
    const r = canvas.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (SIZE / r.width);
    const py = (ev.clientY - r.top) * (SIZE / r.height);
    sim.moveTarget = fromPx(px, py);
    canvas.focus();
  });
  window.addEventListener('keydown', ev => {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'SELECT' || tag === 'INPUT') return;
    if (ev.code === 'Space') { ev.preventDefault(); togglePause(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(ev.code)) {
      ev.preventDefault();
      keys.add(ev.code);
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
    sim.input = { dx, dy, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') };
  }

  // ---- main loop ----
  function loop(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running && !paused && !sim.done) {
      readInput();
      sim.update(dt * timeScale);
    }
    draw();
    updatePanel();
    requestAnimationFrame(loop);
  }

  // ---- panel ----
  function updatePanel() {
    const t = sim.t;
    ui.stTime.textContent = (t < 0 ? `詠唱 ${(-t).toFixed(1)}s` : `${t.toFixed(1)}s`);
    ui.stPhase.textContent = PHASE_NAME[sim.phaseKey(t)] + (sim.done ? '（終了）' : '');
    if (sim.user >= 0) {
      const u = sim.user;
      const parts = [];
      if (t >= 0) {
        if (sim.isTethered(u)) parts.push(`光の鎖（相手: ${sim.partnersOf(u).map(i => ROLES[i]).join(', ')}）`);
        if (sim.sc.water.includes(u)) parts.push('ウォタガ（頭割り）');
        if (sim.sc.taker === u && t >= CFG.T.TAKER_MARK && t < CFG.T.TAKER) parts.push('スピリットテイカー対象');
      }
      ui.stDebuff.textContent = parts.length ? parts.join(' / ') : (t < 0 ? '（詠唱完了後に付与）' : 'なし');
      ui.stHint.textContent = running ? sim.hintText(u) : '「開始」を押してください';
    } else {
      ui.stDebuff.textContent = '観戦モード';
      ui.stHint.textContent = running ? '全員 AI が処理します' : '「開始」を押してください';
    }
    // log
    while (loggedCount < sim.log.length) {
      const l = sim.log[loggedCount++];
      const li = document.createElement('li');
      li.className = l.type;
      li.innerHTML = `<span class="t">${l.t < 0 ? '-' : l.t.toFixed(1) + 's'}</span>${escapeHtml(l.text)}`;
      ui.log.appendChild(li);
      ui.log.scrollTop = ui.log.scrollHeight;
    }
    // result
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
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- drawing ----
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
  function cone(from, ang, half, len, fill) {
    const c = toPx(from);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, len * SCALE, ang - half, ang + half);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }
  function halfPlane(side, fill) {
    ctx.save(); clipArena();
    ctx.fillStyle = fill;
    if (side === 'E') ctx.fillRect(SIZE / 2, 0, SIZE / 2, SIZE); else ctx.fillRect(0, 0, SIZE / 2, SIZE);
    ctx.restore();
  }

  function draw() {
    const t = sim.t, T = CFG.T;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const showHint = ui.hint.checked && sim.user >= 0;

    // arena
    circle({ x: 0, y: 0 }, CFG.R, '#1b2233', '#3a4660', 3);
    ctx.save(); clipArena();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let k = -20; k <= 20; k += 5) {
      const a = toPx({ x: k, y: -CFG.R }), b = toPx({ x: k, y: CFG.R });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = toPx({ x: -CFG.R, y: k }), d = toPx({ x: CFG.R, y: k });
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();

    // hint: wing danger side
    if (showHint && t >= T.WING_CAST && t < T.WING) halfPlane(sim.sc.wingCleave, 'rgba(255,120,80,0.10)');
    // hint: cone zones (only while telegraph)
    // markers
    const MR = 16;
    const marks = [
      ['A', 0, '#f26b6b', 'circle'], ['B', 90, '#f2d16b', 'circle'], ['C', 180, '#6bb3f2', 'circle'], ['D', 270, '#c86bf2', 'circle'],
      ['1', 45, '#f26b6b', 'square'], ['2', 135, '#f2d16b', 'square'], ['3', 225, '#6bb3f2', 'square'], ['4', 315, '#c86bf2', 'square'],
    ];
    for (const [name, deg, color, shape] of marks) {
      const p = compass(deg, MR); const c = toPx(p);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      if (shape === 'circle') { ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.stroke(); }
      else ctx.strokeRect(c.x - 10, c.y - 10, 20, 20);
      text(name, p, color, 12, 0);
    }

    // towers
    if (t >= T.TOWER_SPAWN && t < T.TOWER) {
      CFG.TOWERS.forEach(tw => {
        const inside = sim.players.filter(p => dist(p, tw) <= CFG.TOWER_R).length;
        circle(tw, CFG.TOWER_R, 'rgba(255,220,100,0.18)', 'rgba(255,220,100,0.9)', 2);
        circle(tw, 0.8, 'rgba(255,240,160,0.8)');
        text(`${inside}/${CFG.TOWER_NEED}`, tw, '#fff3c4', 13, -CFG.TOWER_R * SCALE - 10);
      });
    }

    // cones
    if (t >= T.CONE_TELEGRAPH && t < T.TOWER) {
      for (const i of sim.nearestToUsurper(CFG.CONE_COUNT)) {
        const ang = angleOf(CFG.USURPER, sim.players[i]);
        cone(CFG.USURPER, ang, CFG.CONE_HALF, CFG.R + 1, 'rgba(255,170,60,0.22)');
      }
    } else if (sim.cones && t < sim.coneUntil) {
      for (const c of sim.cones) cone(CFG.USURPER, c.ang, CFG.CONE_HALF, CFG.R + 1, 'rgba(255,170,60,0.5)');
    }

    // effects
    for (const ef of sim.effects) {
      if (ef.type === 'circle') circle(ef.pos, ef.r, ef.color);
      else if (ef.type === 'half') halfPlane(ef.side, ef.color);
    }

    // tethers
    if (t >= T.DEBUFF && t < T.END) {
      for (const e of sim.edges) {
        if (e.broken) continue;
        const a = toPx(sim.players[e.a]), b = toPx(sim.players[e.b]);
        const d = dist(sim.players[e.a], sim.players[e.b]);
        const danger = d < CFG.TETHER_MIN + 1.5;
        ctx.strokeStyle = danger ? 'rgba(255,80,80,0.95)' : 'rgba(255,240,160,0.75)';
        ctx.lineWidth = danger ? 3 : 2;
        ctx.setLineDash(danger ? [6, 4] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // bosses
    const U = CFG.USURPER;
    ctx.setLineDash([4, 4]);
    circle(U, CFG.USURPER_HITBOX, 'rgba(140,200,255,0.06)', 'rgba(140,200,255,0.45)', 1.5);
    ctx.setLineDash([]);
    if (t >= T.WING_CAST && t < T.WING) drawWings(U, sim.sc.wingCleave);
    circle(U, 1.5, '#9fd3ff', '#e8f6ff', 2);
    text('リーン', { x: U.x, y: U.y }, '#dff1ff', 12, -1.5 * SCALE - 10);
    const O = sim.oracle;
    circle(O, 1.2, '#5b2d8f', '#c9a4ff', 2);
    text('ガイア', O, '#e7d7ff', 12, 1.2 * SCALE + 10);

    // hint: assigned position
    if (showHint && running && !sim.done) {
      const u = sim.user;
      const k = sim.phaseKey(t);
      let target = sim.assignedPos(u, t);
      if (k === 'A' && sim.as.waypoint[u] && dist(sim.players[u], sim.as.waypoint[u]) >= 1.0 && !sim.ai[u].wpDone && dist(sim.players[u], target) > 6) {
        // 迂回推奨ポイントも薄く表示
        ctx.setLineDash([3, 3]);
        circle(sim.as.waypoint[u], 0.9, null, 'rgba(255,255,255,0.4)', 1.5);
        ctx.setLineDash([]);
      }
      if (target) {
        ctx.setLineDash([5, 4]);
        circle(target, 1.3, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 2);
        ctx.setLineDash([]);
        const a = toPx(sim.players[u]), b = toPx(target);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // players
    for (let i = 0; i < 8; i++) {
      const p = sim.players[i];
      const isUser = i === sim.user;
      if (t >= T.DEBUFF && t < T.END && sim.isTethered(i)) circle(p, 1.05, null, 'rgba(255,240,160,0.9)', 2);
      circle(p, 0.7, ROLE_COLOR[ROLE_TYPE[i]], isUser ? '#ffffff' : 'rgba(0,0,0,0.6)', isUser ? 3 : 1.5);
      text(ROLES[i], p, '#ffffff', 11, 0);
      if (isUser) text('YOU', p, '#ffffff', 10, 0.7 * SCALE + 9);
      if (t >= T.DEBUFF && sim.sc.water.includes(i) && t < T.WING) {
        const c = toPx(p);
        ctx.fillStyle = '#4da3ff'; ctx.beginPath(); ctx.arc(c.x, c.y - 0.7 * SCALE - 12, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('水', c.x, c.y - 0.7 * SCALE - 12);
      }
      if (sim.sc.taker === i && t >= T.TAKER_MARK && t < T.TAKER) {
        const c = toPx(p);
        ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, 0.7 * SCALE + 6 + Math.sin(t * 10) * 2, 0, Math.PI * 2); ctx.stroke();
        text('テイカー', p, '#e3c6ff', 11, -0.7 * SCALE - 26);
      }
      if (sim.fails[i].length) {
        const c = toPx(p);
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(c.x - 9, c.y - 9); ctx.lineTo(c.x + 9, c.y + 9); ctx.moveTo(c.x + 9, c.y - 9); ctx.lineTo(c.x - 9, c.y + 9); ctx.stroke();
      }
    }

    drawHud();
  }

  function drawWings(U, cleave) {
    const c = toPx(U);
    const wing = (dir, lit) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(dir, 1);
      ctx.beginPath();
      ctx.moveTo(1.2 * SCALE, 0);
      ctx.quadraticCurveTo(4 * SCALE, -3.5 * SCALE, 7 * SCALE, -2.5 * SCALE);
      ctx.quadraticCurveTo(5 * SCALE, -0.5 * SCALE, 6.5 * SCALE, 1.5 * SCALE);
      ctx.quadraticCurveTo(3.5 * SCALE, 0.5 * SCALE, 1.2 * SCALE, 1.2 * SCALE);
      ctx.closePath();
      if (lit) {
        ctx.shadowColor = '#fff2a8'; ctx.shadowBlur = 25;
        ctx.fillStyle = 'rgba(255,245,180,0.95)';
      } else {
        ctx.fillStyle = 'rgba(150,170,200,0.35)';
      }
      ctx.fill();
      ctx.restore();
    };
    wing(1, cleave === 'E');
    wing(-1, cleave === 'W');
  }

  function drawHud() {
    const t = sim.t, T = CFG.T;
    // time
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '14px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(t < 0 ? `詠唱中 ${(-t).toFixed(1)}s` : `T+${t.toFixed(1)}s`, 12, 10);
    ctx.fillText(PHASE_NAME[sim.phaseKey(t)], 12, 30);
    // cast bar
    let cast = null;
    if (t < T.DEBUFF) cast = ['光と闇の竜詩', (t - T.START) / (T.DEBUFF - T.START)];
    else if (t >= T.WING_CAST && t < T.WING) cast = ['ホーリーウィング', (t - T.WING_CAST) / (T.WING - T.WING_CAST)];
    else if (t >= T.DANCE_CAST && t < T.DANCE1) cast = ['宵闇の舞踏技', (t - T.DANCE_CAST) / (T.DANCE1 - T.DANCE_CAST)];
    else if (t >= T.CONE_TELEGRAPH && t < T.TOWER) cast = ['光の道（扇）/ 塔', (t - T.CONE_TELEGRAPH) / (T.TOWER - T.CONE_TELEGRAPH)];
    if (cast) {
      const w = 260, h = 14, x = SIZE / 2 - w / 2, y = 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#f2c94c'; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, cast[1])), h);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#fff'; ctx.font = '13px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(cast[0], SIZE / 2, y + h + 4);
    }
    // compass
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('北↑ / 東→', SIZE - 12, 10);
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

  CFG.TETHER_MIN = parseFloat(ui.tether.value);
  window.DragonsongApp = { get sim() { return sim; } };
  newSim();
  requestAnimationFrame(loop);
})();
