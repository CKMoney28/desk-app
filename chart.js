// Hand-drawn canvas charts (no library). devicePixelRatio aware.
const Charts = (() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setup(cv) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return [ctx, r.width, r.height];
  }
  const C = {green: "#00d35a", red: "#ff453a", blue: "#0a84ff", orange: "#ff9f0a", t3: "rgba(235,235,245,0.3)", t2: "rgba(235,235,245,0.6)"};
  // Home line chart: points [[ts,val]], marks [{ts,kind,label}], start value
  function line(cv, data, prev) {
    const run = (k) => {
      const [ctx, W, H] = setup(cv); ctx.clearRect(0, 0, W, H);
      const pts = data.points || [], top = 44, bot = H - 8;
      if (pts.length < 2) {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = C.t3; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.t2; ctx.font = "15px -apple-system"; ctx.textAlign = "center"; ctx.fillText("Waiting for the first trade", W / 2, H / 2 - 12); return;
      }
      const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
      let lo = Math.min(...pts.map(p => p[1]), data.start ?? Infinity), hi = Math.max(...pts.map(p => p[1]), data.start ?? -Infinity);
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const X = t => (t1 === t0 ? W : (t - t0) / (t1 - t0) * W), Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
      // new point slides in: last segment drawn to fraction k
      const n = pts.length; const lastX = X(pts[n - 1][0]), prevX = X(pts[n - 2][0]);
      const endX = prevX + (lastX - prevX) * k, endY = Y(pts[n - 2][1]) + (Y(pts[n - 1][1]) - Y(pts[n - 2][1])) * k;
      ctx.beginPath(); pts.slice(0, n - 1).forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.lineTo(endX, endY);
      const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, "rgba(0,211,90,0.28)"); g.addColorStop(1, "rgba(0,211,90,0)");
      ctx.save(); ctx.lineTo(endX, bot); ctx.lineTo(0, bot); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      ctx.beginPath(); pts.slice(0, n - 1).forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.lineTo(endX, endY);
      ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke();
      if (data.start != null) { ctx.setLineDash([3, 4]); ctx.strokeStyle = C.t3; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Y(data.start)); ctx.lineTo(W, Y(data.start)); ctx.stroke(); ctx.setLineDash([]); }
      // marks: never overlap; a later mark moves up a row
      ctx.font = "600 11px -apple-system"; const rows = [];
      (data.marks || []).forEach(m => {
        if (m.ts < t0) return;
        const w = ctx.measureText(m.label).width + 12, x = Math.min(Math.max(X(m.ts) - w / 2, 0), W - w);
        let r = 0; while ((rows[r] || []).some(([a, b]) => x < b + 4 && x + w > a - 4)) r++;
        (rows[r] = rows[r] || []).push([x, x + w]);
        const y = Math.max(2, 26 - r * 20 + (r ? 0 : 0)); const yy = top - 22 - r * 20 < 0 ? 2 + r * 0 : top - 22 - r * 20;
        ctx.globalAlpha = Math.min(1, k * 1.25);
        ctx.fillStyle = m.kind === "bought" ? C.blue : m.kind === "sold" ? C.green : C.red;
        ctx.beginPath(); ctx.roundRect(x, Math.max(0, yy), w, 18, 9); ctx.fill(); ctx.fillStyle = m.kind === "sold" ? "#000" : "#fff";
        ctx.fillText(m.label, x + 6, Math.max(0, yy) + 13); ctx.globalAlpha = 1;
      });
    };
    if (reduce || !prev || prev === JSON.stringify(data.points)) return run(1);
    const t = performance.now(); const step = now => { const k = Math.min(1, (now - t) / 250); run(k); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
  }
  // Coin candles: [{t,o,h,l,c,v}], exit line (orange dashed)
  function candles(cv, cs, exitLine) {
    const [ctx, W, H] = setup(cv); ctx.clearRect(0, 0, W, H);
    if (!cs || !cs.length) { ctx.fillStyle = C.t2; ctx.font = "15px -apple-system"; ctx.textAlign = "center"; ctx.fillText("No candles yet", W / 2, H / 2); return; }
    const vh = H * 0.2, ph = H - vh - 8;
    let lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo < 1e-12) { hi *= 1.01; lo *= 0.99; }
    const Y = v => 6 + (hi - v) / (hi - lo) * (ph - 12), bw = Math.max(2, Math.min(10, W / cs.length - 2)), vmax = Math.max(1e-9, ...cs.map(c => c.v));
    cs.forEach((c, i) => {
      const x = (i + 0.5) * W / cs.length, col = c.c >= c.o ? C.green : C.red;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
      ctx.fillRect(x - bw / 2, Math.min(Y(c.o), Y(c.c)), bw, Math.max(1, Math.abs(Y(c.o) - Y(c.c))));
      ctx.globalAlpha = 0.45; const h = c.v / vmax * vh; ctx.fillRect(x - bw / 2, H - h, bw, h); ctx.globalAlpha = 1;
    });
    if (exitLine) {
      ctx.setLineDash([6, 4]); ctx.strokeStyle = C.orange; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, Y(exitLine)); ctx.lineTo(W, Y(exitLine)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.orange; ctx.font = "600 11px -apple-system"; ctx.fillText("Risk trailing stop", 4, Y(exitLine) - 4);
    }
  }
  function ring(cv, score, min) {
    const [ctx, W, H] = setup(cv); ctx.clearRect(0, 0, W, H); const r = Math.min(W, H) / 2 - 6;
    ctx.lineWidth = 8; ctx.strokeStyle = "#2c2c2e"; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.stroke();
    if (score != null) { ctx.strokeStyle = score >= min ? C.green : C.red; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100); ctx.stroke(); }
    ctx.fillStyle = "#fff"; ctx.font = "600 26px -apple-system"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(score == null ? "–" : score, W / 2, H / 2);
  }
  return {line, candles, ring};
})();
