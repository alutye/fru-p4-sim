/* 絶もうひとつの未来 P4「光と闇の竜詩」シミュレーター - ギミックエンジン
 * 座標系: 原点=フィールド中央, x=東(+), y=南(+), 単位=ヤルム(y)
 */
(function (global) {
  'use strict';

  const ROLES = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
  const ROLE_TYPE = ['tank', 'tank', 'healer', 'healer', 'dps', 'dps', 'dps', 'dps'];
  const D2R = Math.PI / 180;

  const CFG = {
    R: 20,                 // フィールド半径
    SPEED: 6.0,            // 移動速度 (y/s)
    SPRINT: 7.8,           // スプリント速度
    TETHER_MIN: 4,         // 鎖が切れる距離（推定値・設定で変更可）
    TETHER_GRACE: 1.0,     // 付与直後の猶予
    TOWER_R: 3,
    TOWER_NEED: 2,
    TOWERS: [{ x: 0, y: -11 }, { x: 0, y: 11 }],
    CONE_HALF: 25 * D2R,   // 扇の半角
    CONE_COUNT: 4,
    TAKER_R: 5,            // スピリットテイカー
    WATER_R: 6,            // ウォタガ頭割り
    WATER_NEED: 4,
    DANCE_R: 4,            // 宵闇の舞踏技
    USURPER: { x: 0, y: 0 },
    USURPER_HITBOX: 5,
    ORACLE_HOME: { x: 0, y: 4 },
    T: {
      START: -4,
      DEBUFF: 0,
      TOWER_SPAWN: 2,
      CONE_TELEGRAPH: 7.5,
      TOWER: 9.5,
      TAKER_MARK: 12.5,
      TAKER: 14.5,
      WING_CAST: 14.5,
      WING: 20.5,
      DANCE_CAST: 20.5,
      DANCE1: 24.0,
      DANCE2: 25.5,
      END: 27.5,
    },
  };

  // 整列位置（ぬけまる式・南北整列）: 北列 西← H1 H2 MT ST →東 / 南列 西← D1 D2 D3 D4 →東
  const LINEUP = [
    { x: 3.5, y: -7 }, { x: 10.5, y: -7 }, { x: -10.5, y: -7 }, { x: -3.5, y: -7 },
    { x: -10.5, y: 7 }, { x: -3.5, y: 7 }, { x: 3.5, y: 7 }, { x: 10.5, y: 7 },
  ];
  const byWest = (a, b) => LINEUP[a].x - LINEUP[b].x;
  const rowNames = row => row.slice().sort(byWest).map(i => ROLES[i]).join(' ');

  const SHAPE_NAME = { ribbon: 'リボン（∞）', square: '四角形（□）', hourglass: '砂時計（8）' };
  const SPOT_NAME = { 22.5: 'A–1', 67.5: '1–B', 112.5: 'B–2', 157.5: '2–C', 202.5: 'C–3', 247.5: '3–D', 292.5: 'D–4', 337.5: '4–A' };

  function compass(deg, r) { const a = deg * D2R; return { x: r * Math.sin(a), y: -r * Math.cos(a) }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleOf(from, to) { return Math.atan2(to.y - from.y, to.x - from.x); }
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }

  function pick2(arr, rand) {
    const a = arr.slice();
    const x = a.splice(Math.floor(rand() * a.length), 1)[0];
    const y = a[Math.floor(rand() * a.length)];
    return [x, y].sort((p, q) => p - q);
  }

  function genScenario(opts, rand) {
    // 鎖はタンク1人＋ヒーラー1人、DPS2人
    const th = [Math.floor(rand() * 2), 2 + Math.floor(rand() * 2)].sort(byWest);
    const dps = pick2([4, 5, 6, 7], rand).sort(byWest);
    const NW = th[0], NE = th[1], SW = dps[0], SE = dps[1];
    const shapes = ['ribbon', 'square', 'hourglass'];
    const shape = shapes.includes(opts.shape) ? opts.shape : shapes[Math.floor(rand() * 3)];
    let cycle;
    if (shape === 'ribbon') cycle = [NW, SW, NE, SE];
    else if (shape === 'square') cycle = [NW, NE, SE, SW];
    else cycle = [NW, NE, SW, SE];
    const pairs = [[cycle[0], cycle[2]], [cycle[1], cycle[3]]]; // 鎖で繋がっていない組 = 同じ塔に入れる組
    let water = [0, 1];
    for (let k = 0; k < 200; k++) {
      water = pick2([0, 1, 2, 3, 4, 5, 6, 7], rand);
      const same = pairs.some(p => p.includes(water[0]) && p.includes(water[1]));
      if (!same) break;
    }
    const wingCleave = (opts.wing === 'E' || opts.wing === 'W') ? opts.wing : (rand() < 0.5 ? 'E' : 'W');
    const taker = Math.floor(rand() * 8);
    return { th, dps, shape, cycle, pairs, water, wingCleave, taker };
  }

  // ぬけまる式（南北整列 / 塔: 北TH・南DPS / 扇誘導: TH北・DPS南 / ウォタガ偏りは扇前調整）で各フェーズの担当位置を算出
  function computeAssignments(sc) {
    const tethered = new Set(sc.cycle);
    // 西側THを含む（鎖で繋がっていない）組が北の塔。
    //   ∞: 調整なし（TH2人=北, DPS2人=南） / □: 右上↔右下（東TH↔東DPS） / 8: 右上↔左下（東TH↔西DPS）
    const westTH = sc.th[0];
    const northPair = sc.pairs.find(p => p.includes(westTH)).slice().sort(byWest);
    const southPair = sc.pairs.find(p => !p.includes(westTH)).slice().sort(byWest);
    const freeTH = [0, 1, 2, 3].filter(i => !tethered.has(i)).sort(byWest);
    const freeD = [4, 5, 6, 7].filter(i => !tethered.has(i)).sort(byWest);
    const thW = freeTH[0], thE = freeTH[1], dW = freeD[0], dE = freeD[1];
    const isWater = i => sc.water.includes(i);

    // 扇誘導: 鎖なしTHはリーンの北側（西/東）、鎖なしDPSは南側（西/東）
    const FAN = { NW: { x: -3.5, y: -3.5 }, NE: { x: 3.5, y: -3.5 }, SW: { x: -3.5, y: 3.5 }, SE: { x: 3.5, y: 3.5 } };
    const fanSlot = {}; fanSlot[thW] = 'NW'; fanSlot[thE] = 'NE'; fanSlot[dW] = 'SW'; fanSlot[dE] = 'SE';
    let northFan = [thW, thE], southFan = [dW, dE];
    let swapped = null;
    const nWater = [...northPair, ...northFan].filter(isWater).length;
    const swapFan = (a, b) => {
      [fanSlot[a], fanSlot[b]] = [fanSlot[b], fanSlot[a]];
      northFan = northFan.map(i => (i === a ? b : i)); southFan = southFan.map(i => (i === b ? a : i));
    };
    if (nWater === 2) {
      // 北に偏り: ウォタガ持ちの北側TH が南へ、同じ側のDPSが北へ
      const t = isWater(thW) ? thW : thE; const d = (t === thW) ? dW : dE;
      swapFan(t, d); swapped = [t, d];
    } else if (nWater === 0) {
      // 南に偏り: ウォタガ持ちの南側DPS が北へ、同じ側のTHが南へ
      const d = isWater(dW) ? dW : dE; const t = (d === dW) ? thW : thE;
      swapFan(t, d); swapped = [d, t];
    }
    const north = [...northPair, ...northFan];
    const south = [...southPair, ...southFan];
    const fanInfo = {};
    for (const i of [thW, thE, dW, dE]) fanInfo[i] = { ns: fanSlot[i][0] === 'N' ? '北' : '南', ew: fanSlot[i][1] === 'W' ? '西' : '東' };

    const A = {}, B = {}, C = {}, D = {};
    // フェーズA: 塔 / 扇誘導
    A[northPair[0]] = { x: -1.2, y: CFG.TOWERS[0].y }; A[northPair[1]] = { x: 1.2, y: CFG.TOWERS[0].y };
    A[southPair[0]] = { x: -1.2, y: CFG.TOWERS[1].y }; A[southPair[1]] = { x: 1.2, y: CFG.TOWERS[1].y };
    for (const i of [thW, thE, dW, dE]) A[i] = FAN[fanSlot[i]];

    // 南北を入れ替える鎖持ちの迂回ポイント（鎖の相手と正面衝突しないよう外周側を回る）
    const waypoint = {};
    const thSwap = [...northPair, ...southPair].find(i => i < 4 && Math.sign(A[i].y) !== Math.sign(LINEUP[i].y));
    const dSwap = [...northPair, ...southPair].find(i => i >= 4 && Math.sign(A[i].y) !== Math.sign(LINEUP[i].y));
    if (thSwap !== undefined && dSwap !== undefined && Math.sign(LINEUP[thSwap].x) === Math.sign(LINEUP[dSwap].x)) {
      // 同じ側にいる場合: 外側にいる方が外周レーン、内側にいる方が内側レーンを通る
      const side = Math.sign(LINEUP[thSwap].x);
      const thOuter = Math.abs(LINEUP[thSwap].x) >= Math.abs(LINEUP[dSwap].x);
      waypoint[thSwap] = { x: side * (thOuter ? 12.5 : 5), y: 0 };
      waypoint[dSwap] = { x: side * (thOuter ? 5 : 12.5), y: 0 };
    } else {
      if (thSwap !== undefined) waypoint[thSwap] = { x: Math.sign(LINEUP[thSwap].x) * 8, y: 0 };
      if (dSwap !== undefined) waypoint[dSwap] = { x: Math.sign(LINEUP[dSwap].x) * 8, y: 0 };
    }

    // フェーズB: テイカー散開（マーカー間）
    const SR = 14;
    const spot = {};
    const nf = northFan.slice().sort((a, b) => A[a].x - A[b].x), sf = southFan.slice().sort((a, b) => A[a].x - A[b].x);
    spot[nf[0]] = 292.5; spot[northPair[0]] = 337.5; spot[northPair[1]] = 22.5; spot[nf[1]] = 67.5;
    spot[sf[0]] = 247.5; spot[southPair[0]] = 202.5; spot[southPair[1]] = 157.5; spot[sf[1]] = 112.5;
    for (const i of Object.keys(spot)) B[i] = compass(spot[i], SR);
    // フェーズC: 安地側で南北4:4頭割り
    const s = sc.wingCleave === 'E' ? -1 : 1;
    const offs = [{ x: -0.8, y: -0.8 }, { x: 0.8, y: -0.8 }, { x: -0.8, y: 0.8 }, { x: 0.8, y: 0.8 }];
    north.forEach((p, k) => { C[p] = { x: s * 8 + offs[k].x, y: -9 + offs[k].y }; });
    south.forEach((p, k) => { C[p] = { x: s * 8 + offs[k].x, y: 9 + offs[k].y }; });
    // フェーズD: 宵闇の舞踏技（MTが外周へ）
    Object.assign(D, C);
    D[0] = { x: s * 19, y: 0 };
    return { northPair, southPair, fanInfo, north, south, swapped, safeSign: s, spot, waypoint, pos: { A, B, C, D } };
  }

  function moveToward(p, target, step) {
    const d = dist(p, target);
    if (d <= step || d === 0) { p.x = target.x; p.y = target.y; return; }
    p.x += (target.x - p.x) / d * step;
    p.y += (target.y - p.y) / d * step;
  }

  class Sim {
    constructor(opts) {
      this.opts = Object.assign({ shape: 'random', wing: 'random', userRole: 0, spectate: false, rand: Math.random }, opts || {});
      this.reset();
    }

    reset() {
      const rand = this.opts.rand;
      this.t = CFG.T.START;
      this.done = false;
      this.result = null;
      this.log = [];
      this.fails = ROLES.map(() => []);
      this.raidFails = [];
      this.sc = genScenario(this.opts, rand);
      this.as = computeAssignments(this.sc);
      this.players = LINEUP.map(p => ({ x: p.x, y: p.y }));
      this.user = this.opts.spectate ? -1 : this.opts.userRole;
      this.oracle = { x: CFG.ORACLE_HOME.x, y: CFG.ORACLE_HOME.y };
      this.oracleReturnAt = null;
      const c = this.sc.cycle;
      this.edges = [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]].map(e => ({ a: e[0], b: e[1], broken: false }));
      this.ai = ROLES.map(() => ({ phase: null, delay: 0, since: 0, wpDone: false }));
      this.effects = [];
      this.cones = null;
      this.coneUntil = -1;
      this.moveTarget = null;
      this.input = { dx: 0, dy: 0, sprint: false };
      this.info(`シナリオ生成: 鎖=${this.sc.cycle.map(i => ROLES[i]).join('→')}→${ROLES[this.sc.cycle[0]]} / 形=${SHAPE_NAME[this.sc.shape]} / ウォタガ=${this.sc.water.map(i => ROLES[i]).join(', ')}`);
    }

    // ---- ログ ----
    info(text) { this.log.push({ t: this.t, type: 'info', text }); }
    ok(text) { this.log.push({ t: this.t, type: 'ok', text }); }
    fail(i, text) { this.fails[i].push(text); this.log.push({ t: this.t, type: 'fail', who: i, text: `${ROLES[i]}: ${text}` }); }
    raidFail(text) { this.raidFails.push(text); this.log.push({ t: this.t, type: 'fail', text }); }

    // ---- 情報 ----
    phaseKey(t) {
      const T = CFG.T;
      if (t < T.DEBUFF) return 'pre';
      if (t < T.TOWER) return 'A';
      if (t < T.TAKER) return 'B';
      if (t < T.WING) return 'C';
      return 'D';
    }
    assignedPos(i, t) {
      const k = this.phaseKey(t);
      if (k === 'pre') return LINEUP[i];
      return this.as.pos[k][i];
    }
    partnersOf(i) { return this.edges.filter(e => e.a === i || e.b === i).map(e => (e.a === i ? e.b : e.a)); }
    isTethered(i) { return this.sc.cycle.includes(i); }
    towerOf(i) { if (this.as.northPair.includes(i)) return '北'; if (this.as.southPair.includes(i)) return '南'; return null; }
    groupOf(i) { return this.as.north.includes(i) ? '北' : '南'; }
    safeSideName() { return this.as.safeSign > 0 ? '東' : '西'; }
    cleaveSideName() { return this.sc.wingCleave === 'E' ? '東' : '西'; }

    // 現在フェーズでのユーザー向けヒント
    hintText(i) {
      const k = this.phaseKey(this.t);
      const as = this.as;
      if (k === 'pre') return `整列して待機（北列 西← ${rowNames([0, 1, 2, 3])} →東 / 南列 西← ${rowNames([4, 5, 6, 7])} →東）`;
      if (k === 'A') {
        const swap = as.swapped ? `　※ウォタガ偏り: ${ROLES[as.swapped[0]]}⇔${ROLES[as.swapped[1]]} が扇前に南北入れ替え` : '';
        if (this.isTethered(i)) {
          const partner = (as.northPair.includes(i) ? as.northPair : as.southPair).find(p => p !== i);
          const shapeNote = { ribbon: '∞=調整なし', square: '□=右上↔右下', hourglass: '8=右上↔左下' }[this.sc.shape];
          return `鎖あり（${shapeNote}） → ${this.towerOf(i)}の塔へ（同じ塔: ${ROLES[partner]} / 鎖の相手: ${this.partnersOf(i).map(p => ROLES[p]).join(', ')} と離れる）${swap}`;
        }
        const f = as.fanInfo[i];
        return `鎖なし → 扇誘導。リーンのタゲサ内の${f.ns}${f.ew}に立つ（基本: TH北・DPS南）${swap}`;
      }
      if (k === 'B') return `テイカー散開 → マーカー間 ${SPOT_NAME[as.spot[i]]} へ`;
      if (k === 'C') return `羽が光った側（${this.cleaveSideName()}）が焼かれる → 安地=${this.safeSideName()}側の${this.groupOf(i)}グループで4人頭割り`;
      if (k === 'D') {
        if (i === 0) return `宵闇の舞踏技 → 無敵を使って${this.safeSideName()}の外周（${this.safeSideName() === '東' ? 'B' : 'D'}）へ。1段目=最遠、2段目=最近をMTが受ける`;
        return `宵闇の舞踏技 → 頭割り位置で待機（ガイアに近づかない / 鎖の相手に近づかない）`;
      }
      return '';
    }

    nearestToUsurper(n) {
      return this.players.map((p, i) => ({ i, d: dist(p, CFG.USURPER) })).sort((a, b) => a.d - b.d).slice(0, n).map(o => o.i);
    }

    // ---- 更新 ----
    update(dt) {
      if (this.done || dt <= 0) return;
      const T = CFG.T;
      const t0 = this.t, t1 = this.t + dt;
      const rand = this.opts.rand;

      // AI 移動
      for (let i = 0; i < 8; i++) {
        if (i === this.user) continue;
        const k = this.phaseKey(t0);
        const a = this.ai[i];
        if (a.phase !== k) { a.phase = k; a.delay = 0.3 + rand() * 0.6; a.since = t0; a.wpDone = false; }
        if (t0 - a.since >= a.delay) {
          let target = this.assignedPos(i, t0);
          if (k === 'A' && !a.wpDone && this.as.waypoint[i]) {
            const wp = this.as.waypoint[i];
            if (dist(this.players[i], wp) < 1.0) a.wpDone = true; else target = wp;
          }
          this.aiStep(i, target, CFG.SPEED * dt);
        }
      }
      // ユーザー移動
      if (this.user >= 0) {
        const p = this.players[this.user];
        const sp = (this.input.sprint ? CFG.SPRINT : CFG.SPEED) * dt;
        const { dx, dy } = this.input;
        if (dx !== 0 || dy !== 0) {
          const l = Math.hypot(dx, dy);
          p.x += dx / l * sp; p.y += dy / l * sp;
          this.moveTarget = null;
        } else if (this.moveTarget) {
          moveToward(p, this.moveTarget, sp);
          if (dist(p, this.moveTarget) < 0.01) this.moveTarget = null;
        }
      }
      // フィールド外に出ない
      for (const p of this.players) {
        const r = Math.hypot(p.x, p.y);
        if (r > CFG.R - 0.3) { p.x *= (CFG.R - 0.3) / r; p.y *= (CFG.R - 0.3) / r; }
      }

      this.t = t1;

      // 鎖の距離チェック
      if (t1 >= T.DEBUFF + CFG.TETHER_GRACE && t1 < T.END) {
        for (const e of this.edges) {
          if (e.broken) continue;
          if (dist(this.players[e.a], this.players[e.b]) < CFG.TETHER_MIN) {
            e.broken = true;
            this.fail(e.a, `鎖が切れた（${ROLES[e.b]} に接近しすぎ）`);
            this.fail(e.b, `鎖が切れた（${ROLES[e.a]} に接近しすぎ）`);
          }
        }
      }

      const cross = tt => t0 < tt && t1 >= tt;
      if (cross(T.DEBUFF)) this.info(`詠唱完了。光の鎖: ${this.sc.cycle.map(i => ROLES[i]).join(', ')} / ウォタガ: ${this.sc.water.map(i => ROLES[i]).join(', ')}`);
      if (cross(T.TOWER_SPAWN)) this.info('北と南に塔が出現（各2人）');
      if (cross(T.TOWER)) this.resolveTowerAndCones();
      if (cross(T.TAKER_MARK)) this.info(`スピリットテイカー対象: ${ROLES[this.sc.taker]}`);
      if (cross(T.TAKER)) this.resolveTaker();
      if (cross(T.WING_CAST)) this.info(`ホーリーウィング詠唱開始（${this.cleaveSideName()}の羽が発光 → ${this.safeSideName()}側が安地）`);
      if (cross(T.WING)) this.resolveWingAndWater();
      if (cross(T.DANCE_CAST)) this.info('宵闇の舞踏技 詠唱開始（1段目: 最遠 / 2段目: 最近）');
      if (cross(T.DANCE1)) this.resolveDance(1);
      if (cross(T.DANCE2)) this.resolveDance(2);
      if (this.oracleReturnAt !== null && t1 >= this.oracleReturnAt) {
        this.oracle = { x: CFG.ORACLE_HOME.x, y: CFG.ORACLE_HOME.y };
        this.oracleReturnAt = null;
      }
      if (cross(T.END)) this.finish();

      this.effects = this.effects.filter(ef => ef.until > this.t);
    }

    // AI の1ステップ移動（鎖の相手に近づきそうなら迂回する）
    aiStep(i, target, step) {
      const p = this.players[i];
      const dx = target.x - p.x, dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) return;
      let vx = dx / d, vy = dy / d;
      let avoiding = false;
      const AV = CFG.TETHER_MIN + 3.5;
      for (const q of this.partnersOf(i)) {
        const qp = this.players[q];
        const ex = p.x - qp.x, ey = p.y - qp.y;
        const e = Math.hypot(ex, ey);
        if (e < AV && e > 1e-6) {
          const w = (AV - e) / (AV - CFG.TETHER_MIN);
          const ax = ex / e, ay = ey / e;
          // 離れる方向 + 横方向（正面衝突しないよう必ず同じ回転方向にずれる）
          vx += (ax + -ay * 1.5) * w * 4;
          vy += (ay + ax * 1.5) * w * 4;
          avoiding = true;
        }
      }
      const l = Math.hypot(vx, vy);
      if (l < 1e-6) return;
      const len = avoiding ? step : Math.min(step, d);
      p.x += vx / l * len; p.y += vy / l * len;
    }

    resolveTowerAndCones() {
      const names = ['北', '南'];
      CFG.TOWERS.forEach((tw, k) => {
        const inside = this.players.map((p, i) => i).filter(i => dist(this.players[i], tw) <= CFG.TOWER_R);
        if (inside.length < CFG.TOWER_NEED) this.raidFail(`${names[k]}の塔が未処理（${inside.length}人 / ${CFG.TOWER_NEED}人必要）`);
        else this.ok(`${names[k]}の塔: ${inside.map(i => ROLES[i]).join(', ')} で処理`);
        this.effects.push({ type: 'circle', pos: tw, r: CFG.TOWER_R, color: inside.length >= CFG.TOWER_NEED ? 'rgba(255,230,120,0.5)' : 'rgba(255,80,80,0.6)', until: this.t + 1.0 });
      });
      const targets = this.nearestToUsurper(CFG.CONE_COUNT);
      this.cones = targets.map(i => ({ target: i, ang: angleOf(CFG.USURPER, this.players[i]) }));
      this.coneUntil = this.t + 1.0;
      for (const c of this.cones) {
        for (let j = 0; j < 8; j++) {
          if (j === c.target) continue;
          const d = dist(this.players[j], CFG.USURPER);
          if (d < 0.01) { this.fail(j, '扇範囲（光の道）に被弾'); continue; }
          if (angDiff(angleOf(CFG.USURPER, this.players[j]), c.ang) <= CFG.CONE_HALF) this.fail(j, `扇範囲（${ROLES[c.target]} 誘導分）に被弾`);
        }
      }
      this.info(`扇誘導: ${targets.map(i => ROLES[i]).join(', ')}`);
      for (const i of targets) if (this.isTethered(i)) this.fail(i, '鎖持ちが扇を誘導してしまった（塔に入れない）');
    }

    resolveTaker() {
      const tgt = this.sc.taker;
      const pos = { x: this.players[tgt].x, y: this.players[tgt].y };
      this.oracle = { x: pos.x, y: pos.y };
      this.oracleReturnAt = this.t + 1.2;
      let hit = 0;
      for (let j = 0; j < 8; j++) {
        if (j === tgt) continue;
        if (dist(this.players[j], pos) <= CFG.TAKER_R) { this.fail(j, `スピリットテイカー（${ROLES[tgt]}）に巻き込まれた`); hit++; }
      }
      if (!hit) this.ok(`スピリットテイカー（${ROLES[tgt]}）: 散開成功`);
      this.effects.push({ type: 'circle', pos, r: CFG.TAKER_R, color: 'rgba(170,90,255,0.45)', until: this.t + 0.8 });
    }

    resolveWingAndWater() {
      const s = this.as.safeSign;
      let hit = 0;
      for (let j = 0; j < 8; j++) {
        if (this.players[j].x * s <= 0) { this.fail(j, `ホーリーウィング（${this.cleaveSideName()}半面）に被弾`); hit++; }
      }
      if (!hit) this.ok(`ホーリーウィング: 全員${this.safeSideName()}側で回避`);
      this.effects.push({ type: 'half', side: this.sc.wingCleave, color: 'rgba(255,240,180,0.55)', until: this.t + 0.8 });

      const counts = new Array(8).fill(0);
      for (const h of this.sc.water) {
        const hp = this.players[h];
        const members = this.players.map((p, i) => i).filter(i => dist(this.players[i], hp) <= CFG.WATER_R);
        for (const m of members) counts[m]++;
        if (members.length !== CFG.WATER_NEED) this.raidFail(`ウォタガ頭割り（${ROLES[h]}）: ${members.length}人（${CFG.WATER_NEED}人必要）`);
        else this.ok(`ウォタガ頭割り（${ROLES[h]}）: ${members.map(i => ROLES[i]).join(', ')}`);
        this.effects.push({ type: 'circle', pos: { x: hp.x, y: hp.y }, r: CFG.WATER_R, color: members.length === CFG.WATER_NEED ? 'rgba(80,160,255,0.45)' : 'rgba(255,80,80,0.5)', until: this.t + 0.8 });
      }
      for (let j = 0; j < 8; j++) if (counts[j] >= 2) this.fail(j, 'ウォタガ頭割りを2つ同時に受けた');
    }

    resolveDance(n) {
      const ds = this.players.map((p, i) => ({ i, d: dist(p, this.oracle) }));
      ds.sort((a, b) => a.d - b.d);
      const tgt = n === 1 ? ds[ds.length - 1].i : ds[0].i;
      const pos = { x: this.players[tgt].x, y: this.players[tgt].y };
      if (ROLE_TYPE[tgt] !== 'tank') this.fail(tgt, `宵闇の舞踏技${n}段目（${n === 1 ? '最遠' : '最近'}）を非タンクが受けた`);
      else this.ok(`宵闇の舞踏技${n}段目: ${ROLES[tgt]} が受けた`);
      for (let j = 0; j < 8; j++) {
        if (j === tgt) continue;
        if (dist(this.players[j], pos) <= CFG.DANCE_R) this.fail(j, `宵闇の舞踏技${n}段目（${ROLES[tgt]}）の範囲に巻き込まれた`);
      }
      this.effects.push({ type: 'circle', pos, r: CFG.DANCE_R, color: 'rgba(120,60,200,0.5)', until: this.t + 0.8 });
      if (n === 1) {
        // ガイアが対象に飛びつく（中央寄りに着地）
        const d = Math.hypot(pos.x, pos.y);
        const k = d > 1.5 ? (d - 1.5) / d : 0;
        this.oracle = { x: pos.x * k, y: pos.y * k };
        this.oracleReturnAt = null;
      }
    }

    finish() {
      this.done = true;
      const failedPlayers = this.fails.map((f, i) => ({ i, f })).filter(o => o.f.length);
      const success = failedPlayers.length === 0 && this.raidFails.length === 0;
      this.result = { success, failedPlayers, raidFails: this.raidFails.slice() };
      this.log.push({ t: this.t, type: success ? 'ok' : 'fail', text: success ? '光と闇の竜詩 クリア！' : 'ミスがありました。ログを確認してください。' });
    }
  }

  const api = { Sim, CFG, ROLES, ROLE_TYPE, LINEUP, SHAPE_NAME, SPOT_NAME, compass, dist, angleOf, genScenario, computeAssignments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DragonsongSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
