// Renders one still "photo" of the setting for the home page header: the
// dark-purple picnic table in the courtyard with markers, the solo cup and the
// eraser on it, and Paul standing behind it holding up a marker.
// Rendered once offscreen, returned as an image URL, then the GPU stuff is freed.

import * as THREE from 'three';
import { buildCourtyard } from './courtyard.js';
import { createPicnicTable, createMarker3D, createSoloCup, createEraser3D, setRodPose } from './props.js';
import { createPaul3D } from './paul3d.js';
import { MARKER_COLORS } from '../shared/colors.js';

export async function renderHeroShot(width, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();

  // floor at y = 0; game coords (x, y, z) -> three (x, y, -z)
  buildCourtyard({ scene, renderer }, {
    floorY: 0, buildingZ: 14, sunElevationDeg: 40, sunAzimuthDeg: 35, shadowCenter: [0, 0.6], shadowSize: 4,
    tables: [{ x: -4.5, z: 5.5, rotDeg: 25 }, { x: 5.5, z: 7, rotDeg: -10 }],
  });

  const table = createPicnicTable();
  table.rotation.y = 0.35;
  scene.add(table);

  // stuff on the table (three coords; table top is at y = 0.74)
  const TOP = 0.756;
  const lying = [[-0.32, 0.05, 0.4], [-0.12, 0.18, -0.3], [0.08, -0.12, 1.1], [0.3, 0.12, -0.9], [-0.05, -0.3, 2.2]];
  lying.forEach(([x, z, ang], i) => {
    const m = createMarker3D(MARKER_COLORS[(i * 3) % 8].hex);
    const dx = Math.cos(ang) * 0.07, dz = Math.sin(ang) * 0.07;
    setRodPose(m, [x - dx, TOP, -(z - dz)], [x + dx, TOP, -(z + dz)]);
    scene.add(m);
  });
  const cup = createSoloCup();
  cup.position.set(0.28, 0.745, -0.18);
  scene.add(cup);
  const eraser = await createEraser3D();
  eraser.position.set(-0.3, 0.745 + 0.025, 0.28);
  eraser.rotation.y = 0.7;
  scene.add(eraser);

  // Paul behind the table, holding up a purple marker
  const paul = createPaul3D();
  const pose = { x: 0.45, z: 1.15, floorY: 0, yaw: -0.45, rightHand: [0.86, 1.52, 0.82] };
  paul.update(pose);
  scene.add(paul.group);
  const held = createMarker3D(MARKER_COLORS[6].hex);
  setRodPose(held, [0.86, 1.5, 0.8], [0.88, 1.64, 0.78]);
  scene.add(held);

  const camera = new THREE.PerspectiveCamera(36, width / height, 0.05, 3000);
  camera.position.set(1.9, 1.45, 2.6);
  camera.lookAt(0.45, 0.95, -0.5);
  // keep the action on the right so the logo has room on the left
  camera.setViewOffset(width, height, -width * 0.3, 0, width, height);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.86);

  scene.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) m.dispose?.();
  });
  scene.environment?.dispose?.();
  renderer.dispose();
  renderer.forceContextLoss?.();
  return url;
}
