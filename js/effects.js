// Small visual effects. Everything here is skipped when the phone asks for reduced motion.
export const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

export function vibrate(pattern = 40) {
  try { if (!reducedMotion() && navigator.vibrate) navigator.vibrate(pattern); } catch { /* not supported */ }
}

/** Short confetti burst (about 0.9 s). Never blocks taps: the canvas ignores pointer events. */
export function confetti(host = document.body) {
  if (reducedMotion()) return;
  const cs = getComputedStyle(document.documentElement);
  const colors = ['--cheap', '--avg', '--pricey', '--primary', '--on-surface'].map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = host.clientWidth, h = host.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  host.appendChild(cv);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const N = 70, DUR = 900;
  const ox = w / 2, oy = h * 0.42;
  const ps = Array.from({ length: N }, (_, i) => {
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = 260 + Math.random() * 360;
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 5, c: colors[i % colors.length] || '#E9A100' };
  });
  const t0 = performance.now();
  let last = t0;
  (function frame(now) {
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    const k = (now - t0) / DUR;
    if (k >= 1) { cv.remove(); return; }
    g.clearRect(0, 0, w, h);
    g.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    for (const p of ps) {
      p.vy += 900 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    requestAnimationFrame(frame);
  })(t0);
}
