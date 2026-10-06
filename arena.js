/* 絶エデン（FRU）フィールド床・ウェイマーク
 * 半径 20y。内側の円 10y 上に JP/ぬけまる式の時計マーカー（A 北・B 東・1 北東）。
 * 床は実機どおりフラワー・オブ・ライフ（半径10の円を六方に重ねる）。
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

  function drawFloor(ctx, toPx, R, SCALE) {
    const o = toPx({ x: 0, y: 0 });
    const px = r => r * SCALE;
    const ring = 10;

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.fillStyle = '#17356a';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.clip();

    const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, px(ring));
    glow.addColorStop(0, 'rgba(240, 248, 255, 0.62)');
    glow.addColorStop(0.1, 'rgba(190, 215, 255, 0.22)');
    glow.addColorStop(0.4, 'rgba(90, 140, 210, 0.07)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(ring), 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.strokeStyle = 'rgba(150, 190, 235, 0.22)';
    ctx.lineWidth = 1;
    const cell = 2;
    for (let v = -R; v <= R; v += cell) {
      const a = toPx({ x: v, y: -R });
      const b = toPx({ x: v, y: R });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const c = toPx({ x: -R, y: v });
      const d = toPx({ x: R, y: v });
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(220, 235, 255, 0.16)';
    ctx.lineWidth = 1;
    for (let deg = 0; deg < 360; deg += 15) {
      const p = toPx(compass(deg, ring));
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    function strokeCirc(deg, dist, rad, col, w) {
      const c = dist === 0 ? o : toPx(compass(deg, dist));
      ctx.beginPath();
      ctx.arc(c.x, c.y, px(rad), 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
    }

    const lace = 'rgba(210, 230, 255, 0.62)';
    const laceSoft = 'rgba(186, 214, 245, 0.32)';
    strokeCirc(0, 0, ring, lace, 1.7);
    for (let deg = 0; deg < 360; deg += 60) strokeCirc(deg, ring, ring, lace, 1.55);
    for (let deg = 30; deg < 360; deg += 60) strokeCirc(deg, ring * Math.sqrt(3), ring, laceSoft, 1.25);
    for (let deg = 0; deg < 360; deg += 60) strokeCirc(deg, ring * 2, ring, laceSoft, 1.15);

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(ring), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(230, 240, 255, 0.92)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(1.35), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245, 250, 255, 0.55)';
    ctx.fill();

    ctx.restore();

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.strokeStyle = '#8aa4d4';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R) - 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(170, 200, 230, 0.4)';
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
    const key = size + ':' + dpr + ':' + R + ':' + SCALE + ':v7';
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
