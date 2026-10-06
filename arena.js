/* 絶エデン（FRU）フィールド床・ウェイマーク
 * 半径 20y。内側の円 10y 上に JP/ぬけまる式の時計マーカー（A 北・B 東・1 北東）。
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

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.fillStyle = '#141924';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.clip();

    for (let i = 0; i < 8; i++) {
      const start = (i * 45 - 90 - 22.5) * D2R;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.arc(o.x, o.y, px(R), start, start + 45 * D2R);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.14)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(10), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(48, 62, 88, 0.28)';
    ctx.fill();

    for (let deg = 0; deg < 360; deg += 45) {
      const p = toPx(compass(deg, R));
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(p.x, p.y);
      const cardinal = deg % 90 === 0;
      ctx.strokeStyle = cardinal ? 'rgba(212,185,110,0.42)' : 'rgba(170,165,145,0.16)';
      ctx.lineWidth = cardinal ? 1.7 : 1;
      ctx.stroke();
    }

    const rings = [
      [5.5, 'rgba(200,180,120,0.22)', 1],
      [10, 'rgba(232,205,130,0.78)', 2.4],
      [15.5, 'rgba(200,180,120,0.28)', 1.2],
      [16.5, 'rgba(170,195,220,0.20)', 1],
    ];
    for (const [r, col, w] of rings) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, px(r), 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
    }

    for (let deg = 0; deg < 360; deg += 22.5) {
      const a = toPx(compass(deg, 9.55));
      const b = toPx(compass(deg, 10.45));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(232,205,130,0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(2.2), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,205,130,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,205,130,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(0.7), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,205,130,0.35)';
    ctx.fill();

    ctx.restore();

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.strokeStyle = '#8b9bb4';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R) - 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212,185,110,0.5)';
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
    const key = size + ':' + dpr + ':' + R + ':' + SCALE;
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
