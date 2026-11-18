// Shared Wind system (Archery, Bowling). Each throw gets a new wind.
// It's mostly left/right with a bit of head/tail wind, and it pushes thrown
// objects through their air drag (light foam drifts more than a heavy eraser).
//
// cfg: { mph: [min, max], headTailMix, strength, particlesPerMph, visualSpeed }

import { add, sub, mul, norm, clamp } from './vec3.js';
import { HUD_FONT } from './hud.js';
import { roundRectPath } from './whiteboard.js';

const MPH_TO_MS = 0.44704;
const BOX = { x: [-7.5, 7.5], y: [-1.6, 2.4], z: [1.2, 10.5] };

export function createWind(rng, cfg, enabled) {
  const wind = { enabled, mph: 0, dir: [1, 0, 0], vec: [0, 0, 0], particles: [] };
  const rnd = Math.random; // visuals only — keep the seeded rng for gameplay

  function spawn() {
    return {
      pos: [BOX.x[0] + rnd() * (BOX.x[1] - BOX.x[0]), BOX.y[0] + rnd() * (BOX.y[1] - BOX.y[0]), BOX.z[0] + rnd() * (BOX.z[1] - BOX.z[0])],
      life: 0,
      jitter: 0.7 + rnd() * 0.6,
    };
  }

  wind.reroll = () => {
    if (!enabled) { wind.mph = 0; wind.vec = [0, 0, 0]; return; }
    const mph = rng.range(cfg.mph);
    wind.dir = norm([rng.sign(), 0, rng.range(-cfg.headTailMix, cfg.headTailMix)]);
    wind.mph = mph;
    wind.vec = mul(wind.dir, mph * MPH_TO_MS * cfg.strength);
  };

  wind.update = (dt) => {
    if (!enabled) return;
    const target = Math.round(wind.mph * cfg.particlesPerMph);
    while (wind.particles.length < target) wind.particles.push(spawn());
    if (wind.particles.length > target) wind.particles.length = target;
    const speed = Math.max(1.5, wind.mph * MPH_TO_MS * cfg.visualSpeed);
    for (const p of wind.particles) {
      p.pos = add(p.pos, mul(wind.dir, speed * p.jitter * dt));
      p.life += dt;
      const [x, , z] = p.pos;
      if (x < BOX.x[0] || x > BOX.x[1] || z < BOX.z[0] || z > BOX.z[1]) Object.assign(p, spawn());
    }
  };

  wind.drawStreaks = (ctx, cam) => {
    if (!enabled || !wind.particles.length) return;
    const streak = 0.25 + wind.mph * 0.05;
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of wind.particles) {
      const a = cam.project(p.pos);
      const b = cam.project(sub(p.pos, mul(wind.dir, streak * p.jitter)));
      const alpha = Math.min(1, p.life / 0.4) * 0.32;
      ctx.strokeStyle = `rgba(70,95,135,${alpha.toFixed(3)})`;
      ctx.lineWidth = clamp(0.012 * a.s, 1, 3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  /** Corner gauge. The arrow is a top-down view: up = blowing away from you. */
  wind.drawIndicator = (ctx, right, top) => {
    if (!enabled) return;
    const w = 128, h = 62;
    const x = right - w, y = top;
    ctx.save();
    ctx.fillStyle = 'rgba(15,10,20,0.6)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = `800 11px ${HUD_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText('WIND', x + 10, y + 18);

    // arrow
    const ax = x + 32, ay = y + 39;
    const ang = Math.atan2(-wind.dir[2], wind.dir[0]);
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.strokeStyle = '#8ec5ff';
    ctx.fillStyle = '#8ec5ff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(5, -8);
    ctx.lineTo(5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = `800 22px ${HUD_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(wind.mph)}`, x + 58, y + 46);
    ctx.font = `700 12px ${HUD_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('mph', x + 58 + (wind.mph >= 9.5 ? 28 : 16), y + 46);
    ctx.restore();
  };

  return wind;
}
