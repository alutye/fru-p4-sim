/* 絶もうひとつの未来 P4「時間結晶」シミュレーター - ギミックエンジン
 * 座標系: 原点=フィールド中央, x=東(+), y=南(+), 単位=ヤルム(y)
 * 処理法: ぬけまる式（赤ブリ東西待機 / 青は紫線基準 / リターンY字・タンク前受け）
 */
(function (global) {
  'use strict';

  const ROLES = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'];
  const ROLE_TYPE = ['tank', 'tank', 'healer', 'healer', 'dps', 'dps', 'dps', 'dps'];
  const D2R = Math.PI / 180;
  // 赤デバフ優先度（西←H1 MT ST D1 D2 D3 D4 H2→東）
  const RED_PRIO = [2, 0, 1, 4, 5, 6, 7, 3];

  const CFG = {
    R: 20,
    SPEED: 6.0,
    SPRINT: 7.8,
    AI_SPEED: 6.3,
    HG_DIST: 10,          // 砂時計の中心距離
    HG_R: 8.5,            // 砂時計の爆発半径
    HG_ANGLES: [0, 60, 120, 180, 240, 300],
    HEAD_R: 12.5,          // 竜頭の移動半径（砂時計・マーカーの円 10y のすぐ外側）
    HEAD_SPEED: 6.2,      // 竜頭の角速度 (deg/s)。90°到達≒14.5s（ブリザガと同時）
    HEAD_TOUCH: 2.2,
    RUGBY_TIP: 8.5,        // 内側の円のラグビー外側先端（ぬけまる散会）
    LONGING_R: 5.5,       // 竜頭接触時の爆発
    PUDDLE_R: 2.0,
    PUDDLE_UNTIL: 46,
    WATER_R: 6, WATER_NEED: 4,
    UNHOLY_R: 6, UNHOLY_NEED: 5,
    ERUPT_R: 6,
    BLIZ_IN: 4, BLIZ_OUT: 10,
    AERO_R: 10, AERO_KB: 25,
    TAKER_R: 5,
    TIDAL_W: 10,
    TIDAL_TELE: 1.6,
    FRAGMENT: { x: 0, y: -18 }, FRAGMENT_R: 1.5,
    T: {
      START: -5, DEBUFF: 0,
      YELLOW: 12, MOST: 14, UNTETH: 17,
      TIDAL1_ANN: 19, TIDAL1: [21.0, 22.6, 24.2, 25.8],
      PURPLE: 22.6,
      TIDAL2_ANN: 24.2, TIDAL2: [26.5, 28.1, 29.7, 31.3],
      CLAW_ICE: 17, CLAW_AERO: 40, FANG: 40,
      QUIETUS: 35, RETURN_SNAP: 36, TAKER_MARK: 37.5, TAKER: 39.5,
      RETURN: 42, KB1: 44, KB2: 46, END: 48,
    },
  };

  const SPELL_NAME = { aeroR: 'エアロガ', iceR: 'ブリザガ', iceB: 'ブリザガ', waterB: 'ウォタガ', unholyB: 'ダークホーリー', eruptB: 'ダークエラプション' };
  const SPELL_SHORT = { aeroR: '風', iceR: '氷', iceB: '氷', waterB: '水', unholyB: '聖', eruptB: '爆' };
  // ぬけまる／野良：青が attack me → 1=B, 2=2, 3=3, 4=D
  const ATTACK_MARK = { iceB: 1, unholyB: 2, waterB: 3, eruptB: 4 };
  const BLUE_PUDDLE_MARK = { iceB: 'B', unholyB: '2', waterB: '3', eruptB: 'D' };
  const PUDDLE_MARK = { iceB: 'B（東・赤氷）', unholyB: '2（南東・赤風）', waterB: '3（南西・赤風）', eruptB: 'D（西・赤氷）' };

  function compass(deg, r) { const a = deg * D2R; return { x: r * Math.sin(a), y: -r * Math.cos(a) }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function add(a, b, k) { k = k === undefined ? 1 : k; return { x: a.x + b.x * k, y: a.y + b.y * k }; }
  function unit(v) { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }
  function clampArena(p, r) {
    const l = Math.hypot(p.x, p.y);
    if (l > r) { p.x *= r / l; p.y *= r / l; }
    return p;
  }
  function shuffle(a, rand) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  const START_POS = [0, 1, 2, 3, 4, 5, 6, 7].map(k => compass(22.5 + 45 * k, 3));
  const NORTH_SAFE = { x: 0, y: -13 };
  const PUDDLE_NOMINAL = {
    iceB: { x: CFG.HEAD_R, y: 0 },
    eruptB: { x: -CFG.HEAD_R, y: 0 },
    unholyB: compass(135, CFG.HEAD_R),
    waterB: compass(225, CFG.HEAD_R),
  };
  const MARK_POS = { B: PUDDLE_NOMINAL.iceB, D: PUDDLE_NOMINAL.eruptB, '2': PUDDLE_NOMINAL.unholyB, '3': PUDDLE_NOMINAL.waterB };

  function genScenario(opts, rand) {
    const spells = shuffle(['aeroR', 'aeroR', 'iceR', 'iceR', 'iceB', 'waterB', 'unholyB', 'eruptB'], rand);
    const purpleNE = opts.purple === 'NE' ? true : opts.purple === 'NW' ? false : rand() < 0.5;
    const tidal1 = (opts.tidal1 === 'E' || opts.tidal1 === 'W') ? opts.tidal1 : (rand() < 0.5 ? 'E' : 'W');
    const tidal2 = (opts.tidal2 === 'N' || opts.tidal2 === 'S') ? opts.tidal2 : (rand() < 0.5 ? 'N' : 'S');
    const taker = Math.floor(rand() * 8);
    return { spells, purpleNE, tidal1, tidal2, taker };
  }

  function computeAssignments(sc) {
    const prio = i => RED_PRIO.indexOf(i);
    const byPrio = (a, b) => prio(a) - prio(b);
    const redIce = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => sc.spells[i] === 'iceR').sort(byPrio);
    const redAero = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => sc.spells[i] === 'aeroR').sort(byPrio);
    const pn = sc.purpleNE ? 1 : -1;   // 紫線の北側（x符号）
    const ps = -pn;                    // 紫線の南側（x符号）
    const iceSide = {}; iceSide[redIce[0]] = -1; iceSide[redIce[1]] = 1;       // 優先度高→西
    const aeroSide = {}; aeroSide[redAero[0]] = -1; aeroSide[redAero[1]] = 1;  // 優先度高→南西
    const eruptInit = { x: pn * 14.5, y: -12.8 };
    const southWall = compass(ps < 0 ? 225 : 135, 18.8);
    const A = compass(ps < 0 ? 225 : 135, 10);
    const L = compass(pn > 0 ? 45 : 315, 15.3);
    const u = unit({ x: L.x - A.x, y: L.y - A.y });
    const perp = { x: -u.y, y: u.x };
    const blues = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => ['iceB', 'waterB', 'unholyB'].includes(sc.spells[i]));
    const bluesInit = {}, kbSpot = {}, landSpot = {};
    blues.forEach((i, k) => {
      const off = (k - 1) * 0.8;
      bluesInit[i] = add(add(southWall, u, 1.3), perp, off);
      kbSpot[i] = add(add(A, u, 2.2), perp, off * 0.8);
      landSpot[i] = add(L, perp, off * 0.8);
    });
    const eruptIdx = sc.spells.indexOf('eruptB');
    const eruptSideIce = redIce.find(i => iceSide[i] === pn);
    const assignedAero = redAero.find(i => aeroSide[i] === ps);

    // リターン設置: 2つの光の波の始点に近い角。MT=1発目前列、ST=2発目前列
    const o1 = sc.tidal1 === 'E' ? { x: 1, y: 0 } : { x: -1, y: 0 };
    const n = sc.tidal2 === 'N' ? { x: 0, y: -1 } : { x: 0, y: 1 };
    const cx = sc.tidal1 === 'E' ? 1 : -1;
    const cy = sc.tidal2 === 'S' ? 1 : -1;
    const kb1Tank = 0, kb2Tank = 1;
    const ret = {};
    ret[0] = { x: cx * 17.0, y: cy * 12.6 };
    ret[1] = { x: cx * 12.6, y: cy * 17.0 };
    const offs = [[2, 14.2, 11.8], [3, 11.8, 14.2], [4, 13.5, 13.5], [5, 12.2, 12.2], [6, 11.5, 14.8], [7, 14.8, 11.5]];
    offs.forEach(([i, ox, oy]) => { ret[i] = { x: cx * ox, y: cy * oy }; });
    // テイカー散開（南北波基準）
    const base = { 0: 337.5, 1: 22.5, 2: 292.5, 3: 67.5, 4: 247.5, 5: 112.5, 6: 202.5, 7: 157.5 };
    const rot = sc.tidal2 === 'S' ? 180 : 0;
    const spread = {};
    for (const i in base) spread[i] = compass(base[i] + rot, CFG.RUGBY_TIP);

    return { redIce, redAero, pn, ps, iceSide, aeroSide, eruptInit, southWall, A, L, u, bluesInit, kbSpot, landSpot, eruptIdx, eruptSideIce, assignedAero, n, o1, kb1Tank, kb2Tank, ret, spread, cx, cy };
  }

  class Sim {
    constructor(opts) {
      this.opts = Object.assign({ purple: 'random', tidal1: 'random', tidal2: 'random', userRole: 0, spectate: false, rand: Math.random }, opts || {});
      this.reset();
    }

    reset() {
      const rand = this.opts.rand;
      const T = CFG.T;
      this.t = T.START;
      this.done = false; this.result = null;
      this.log = []; this.fails = ROLES.map(() => []); this.raidFails = [];
      this.sc = genScenario(this.opts, rand);
      this.as = computeAssignments(this.sc);
      this.pl = ROLES.map((_, i) => {
        const sp = this.sc.spells[i];
        const red = sp.endsWith('R');
        return { x: START_POS[i].x, y: START_POS[i].y, spell: sp, red, blue: !red, claw: red, fang: !red, popped: false, cleansed: false, immune: -1 };
      });
      this.user = this.opts.spectate ? -1 : this.opts.userRole;
      this.heads = [{ dir: 1, alive: true, pops: 0, x: 0, y: -CFG.HEAD_R }, { dir: -1, alive: true, pops: 0, x: 0, y: -CFG.HEAD_R }];
      this.puddles = [];
      this.hourglass = CFG.HG_ANGLES.map(deg => {
        const pos = compass(deg, CFG.HG_DIST);
        let kind = 'none', at = T.UNTETH;
        if (deg === 0 || deg === 180) { kind = 'yellow'; at = T.YELLOW; }
        else if ((this.sc.purpleNE && (deg === 60 || deg === 240)) || (!this.sc.purpleNE && (deg === 120 || deg === 300))) { kind = 'purple'; at = T.PURPLE; }
        return { deg, pos, kind, at, exploded: false };
      });
      this.snapshot = null;
      this.effects = [];
      this.ai = ROLES.map(() => ({ delay: 0.2 + rand() * 0.5 }));
      this.moveTarget = null;
      this.input = { dx: 0, dy: 0, sprint: false };
      this.kb1Taker = null;
      this.info(`シナリオ: 紫線=${this.sc.purpleNE ? '北東–南西' : '北西–南東'} / 赤: ${[...this.as.redIce.map(i => ROLES[i] + '(氷)'), ...this.as.redAero.map(i => ROLES[i] + '(風)')].join(' ')} / 青: ${[0, 1, 2, 3, 4, 5, 6, 7].filter(i => this.pl[i].blue).map(i => ROLES[i] + '(' + SPELL_SHORT[this.pl[i].spell] + ')').join(' ')}`);
    }

    info(text) { this.log.push({ t: this.t, type: 'info', text }); }
    ok(text) { this.log.push({ t: this.t, type: 'ok', text }); }
    fail(i, text) { this.fails[i].push(text); this.log.push({ t: this.t, type: 'fail', who: i, text: `${ROLES[i]}: ${text}` }); }
    raidFail(text) { this.raidFails.push(text); this.log.push({ t: this.t, type: 'fail', text }); }

    // ---- 情報 ----
    phaseKey(t) {
      const T = CFG.T;
      if (t < T.DEBUFF) return 'pre';
      if (t < T.YELLOW) return 'setup';
      if (t < T.MOST) return 'yellow';
      if (t < T.UNTETH) return 'kb';
      if (t < T.TIDAL1_ANN) return 'heads';
      if (t < T.TIDAL2[3]) return 'tidal';
      if (t < T.RETURN_SNAP) return 'return';
      if (t < T.RETURN) return 'taker';
      return 'kb2';
    }
    tidalDir(j) { const o = j === 1 ? this.sc.tidal1 : this.sc.tidal2; return { E: { x: 1, y: 0 }, W: { x: -1, y: 0 }, N: { x: 0, y: -1 }, S: { x: 0, y: 1 } }[o]; }
    tidalName(j) { const o = j === 1 ? this.sc.tidal1 : this.sc.tidal2; return { E: '東', W: '西', N: '北', S: '南' }[o]; }
    tidalBand(j, k) { const hi = CFG.R - CFG.TIDAL_W * k, lo = hi - CFG.TIDAL_W; return { d: this.tidalDir(j), lo, hi, at: (j === 1 ? CFG.T.TIDAL1 : CFG.T.TIDAL2)[k] }; }
    sideName(sx) { return sx > 0 ? '東' : '西'; }
    cornerName() { return `${this.tidalName(2)}${this.tidalName(1)}`; }
    remain(i, which) {
      const T = CFG.T, p = this.pl[i];
      if (which === 'color') return p.red ? (p.spell === 'iceR' ? T.CLAW_ICE : T.CLAW_AERO) - this.t : T.FANG - this.t;
      const m = { aeroR: T.MOST, iceR: T.MOST, iceB: T.MOST, eruptB: T.MOST, waterB: T.YELLOW, unholyB: T.UNTETH };
      return m[p.spell] - this.t;
    }

    assignedPos(i, t) { return this.desired(i, t); }
    wantsHead(i, t) {
      const p = this.pl[i];
      if (!p.red || p.popped) return false;
      if (p.spell === 'iceR') return t < CFG.T.CLAW_ICE;
      return t >= CFG.T.MOST && t < CFG.T.CLAW_AERO;
    }
    isUnsafe(pos, t, i, ignoreTidal) {
      for (const h of this.hourglass) {
        if (!h.exploded && t >= h.at - 2.2 && dist(pos, h.pos) < CFG.HG_R + 0.6) return true;
      }
      if (!ignoreTidal) {
        for (const j of [1, 2]) {
          const ann = j === 1 ? CFG.T.TIDAL1_ANN : CFG.T.TIDAL2_ANN;
          if (t < ann) continue;
          for (let k = 0; k < 4; k++) {
            const b = this.tidalBand(j, k);
            if (t >= b.at - CFG.TIDAL_TELE && t < b.at) {
              const s = pos.x * b.d.x + pos.y * b.d.y;
              if (s >= b.lo - 0.5 && s <= b.hi + 0.5) return true;
            }
          }
        }
      }
      if (!this.wantsHead(i, t)) {
        for (const h of this.heads) {
          if (h.alive && dist(pos, h) < CFG.HEAD_TOUCH + 2.2) return true;
        }
      }
      return false;
    }
    clampHazards(i, p, desired, t) {
      const ignoreTidal = this.pl[i].blue && !this.pl[i].cleansed && this.puddles.length > 0;
      let tgt = { x: desired.x, y: desired.y };
      if (!this.isUnsafe(p, t, i, ignoreTidal) && !this.isUnsafe(tgt, t, i, ignoreTidal)) return clampArena(tgt, CFG.R - 0.7);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]];
      let best = null, bestD = 1e9;
      for (const r of [2, 4, 6, 8, 10, 12, 14]) {
        for (const d of dirs) {
          const cand = clampArena({ x: p.x + d[0] * r, y: p.y + d[1] * r }, CFG.R - 0.7);
          if (this.isUnsafe(cand, t, i, ignoreTidal)) continue;
          const dd = dist(cand, desired);
          if (dd < bestD) { bestD = dd; best = cand; }
        }
      }
      return best || clampArena(tgt, CFG.R - 0.7);
    }

    puddleMarkOfRed(i) {
      const p = this.pl[i];
      if (p.spell === 'iceR') return this.as.iceSide[i] > 0 ? 'B' : 'D';
      if (p.spell === 'aeroR') return this.as.aeroSide[i] > 0 ? '2' : '3';
      return null;
    }
    puddleTarget(i) {
      const mark = BLUE_PUDDLE_MARK[this.pl[i].spell];
      const pd = this.puddles.find(x => x.mark === mark);
      if (pd) return { x: pd.x, y: pd.y };
      const wait = MARK_POS[mark];
      const r = Math.hypot(wait.x, wait.y) || 1;
      const hold = 8;
      return { x: wait.x / r * hold, y: wait.y / r * hold };
    }

    desired(i, t) {
      const T = CFG.T, p = this.pl[i], as = this.as;
      if (t < T.DEBUFF) return START_POS[i];
      if (t >= T.RETURN) return as.ret[i];
      if (t >= T.RETURN_SNAP && !(p.blue && !p.cleansed && this.puddles.length && t < 39)) return as.spread[i];
      if (t >= 32 && !(p.blue && !p.cleansed && this.puddles.length)) return as.ret[i];
      const late = t >= T.TIDAL2[0] - 0.15
        ? as.ret[i]
        : (t >= T.TIDAL1[3] - 0.2 ? { x: as.cx * 13, y: as.cy * 8 } : (t >= T.TIDAL1_ANN ? { x: as.cx * 3, y: as.cy * 3 } : NORTH_SAFE));
      if (p.spell === 'iceR') {
        const side = as.iceSide[i];
        const dash = side !== as.pn; // エラプがいない側 → 爆走
        const wall = { x: side * 19, y: 0 };
        const head = this.heads.find(h => h.alive && Math.sign(h.dir || 1) === Math.sign(side));
        if (!p.popped && t < T.CLAW_ICE) {
          const wait = { x: side * CFG.RUGBY_TIP, y: 0 };
          if (dash && t >= T.MOST - 2) {
            if (head) return { x: head.x, y: head.y };
            return compass(side > 0 ? 55 : 305, CFG.HEAD_R);
          }
          if (!dash && head && dist(wait, head) <= CFG.HEAD_TOUCH + 2.5) return { x: head.x, y: head.y };
          return wait;
        }
        if (dash) {
          if (t < T.TIDAL1_ANN) return NORTH_SAFE;
          return late;
        }
        if (t < T.MOST + 0.2) return wall;
        if (side === as.pn) return t < T.UNTETH + 0.4 ? add(as.L, as.u, 0.8) : late;
        return t < T.TIDAL1_ANN ? NORTH_SAFE : late;
      }
      if (p.spell === 'aeroR') {
        const side = as.aeroSide[i];
        const markAng = side < 0 ? 225 : 135;
        const wallOut = compass(markAng, 18.8);
        const wait = compass(markAng, CFG.HEAD_R);
        if (t < T.YELLOW + 0.2) return wallOut;
        if (t < T.MOST + 0.3) return side === as.ps ? as.A : wallOut;
        if (!p.popped && t < T.CLAW_AERO) {
          const head = this.heads.find(h => h.alive && Math.sign(h.dir || 1) === Math.sign(side));
          if (head && dist(wait, head) <= CFG.HEAD_TOUCH + 1) return { x: head.x, y: head.y };
          return wait;
        }
        return late;
      }
      if (p.spell === 'eruptB') {
        if (t < T.MOST + 0.3) return as.eruptInit;
        if (t < T.UNTETH + 0.3) return add(as.L, as.u, -0.8);
        if (!p.cleansed) return this.puddleTarget(i);
        return late;
      }
      // 青（氷・水・聖）
      if (t < T.YELLOW + 0.2) return as.bluesInit[i];
      if (t < T.MOST) return as.kbSpot[i];
      if (t < T.UNTETH + 0.3) return as.landSpot[i];
      if (!p.cleansed) return this.puddleTarget(i);
      return late;
    }
    aiSprint(i, t) {
      const T = CFG.T, p = this.pl[i];
      if (p.spell === 'iceR' && this.as.iceSide[i] !== this.as.pn && t >= CFG.T.MOST - 2 && t < CFG.T.TIDAL1_ANN) return true;
      if (p.blue && t >= T.UNTETH && !p.cleansed) return true;
      if (t >= T.TIDAL1_ANN) return true;
      return false;
    }

    // ---- ヒント ----
    hintText(i) {
      const T = CFG.T, t = this.t, p = this.pl[i], as = this.as;
      const sp = SPELL_NAME[p.spell];
      if (t < T.DEBUFF) return '詠唱中。着弾後に自分の色（赤/青）と魔法を確認';
      if (t >= T.RETURN) {
        if (i === as.kb1Tank && t < T.KB1) return `リターンで戻った後、${this.tidalName(1)}からの1発目を先頭で受ける（軽減）`;
        if (i === as.kb2Tank && t < T.KB2) return `${this.tidalName(2)}からの2発目を先頭で受ける（軽減）`;
        return 'リターンで戻される。アムレン＋軽減で2回のノックバックを受ける';
      }
      if (t >= T.RETURN_SNAP) return `リターン設置完了 → テイカー散会（ラグビー先端 / ${this.tidalName(2)}基準 / 未来の欠片に当てない）`;
      if (t >= T.TIDAL2[3] || (p.cleansed && t >= T.TIDAL2_ANN) || (!p.blue && t >= T.TIDAL2_ANN && p.popped)) {
        const spot = i === 0 ? '角の1発目側（前列）' : i === 1 ? '角の2発目側（前列）' : '角の内側';
        return `残りの光の波を避けて、${this.tidalName(2)}を「北」としたY字でリターン設置 → ${spot}`;
      }
      if (p.spell === 'iceR') {
        const side = as.iceSide[i];
        const dash = side !== as.pn;
        const mark = side > 0 ? 'B' : 'D';
        if (!p.popped) {
          if (dash) {
            if (t < T.MOST - 2) return `赤・${sp} → 爆走確定（エラプは${this.sideName(as.pn)}側）。${this.sideName(side)}（${mark}）のラグビー先端で待機。ブリザガ2秒前にスプリント`;
            return `爆走！北へ走って竜頭に当たり、未来の欠片へ（ブリザガ残${Math.max(0, this.remain(i, 'spell')).toFixed(0)}s）`;
          }
          return `赤・${sp} → 爆走しない（エラプが前にいる）。${this.sideName(side)}（${mark}）のラグビー先端で待機。竜頭が当たりに来る`;
        }
        if (dash) return t < T.TIDAL1_ANN ? `竜頭に当たった → 未来の欠片／北安置へ（ブリザガで味方を巻き込まない）` : `光の波（${t >= T.TIDAL1_ANN ? this.tidalName(1) + 'から' : '東西'}）を避ける`;
        if (t < T.MOST) return `ブリザガ着弾まで動かない（ドーナツ範囲に味方を巻き込まない）`;
        if (side === as.pn) return t < T.UNTETH ? `エラプ側 → ${this.sideName(as.pn)}北の頭割り（ダークホーリー）へ合流` : `光の波（${t >= T.TIDAL1_ANN ? this.tidalName(1) + 'から' : '東西どちらか'}）を避けつつ北/中央へ`;
        return t < T.TIDAL1_ANN ? `北安置へ` : `光の波（${this.tidalName(1)}から）を避ける`;
      }
      if (p.spell === 'aeroR') {
        const side = as.aeroSide[i];
        const sideN = side < 0 ? '南西' : '南東';
        if (t < T.YELLOW) return `赤・${sp} → ${sideN}の外周（砂時計の円の外）で待機${side === as.ps ? '。青3人が自分の前に集まる' : '（1人）'}`;
        if (t < T.MOST) return side === as.ps ? `黄砂時計の爆発後、内側の円のラグビー先端へ。青3人を北の反対側（エラプ）へ飛ばす（${this.remain(i, 'spell').toFixed(0)}s）` : `その場で待機（エアロガ着弾まで動かない）`;
        if (!p.popped) return `${sideN}の外周で竜頭を待って当たる（${this.remain(i, 'color').toFixed(0)}s）。周りに人がいないこと`;
        return `光の波（${t >= T.TIDAL1_ANN ? this.tidalName(1) + 'から' : '東西'}）を避けつつ、${t >= T.TIDAL2_ANN ? 'リターン設置へ' : '安地へ'}`;
      }
      if (p.spell === 'eruptB') {
        if (t < T.MOST) return `青・${sp}（攻撃${ATTACK_MARK.eruptB}） → 紫線の北側（${this.sideName(as.pn)}）の外周、円の外で待機（${this.remain(i, 'spell').toFixed(0)}s）`;
        if (t < T.UNTETH) return `エラプ着弾後、少し内側へ → 飛んでくる青3人＋赤氷とダークホーリー頭割り（5人）`;
        if (!p.cleansed) return `攻撃${ATTACK_MARK[p.spell]}の白円（${BLUE_PUDDLE_MARK[p.spell]}＝赤が残した場所）を踏みに行く。光の波と紫砂時計に注意（${this.remain(i, 'color').toFixed(0)}s）`;
        return `解除完了 → 光の波を避けて ${this.cornerName()} 側へ`;
      }
      // 青（氷・水・聖）
      if (t < T.YELLOW) return `青・${sp}（攻撃${ATTACK_MARK[p.spell]}） → 紫線の南側（${this.sideName(as.ps)}）の外周で赤エアロガと一緒に待機（ウォタガ頭割り）`;
      if (t < T.MOST) return `黄砂時計の爆発後、エアロガ担当の前（北の反対側に向かって一直線）に立つ → 吹き飛ばされる`;
      if (t < T.UNTETH) return `飛んだ先でエラプ＋赤氷と頭割り（ダークホーリー）`;
      if (!p.cleansed) return `攻撃${ATTACK_MARK[p.spell]}の白円（${BLUE_PUDDLE_MARK[p.spell]}＝赤が残した場所）を踏みに行く。光の波と紫砂時計に注意（${this.remain(i, 'color').toFixed(0)}s）`;
      return `解除完了 → 光の波を避けて ${this.cornerName()} 側へ`;
    }

    // ---- 更新 ----
    update(dt) {
      if (this.done || dt <= 0) return;
      const T = CFG.T;
      const t0 = this.t, t1 = this.t + dt;

      // 竜頭の移動
      for (const h of this.heads) {
        if (!h.alive) continue;
        const ang = CFG.HEAD_SPEED * Math.max(0, t0);
        if (ang >= 180) { h.alive = false; continue; }
        const p = compass(h.dir * ang, CFG.HEAD_R); h.x = p.x; h.y = p.y;
      }

      // AI 移動
      for (let i = 0; i < 8; i++) {
        if (i === this.user) continue;
        if (t0 < T.DEBUFF + this.ai[i].delay) continue;
        if (t0 >= T.RETURN) continue;
        const p = this.pl[i];
        const tgt = this.clampHazards(i, p, this.desired(i, t0), t0);
        const sp = (this.aiSprint(i, t0) ? CFG.SPRINT : CFG.AI_SPEED) * dt;
        const d = dist(p, tgt);
        if (d > 0.01) { const k = Math.min(1, sp / d); p.x += (tgt.x - p.x) * k; p.y += (tgt.y - p.y) * k; }
      }
      // ユーザー移動
      if (this.user >= 0 && t0 < T.RETURN) {
        const p = this.pl[this.user];
        const sp = (this.input.sprint ? CFG.SPRINT : CFG.SPEED) * dt;
        const { dx, dy } = this.input;
        if (dx !== 0 || dy !== 0) { const l = Math.hypot(dx, dy); p.x += dx / l * sp; p.y += dy / l * sp; this.moveTarget = null; }
        else if (this.moveTarget) {
          const d = dist(p, this.moveTarget);
          if (d <= sp) { p.x = this.moveTarget.x; p.y = this.moveTarget.y; this.moveTarget = null; }
          else { p.x += (this.moveTarget.x - p.x) / d * sp; p.y += (this.moveTarget.y - p.y) / d * sp; }
        }
      }
      for (const p of this.pl) clampArena(p, CFG.R - 0.3);

      this.t = t1;
      const cross = tt => t0 < tt && t1 >= tt;

      // 竜頭との接触 / 白円の取得
      if (t1 > 1) {
        for (const h of this.heads) {
          if (!h.alive) continue;
          for (let i = 0; i < 8; i++) {
            const p = this.pl[i];
            if (p.immune > t1 || dist(p, h) > CFG.HEAD_TOUCH) continue;
            p.immune = t1 + 2;
            if (p.red && p.claw) this.popHead(h, i);
            else this.fail(i, '赤デバフなしで竜頭に接触した');
          }
        }
        if (t1 >= T.UNTETH - 0.2) {
          for (const pd of this.puddles.slice()) {
            for (let i = 0; i < 8; i++) {
              const p = this.pl[i];
              if (!p.blue || !p.fang || dist(p, pd) > CFG.PUDDLE_R) continue;
              this.puddles.splice(this.puddles.indexOf(pd), 1);
              p.fang = false; p.cleansed = true;
              this.ok(`${ROLES[i]} が白円を取得（聖竜の牙 解除）`);
              break;
            }
          }
        }
      }
      this.puddles = this.puddles.filter(pd => t1 < CFG.PUDDLE_UNTIL);

      if (cross(T.DEBUFF)) this.info('デバフ付与。砂時計6個（黄: 南北 / 紫: 対角）出現、北に光の竜頭×2');
      for (const h of this.hourglass) if (!h.exploded && cross(h.at)) this.explodeHourglass(h);
      if (cross(T.YELLOW)) this.resolveStack('waterB', CFG.WATER_R, CFG.WATER_NEED, 'ウォタガ');
      if (cross(T.MOST)) this.resolveMost();
      if (cross(T.UNTETH)) {
        this.resolveStack('unholyB', CFG.UNHOLY_R, CFG.UNHOLY_NEED, 'ダークホーリー');
        for (const i of this.as.redIce) if (this.pl[i].claw) { this.fail(i, '聖竜の爪（ブリザガ）が時間切れ：竜頭に当たれなかった'); this.pl[i].claw = false; }
      }
      if (cross(T.TIDAL1_ANN)) this.info(`リーンが${this.tidalName(1)}に出現 → 光の波が${this.tidalName(1)}から4回`);
      if (cross(T.TIDAL2_ANN)) this.info(`リーンが${this.tidalName(2)}に出現 → 光の波が${this.tidalName(2)}から4回。安地の角は ${this.cornerName()}`);
      for (const j of [1, 2]) for (let k = 0; k < 4; k++) { const b = this.tidalBand(j, k); if (cross(b.at)) this.resolveTidal(j, k, b); }
      if (cross(T.QUIETUS)) this.info('クワイタス（全体攻撃）');
      if (cross(T.RETURN_SNAP)) {
        this.snapshot = this.pl.map(p => ({ x: p.x, y: p.y }));
        this.info('リターン位置を記録 → テイカー散開');
        this.checkReturnPlacement();
      }
      if (cross(T.TAKER_MARK)) this.info(`スピリットテイカー対象: ${ROLES[this.sc.taker]}`);
      if (cross(T.TAKER)) this.resolveTaker();
      if (cross(T.FANG)) {
        for (let i = 0; i < 8; i++) {
          const p = this.pl[i];
          if (p.blue && p.fang) { this.fail(i, '聖竜の牙が時間切れ：白円を取れなかった'); p.fang = false; }
          if (p.spell === 'aeroR' && p.claw) { this.fail(i, '聖竜の爪（エアロガ）が時間切れ：竜頭に当たれなかった'); p.claw = false; }
        }
      }
      if (cross(T.RETURN)) {
        if (this.snapshot) this.pl.forEach((p, i) => { p.x = this.snapshot[i].x; p.y = this.snapshot[i].y; });
        this.info('リターン発動：記録位置へ転移');
      }
      if (cross(T.KB1)) this.resolveKnockback(1);
      if (cross(T.KB2)) this.resolveKnockback(2);
      if (cross(T.END)) this.finish();
      this.effects = this.effects.filter(ef => ef.until > this.t);
    }

    popHead(h, i) {
      const p = this.pl[i];
      p.claw = false; p.popped = true; h.pops++;
      const pos = { x: p.x, y: p.y };
      const mark = this.puddleMarkOfRed(i);
      this.puddles.push({ x: pos.x, y: pos.y, mark, from: i });
      this.ok(`${ROLES[i]} が竜頭に接触（聖竜の爪 解除）→ 白円を${mark}に設置`);
      for (let j = 0; j < 8; j++) {
        if (j === i) continue;
        if (dist(this.pl[j], pos) <= CFG.LONGING_R) this.fail(j, `竜頭の爆発（${ROLES[i]} の接触）に巻き込まれた`);
      }
      this.effects.push({ type: 'circle', pos, r: CFG.LONGING_R, color: 'rgba(255,240,200,0.5)', until: this.t + 0.7 });
      if (h.pops >= 2) h.alive = false;
    }

    explodeHourglass(h) {
      h.exploded = true;
      const name = { yellow: '黄', purple: '紫', none: '線なし' }[h.kind];
      const hit = [];
      for (let j = 0; j < 8; j++) if (dist(this.pl[j], h.pos) <= CFG.HG_R) { this.fail(j, `${name}砂時計（${this.dirName(h.deg)}）の爆発に被弾`); hit.push(j); }
      this.effects.push({ type: 'circle', pos: h.pos, r: CFG.HG_R, color: hit.length ? 'rgba(255,80,80,0.55)' : 'rgba(180,200,255,0.4)', until: this.t + 0.8 });
    }
    dirName(deg) { return { 0: '北', 60: '北東', 120: '南東', 180: '南', 240: '南西', 300: '北西' }[deg]; }

    resolveStack(spell, r, need, name) {
      const i = this.sc.spells.indexOf(spell);
      const c = this.pl[i];
      const members = [0, 1, 2, 3, 4, 5, 6, 7].filter(j => dist(this.pl[j], c) <= r);
      if (members.length < need) this.raidFail(`${name}頭割り（${ROLES[i]}）: ${members.length}人（${need}人必要）`);
      else this.ok(`${name}頭割り（${ROLES[i]}）: ${members.map(j => ROLES[j]).join(', ')}`);
      if (dist(c, CFG.FRAGMENT) <= r + CFG.FRAGMENT_R) this.raidFail(`${name}頭割りが未来の欠片に当たった`);
      this.effects.push({ type: 'circle', pos: { x: c.x, y: c.y }, r, color: members.length >= need ? 'rgba(80,120,255,0.45)' : 'rgba(255,80,80,0.5)', until: this.t + 0.8 });
    }

    resolveMost() {
      // ブリザガ（ドーナツ）×3
      for (let i = 0; i < 8; i++) {
        const p = this.pl[i];
        if (p.spell !== 'iceR' && p.spell !== 'iceB') continue;
        for (let j = 0; j < 8; j++) {
          if (j === i) continue;
          const d = dist(this.pl[j], p);
          if (d >= CFG.BLIZ_IN && d <= CFG.BLIZ_OUT) this.fail(j, `ブリザガ（${ROLES[i]}）のドーナツ範囲に被弾`);
        }
        this.effects.push({ type: 'donut', pos: { x: p.x, y: p.y }, r1: CFG.BLIZ_IN, r2: CFG.BLIZ_OUT, color: 'rgba(120,200,255,0.35)', until: this.t + 0.8 });
      }
      // エラプション
      const e = this.pl[this.as.eruptIdx];
      for (let j = 0; j < 8; j++) if (j !== this.as.eruptIdx && dist(this.pl[j], e) <= CFG.ERUPT_R) this.fail(j, `ダークエラプション（${ROLES[this.as.eruptIdx]}）に被弾`);
      if (dist(e, CFG.FRAGMENT) <= CFG.ERUPT_R + CFG.FRAGMENT_R) this.raidFail('ダークエラプションが未来の欠片に当たった');
      this.effects.push({ type: 'circle', pos: { x: e.x, y: e.y }, r: CFG.ERUPT_R, color: 'rgba(170,90,255,0.45)', until: this.t + 0.8 });
      // エアロガ（ノックバック）
      const kb = [];
      for (const a of this.as.redAero) {
        const ap = this.pl[a];
        for (let j = 0; j < 8; j++) {
          if (j === a) continue;
          const d = dist(this.pl[j], ap);
          if (d <= CFG.AERO_R) kb.push({ j, from: { x: ap.x, y: ap.y } });
        }
        this.effects.push({ type: 'circle', pos: { x: ap.x, y: ap.y }, r: CFG.AERO_R, color: 'rgba(120,255,160,0.35)', until: this.t + 0.8 });
      }
      for (const { j, from } of kb) {
        const p = this.pl[j];
        const dir = unit({ x: p.x - from.x, y: p.y - from.y });
        const before = { x: p.x, y: p.y };
        p.x += dir.x * CFG.AERO_KB; p.y += dir.y * CFG.AERO_KB;
        clampArena(p, CFG.R - 0.5);
        this.effects.push({ type: 'line', a: before, b: { x: p.x, y: p.y }, color: 'rgba(120,255,160,0.6)', until: this.t + 1.0 });
      }
      this.info(`ブリザガ×3・エラプション・エアロガ着弾（ノックバック: ${kb.map(k => ROLES[k.j]).join(', ') || 'なし'}）`);
    }

    resolveTidal(j, k, b) {
      const hit = [];
      for (let i = 0; i < 8; i++) { const s = this.pl[i].x * b.d.x + this.pl[i].y * b.d.y; if (s >= b.lo && s <= b.hi) { this.fail(i, `光の波（${this.tidalName(j)}から ${k + 1}発目）に被弾`); hit.push(i); } }
      this.effects.push({ type: 'band', d: b.d, lo: b.lo, hi: b.hi, color: hit.length ? 'rgba(255,80,80,0.5)' : 'rgba(255,240,180,0.5)', until: this.t + 0.6 });
    }

    checkReturnPlacement() {
      const o1 = this.as.o1, o2 = this.as.n;
      const by = d => [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => (this.pl[b].x * d.x + this.pl[b].y * d.y) - (this.pl[a].x * d.x + this.pl[a].y * d.y));
      const c1 = by(o1)[0], c2 = by(o2)[0];
      this.info(`リターン位置: ${this.tidalName(1)}側先頭=${ROLES[c1]} / ${this.tidalName(2)}側先頭=${ROLES[c2]}`);
    }

    resolveTaker() {
      const tgt = this.sc.taker;
      const pos = { x: this.pl[tgt].x, y: this.pl[tgt].y };
      let hit = 0;
      for (let j = 0; j < 8; j++) if (j !== tgt && dist(this.pl[j], pos) <= CFG.TAKER_R) { this.fail(j, `スピリットテイカー（${ROLES[tgt]}）に巻き込まれた`); hit++; }
      if (dist(pos, CFG.FRAGMENT) <= CFG.TAKER_R + CFG.FRAGMENT_R) this.raidFail(`スピリットテイカー（${ROLES[tgt]}）が未来の欠片に当たった`);
      if (!hit) this.ok(`スピリットテイカー（${ROLES[tgt]}）: 散開成功`);
      this.effects.push({ type: 'circle', pos, r: CFG.TAKER_R, color: 'rgba(170,90,255,0.45)', until: this.t + 0.8 });
    }

    resolveKnockback(n) {
      const d = n === 1 ? this.as.o1 : this.as.n;
      const order = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => (this.pl[b].x * d.x + this.pl[b].y * d.y) - (this.pl[a].x * d.x + this.pl[a].y * d.y));
      const first = order[0];
      if (ROLE_TYPE[first] !== 'tank') this.fail(first, `ノックバック${n}発目（${this.tidalName(n)}から）を非タンクが先頭で受けた`);
      else if (n === 2 && first === this.kb1Taker) this.fail(first, '同じタンクが1発目と2発目の両方を先頭で受けた');
      else this.ok(`ノックバック${n}発目（${this.tidalName(n)}から）: ${ROLES[first]} が先頭で受けた`);
      if (n === 1) this.kb1Taker = first;
      for (const p of this.pl) { p.x -= d.x * 6; p.y -= d.y * 6; clampArena(p, CFG.R - 0.5); }
      this.effects.push({ type: 'band', d, lo: -CFG.R, hi: CFG.R, color: 'rgba(255,240,180,0.35)', until: this.t + 0.6 });
    }

    finish() {
      this.done = true;
      const failedPlayers = this.fails.map((f, i) => ({ i, f })).filter(o => o.f.length);
      const success = failedPlayers.length === 0 && this.raidFails.length === 0;
      this.result = { success, failedPlayers, raidFails: this.raidFails.slice() };
      this.log.push({ t: this.t, type: success ? 'ok' : 'fail', text: success ? '時間結晶 クリア！' : 'ミスがありました。ログを確認してください。' });
    }
  }

  const api = { Sim, CFG, ROLES, ROLE_TYPE, SPELL_NAME, SPELL_SHORT, ATTACK_MARK, BLUE_PUDDLE_MARK, PUDDLE_MARK, PUDDLE_NOMINAL, MARK_POS, START_POS, NORTH_SAFE, compass, dist, genScenario, computeAssignments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CrystallizeSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
