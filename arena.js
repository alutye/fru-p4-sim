/* 絶エデン（FRU）フィールド床・ウェイマーク
 * 半径 20y。内側の円 10y 上に JP/ぬけまる式の時計マーカー（A 北・B 東・1 北東）。
 * 床は実機の砂時計円6つ・南北ラグビーボール・ダイヤ列に合わせる。
 */
(function (global) {
  'use strict';
  const D2R = Math.PI / 180;
  function compass(deg, r) { const a = deg * D2R; return { x: r * Math.sin(a), y: -r * Math.cos(a) }; }

  const WAYMARK_R = 10;
  const MARKS = [
    ['A', 0, '#e11d48', 'circle'], ['B', 90, '#eab308', 'circle'],
    ['C', 180, '#3b82f6', 'circle'], ['D', 270, '#a855f7', 'circle'],
    ['1', 45, '#e11d48', 'square'], ['2', 135, '#eab308', 'square'],
    ['3', 225, '#3b82f6', 'square'], ['4', 315, '#a855f7', 'square'],
  ];
  const HG_FLOOR = [0, 60, 120, 180, 240, 300];

  function diamond(ctx, x, y, s, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-s, -s, s * 2, s * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.1; ctx.stroke(); }
    ctx.restore();
  }

  function star(ctx, x, y, r, fill) {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 8;
      const rad = i % 2 === 0 ? r : r * 0.38;
      const px = x + rad * Math.cos(a), py = y + rad * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawFloor(ctx, toPx, R, SCALE) {
    const o = toPx({ x: 0, y: 0 });
    const px = r => r * SCALE;

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.fillStyle = '#101820';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.clip();

    // 砂時計の円（実機の床に描いてあるメイルストローム範囲。中心 r=10、半径 8.5）
    for (const deg of HG_FLOOR) {
      const c = toPx(compass(deg, 10));
      ctx.beginPath();
      ctx.arc(c.x, c.y, px(8.5), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(72, 118, 148, 0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(168, 214, 230, 0.38)';
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, px(8.5) - 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(168, 214, 230, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(10), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(24, 40, 56, 0.62)';
    ctx.fill();

    // 南北ラグビーボール
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, px(10.3), px(18.7), 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(210, 228, 236, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, px(9.35), px(17.3), 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 205, 220, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 東西の薄い楕円（交差して花弁に見える）
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, px(18.7), px(10.3), 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(170, 200, 215, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const rings = [
      [3.4, 'rgba(170, 195, 210, 0.22)', 1],
      [5.6, 'rgba(200, 185, 130, 0.28)', 1.1],
      [10, 'rgba(232, 205, 130, 0.88)', 2.6],
      [14.6, 'rgba(160, 195, 215, 0.28)', 1.2],
      [18.3, 'rgba(175, 205, 220, 0.34)', 1.5],
    ];
    for (const [r, col, w] of rings) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, px(r), 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
    }

    for (let deg = 0; deg < 360; deg += 15) {
      const inner = deg % 90 === 0 ? 9.35 : 9.55;
      const outer = deg % 90 === 0 ? 10.65 : 10.42;
      const a = toPx(compass(deg, inner));
      const b = toPx(compass(deg, outer));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = deg % 90 === 0 ? 'rgba(232,205,130,0.7)' : 'rgba(200, 220, 230, 0.32)';
      ctx.lineWidth = deg % 90 === 0 ? 1.7 : 1;
      ctx.stroke();
    }

    // ラグビー／風待ちで使う中央線（南北・南東・南西）
    for (const deg of [0, 135, 180, 225]) {
      const a = toPx(compass(deg, 4));
      const b = toPx(compass(deg, R));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(200, 220, 230, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ダイヤ列（大→小。赤風が「大きいダイヤから南へ2つ」と数える目印）
    const pipR = [11.4, 13.35, 15.25, 17.15];
    const pipS = [4.4, 3.3, 2.6, 2.15];
    for (let d = 0; d < 360; d += 45) {
      for (let i = 0; i < pipR.length; i++) {
        const p = toPx(compass(d, pipR[i]));
        const aero = d === 135 || d === 225;
        diamond(ctx, p.x, p.y, pipS[i],
          aero ? 'rgba(200, 230, 240, 0.34)' : 'rgba(175, 205, 220, 0.18)',
          aero ? 'rgba(220, 240, 250, 0.55)' : 'rgba(180, 210, 225, 0.28)');
      }
    }

    star(ctx, o.x, o.y, px(1.55), 'rgba(232, 205, 130, 0.55)');
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(2.15), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,205,130,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(0.55), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,205,130,0.7)';
    ctx.fill();

    ctx.restore();

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.strokeStyle = '#8b9bb4';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R) - 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 210, 225, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawWaymarks(ctx, toPx) {
    const s = 13;
    for (const [name, deg, color, shape] of MARKS) {
      const c = toPx(compass(deg, WAYMARK_R));
      ctx.save();
      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(c.x, c.y, s, 0, Math.PI * 2);
      } else {
        roundRect(ctx, c.x - s, c.y - s, s * 2, s * 2, 3);
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, c.x, c.y + 0.5);
      ctx.restore();
    }
  }

  let floorCache = null, floorKey = '';
  function blitFloor(ctx, size, dpr, R, SCALE) {
    const key = size + ':' + dpr + ':' + R + ':' + SCALE + ':v4';
    if (!floorCache || floorKey !== key) {
      const c = document.createElement('canvas');
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
      const cctx = c.getContext('2d');
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const toPx = p => ({ x: size / 2 + p.x * SCALE, y: size / 2 + p.y * SCALE });
      drawFloor(cctx, toPx, R, SCALE);
      floorCache = c;
      floorKey = key;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(floorCache, 0, 0);
    ctx.restore();
  }

  global.EdenArena = { WAYMARK_R, MARKS, compass, drawFloor, drawWaymarks, blitFloor };
})(typeof window !== 'undefined' ? window : globalThis);
