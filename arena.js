/* 絶エデン（FRU）フィールド床・ウェイマーク
 * 半径 20y。内側の円 10y 上に JP/ぬけまる式の時計マーカー（A 北・B 東・1 北東）。
 * 床は実機テクスチャ（半径20の円を六方のリムに置き、東西＋斜めに6弁のラグビー）。
 */
(function (global) {
  'use strict';
  const D2R = Math.PI / 180;
  function compass(deg, r) { const a = deg * D2R; return { x: r * Math.sin(a), y: -r * Math.cos(a) }; }

  const WAYMARK_R = 10;
  // 散会用。床の弁は 30° 刻みだが、ぬけまるの先端指定は東西＋四隅マーカー側
  const RUGBY_DEGS = [90, 270, 45, 135, 225, 315];
  const RUGBY_R = 6.2;
  const RUGBY_TIP = RUGBY_R;
  const MARKS = [
    ['A', 0, '#e11d48', 'circle'], ['B', 90, '#eab308', 'circle'],
    ['C', 180, '#3b82f6', 'circle'], ['D', 270, '#a855f7', 'circle'],
    ['1', 45, '#e11d48', 'square'], ['2', 135, '#eab308', 'square'],
    ['3', 225, '#3b82f6', 'square'], ['4', 315, '#a855f7', 'square'],
  ];

  let floorImg = null, floorImgState = 'loading';
  (function loadFloor() {
    const img = new Image();
    img.onload = function () {
      floorImg = img;
      floorImgState = 'ok';
      floorCache = null;
      floorKey = '';
    };
    img.onerror = function () { floorImgState = 'err'; };
    try { img.src = new URL('floor.png', document.currentScript.src).href; }
    catch (e) { img.src = 'floor.png'; }
  })();

  function drawFloorFallback(ctx, toPx, R, SCALE) {
    const o = toPx({ x: 0, y: 0 });
    const px = r => r * SCALE;

    ctx.fillStyle = '#14182a';
    ctx.fillRect(o.x - px(R) - 8, o.y - px(R) - 8, px(R) * 2 + 16, px(R) * 2 + 16);

    const cornerGlow = ctx.createRadialGradient(o.x, o.y, px(R) * 0.92, o.x, o.y, px(R) * 1.45);
    cornerGlow.addColorStop(0, 'rgba(40, 160, 230, 0)');
    cornerGlow.addColorStop(0.55, 'rgba(50, 190, 245, 0.28)');
    cornerGlow.addColorStop(1, 'rgba(30, 80, 160, 0.15)');
    ctx.fillStyle = cornerGlow;
    ctx.fillRect(o.x - px(R) - 8, o.y - px(R) - 8, px(R) * 2 + 16, px(R) * 2 + 16);

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.fillStyle = '#1a2460';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = 'rgba(80, 110, 190, 0.28)';
    ctx.lineWidth = 1;
    const cell = 2;
    for (let v = -R; v <= R; v += cell) {
      const a = toPx({ x: v, y: -R });
      const b = toPx({ x: v, y: R });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = toPx({ x: -R, y: v });
      const d = toPx({ x: R, y: v });
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }

    const rings = [2.2, 4.4, 6.6, 8.8, 11.2, 13.6, 16.2];
    ctx.strokeStyle = 'rgba(90, 120, 210, 0.28)';
    ctx.lineWidth = 1.1;
    for (const rad of rings) {
      ctx.beginPath(); ctx.arc(o.x, o.y, px(rad), 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const p = toPx(compass(i * 30, 3.1));
      ctx.beginPath();
      ctx.arc(p.x, p.y, px(0.72), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(140, 160, 230, 0.4)';
      ctx.stroke();
    }

    // 実機の6弁: 半径20の円を北から60°おきのリムに置く。先端は東西と斜め（南北にはない）
    for (let deg = 0; deg < 360; deg += 60) {
      const c = toPx(compass(deg, R));
      ctx.beginPath();
      ctx.arc(c.x, c.y, px(R), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(170, 150, 255, 0.55)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, px(R) - 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(210, 190, 255, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(1.1), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(170, 190, 255, 0.35)';
    ctx.fill();

    ctx.restore();

    ctx.beginPath();
    ctx.arc(o.x, o.y, px(R), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20, 24, 40, 0.9)';
    ctx.lineWidth = 3;
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
    const key = size + ':' + dpr + ':' + R + ':' + SCALE + ':v11:' + floorImgState;
    if (!floorCache || floorKey !== key) {
      const c = document.createElement('canvas');
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
      const cctx = c.getContext('2d');
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const toPx = p => ({ x: size / 2 + p.x * SCALE, y: size / 2 + p.y * SCALE });
      if (floorImg) cctx.drawImage(floorImg, 0, 0, size, size);
      else drawFloorFallback(cctx, toPx, R, SCALE);
      floorCache = c;
      floorKey = key;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(floorCache, 0, 0);
    ctx.restore();
  }

  global.EdenArena = {
    WAYMARK_R, RUGBY_DEGS, RUGBY_R, RUGBY_TIP, MARKS,
    compass, drawFloor: drawFloorFallback, drawWaymarks, blitFloor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
