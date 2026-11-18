// Realistic 3D props: dry-erase markers and the dark-purple perforated picnic table.
import * as THREE from 'three';
import { perforatedAlpha } from './textures.js';

// ---------- the dry-erase marker ----------
// 14 cm long, centered on the origin along +Y; the cap is the +Y end.
const L = 0.14;
let markerGeo = null;
function markerGeometry() {
  if (markerGeo) return markerGeo;
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  markerGeo = {
    barrel: lathe([[0, -0.07], [0.005, -0.0698], [0.0085, -0.069], [0.0094, -0.0675], [0.0095, -0.066], [0.0095, 0.024], [0, 0.024]]),
    plug: lathe([[0, -0.0702], [0.0055, -0.0701], [0.0089, -0.069], [0.0097, -0.0672], [0.0097, -0.063], [0, -0.063]]),
    band: new THREE.CylinderGeometry(0.00965, 0.00965, 0.026, 32, 1, true),
    cap: lathe([[0, 0.021], [0.0108, 0.021], [0.0109, 0.024], [0.0109, 0.064], [0.0102, 0.0685], [0.0082, 0.0697], [0.004, 0.0702], [0, 0.0703]]),
    ring: new THREE.TorusGeometry(0.0108, 0.0009, 8, 32),
    clip: new THREE.BoxGeometry(0.0035, 0.034, 0.006),
  };
  markerGeo.band.translate(0, -0.02, 0);
  markerGeo.ring.rotateX(Math.PI / 2);
  markerGeo.ring.translate(0, 0.0225, 0);
  markerGeo.clip.translate(0.0118, 0.045, 0);
  return markerGeo;
}

const plastic = new THREE.MeshPhysicalMaterial({ color: 0xedede8, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35 });
const colorMats = new Map();
function colorMat(hex) {
  if (!colorMats.has(hex)) {
    colorMats.set(hex, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  }
  return colorMats.get(hex);
}

export function createMarker3D(hex) {
  const g = markerGeometry();
  const group = new THREE.Group();
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  add(g.barrel, plastic);
  add(g.plug, colorMat(hex));
  add(g.band, colorMat(hex));
  add(g.cap, colorMat(hex));
  add(g.ring, colorMat(hex));
  add(g.clip, colorMat(hex));
  group.userData.length = L;
  return group;
}

// ---------- the picnic table ----------
// Square perforated-metal top, four separate benches (one per side, pinwheel
// offset), black tube frame. Painted dark purple, close to black.
export const TABLE_COLOR = 0x2a1c33;

export function createPicnicTable() {
  const group = new THREE.Group();
  const metal = (repeat) => new THREE.MeshStandardMaterial({
    color: TABLE_COLOR,
    metalness: 0.2,
    roughness: 0.62,
    alphaMap: perforatedAlpha(repeat),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const solid = new THREE.MeshStandardMaterial({ color: TABLE_COLOR, metalness: 0.2, roughness: 0.55 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.5, roughness: 0.35 });
  const add = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // top
  const S = 1.17, TOP_Y = 0.74;
  const top = add(new THREE.Mesh(new THREE.PlaneGeometry(S, S), metal([S / 0.045, S / 0.045])));
  top.rotation.x = -Math.PI / 2;
  top.position.y = TOP_Y;
  // rolled edge around the top
  for (const [x, z, w, d] of [[0, S / 2, S, 0.03], [0, -S / 2, S, 0.03], [S / 2, 0, 0.03, S], [-S / 2, 0, 0.03, S]]) {
    const e = add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), solid));
    e.position.set(x, TOP_Y - 0.012, z);
  }

  // benches
  const BL = 1.12, BD = 0.3, BENCH_Y = 0.46, OUT = 0.585 + 0.24 + BD / 2;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.PlaneGeometry(BL, BD), metal([BL / 0.045, BD / 0.045]));
    seat.rotation.x = -Math.PI / 2;
    seat.position.set(0.12, BENCH_Y, OUT);
    seat.castShadow = seat.receiveShadow = true;
    bench.add(seat);
    for (const [x, z, w, d] of [[0.12, OUT + BD / 2, BL, 0.03], [0.12, OUT - BD / 2, BL, 0.03], [0.12 + BL / 2, OUT, 0.03, BD], [0.12 - BL / 2, OUT, 0.03, BD]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), solid);
      e.position.set(x, BENCH_Y - 0.012, z);
      e.castShadow = e.receiveShadow = true;
      bench.add(e);
    }
    // bent tube legs from the center hub out and up to the bench
    for (const off of [-0.35, 0.55]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(off * 0.25, 0.12, 0.15),
        new THREE.Vector3(off, 0.06, OUT - 0.05),
        new THREE.Vector3(off, 0.03, OUT + 0.05),
        new THREE.Vector3(off, 0.2, OUT + 0.1),
        new THREE.Vector3(off, BENCH_Y - 0.03, OUT),
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.021, 10), frame);
      tube.castShadow = true;
      bench.add(tube);
    }
    bench.rotation.y = a;
    group.add(bench);
  }
  // table legs: from the hub up to each corner
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const cx = Math.cos(a) * 0.55, cz = Math.sin(a) * 0.55;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cx * 0.15, 0.12, cz * 0.15),
      new THREE.Vector3(cx * 0.5, 0.05, cz * 0.5),
      new THREE.Vector3(cx * 0.75, 0.3, cz * 0.75),
      new THREE.Vector3(cx * 0.8, TOP_Y - 0.03, cz * 0.8),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.024, 10), frame);
    tube.castShadow = true;
    group.add(tube);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16), frame);
  hub.position.y = 0.12;
  group.add(hub);
  return group;
}

