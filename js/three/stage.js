// The realistic 3D layer (Three.js), shared by the 3D games.
//
// Games keep their physics in "game coordinates" (meters; camera at the
// origin; x right, y up, z forward/away from you) and keep their `cam`
// object (from shared/scene3d.js or their own) for hit-testing and HUD.
// This stage renders a Three.js scene with a camera that exactly matches
// that `cam`, and puts a transparent 2D HUD canvas on top for scores/text.
//
// Three.js looks down -z, so game [x, y, z] -> three (x, y, -z).

import * as THREE from 'three';
import { createCanvas } from '../core/canvas.js';

export { THREE };

export function toThree(p, out = new THREE.Vector3()) {
  return out.set(p[0], p[1], -p[2]);
}

/** Rotation that turns +Y into the given game-space direction. */
export function quatFromGameDir(dir, out = new THREE.Quaternion()) {
  const v = new THREE.Vector3(dir[0], dir[1], -dir[2]).normalize();
  return out.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
}

/**
 * opts: { onResize(size), getCam() -> the game's cam {W, H, f, cx, cy} }
 * Returns { renderer, scene, camera, hud (2D canvas view: {canvas, ctx, size}), render(), destroy() }
 */
export function createStage3D(container, { onResize, getCam } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const gl = renderer.domElement;
  gl.className = 'game-canvas3d';
  container.appendChild(gl);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 3000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  // Big screens (fullscreen on a PC) at 2x sharpness can exceed what the GPU will
  // draw, which shows up as a gray screen. Cap the total pixels instead.
  const MAX_PIXELS = 4.2e6;
  function matchCam(cam, size) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / Math.max(1, cam.W * cam.H)));
    renderer.setPixelRatio(Math.max(0.75, dpr));
    renderer.setSize(cam.W, cam.H, false);
    camera.fov = (2 * Math.atan(cam.H / 2 / cam.f) * 180) / Math.PI;
    camera.aspect = cam.W / cam.H;
    // shift the principal point to (cx, cy) like the 2D camera
    camera.setViewOffset(cam.W, cam.H, cam.W / 2 - cam.cx, cam.H / 2 - cam.cy, cam.W, cam.H);
    camera.updateProjectionMatrix();
    void size;
    // resizing clears the picture: draw again right away instead of flashing blank until the next frame
    try { renderer.render(scene, camera); } catch { /* scene still loading */ }
  }

  // if the GPU drops the canvas (it can on resize), let three.js restore it
  gl.addEventListener('webglcontextlost', (e) => e.preventDefault());

  // The HUD canvas goes on top (it also receives pointer input).
  const hud = createCanvas(container, (size) => {
    onResize?.(size);
    const cam = getCam?.();
    if (cam) matchCam(cam, size);
  });

  return {
    THREE,
    renderer,
    scene,
    camera,
    hud,
    render() { renderer.render(scene, camera); },
    destroy() {
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) m[k].dispose();
          m.dispose?.();
        }
      });
      scene.environment?.dispose?.();
      renderer.dispose();
      gl.remove();
      hud.destroy();
    },
  };
}
