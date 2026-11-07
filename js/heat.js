// Price heat map: a canvas layer under the pins. Green = cheap, amber = average, red = expensive,
// relative to the station's region (same scale as the pins).
import { reducedMotion } from './effects.js';

export function createHeatLayer(getPoints) {
  const Heat = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      const c = (this._canvas = L.DomUtil.create('canvas', 'heat-canvas leaflet-zoom-hide'));
      c.setAttribute('aria-hidden', 'true');
      map.getPanes().overlayPane.appendChild(c);
      map.on('moveend zoomend resize', this._redraw, this);
      this._redraw();
      if (!reducedMotion()) { c.style.opacity = 0; requestAnimationFrame(() => { c.style.opacity = ''; }); }
    },
    onRemove(map) {
      map.off('moveend zoomend resize', this._redraw, this);
      L.DomUtil.remove(this._canvas);
    },
    redraw() { this._redraw(); },
    _redraw() {
      const map = this._map, c = this._canvas;
      if (!map) return;
      const size = map.getSize();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
      c.width = size.x * dpr; c.height = size.y * dpr;
      c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      const z = map.getZoom();
      const r = Math.max(12, Math.min(46, 5 * (z - 4)));
      const cs = getComputedStyle(document.documentElement);
      const col = ['--cheap', '--avg', '--pricey'].map((v) => cs.getPropertyValue(v).trim());
      const rgb = col.map(hexToRgb);
      const b = map.getBounds().pad(0.2);
      for (const p of getPoints()) {
        if (!b.contains([p.lat, p.lng])) continue;
        const pt = map.latLngToContainerPoint([p.lat, p.lng]);
        const [R, G, B] = mix(rgb, p.t);
        const grad = g.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
        grad.addColorStop(0, `rgba(${R},${G},${B},.55)`);
        grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
        g.fillStyle = grad;
        g.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
      }
    },
  });
  return new Heat();
}

function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  const n = m ? parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** t: 0 = cheap, 0.5 = average, 1 = expensive */
function mix(rgb, t) {
  const [a, b, c] = rgb;
  const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const from = t < 0.5 ? a : b, to = t < 0.5 ? b : c;
  return from.map((v, i) => Math.round(v + (to[i] - v) * f));
}