// ---------- helpers for game-coordinate poses ----------
// Game coords are [x, y, z] with z away from you; Three.js uses -z. A game
// basis { r, u, n } maps to a proper rotation once each vector's z is flipped.
const _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
export function setPoseFromBasis(obj, p, { r, u, n }) {
  obj.position.set(p[0], p[1], -p[2]);
  _a.set(r[0], r[1], -r[2]);
  _b.set(u[0], u[1], -u[2]);
  _c.set(n[0], n[1], -n[2]);
  _m.makeBasis(_a, _b, _c);
  obj.quaternion.setFromRotationMatrix(_m);
}

/** Point a +Y-aligned object (like a marker) from `back` to `cap` (game coords). */
export function setRodPose(obj, back, cap) {
  obj.position.set((back[0] + cap[0]) / 2, (back[1] + cap[1]) / 2, -(back[2] + cap[2]) / 2);
  _a.set(cap[0] - back[0], cap[1] - back[1], -(cap[2] - back[2])).normalize();
  obj.quaternion.setFromUnitVectors(_b.set(0, 1, 0), _a);
}

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// ---------- red solo cup (16 oz): base at the origin, opening up +Y ----------
export function createSoloCup({ rimRadius = 0.068, bottomRadius = 0.047, height = 0.12 } = {}) {
  const group = new THREE.Group();
  const r = (f) => bottomRadius + (rimRadius - bottomRadius) * f;
  const outer = [[0, 0], [bottomRadius - 0.004, 0], [bottomRadius, 0.004]];
  // body with a few shallow ridges, like the real thing
  for (const [f, bump] of [[0.12, 0], [0.2, 0.0016], [0.24, 0], [0.55, 0], [0.62, 0.0016], [0.66, 0], [0.84, 0], [0.88, 0.0012], [0.92, 0], [0.97, 0]]) outer.push([r(f) + bump, height * f]);
  outer.push([rimRadius, height]);
  const toV = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const red = new THREE.MeshPhysicalMaterial({ color: 0xc8161d, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3efec, roughness: 0.55, side: THREE.DoubleSide });
  group.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(toV(outer), 40), red)));
  const inner = [[rimRadius - 0.0016, height], [r(0.5) - 0.0016, height * 0.5], [bottomRadius - 0.0016, 0.006], [0, 0.006]];
  group.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(toV(inner), 40), white)));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rimRadius - 0.0004, 0.0022, 8, 48), new THREE.MeshPhysicalMaterial({ color: 0xd31d24, roughness: 0.3, clearcoat: 0.7 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height;
  group.add(shadowed(rim));
  return group;
}

// ---------- the yellow/black school whiteboard eraser ----------
// Local axes: x = length, y = up out of the handle, z = width. Centered.
export async function createEraser3D({ length = 0.16, width = 0.055, feltH = 0.018, handleH = 0.032 } = {}) {
  const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
  const group = new THREE.Group();
  const H = feltH + handleH;
  const felt = shadowed(new THREE.Mesh(new RoundedBoxGeometry(length, feltH, width, 3, 0.004), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.98 })));
  felt.position.y = -H / 2 + feltH / 2;
  const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(length - 0.004, handleH, width - 0.003, 4, 0.008), new THREE.MeshPhysicalMaterial({ color: 0xf2c230, roughness: 0.4, clearcoat: 0.5 })));
  handle.position.y = H / 2 - handleH / 2;
  const label = shadowed(new THREE.Mesh(new THREE.BoxGeometry(length * 0.34, 0.002, width - 0.01), new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.5 })));
  label.position.y = H / 2 + 0.0005;
  group.add(felt, handle, label);
  return group;
}

// ---------- foam state puzzle piece ----------
// Shape points are normalized (longest side 1, +y up). Local: x/y = the shape, z = thickness (centered).
export function createFoamPiece(shapePts, size, thickness, hex) {
  const shape = new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(x * size, y * size)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.002, bevelSegments: 2 });
  geo.translate(0, 0, -thickness / 2);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.92 });
  return shadowed(new THREE.Mesh(geo, mat));
}

// ---------- handheld classroom whiteboard ----------
// width x height, front faces +Z. Optional canvas textures for each side.
export function createHandBoard(width, height, { frontCanvas = null, backCanvas = null } = {}) {
  const group = new THREE.Group();
  const thick = 0.01;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.35, metalness: 0.6 });
  const tex = (c) => {
    if (!c) return null;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const front = tex(frontCanvas), back = tex(backCanvas);
  const surface = (map) => new THREE.MeshPhysicalMaterial({ color: 0xffffff, map, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.12, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: map ? 0.32 : 0 });
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, height, thick), [frameMat, frameMat, frameMat, frameMat, surface(front), surface(back)]));
  group.add(body);
  // thin frame lip around the front and back
  const lip = 0.012;
  for (const z of [thick / 2 + 0.001, -thick / 2 - 0.001]) {
    for (const [x, y, w, h] of [[0, height / 2 - lip / 2, width, lip], [0, -height / 2 + lip / 2, width, lip], [width / 2 - lip / 2, 0, lip, height], [-width / 2 + lip / 2, 0, lip, height]]) {
      const e = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), frameMat));
      e.position.set(x, y, z);
      group.add(e);
    }
  }
  group.userData = { front, back, width, height };
  return group;
}

/** Reusable 3D markers: call begin(), get(key, hex) for each marker to show this frame, then end(). */
export function createMarkerPool(scene) {
  const pool = new Map();
  let used = new Set();
  return {
    begin() { used = new Set(); },
    get(key, hex) {
      let m = pool.get(key);
      if (!m) {
        m = createMarker3D(hex);
        scene.add(m);
        pool.set(key, m);
      }
      m.visible = true;
      used.add(key);
      return m;
    },
    end() { for (const [k, m] of pool) if (!used.has(k)) m.visible = false; },
  };
}
